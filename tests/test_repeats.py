import copy
import csv
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from repeat_selection import repeat_groups, surviving_repeat_groups, valid_selection, validate_selections
from measurement_transformations import key, DEFAULT_RULES, apply_to_dataset, scan_rows
from build_quality_review import empty_ledger, payload_for


def row(second,temp=773):
    return dict(specimen='REP-1',treat_temp=str(temp),dir_dec='10',dir_inc='30',magn_moment='1e-8',dir_csd='1',timestamp=f'2000-01-01T12:00:{second:02}',quality='g',measurement=str(second))


class RepeatTests(unittest.TestCase):
    def test_one_winner_and_changed_membership(self):
        rows=[row(0),row(1),row(2,778)]
        group=next(iter(repeat_groups(rows).values()))
        choice={**group,'selected_identity':key(rows[1])}
        self.assertTrue(valid_selection(group,choice))
        changed=next(iter(repeat_groups(rows+[row(3)]).values()))
        self.assertFalse(valid_selection(changed,choice))
        self.assertFalse(valid_selection(group,{**choice,'selected_identity':'unknown'}))
        self.assertFalse(valid_selection(group,choice,{key(rows[1]):{'status':'approved'}}))
        with self.assertRaises(ValueError):validate_selections({group['group_id']:group},{group['group_id']:{**choice,'signature':'forged'}},{})

    def test_pending_withheld_and_selection_applied(self):
        rows=[row(0),row(1),row(2,778)]
        group=next(iter(repeat_groups(rows).values()));ledger=empty_ledger()
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)
            with (source/'measurements.txt').open('w') as stream:
                stream.write('tab\tmeasurements\n');writer=csv.DictWriter(stream,fieldnames=list(rows[0]),delimiter='\t');writer.writeheader();writer.writerows(rows)
            pending=apply_to_dataset(source,source/'out',ledger,DEFAULT_RULES)
            self.assertEqual(len(pending[2]),1)
            self.assertEqual(pending[-1][0]['action'],'repeat_selection_pending')
            ledger['repeat_selections']={group['group_id']:{**group,'selected_identity':key(rows[1])}}
            applied=apply_to_dataset(source,source/'out',ledger,DEFAULT_RULES)
            self.assertEqual([key(r) for r in applied[2]],[key(rows[1]),key(rows[2])])
            self.assertEqual(len(applied[3]),1)
            self.assertNotIn('repeat_selection_pending',[a['action'] for a in applied[-1]])
            # A global winner outside a partial overlapping dataset must not leave its nonwinner.
            catalog=repeat_groups(rows+[row(4)])
            global_group=next(iter(catalog.values()))
            ledger['repeat_selections']={global_group['group_id']:{**global_group,'selected_identity':key(row(4))}}
            overlap=apply_to_dataset(source,source/'out',ledger,DEFAULT_RULES,catalog)
            self.assertEqual([key(r) for r in overlap[2]],[key(rows[2])])

    def test_all_bad_is_resolved_and_removes_every_repeat(self):
        rows=[row(0),row(1),row(2,778)]
        group=next(iter(repeat_groups(rows).values()))
        choice={**group,'selected_identity':None,'all_bad':True}
        self.assertTrue(valid_selection(group,choice))
        self.assertFalse(valid_selection(group,{**choice,'selected_identity':key(rows[0])}))
        self.assertFalse(valid_selection(group,{**choice,'identities':group['identities'][:1]}))
        changed=next(iter(repeat_groups(rows+[row(3)]).values()))
        self.assertFalse(valid_selection(changed,choice))
        ledger=empty_ledger();ledger['repeat_selections']=validate_selections({group['group_id']:group},{group['group_id']:choice},{})
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)
            with (source/'measurements.txt').open('w') as stream:
                stream.write('tab\tmeasurements\n');writer=csv.DictWriter(stream,fieldnames=list(rows[0]),delimiter='\t');writer.writeheader();writer.writerows(rows)
            applied=apply_to_dataset(source,source/'out',ledger,DEFAULT_RULES)
            self.assertEqual([key(r) for r in applied[2]],[key(rows[2])])
            self.assertEqual(len(applied[3]),2)
            self.assertEqual(applied[-1][0]['action'],'repeat_all_bad')
            self.assertNotIn('repeat_selection_pending',[a['action'] for a in applied[-1]])

    def test_quality_exclusions_precede_repeat_selection(self):
        rows=[row(0),row(1),row(2)]
        ledger=empty_ledger()
        # Use a real exclusion proposal, then approve it.
        rows[0]['dir_csd']='15';scan_rows(rows,ledger,DEFAULT_RULES)
        ledger['exclusions'][key(rows[0])]['status']='approved'
        groups=surviving_repeat_groups(rows,ledger)
        group=next(iter(groups.values()))
        self.assertEqual(group['identities'],[key(rows[1]),key(rows[2])])
        ledger['repeat_selections']={group['group_id']:{**group,'selected_identity':key(rows[2])}}
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)
            with (source/'measurements.txt').open('w') as stream:
                stream.write('tab\tmeasurements\n');writer=csv.DictWriter(stream,fieldnames=list(rows[0]),delimiter='\t');writer.writeheader();writer.writerows(rows)
            kept=apply_to_dataset(source,source/'out',ledger,DEFAULT_RULES)[2]
            self.assertEqual([key(r) for r in kept],[key(rows[2])])
            # With just one survivor there is no repeat decision to make.
            rows[1]['dir_csd']='15';scan_rows(rows,ledger,DEFAULT_RULES)
            ledger['exclusions'][key(rows[1])]['status']='approved'
            self.assertEqual(surviving_repeat_groups(rows,ledger),{})

    def test_payload_merges_overlapping_context(self):
        rows=[row(0),row(1),row(2,778)]
        bundle=payload_for(empty_ledger(),{'first':rows[:2],'second':rows[1:]})
        self.assertEqual(len(bundle['context']['REP-1']),3)
        self.assertEqual(len(bundle['repeat_groups']),1)
        self.assertEqual(len(next(iter(bundle['repeat_groups'].values()))['identities']),2)


if __name__=='__main__':unittest.main()
