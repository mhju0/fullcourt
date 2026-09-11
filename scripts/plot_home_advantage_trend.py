"""Render the exploratory snapshot: python3 scripts/plot_home_advantage_trend.py."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/research/2026-09-11-home-advantage-trend'
data = json.loads(BASE.with_suffix('.json').read_text())
rows = data['perSeason']
x = [r['startYear'] for r in rows]
fig, axes = plt.subplots(2, 1, figsize=(11, 7), sharex=True,
                         gridspec_kw={'height_ratios': [2, 1]})
fig.subplots_adjust(top=.86, bottom=.20, left=.09, right=.97, hspace=.23)
fig.suptitle('Home teams win less often than they did in the 1980s',
             x=.09, ha='left', fontsize=17, fontweight='bold', y=.97)
fig.text(.09, .91, 'FullCourt eligible NBA regular-season games · 1985–86 to 2025–26 · Annual observations', fontsize=10)
axes[0].plot(x, [r['homeWinPct'] for r in rows], color='#176b91',
             marker='o', markersize=3, label='All eligible home teams')
axes[0].plot(x, [r['homeRestedWinPct'] for r in rows], color='#b35c20',
             marker='s', markersize=3, linestyle='--', label='Rested home teams')
axes[0].axhline(50, color='#777777', linewidth=.8, linestyle=':')
axes[0].set_ylim(49, 72)
axes[0].yaxis.set_major_formatter(PercentFormatter())
axes[0].set_ylabel('Win rate')
axes[0].legend(loc='upper center', frameon=False)
axes[1].plot(x, [r['homeRestedLiftVsSeasonBaselinePp'] for r in rows],
             color='#694b82', marker='o', markersize=3)
axes[1].axhline(0, color='#777777', linewidth=.8)
axes[1].set_ylabel('Rested-home gap\n(percentage points)')
axes[1].set_ylim(-2.5, 5)
axes[1].set_title('Gap above each season’s home baseline', loc='left', fontsize=11)
for ax in axes:
    ax.axvspan(2018.5, 2020.5, color='#777777', alpha=.10)
    ax.grid(axis='y', alpha=.18)
    ax.spines[['top', 'right']].set_visible(False)
    ax.set_xlim(1984.5, 2025.5)
axes[0].text(2019.5, 70.6, 'COVID\nseasons', ha='center', va='top', fontsize=8, color='#555555')
ticks = [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]
axes[1].set_xticks(ticks, [f'{v}–{str(v+1)[-2:]}' for v in ticks], fontsize=9)
fig.text(.09, .07, '47,143 games; both fatigue records required. “Home” is the designated home team; Orlando bubble excluded.\nRested means FullCourt’s existing fatigue-score classification. Gaps are descriptive, not causal rest effects.\nShading marks 2019–20 (pre-bubble games only) and 2020–21. Source and methods: companion research note.', fontsize=9, linespacing=1.5)
fig.savefig(BASE.with_suffix('.png'), dpi=170)
print(BASE.with_suffix('.png'))
