from copy import deepcopy
from datetime import date
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_current_shooting import build_snapshot, match_event, parse_summary
from player_appearance_history import annotate_outcomes
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


def disputed_game():
    summary = json.loads((Path(__file__).parent / 'fixtures' / 'espn-summary-401909095.json').read_text())
    fixture = dict(gid='canonical-bos-nyk', date=date(2026, 10, 23), home='BOS', away='NYK',
                   homeScore=107, awayScore=103)
    return fixture, summary


class CurrentShootingTests(unittest.TestCase):
    def test_authentic_missing_minutes_preserve_unknown_history_and_exact_shooting(self):
        fixture, summary = disputed_game()
        outcomes, history = parse_summary(summary, fixture, '401909095', 2027)
        disputed = next(row for row in history if row['pid'] == 'espn:5211983')
        self.assertEqual(disputed, dict(pid='espn:5211983', gid=fixture['gid'], date=fixture['date'],
                                         state='unknown', min=None))
        self.assertNotIn('espn:5211983', {row['pid'] for row in outcomes})
        for team, attempts, made, threes, points in [('NYK', 80, 36, 16, 103), ('BOS', 87, 40, 15, 107)]:
            rows = [row for row in outcomes if row['team'] == team]
            self.assertEqual(sum(row['fga'] for row in rows), attempts)
            self.assertEqual(sum(row['fgm'] for row in rows), made)
            self.assertEqual(sum(row['fg3m'] for row in rows), threes)
            block = next(group['statistics'][0] for group in summary['boxscore']['players']
                         if group['team']['abbreviation'] == ('NY' if team == 'NYK' else team))
            self.assertEqual(sum(int(dict(zip(block['labels'], entry['stats']))['PTS'])
                                 for entry in block['athletes'] if entry.get('stats')), points)
        result = build_snapshot([fixture], {fixture['gid']: summary}, {fixture['gid']: '401909095'}, '2026-27')
        self.assertEqual(result['publication']['observedGames'], 1)
        self.assertEqual(result['publication']['missingGameIds'], [])
        self.assertEqual(sum(row[5] for row in result['seasons']), 167)
        self.assertTrue(all(pid.startswith('espn:') for pid in result['playerIds']))

    def test_authentic_unknown_row_withholds_later_rest_and_workload(self):
        first, a = game()
        disputed, b = disputed_game()
        last, c = game(date(2026, 10, 24), 'canonical-next', '125')
        for summary in (a, c):
            summary['boxscore']['players'][0]['statistics'][0]['athletes'][0]['athlete']['id'] = '5211983'
        fixtures = [first, disputed, last]
        summaries = {row['gid']: summary for row, summary in zip(fixtures, (a, b, c))}
        ids = dict(zip(summaries, ('123', '401909095', '125')))
        history = []
        outcomes = []
        for fixture in fixtures:
            rows, appearances = parse_summary(summaries[fixture['gid']], fixture, ids[fixture['gid']], 2027)
            outcomes.extend(rows)
            history.extend(appearances)
        annotated, _ = annotate_outcomes(outcomes, history, {})
        target = next(row for row in annotated if row['pid'] == 'espn:5211983' and row['gid'] == last['gid'])
        self.assertIsNone(target['rest'])
        self.assertIsNone(target['load7'])
        self.assertIsNone(target['min7'])
        self.assertTrue(target['restUncertain'])
        result = build_snapshot(fixtures, summaries, ids, '2026-27')
        player = result['seasons'][result['playerIds'].index('espn:5211983')]
        self.assertEqual(player[5:11], [2, 150, 0, 0, 0, 0])
        self.assertEqual(result['publication']['restUncertainOutcomes'], 1)

    def test_unknown_history_preserves_a_rest_arm_when_both_possible_gaps_are_rested(self):
        first, a = game()
        disputed, b = disputed_game()
        last, c = game(date(2026, 10, 26), 'canonical-next', '125')
        for summary in (a, c):
            summary['boxscore']['players'][0]['statistics'][0]['athletes'][0]['athlete']['id'] = '5211983'
        result = build_snapshot([first, disputed, last], {first['gid']: a, disputed['gid']: b, last['gid']: c},
                                {first['gid']: '123', disputed['gid']: '401909095', last['gid']: '125'}, '2026-27')
        player = result['seasons'][result['playerIds'].index('espn:5211983')]
        self.assertEqual(player[5:11], [2, 150, 0, 0, 1, 150])
        self.assertEqual(result['publication']['restUncertainOutcomes'], 0)

    def test_attempts_with_missing_minutes_establish_rest_without_inventing_duration(self):
        for free_throw_only in (False, True):
            with self.subTest(free_throw_only=free_throw_only):
                first, summary = game()
                stats = summary['boxscore']['players'][0]['statistics'][0]['athletes'][0]['stats']
                stats[0] = '--'
                if free_throw_only:
                    stats[1:] = ['1', '0-0', '0-0', '1-2']
                    first['homeScore'] = 1
                    summary['header']['competitions'][0]['competitors'][0]['score'] = '1'
                outcomes, history = parse_summary(summary, first, '123', 2027)
                self.assertEqual(next(row for row in history if row['pid'] == 'espn:0')['state'], 'played')
                self.assertIsNone(next(row for row in history if row['pid'] == 'espn:0')['min'])
                self.assertEqual('espn:0' in {row['pid'] for row in outcomes}, not free_throw_only)
                second, next_summary = game(date(2026, 10, 21), 'canonical-next', '124')
                next_outcomes, next_history = parse_summary(next_summary, second, '124', 2027)
                annotated, _ = annotate_outcomes(outcomes + next_outcomes, history + next_history, {})
                target = next(row for row in annotated if row['pid'] == 'espn:0' and row['gid'] == second['gid'])
                self.assertEqual(target['rest'], 1)
                self.assertEqual(target['load7'], 1)
                self.assertIsNone(target['min7'])

    def test_zero_shot_positive_minutes_still_establish_an_appearance(self):
        fixture, summary = game()
        entry = summary['boxscore']['players'][0]['statistics'][0]['athletes'][1]
        entry.update(active=False, reason="COACH'S DECISION", stats=['0:01', '0', '0-0', '0-0', '0-0'])
        outcomes, history = parse_summary(summary, fixture, '123', 2027)
        row = next(row for row in history if row['pid'] == 'espn:1')
        self.assertEqual(row['state'], 'played')
        self.assertAlmostEqual(row['min'], 1 / 60)
        self.assertNotIn('espn:1', {row['pid'] for row in outcomes})

    def test_missing_minutes_do_not_relax_malformed_clock_or_dnp_guards(self):
        for minutes in (None, '', '-', 'unknown', '-1', '1.5', '1:60', '1:99', '1:001', '1:xx'):
            with self.subTest(minutes=minutes):
                fixture, summary = game()
                summary['boxscore']['players'][0]['statistics'][0]['athletes'][0]['stats'][0] = minutes
                with self.assertRaisesRegex(ValueError, 'participation minutes|elapsed minutes'):
                    parse_summary(summary, fixture, '123', 2027)
        fixture, summary = disputed_game()
        entry = next(entry for group in summary['boxscore']['players']
                     for entry in group['statistics'][0]['athletes'] if entry['athlete']['id'] == '5211983')
        entry['didNotPlay'] = True
        with self.assertRaisesRegex(ValueError, 'DNP'):
            parse_summary(summary, fixture, '401909095', 2027)
        fixture, summary = game()
        summary['boxscore']['players'][0]['statistics'][0]['athletes'][0]['didNotPlay'] = True
        with self.assertRaisesRegex(ValueError, 'DNP'):
            parse_summary(summary, fixture, '123', 2027)

    def test_missing_minutes_do_not_relax_complete_boxscore_guards(self):
        fixture, summary = disputed_game()
        missing_team = deepcopy(summary)
        missing_team['boxscore']['players'].pop()
        missing_column = deepcopy(summary)
        missing_column['boxscore']['players'][0]['statistics'][0]['labels'].remove('PTS')
        partial_stats = deepcopy(summary)
        partial_stats['boxscore']['players'][0]['statistics'][0]['athletes'][0]['stats'].pop()
        for bad in (missing_team, missing_column, partial_stats):
            with self.subTest(summary=bad['boxscore']['players'][0]['team']):
                with self.assertRaisesRegex(ValueError, 'Missing ESPN|Incomplete ESPN'):
                    parse_summary(bad, fixture, '401909095', 2027)
        fixture, summary = game()
        summary['boxscore']['players'][0]['statistics'][0]['athletes'][1]['stats'] = ['--', '2', '1-1', '0-0', '0-0']
        with self.assertRaisesRegex(ValueError, 'scoring/participation coverage'):
            parse_summary(summary, fixture, '123', 2027)

    def test_unknown_minutes_cannot_supply_missing_team_participation(self):
        fixture, summary = game()
        summary['boxscore']['players'][0]['statistics'][0]['athletes'][4]['stats'] = ['--', '0', '0-0', '0-0', '0-0']
        with self.assertRaisesRegex(ValueError, 'participation coverage'):
            parse_summary(summary, fixture, '123', 2027)

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
