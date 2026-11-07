"""Build portable offline galleries, review bundles, or an empty public viewer."""
import argparse
from collections import defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path

from measurement_transformations import ROOT, DEFAULT_SOURCES, DEFAULT_RULES, read_table, key, scan_rows

TEMPLATES=Path(__file__).resolve().parent/'templates'


def empty_ledger():
    return dict(version=1,identity='specimen|ISO timestamp',rules=DEFAULT_RULES,
                exclusions={},keep_overrides={},review_candidates=[])


def payload_for(ledger, sources):
    context={};provenance=defaultdict(list)
    for name,rows in sources.items():
        by_spec=defaultdict(list)
        for original in rows:
            row={**original,'_review_identity':key(original)}
            by_spec[row['specimen']].append(row)
            provenance[key(row)].append(name)
        for specimen,values in by_spec.items():
            if len(values)>len(context.get(specimen,[])):
                context[specimen]=values
    present=set(provenance);deck=[]
    for identity,entry in ledger['exclusions'].items():
        if identity in present:
            deck.append(dict(section='exclusions',id=identity,type='exclusion',specimen=entry['specimen'],
                             identity=identity,datasets=provenance[identity]))
    for entry in ledger['review_candidates']:
        if entry['identity'] in present and (not entry.get('partner_identity') or entry['partner_identity'] in present):
            deck.append(dict(section='review_candidates',id=entry['review_id'],type=entry['type'],
                specimen=entry['identity'].split('|')[0],identity=entry['identity'],datasets=entry.get('datasets',[])))
    deck.sort(key=lambda c:(c['type']=='exclusion' and ledger['exclusions'][c['id']]['reasons']==['existing_bad_flag'],c['specimen'],c['identity'],c['type']))
    payload=dict(format='measurement-review-bundle',version=1,ledger=ledger,deck=deck,context=context,
                 temperature_offset_K=ledger['rules'].get('kelvin_offset',273.0))
    payload['bundle_id']=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()[:24]
    payload['generated']=datetime.now().isoformat(timespec='seconds')
    return payload


def synthetic_demo():
    """Invented data with an exclusion, half-turn, and reciprocal swap."""
    rows=[]
    scenarios=[('DEMO-01',[15,15,15],[30,30,30],[1e-8,1e-12,9e-9]),
               ('DEMO-02',[75,285,75],[35,-35,35],[1e-8]*3),
               ('DEMO-03',[45,45,45],[20,20,20],[1e-8]*3),
               ('SWAP-01',[10,100,10],[30]*3,[1e-8]*3),
               ('SWAP-02',[100,10,100],[30]*3,[1e-8]*3)]
    for si,(specimen,decs,incs,moments) in enumerate(scenarios):
        for j in range(3):
            rows.append(dict(specimen=specimen,measurement=f'{specimen}_m{j}',timestamp=f'2000-01-01T12:{si*3+j:02d}:00',
                treat_temp=str(773+j*5),magn_moment=str(moments[j]),dir_dec=str(decs[j]),dir_inc=str(incs[j]),
                dir_csd='14' if specimen=='DEMO-01' and j==1 else '6' if specimen=='DEMO-03' and j==1 else '1',quality='g'))
    ledger=empty_ledger();findings=scan_rows(rows,ledger,ledger['rules'])
    for entry in ledger['exclusions'].values():entry['first_seen']='synthetic example'
    for finding in findings:
        if finding['disposition']=='review':
            review_id='|'.join([finding['type'],finding['identity'],finding.get('partner_identity',''),finding.get('model','')])
            ledger['review_candidates'].append({**finding,'review_id':review_id,'status':'pending','datasets':['Synthetic demo']})
    result=payload_for(ledger,{'Synthetic demo':rows});result['synthetic']=True
    return result


def render_html(payload, demo=None):
    def encode(value):return json.dumps(value,allow_nan=False).replace('</','<\\/')
    template=(TEMPLATES/'quality_review.html').read_text()
    return (template.replace('/* PLOT_CODE */',(TEMPLATES/'quality_review_plots.js').read_text())
            .replace('/* APP_CODE */',(TEMPLATES/'quality_review_app.js').read_text())
            .replace('/* REVIEW_PAYLOAD */',encode(payload)).replace('/* DEMO_PAYLOAD */',encode(demo)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT/'data_tables/magic')
    parser.add_argument('--datasets',nargs='+',default=DEFAULT_SOURCES)
    parser.add_argument('--ledger',type=Path,default=ROOT/'data_tables/quality/measurement_transformations.json')
    parser.add_argument('--out',type=Path,help='HTML output; defaults to a timestamped local review directory')
    parser.add_argument('--bundle-output',type=Path,help='also write loadable review bundle JSON')
    parser.add_argument('--public',action='store_true',help='empty publishable viewer with synthetic demo only')
    args=parser.parse_args()
    if args.public:
        payload=payload_for(empty_ledger(),{});demo=synthetic_demo()
    else:
        ledger=json.loads(args.ledger.read_text());sources={}
        for name in args.datasets:sources[name]=read_table(args.source_root/name/'measurements.txt')[2]
        payload=payload_for(ledger,sources);demo=None
    path=args.out or ROOT/'tracking/quality_review'/datetime.now().strftime('%Y%m%d_%H%M%S')/'review.html'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(render_html(payload,demo))
    if args.bundle_output:
        args.bundle_output.parent.mkdir(parents=True,exist_ok=True)
        args.bundle_output.write_text(json.dumps(payload,indent=2,allow_nan=False)+'\n')
    if not args.out:
        path.with_name('review.bundle.json').write_text(json.dumps(payload,indent=2)+'\n')
        (path.parent/'README.md').write_text('# Measurement review\n\nOpen review.html offline, or load review.bundle.json into the public viewer. Arrow keys navigate; Y/N/U approve/reject/defer. Save decisions downloads your reusable transformation ledger.\n\nImport decisions with `python3 functions/measurement_transformations.py --apply --import-decisions /path/to/measurement_transformations.reviewed.json`. Only approved actions affect derived inputs; canonical sources and saved fits are unchanged.\n')
        (ROOT/'tracking/quality_review/LATEST.md').write_text(f'# Latest review\n\n[Open gallery]({path.parent.name}/review.html)\n\n{len(payload["deck"])} cases.\n')
    print(path)


if __name__=='__main__':main()
