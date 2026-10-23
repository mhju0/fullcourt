# Shooting columns prototype

Question: should attempts and eFG% be separate columns, grouped by rest, or grouped by measure?

Open `index.html` directly; no server is required. The same standalone file is at `/prototypes/shooting-columns.html` in this branch preview. A = owner order, B = grouped by rest, C = attempts side by side. Switch season to inspect actual zero-attempt rows. Data is a dated layout snapshot from committed player-rest and shooting-current artifacts. No dataset or definition is changed.

The app comparison is available in development at `/shooting?year=2025&variant=A|B|C`. Prototype rendering is gated out of production. ENERGY 1 / RHYTHM 1 / MOTION 1, preserving FullCourt's existing palette and numeric alignment. Owner selected B, revised to one header row total, with separate attempt/rate columns and the label "2+ days rest". The exact upper cutoff belongs only in Behind the Data. The production implementation is being built separately from this prototype. This branch stays out of main.
