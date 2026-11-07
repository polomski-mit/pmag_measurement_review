"""Persist exclusions and screen refreshed MagIC data without editing raw inputs.

Usage: python functions/measurement_transformations.py --apply
Without --apply, print a scan summary without writing anything.
Identity is specimen + timestamp, not regenerated measurement number. Explicit
keep overrides suppress exclusion. New findings remain pending user review.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from datetime import datetime
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import statistics

from direction_geometry import angle, transform

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCES = []
DEFAULT_RULES = dict(low_moment_ratio=.01, temperature_window_K=25,
                     kelvin_offset=273.15,
                     reference_moment_factor=3, high_csd_degrees=10, review_csd_degrees=4,
                     flip_min_improvement_degrees=30, flip_max_residual_degrees=20,
                     swap_time_window_minutes=30, swap_specimen_number_distance=2)


def key(row):
    if not row.get('specimen') or not row.get('timestamp'):
        raise ValueError('Stable specimen and timestamp required; refusing ID-only matching')
    # Preserve the source clock as written: instrument timestamps have no timezone.
    stamp = datetime.fromisoformat(row['timestamp']).isoformat()
    return f"{row['specimen']}|{stamp}"


def manual_flip(row, model):
    if model not in {'arrow-x','arrow-y'}:raise ValueError('Unsupported manual loading flip')
    identity=key(row)
    return dict(review_id='manual-flip:'+identity+':'+model,identity=identity,
                type='possible_flip',origin='manual',model=model,status='pending',
                source_fingerprint=fingerprint(row),support='manual_review',disposition='review')


def number(row, name, default=float('nan')):
    try:
        return float(row.get(name, ''))
    except (ValueError, TypeError):
        return default


def fingerprint(row):
    fields = ['specimen','timestamp','treat_temp','dir_dec','dir_inc','magn_moment']
    values = [str(row.get(f,'')) if f in {'specimen','timestamp'} else str(number(row,f)) for f in fields]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


def read_table(path):
    with path.open(newline='') as stream:
        marker = next(stream).rstrip('\r\n')
        reader = csv.DictReader(stream, delimiter='\t')
        rows = list(reader)
        headers = reader.fieldnames
    required={'specimen','timestamp','measurement','treat_temp','dir_dec','dir_inc','magn_moment','dir_csd','quality'}
    if marker.lstrip('\ufeff')!='tab\tmeasurements' or not headers or not required.issubset(headers):
        raise ValueError(f'{path}: expected a MagIC 3 measurements table with columns {sorted(required)}')
    for row in rows:
        if any(code in row.get('method_codes','') for code in ['LP-DIR-AF','LT-AF','LP-PI']):
            raise ValueError(f'{path}: this reviewer supports thermal directional measurements only')
        if (not all(math.isfinite(number(row,f)) for f in ['treat_temp','dir_dec','dir_inc','magn_moment','dir_csd'])
                or not -90<=number(row,'dir_inc')<=90 or number(row,'magn_moment')<0):
            raise ValueError(f'{path}: missing or invalid numerical values at {row.get("measurement")}')
    keys = [key(row) for row in rows]
    if len(set(keys)) != len(keys):
        raise ValueError(f'Ambiguous duplicate specimen/timestamp in {path}')
    return marker, headers, rows


def good(row, excluded, rules):
    return (key(row) not in excluded and row.get('quality') != 'b'
            and number(row, 'dir_csd', float('inf')) <= rules['high_csd_degrees']
            and math.isfinite(number(row, 'magn_moment')) and number(row, 'magn_moment') > 0)


def local_references(row, peers, excluded, rules):
    """Use a reliable exact-temperature repeat, otherwise two bracketing temps."""
    temperature = number(row, 'treat_temp')
    eligible = [other for other in peers if other is not row and good(other, excluded, rules)
                and abs(number(other, 'treat_temp')-temperature) <= rules['temperature_window_K']]
    same = [other for other in eligible if number(other, 'treat_temp') == temperature]
    if same:
        return same, 'same_temperature_repeat'
    below = [other for other in eligible if number(other, 'treat_temp') < temperature]
    above = [other for other in eligible if number(other, 'treat_temp') > temperature]
    if not below or not above:
        return [], 'insufficient_local_support'
    lo = max(number(other, 'treat_temp') for other in below)
    hi = min(number(other, 'treat_temp') for other in above)
    return ([other for other in below if number(other, 'treat_temp') == lo]
            + [other for other in above if number(other, 'treat_temp') == hi]), 'bracketing_temperatures'


def direction_reference(row, peers, excluded, rules):
    refs, support = local_references(row, peers, excluded, rules)
    if not refs or any(angle(a,b)>30 for a in refs for b in refs):
        return None
    vectors = []
    for other in refs:
        d, i = math.radians(number(other,'dir_dec')), math.radians(number(other,'dir_inc'))
        vectors.append((math.cos(i)*math.cos(d),math.cos(i)*math.sin(d),math.sin(i)))
    x,y,z = [sum(v[k] for v in vectors) for k in range(3)]
    ref = dict(dir_dec=math.degrees(math.atan2(y,x))%360,
               dir_inc=math.degrees(math.atan2(z,math.hypot(x,y))))
    return ref, refs, support


def scan_rows(rows, ledger, rules):
    by_specimen = defaultdict(list)
    for row in rows:
        by_specimen[row['specimen']].append(row)
    exclusions = ledger['exclusions']
    keeps = set(ledger['keep_overrides'])
    discoveries = []
    def exclude(row, reason, evidence):
        stable = key(row)
        discoveries.append(dict(identity=stable, type=reason, disposition='keep_override' if stable in keeps else 'exclude', **evidence))
        if stable not in keeps:
            item = exclusions.setdefault(stable, dict(specimen=row['specimen'], timestamp=row['timestamp'],
                    action='exclude', reasons=[], first_measurement_id=row['measurement'],
                    status='pending', source_fingerprint=fingerprint(row),
                    first_seen=datetime.now().isoformat(timespec='seconds'), evidence={}))
            if item.get('source_fingerprint') != fingerprint(row):
                item['status']='pending'
                item['source_fingerprint']=fingerprint(row)
                item['changed_source_requires_review']=True
            if reason not in item['reasons']:
                item['reasons'].append(reason)
            item['evidence'][reason] = evidence
    for row in rows:
        if row.get('quality') == 'b':
            exclude(row,'existing_bad_flag',{})
        if number(row, 'dir_csd') > rules['high_csd_degrees']:
            exclude(row,'high_csd',dict(dir_csd_degrees=number(row,'dir_csd')))
        elif number(row, 'dir_csd') > rules.get('review_csd_degrees',4):
            exclude(row,'elevated_csd_review',dict(dir_csd_degrees=number(row,'dir_csd')))
    # One fixed reference pool; detections do not influence their own baseline.
    excluded = set(exclusions)-keeps
    for row in rows:
        moment = number(row,'magn_moment')
        if not math.isfinite(moment) or moment < 0:
            continue
        refs, support = local_references(row, by_specimen[row['specimen']], excluded, rules)
        if not refs:
            continue
        moments = [number(other,'magn_moment') for other in refs]
        # Reject a baseline straddling a steep natural intensity transition.
        if max(moments)/min(moments) > rules['reference_moment_factor']:
            continue
        if support == 'bracketing_temperatures':
            t = number(row,'treat_temp')
            lo = max(number(other,'treat_temp') for other in refs if number(other,'treat_temp')<t)
            hi = min(number(other,'treat_temp') for other in refs if number(other,'treat_temp')>t)
            ml = statistics.median(number(other,'magn_moment') for other in refs if number(other,'treat_temp')==lo)
            mh = statistics.median(number(other,'magn_moment') for other in refs if number(other,'treat_temp')==hi)
            baseline = math.exp(math.log(ml)+(t-lo)/(hi-lo)*(math.log(mh)-math.log(ml)))
        else:
            baseline = statistics.median(moments)
        if moment/baseline <= rules['low_moment_ratio']:
            exclude(row,'low_moment',dict(moment_Am2=moment, reference_moment_Am2=baseline,
                    ratio=moment/baseline, support=support, references=[key(other) for other in refs]))
    excluded = set(exclusions)-keeps
    # Excluded weak/noisy readings must not drive flip or swap hypotheses.
    clean = [row for row in rows if good(row, excluded, rules)]
    refs = {}
    for row in clean:
        reference = direction_reference(row, by_specimen[row['specimen']], excluded, rules)
        if not reference:
            continue
        center, context, support = reference
        refs[key(row)] = reference
        original = angle(row,center)
        for model in ['arrow-x','arrow-y']:
            residual = angle(transform(row,model),center)
            if original-residual >= rules['flip_min_improvement_degrees'] and residual <= rules['flip_max_residual_degrees']:
                discoveries.append(dict(identity=key(row), type='possible_flip', disposition='review',
                    source_fingerprint=fingerprint(row),
                    model=model, original_angle_degrees=original, transformed_angle_degrees=residual,
                    references=[key(other) for other in context], support=support))
    for index, a in enumerate(clean):
        ma = re.fullmatch(r'(.+)-(\d+)',a['specimen'])
        if not ma or key(a) not in refs:
            continue
        for b in clean[index+1:]:
            mb = re.fullmatch(r'(.+)-(\d+)',b['specimen'])
            if (not mb or ma[1]!=mb[1] or not 0<abs(int(ma[2])-int(mb[2]))<=rules['swap_specimen_number_distance']
                    or number(a,'treat_temp')!=number(b,'treat_temp') or key(b) not in refs):
                continue
            elapsed = abs((datetime.fromisoformat(a['timestamp'])-datetime.fromisoformat(b['timestamp'])).total_seconds())/60
            if elapsed > rules['swap_time_window_minutes']:
                continue
            ra, ca, sa = refs[key(a)]; rb, cb, sb = refs[key(b)]
            old = [angle(a,ra),angle(b,rb)]; swapped = [angle(b,ra),angle(a,rb)]
            if (min(old[i]-swapped[i] for i in range(2)) >= 30 and max(swapped)<=20):
                discoveries.append(dict(identity=key(a), partner_identity=key(b), type='possible_swap',
                    source_fingerprint=fingerprint(a),partner_fingerprint=fingerprint(b),
                    disposition='review', original_angles_degrees=old, swapped_angles_degrees=swapped,
                    elapsed_minutes=elapsed, references_a=[key(r) for r in ca], references_b=[key(r) for r in cb]))
    return discoveries


def apply_to_dataset(source, output, ledger, rules, repeat_catalog=None):
    marker, headers, rows = read_table(source/'measurements.txt')
    discoveries = scan_rows(rows,ledger,rules)
    removed = [row for row in rows if key(row) in ledger['exclusions']
               and ledger['exclusions'][key(row)].get('status')=='approved'
               and key(row) not in ledger['keep_overrides']]
    from repeat_selection import surviving_repeat_groups, valid_selection
    identities={key(r) for r in rows}
    groups={g:v for g,v in (repeat_catalog if repeat_catalog is not None else surviving_repeat_groups(rows,ledger)).items() if identities.intersection(v['identities'])}
    repeat_removed=set()
    unresolved=[]
    for group_id,group in groups.items():
        selection=ledger.get('repeat_selections',{}).get(group_id)
        if valid_selection(group,selection,ledger['exclusions']):
            repeat_removed.update(set(group['identities'])-{selection['selected_identity']})
        elif all(ledger['exclusions'].get(identity,{}).get('status')=='approved' and identity not in ledger['keep_overrides'] for identity in group['identities']):
            repeat_removed.update(group['identities'])
        else:
            # Pending repeats cannot silently overweight a downstream fit.
            repeat_removed.update(group['identities'])
            unresolved.append(group_id)
    removed_keys = {key(row) for row in removed}|repeat_removed
    removed = [row for row in rows if key(row) in removed_keys]
    retained = [dict(row) for row in rows if key(row) not in removed_keys]
    available={key(row):row for row in retained}
    touched=set()
    actions=[dict(action='repeat_selection_pending',group_id=g) for g in unresolved]
    actions += [dict(action='repeat_all_bad' if ledger['repeat_selections'][g].get('all_bad') else 'repeat_selection',group_id=g,selected_identity=ledger['repeat_selections'][g]['selected_identity'],source_identities=groups[g]['identities']) for g in groups if g not in unresolved and valid_selection(groups[g],ledger.get('repeat_selections',{}).get(g),ledger['exclusions'])]
    for decision in ledger.get('review_candidates',[]):
        if decision.get('status')!='approved':continue
        identities=[decision['identity']]
        if decision['type']=='possible_swap':identities.append(decision['partner_identity'])
        if not any(identity in available for identity in identities):
            if any(identity in {key(row) for row in rows} for identity in identities):
                actions.append({'review_id':decision['review_id'],'action':'not_applied_excluded_or_pending_repeat'})
            continue
        if not all(identity in available for identity in identities):
            actions.append({'review_id':decision['review_id'],'action':'not_applied_missing_or_excluded_partner'})
            continue
        if touched.intersection(identities):
            raise ValueError('Conflicting approved actions affect the same observation; choose one in review')
        for identity,field in zip(identities,['source_fingerprint','partner_fingerprint']):
            if fingerprint(available[identity])!=decision[field]:raise ValueError('Approved transformation source changed')
        if decision['type']=='possible_flip':
            target=available[identities[0]]
            target.update(transform(target,decision['model']))
        else:
            a,b=[available[identity] for identity in identities]
            a['specimen'],b['specimen']=b['specimen'],a['specimen']
        touched.update(identities)
        actions.append({'review_id':decision['review_id'],'action':'applied','source_identities':identities})
    counts=defaultdict(int)
    for row in retained:counts[(row['specimen'],number(row,'treat_temp'))]+=1
    if any(count>1 for count in counts.values()):
        raise ValueError('Approved swaps create duplicate temperatures; resolve before applying')
    return marker, headers, retained, removed, discoveries, actions


def atomic_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary = path.with_name(path.name+'.tmp')
    temporary.write_text(json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--ledger',type=Path,default=ROOT/'data_tables/quality/measurement_transformations.json')
    parser.add_argument('--source-root',type=Path,default=ROOT/'data_tables/magic')
    parser.add_argument('--output-root',type=Path,default=ROOT/'data_tables/processed_measurements')
    parser.add_argument('--datasets',nargs='+',default=DEFAULT_SOURCES)
    parser.add_argument('--import-decisions',type=Path,help='import statuses/notes from the saved review gallery JSON')
    args = parser.parse_args()
    ledger = json.loads(args.ledger.read_text()) if args.ledger.exists() else dict(
        version=1,identity='specimen|ISO timestamp (instrument local clock)',rules=DEFAULT_RULES,
        exclusions={},keep_overrides={}, review_candidates=[])
    if ledger.get('version') != 1:
        raise ValueError('Unsupported transformation file version')
    if args.import_decisions:
        incoming=json.loads(args.import_decisions.read_text())
        for identity,decision in incoming.get('exclusions',{}).items():
            if identity not in ledger['exclusions']:
                raise ValueError(f'Unknown reviewed measurement: {identity}')
            original=ledger['exclusions'][identity]
            if decision.get('source_fingerprint')!=original.get('source_fingerprint'):
                raise ValueError('Review refers to changed source data; regenerate gallery')
            if decision.get('status') not in {'pending','approved','rejected'}:
                raise ValueError('Invalid decision status')
            original.update(status=decision['status'],review_note=decision.get('review_note',''))
            if decision['status']=='rejected':ledger['keep_overrides'][identity]={'reason':'Rejected in review gallery'}
            else:ledger['keep_overrides'].pop(identity,None)
        source_lookup={key(row):row for dataset in args.datasets for row in read_table(args.source_root/dataset/'measurements.txt')[2]}
        known={r['review_id']:r for r in ledger['review_candidates']}
        for decision in incoming.get('review_candidates',[]):
            original=known.get(decision.get('review_id'))
            if original is None and decision.get('origin')=='manual':
                row=source_lookup.get(decision.get('identity'))
                if row is None:raise ValueError('Manual flip observation is missing')
                original=manual_flip(row,decision.get('model'))
                if decision.get('review_id')!=original['review_id']:raise ValueError('Invalid manual flip identity')
                ledger['review_candidates'].append(original);known[original['review_id']]=original
            if original is None:raise ValueError('Unknown review hypothesis')
            if decision.get('source_fingerprint')!=original.get('source_fingerprint') or decision.get('partner_fingerprint')!=original.get('partner_fingerprint'):
                raise ValueError('Review hypothesis source changed')
            if decision.get('status') not in {'pending','approved','rejected'}:raise ValueError('Invalid hypothesis decision')
            original.update(status=decision['status'],review_note=decision.get('review_note',''))
    if args.import_decisions:
        from repeat_selection import surviving_repeat_groups, validate_selections
        all_rows=[row for dataset in args.datasets for row in read_table(args.source_root/dataset/'measurements.txt')[2]]
        ledger['repeat_selections']=validate_selections(surviving_repeat_groups(all_rows,ledger),incoming.get('repeat_selections',{}),ledger['exclusions'])
    rules = ledger['rules']
    rules.setdefault('review_csd_degrees',4)
    # Discover in every source first, then filter them all with the final union
    # so overlapping datasets cannot produce order-dependent retained rows.
    findings = {}
    for dataset in args.datasets:
        _,_,rows=read_table(args.source_root/dataset/'measurements.txt')
        current={key(row):fingerprint(row) for row in rows}
        for identity,entry in ledger['exclusions'].items():
            if identity in current and current[identity]!=entry.get('source_fingerprint'):
                entry.update(status='pending',source_fingerprint=current[identity],changed_source_requires_review=True)
                ledger['keep_overrides'].pop(identity,None)
        for entry in ledger.get('review_candidates',[]):
            for identity_field,fingerprint_field in [('identity','source_fingerprint'),('partner_identity','partner_fingerprint')]:
                identity=entry.get(identity_field)
                if identity in current and current[identity]!=entry.get(fingerprint_field):
                    entry.update(status='pending',changed_source_requires_review=True)
                    entry[fingerprint_field]=current[identity]
        findings[dataset]=scan_rows(rows,ledger,rules)
    from repeat_selection import surviving_repeat_groups
    repeat_catalog=surviving_repeat_groups([row for dataset in args.datasets for row in read_table(args.source_root/dataset/'measurements.txt')[2]],ledger)
    active_reviews = {}
    summaries=[]
    for dataset in args.datasets:
        source=args.source_root/dataset;out=args.output_root/dataset
        if out.resolve().is_relative_to(source.resolve()) or source.resolve().is_relative_to(out.resolve()):
            raise ValueError('Output must be separate from source')
        marker,headers,retained,removed,discoveries,actions=apply_to_dataset(source,out,ledger,rules,repeat_catalog)
        for item in discoveries:
            if item['disposition']=='review':
                ident='|'.join([item['type'],item['identity'],item.get('partner_identity',''),item.get('model','')])
                active_reviews.setdefault(ident,{**item,'datasets':[]})['datasets'].append(dataset)
        summary=dict(dataset=dataset,input_rows=len(retained)+len(removed),retained_rows=len(retained),removed_rows=len(removed),
            new_low_moment_flags=sum(r['type']=='low_moment' for r in discoveries),
            flip_candidates=sum(r['type']=='possible_flip' for r in discoveries),swap_candidates=sum(r['type']=='possible_swap' for r in discoveries),approved_actions_applied=sum(a['action']=='applied' for a in actions),pending_repeat_groups=sum(a['action']=='repeat_selection_pending' for a in actions),fit_ready=not any(a['action']=='repeat_selection_pending' for a in actions))
        summaries.append(summary)
        if args.apply:
            out.mkdir(parents=True,exist_ok=True)
            with (out/'measurements.txt').open('w',newline='') as stream:
                stream.write(marker+'\n');writer=csv.DictWriter(stream,fieldnames=headers,delimiter='\t');writer.writeheader();writer.writerows(retained)
            with (out/'removed_measurements.csv').open('w',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=headers);writer.writeheader();writer.writerows(removed)
            atomic_json(out/'quality_review.json',discoveries)
            atomic_json(out/'transformation_audit.json',{**summary,'source':str(source),
                'source_sha256':hashlib.sha256((source/'measurements.txt').read_bytes()).hexdigest(),
                'ledger':str(args.ledger),'rules':rules,'actions':actions,'applied_at':datetime.now().isoformat(timespec='seconds')})
    # Keep historical review findings even if their source no longer appears.
    historical={r['review_id']:r for r in ledger.get('review_candidates',[]) if 'review_id' in r}
    for ident,item in active_reviews.items():
        previous=historical.get(ident,{})
        unchanged=all(previous.get(f)==item.get(f) for f in ['source_fingerprint','partner_fingerprint'])
        historical[ident]={**previous,**item,'review_id':ident,'status':previous.get('status','pending') if unchanged else 'pending'}
    ledger['review_candidates']=list(historical.values())
    if args.apply:
        atomic_json(args.ledger,ledger)
        atomic_json(args.output_root/'summary.json',summaries)
        (args.output_root/'README.md').write_text('# Reviewed measurement inputs\n\nRegenerate after downloads/conversion with `python3 functions/measurement_transformations.py --apply`.\n\nRaw/CIT and canonical MagIC sources are unchanged. Approved exclusions, flips, swaps and explicit repeat choices affect derived measurements. Unresolved repeated-temperature groups are withheld, with pending groups and fit readiness recorded in the audit. Raw repeats remain intact; choose one or explicitly exclude all before fitting. Removed rows and applied transformations are audited. These are measurement inputs, not complete fitted PmagPy contributions: reload/recalculate saved fits against filtered data before reporting directions.\n')
    print(json.dumps(summaries,indent=2))
    print(f"{'Saved' if args.apply else 'Previewed'} {len(ledger['exclusions'])} persistent exclusions and {len(active_reviews)} current review hypotheses.")


if __name__=='__main__':
    main()
