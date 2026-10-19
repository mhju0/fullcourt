"""Season-level replay, independent-oracle and diagnostic publication impacts."""
import collections
import hashlib
import json
from oracle import P, R, load, rawsave, csvout

def side(gap):
    return 'neutral' if abs(gap) < .5 else 'home' if gap > 0 else 'away'

def size(gap):
    return 'neutral' if abs(gap) < .5 else 'small' if abs(gap) < 3 else 'medium' if abs(gap) < 5 else 'large'

def rate(wins, count):
    return 100*wins/count if count else None

def main():
    games, results, scores = load('games'), load('replay-games'), load('scores')
    oracle_anomalies = load('oracle-anomalies')
    replays = load('replay-anomalies')
    byseason = collections.defaultdict(list)
    for row in results:
        byseason[row['season']].append(row)
    outcomes, season_counts, impact = [], [], []
    gd = {g['id']:g for g in games}
    for row in results:
        if row['diagnostic_score_change'] or side(row['replay_gap']) != side(row['zero_home_streak_gap']):
            impact.append({**row, 'stored_side':side(row['stored_gap']), 'replay_side':side(row['replay_gap']), 'diagnostic_side':side(row['zero_home_streak_gap']), 'replay_size':size(row['replay_gap']), 'diagnostic_size':size(row['zero_home_streak_gap'])})
    for season in sorted(byseason):
        rows = byseason[season]
        eligible = [r for r in rows if r['publishable'] and r['decidable'] and not r['neutral_site']]
        n, hw = len(eligible), sum(r['home_won'] for r in eligible)
        sco = [s for s in scores if gd[s['game_id']]['season'] == season]
        old = [g for g in games if g['season'] == season]
        oa = [a for a in oracle_anomalies if a['season'] == season]
        season_counts.append({'season':season, 'games':len(rows), 'team_games':2*len(rows), 'final_games':sum(r['status']=='final' for r in rows), 'scheduled_games':sum(r['status']=='scheduled' for r in rows), 'regular_games':sum(r['game_type']=='regular' for r in rows), 'postseason_games':sum(r['game_type']!='regular' for r in rows), 'neutral_games':sum(r['neutral_site'] for r in rows), 'published_outcome_games':n, 'home_venue_baseline_pct':rate(hw,n), 'road_venue_baseline_pct':rate(n-hw,n), 'null_tip_games':sum(g['tip_off_utc'] is None for g in old), 'zero_ot_games_NOT_verified_no_ot':sum(g['overtime_periods']==0 for g in old), 'positive_ot_games':sum(g['overtime_periods']>0 for g in old), 'null_score_games':sum(g['home_score'] is None or g['away_score'] is None for g in old), 'null_rest_sides':sum(s['days_since_last_game'] is None for s in sco), 'zero_score_sides':sum(float(s['score'])==0 for s in sco), 'missing_score_sides':2*len(rows)-len(sco), 'computed_at_min':min(s['computed_at'] for s in sco), 'computed_at_max':max(s['computed_at'] for s in sco), 'stored_engine_field_mismatches':sum(a['game_id'] in {r['game_id'] for r in rows} for a in replays), 'oracle_stored_field_mismatches':sum(a['comparison']=='stored_vs_oracle' for a in oa), 'oracle_current_home_streak_mismatches':sum(a['comparison']=='stored_vs_oracle' and a['field']=='road_trip_consecutive_away' for a in oa), 'diagnostic_positive_home_score_reductions':sum(r['diagnostic_score_change']>0 for r in rows), 'published_side_changes':sum(side(r['replay_gap'])!=side(r['zero_home_streak_gap']) for r in eligible), 'published_size_changes':sum(size(r['replay_gap'])!=size(r['zero_home_streak_gap']) for r in eligible), 'published_threshold3_changes':sum((abs(r['replay_gap'])>=3)!=(abs(r['zero_home_streak_gap'])>=3) for r in eligible), 'published_threshold5_changes':sum((abs(r['replay_gap'])>=5)!=(abs(r['zero_home_streak_gap'])>=5) for r in eligible)})
        for scenario, gapfield in [('stored','stored_gap'), ('current_engine','replay_gap'), ('diagnostic_home_streak_zero','zero_home_streak_gap')]:
            for pick in ['home','away']:
                baseline = rate(hw if pick=='home' else n-hw,n)
                for bucket in ['all_calls','small','medium','large','threshold3','threshold5']:
                    selected = [r for r in eligible if side(r[gapfield])==pick and (bucket=='all_calls' or (bucket in ['small','medium','large'] and size(r[gapfield])==bucket) or bucket=='threshold3' and abs(r[gapfield])>=3 or bucket=='threshold5' and abs(r[gapfield])>=5)]
                    wins = sum(r['home_won'] if pick=='home' else not r['home_won'] for r in selected)
                    pct = rate(wins,len(selected))
                    outcomes.append({'season':season,'scenario':scenario,'rested_side':pick,'bucket':bucket,'games':len(selected),'wins':wins,'win_rate_pct':pct,'venue_baseline_pct':baseline,'lift_pp':pct-baseline if pct is not None else None,'published_baseline_games':n})
    csvout('season-counts.csv', season_counts)
    csvout('season-outcomes.csv', outcomes)
    all_eligible = [r for r in results if r['publishable'] and r['decidable'] and not r['neutral_site']]
    def aggregate(gapfield, pick):
        chosen=[r for r in all_eligible if side(r[gapfield])==pick]
        wins=sum(r['home_won'] if pick=='home' else not r['home_won'] for r in chosen)
        return {'games':len(chosen),'wins':wins,'win_rate_pct':rate(wins,len(chosen))}
    rawsave('diagnostic-impacts', impact)
    fingerprint_rows = sorted((a['comparison'],a['field'],a['season'],a['game_id'],a['team_id'],a['actual'],a['expected']) for a in oracle_anomalies)
    summary={'seasons':len(byseason),'season_min':min(byseason),'season_max':max(byseason),'all_games':len(games),'all_team_games':2*len(games),'published_outcome_games':len(all_eligible),'home_venue_baseline_pct':rate(sum(r['home_won'] for r in all_eligible),len(all_eligible)),'road_venue_baseline_pct':rate(sum(not r['home_won'] for r in all_eligible),len(all_eligible)),'current_engine':{p:aggregate('replay_gap',p) for p in ['home','away']},'diagnostic_home_streak_zero':{p:aggregate('zero_home_streak_gap',p) for p in ['home','away']},'all_games_positive_home_score_reductions':sum(r['diagnostic_score_change']>0 for r in results),'published_positive_home_score_reductions':sum(r['diagnostic_score_change']>0 for r in all_eligible),'published_side_changes':sum(side(r['replay_gap'])!=side(r['zero_home_streak_gap']) for r in all_eligible),'published_size_changes':sum(size(r['replay_gap'])!=size(r['zero_home_streak_gap']) for r in all_eligible),'published_threshold3_changes':sum((abs(r['replay_gap'])>=3)!=(abs(r['zero_home_streak_gap'])>=3) for r in all_eligible),'published_threshold5_changes':sum((abs(r['replay_gap'])>=5)!=(abs(r['zero_home_streak_gap'])>=5) for r in all_eligible),'max_diagnostic_home_score_reduction':max(impact,key=lambda r:r['diagnostic_score_change']),'oracle_anomaly_fingerprint_sha256':hashlib.sha256(json.dumps(fingerprint_rows,separators=(',',':')).encode()).hexdigest(),'oracle_anomaly_counts':dict(collections.Counter(a['comparison']+':'+a['field'] for a in oracle_anomalies))}
    period_rows = []
    final_seasons = sorted({r['season'] for r in all_eligible})
    recent10 = set(final_seasons[-10:])
    transitions = []
    for period, population in [('all_history', all_eligible), ('recent10', [r for r in all_eligible if r['season'] in recent10])]:
        for pick in ['home','away']:
            for bucket in ['all_calls','small','medium','large','threshold3','threshold5']:
                def mask(r, field):
                    gap = r[field]
                    return side(gap)==pick and (bucket=='all_calls' or bucket in ['small','medium','large'] and size(gap)==bucket or bucket=='threshold3' and abs(gap)>=3 or bucket=='threshold5' and abs(gap)>=5)
                before={r['game_id'] for r in population if mask(r,'replay_gap')}
                after={r['game_id'] for r in population if mask(r,'zero_home_streak_gap')}
                for scenario, ids in [('current_engine',before),('diagnostic_home_streak_zero',after)]:
                    chosen=[r for r in population if r['game_id'] in ids]
                    wins=sum(r['home_won'] if pick=='home' else not r['home_won'] for r in chosen)
                    baseline=rate(sum(r['home_won'] if pick=='home' else not r['home_won'] for r in population),len(population))
                    pct=rate(wins,len(chosen))
                    period_rows.append({'period':period,'scenario':scenario,'rested_side':pick,'bucket':bucket,'games':len(chosen),'wins':wins,'win_rate_pct':pct,'venue_baseline_pct':baseline,'lift_pp':pct-baseline if pct is not None else None,'baseline_games':len(population)})
                transitions.append({'period':period,'rested_side':pick,'bucket':bucket,'before':len(before),'after':len(after),'retained':len(before&after),'added':len(after-before),'lost':len(before-after),'net':len(after)-len(before)})
    csvout('period-outcomes.csv',period_rows)
    csvout('selection-transitions.csv',transitions)
    summary['recent10_seasons']=sorted(recent10)
    summary['headline_selection_transitions']=[r for r in transitions if r['rested_side']=='home' and r['bucket']=='all_calls']
    summary['canonical_generated_facts_reconciliation']={'eligible_games':len(all_eligible)==47112,'called_games':aggregate('replay_gap','home')['games']==27420,'called_wins':aggregate('replay_gap','home')['wins']==16778,'large_games':sum(r['replay_gap']>=5 for r in all_eligible)==3756,'large_wins':sum(r['replay_gap']>=5 and r['home_won'] for r in all_eligible)==2452}
    assert all(summary['canonical_generated_facts_reconciliation'].values())
    (P/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    assert sum(r['games'] for r in season_counts)==len(games)
    assert sum(r['team_games'] for r in season_counts)==len(scores)==103390
    assert sum(r['published_outcome_games'] for r in season_counts)==len(all_eligible)
    print(json.dumps(summary,indent=2))

if __name__=='__main__':
    main()
