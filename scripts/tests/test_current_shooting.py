from copy import deepcopy
from datetime import date
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_current_shooting import build_snapshot, match_event
from export_player_rest import atomic_write_payload
from analyze_player_shooting import efg_se


def game(day=date(2026, 10, 20), gid="canonical-one", event="123"):
    fixture = dict(gid=gid, date=day, home="ATL", away="BOS", homeScore=3, awayScore=2)
    competition = dict(date=day.isoformat()+"T23:00Z", status={"type": {"completed": True}},
                       competitors=[dict(homeAway=side, score=str(score), team={"abbreviation": team})
                                    for side, team, score in [("home", "ATL", 3), ("away", "BOS", 2)]])
    groups=[]
    for ti, team in enumerate(["ATL", "BOS"]):
        athletes=[]
        for pi in range(5):
            fg="1-1" if pi==0 else "0-1"
            three="1-1" if ti==0 and pi==0 else "0-0"
            pts="3" if ti==0 and pi==0 else "2" if pi==0 else "0"
            athletes.append(dict(athlete={"id":str(ti*10+pi),"displayName":f"Player{ti}-{pi}"}, didNotPlay=False,
                                 stats=["1",pts,fg,three,"0-0"]))
        groups.append(dict(team={"abbreviation":team}, statistics=[dict(labels=["MIN","PTS","FG","3PT","FT"],athletes=athletes)]))
    summary=dict(header=dict(id=event,season={"year":2027,"type":2},competitions=[competition]), boxscore={"players":groups})
    return fixture, summary

class CurrentShootingTests(unittest.TestCase):
    def test_first_observed_rows_publish_outliers_without_inventing_rest(self):
        fixture, summary=game()
        result=build_snapshot([fixture],{fixture['gid']:summary},{fixture['gid']:"123"},"2026-27")
        self.assertEqual(result['publication']['observedGames'],1)
        self.assertEqual(result['publication']['through'],'2026-10-20')
        self.assertEqual(result['seasons'][0][6],150)
        self.assertEqual(result['seasons'][0][7:11],[0,0,0,0])
        self.assertEqual(result['seasons'][0][11:],[3,0,0,9,0,0])
        self.assertTrue(all(pid.startswith('espn:') for pid in result['playerIds']))

    def test_own_prior_appearance_creates_zero_rest_arm(self):
        first, a=game()
        second, b=game(date(2026,10,21),'canonical-two','124')
        result=build_snapshot([first,second],{'canonical-one':a,'canonical-two':b},{'canonical-one':'123','canonical-two':'124'},'2026-27')
        self.assertEqual(result['seasons'][0][7:11],[1,150,0,0])

    def test_missing_fixture_and_wrong_scores_hold_export(self):
        fixture, summary=game()
        with self.assertRaisesRegex(ValueError,'Missing'):
            build_snapshot([fixture],{}, {},'2026-27')
        bad=deepcopy(summary)
        bad['boxscore']['players'][0]['statistics'][0]['athletes'][0]['stats'][1]='2'
        with self.assertRaisesRegex(ValueError,'scoring'):
            build_snapshot([fixture],{fixture['gid']:bad},{fixture['gid']:'123'},'2026-27')

    def test_fixture_bridge_rejects_ambiguous_and_previous_season_events(self):
        fixture, summary=game()
        event={'id':'123','season':{'year':2027,'type':2},'competitions':summary['header']['competitions']}
        self.assertEqual(match_event(fixture,{'events':[event]},2027),'123')
        with self.assertRaises(ValueError):
            match_event(fixture,{'events':[event,event]},2027)
        event['season']['year']=2026
        with self.assertRaises(ValueError):
            match_event(fixture,{'events':[event]},2027)

    def test_atomic_failure_preserves_previous_export(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'snapshot.json'
            path.write_text('last good')
            with patch('export_player_rest.os.replace', side_effect=OSError('disk error')):
                with self.assertRaises(OSError): atomic_write_payload(path,{'valid':True})
            self.assertEqual(path.read_text(),'last good')
            self.assertEqual(len(list(Path(directory).iterdir())),1)
            with self.assertRaises(ValueError): atomic_write_payload(path,{'invalid':float('nan')})
            self.assertEqual(path.read_text(),'last good')

    def test_efg_sampling_error_uses_actual_three_point_second_moment(self):
        self.assertAlmostEqual(efg_se(1,2,1),75)
        self.assertTrue(math.isnan(efg_se(1,1,1)))
        self.assertTrue(math.isnan(efg_se(0,0,0)))

if __name__=='__main__': unittest.main()
