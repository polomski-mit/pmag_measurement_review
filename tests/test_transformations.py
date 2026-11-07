import copy
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from measurement_transformations import DEFAULT_RULES, scan_rows, key, apply_to_dataset
from build_quality_review import empty_ledger, synthetic_demo


def row(specimen,t,dec=10,moment=1e-8,csd=1,second=0):
    return dict(specimen=specimen,treat_temp=str(t),dir_dec=str(dec),dir_inc='30',
        magn_moment=str(moment),dir_csd=str(csd),timestamp=f'2000-01-01T12:00:{second:02}',
        quality='g',measurement=f'{specimen}_{second}')


class TransformTests(unittest.TestCase):
    def test_csd_thresholds(self):
        rows=[row('A-1',773,csd=value,second=i) for i,value in enumerate([4,4.1,10,10.1])]
        ledger=empty_ledger();scan_rows(rows,ledger,DEFAULT_RULES)
        self.assertNotIn(key(rows[0]),ledger['exclusions'])
        self.assertIn('elevated_csd_review',ledger['exclusions'][key(rows[1])]['reasons'])
        self.assertIn('elevated_csd_review',ledger['exclusions'][key(rows[2])]['reasons'])
        self.assertIn('high_csd',ledger['exclusions'][key(rows[3])]['reasons'])
        self.assertTrue(all(e['status']=='pending' for e in ledger['exclusions'].values()))

    def test_low_moment_and_natural_tail(self):
        rows=[row('A-1',773,second=0),row('A-1',778,moment=1e-12,second=1),row('A-1',783,second=2)]
        ledger=empty_ledger();scan_rows(rows,ledger,DEFAULT_RULES)
        self.assertIn('low_moment',ledger['exclusions'][key(rows[1])]['reasons'])
        rows[2]['magn_moment']='1e-13'
        findings=scan_rows(rows,empty_ledger(),DEFAULT_RULES)
        self.assertFalse(any(f['type']=='low_moment' for f in findings))

    def test_moderate_isolated_dip_and_decision_preservation(self):
        rows=[row('A-1',773,second=0),row('A-1',778,moment=1e-9,second=1),row('A-1',783,second=2)]
        rules=dict(DEFAULT_RULES);rules.pop('bracket_low_moment_ratio') # old saved settings
        ledger=empty_ledger();scan_rows(rows,ledger,rules)
        entry=ledger['exclusions'][key(rows[1])]
        self.assertEqual(entry['evidence']['low_moment']['threshold_ratio'],.1)
        entry['status']='approved';scan_rows(rows,ledger,rules)
        self.assertEqual(entry['status'],'approved')
        entry['status']='rejected';ledger['keep_overrides'][key(rows[1])]={}
        scan_rows(rows,ledger,rules)
        self.assertEqual(entry['status'],'rejected')
        rows[1]['magn_moment']='1.01e-9'
        self.assertFalse(any(f['type']=='low_moment' for f in scan_rows(rows,empty_ledger(),rules)))
        # A 10x interpolation dip is insufficient if it isn't 10x below each side.
        rows[1]['magn_moment']='9e-10';rows[2]['magn_moment']='5e-9'
        self.assertFalse(any(f['type']=='low_moment' for f in scan_rows(rows,empty_ledger(),rules)))
        self.assertFalse(any(f['type']=='low_moment' for f in scan_rows(rows[:2],empty_ledger(),rules)))
        # Same-temperature repeats retain their stricter 100x threshold.
        rows[2]['treat_temp']='778';rows[2]['magn_moment']='1e-8'
        self.assertFalse(any(f['type']=='low_moment' for f in scan_rows(rows,empty_ledger(),rules)))

    def test_repeat_does_not_hide_bracket_dip(self):
        rows=[row('A-1',923,moment=4.96e-9,second=0),
              row('A-1',928,moment=6.15e-11,csd=7,second=1),
              row('A-1',928,moment=5.64e-9,second=2),
              row('A-1',933,moment=5.41e-9,second=3)]
        ledger=empty_ledger();scan_rows(rows,ledger,DEFAULT_RULES)
        evidence=ledger['exclusions'][key(rows[1])]['evidence']['low_moment']
        self.assertEqual(evidence['support'],'bracketing_temperatures')
        self.assertAlmostEqual(evidence['threshold_ratio'],.1)

    def test_reciprocal_swap(self):
        rows=[row('A-1',773,second=0),row('A-1',778,dec=100,second=1),row('A-1',783,second=2),
              row('A-2',773,dec=100,second=3),row('A-2',778,second=4),row('A-2',783,dec=100,second=5)]
        findings=scan_rows(rows,empty_ledger(),DEFAULT_RULES)
        self.assertEqual(sum(f['type']=='possible_swap' for f in findings),1)

    def test_pending_and_reimport(self):
        rows=[row('A-1',773,second=0),row('A-1',778,moment=1e-12,second=1),row('A-1',783,second=2)]
        ledger=empty_ledger();scan_rows(rows,ledger,DEFAULT_RULES)
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            def write():
                with (folder/'measurements.txt').open('w') as stream:
                    stream.write('tab\tmeasurements\n');writer=csv.DictWriter(stream,fieldnames=list(rows[0]),delimiter='\t');writer.writeheader();writer.writerows(rows)
            write();self.assertEqual(len(apply_to_dataset(folder,folder/'out',ledger,DEFAULT_RULES)[2]),3)
            ledger['exclusions'][key(rows[1])]['status']='approved'
            rows[1]['measurement']='renumbered_import';write()
            self.assertEqual(len(apply_to_dataset(folder,folder/'out',ledger,DEFAULT_RULES)[2]),2)

    def test_standalone_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);source=base/'experiment';source.mkdir();out=base/'review'
            data=synthetic_demo()['context'];rows=[r for values in data.values() for r in values]
            columns=[c for c in rows[0] if not c.startswith('_')]
            with (source/'measurements.txt').open('w') as stream:
                stream.write('tab\tmeasurements\n');writer=csv.DictWriter(stream,fieldnames=columns,delimiter='\t',extrasaction='ignore');writer.writeheader();writer.writerows(rows)
            wrapper=Path(__file__).resolve().parents[1]/'review.py'
            subprocess.run([sys.executable,str(wrapper),'--input',str(source),'--output',str(out)],check=True,stdout=subprocess.DEVNULL)
            ledger=json.loads((out/'transformations.json').read_text())
            self.assertTrue((out/'review.html').is_file());self.assertTrue((out/'review.bundle.json').is_file())
            self.assertTrue(all(e['status']=='pending' for e in ledger['exclusions'].values()))


if __name__=='__main__':unittest.main()
