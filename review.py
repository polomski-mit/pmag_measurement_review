#!/usr/bin/env python3
"""Portable thermal paleomagnetic measurement review. Python 3.10+, stdlib only."""
import argparse
from pathlib import Path
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True,type=Path,help='MagIC folder containing measurements.txt')
    parser.add_argument('--output',required=True,type=Path,help='separate working directory for ledger/gallery/derived data')
    parser.add_argument('--decisions',type=Path,help='downloaded reviewed transformation JSON to import')
    args=parser.parse_args()
    source=args.input.expanduser().resolve();out=args.output.expanduser().resolve()
    if not (source/'measurements.txt').is_file():parser.error('Input must contain measurements.txt')
    if source==out or source.is_relative_to(out) or out.is_relative_to(source):parser.error('Keep output separate from the input folder')
    out.mkdir(parents=True,exist_ok=True)
    lib=Path(__file__).resolve().parent/'lib'
    common=['--source-root',str(source.parent),'--datasets',source.name,'--ledger',str(out/'transformations.json')]
    scan=[sys.executable,str(lib/'measurement_transformations.py'),*common,'--apply','--output-root',str(out/'derived')]
    if args.decisions:scan+=['--import-decisions',str(args.decisions.expanduser().resolve())]
    subprocess.run(scan,check=True)
    subprocess.run([sys.executable,str(lib/'build_quality_review.py'),*common,
                    '--out',str(out/'review.html'),'--bundle-output',str(out/'review.bundle.json')],check=True)
    print(f'Open {out / "review.html"} or load review.bundle.json into the public viewer.')


if __name__=='__main__':main()
