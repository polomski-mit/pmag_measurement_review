"""Directional distances and conditional half-turns in specimen coordinates."""
import math


def angle(a,b):
    da,ia,db,ib=map(math.radians,[float(a['dir_dec']),float(a['dir_inc']),float(b['dir_dec']),float(b['dir_inc'])])
    dot=math.sin(ia)*math.sin(ib)+math.cos(ia)*math.cos(ib)*math.cos(da-db)
    return math.degrees(math.acos(max(-1,min(1,dot))))


def transform(row,model):
    if model not in {'antipode','arrow-x','arrow-y'}:raise ValueError('Unknown direction transform')
    d=float(row['dir_dec'])
    d=d+180 if model=='antipode' else -d if model=='arrow-x' else 180-d
    return {**row,'dir_dec':d%360,'dir_inc':-float(row['dir_inc'])}
