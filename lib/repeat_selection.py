"""Explicit one-observation-per-specimen/temperature choices for fit inputs."""
from collections import defaultdict
import hashlib
import json


def repeat_groups(rows):
    from measurement_transformations import key, fingerprint, number
    unique={}
    for row in rows:
        identity=key(row)
        if identity in unique and fingerprint(row)!=fingerprint(unique[identity]):
            raise ValueError('Conflicting overlapping source observation: '+identity)
        unique[identity]=row
    groups=defaultdict(list)
    for row in unique.values():groups[(row['specimen'],number(row,'treat_temp'))].append(row)
    result={}
    for (specimen,temp),members in sorted(groups.items()):
        if len(members)<2:continue
        group_id=specimen+'|T='+format(temp,'.12g')
        identities=sorted(key(r) for r in members)
        signature=hashlib.sha256(json.dumps(sorted((key(r),fingerprint(r),str(r.get('dir_csd',''))) for r in members)).encode()).hexdigest()
        result[group_id]=dict(group_id=group_id,specimen=specimen,treat_temp=temp,
            identities=identities,signature=signature)
    return result


def valid_selection(group, selection, exclusions=None):
    if not isinstance(selection,dict) or selection.get('signature')!=group['signature']:return False
    if selection.get('all_bad') is True:
        return selection.get('selected_identity') is None and sorted(selection.get('identities',[]))==sorted(group['identities'])
    chosen=selection.get('selected_identity')
    if chosen not in group['identities']:return False
    return (exclusions or {}).get(chosen,{}).get('status')!='approved'


def validate_selections(groups, incoming, exclusions):
    """Validate user-supplied choices against server-side observations."""
    result={}
    for group_id,selection in incoming.items():
        group=groups.get(group_id)
        if not group or not valid_selection(group,selection,exclusions):
            raise ValueError('Repeat selection changed, is excluded, or is unknown; review again: '+group_id)
        result[group_id]={**group,'selected_identity':selection['selected_identity'],**({'all_bad':True} if selection.get('all_bad') is True else {})}
    return result


def surviving_repeat_groups(rows, ledger):
    """Only groups still duplicated after approved quality exclusions."""
    result={}
    for group_id,group in repeat_groups(rows).items():
        survivors=[identity for identity in group['identities']
                   if ledger.get('exclusions',{}).get(identity,{}).get('status')!='approved']
        if len(survivors)>1:
            result[group_id]={**group,'identities':survivors,'source_identities':group['identities']}
    return result
