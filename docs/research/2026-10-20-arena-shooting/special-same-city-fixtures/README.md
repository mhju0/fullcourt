# Same-city physical arena exceptions

Research only, 2026-10-20. Both fixtures have direct primary evidence for the
actual building. Preserve their dates, designated teams, scores and game IDs;
the findings concern physical venue placement. No canonical fixture register,
coordinates, application code or database was changed. Root owns adoption.

| Game ID | Eastern date | Away at home | Actual building | Final score | Finding |
|---|---|---|---|---|---|
| 0020800969 | 2009-03-13 | CHI at PHI | Spectrum, Philadelphia | CHI 101–PHI 104 | Accept Spectrum farewell exception; reject Wachovia Center label for this fixture |
| 0021700067 | 2017-10-26 | BOS at MIL | UW-Milwaukee Panther Arena / MECCA, Milwaukee | BOS 96–MIL 89 | Accept MECCA return exception; use this physical building |

The root's retained NBA game-page captures provide the full native identities.
This supplement independently establishes the building despite conflicting or
insufficient modern game-page venue fields. Being in the same city does not
make either building the team's normal home arena for this fixture.

**Philadelphia.** The [AP postgame report published by 6abc on March 13, 2009](https://6abc.com/archive/6709354/)
identifies the 104–101 Philadelphia victory over Chicago as the “final NBA game
at the 42-year-old Spectrum.” It expressly distinguishes the usual Wachovia
Center across the street. This is evidence of the completed game, rather than
an announcement that the game was scheduled there. No large historical guide
was downloaded because the contemporary report directly closes the fixture.

**Milwaukee.** The [NBA official final scorer's report, page 1](https://statsdmz.nba.com/pdfs/20171026/20171026_BOSMIL.pdf)
heads the completed Boston–Milwaukee 96–89 box score with “Thursday, October 26,
2017 UW-Milwaukee Panther Arena, Milwaukee, WI.” Its visitor/home labels, final
period totals and date bind the physical building to this exact played fixture.
The [Bucks' October 20 team release](https://www.nba.com/bucks/release/bucks-replicate-famed-mecca-court-return-mecca-game-oct-26)
identifies “UW-Milwaukee Panther Arena, formerly known as the MECCA.” The release
provides the arena alias; the final scorer's report supplies the stronger
postgame placement. The separately retained [October 26 NBA feature](https://www.nba.com/news/milwaukee-bucks-return-mecca-face-boston-celtics?sf125889622=1)
is pregame corroboration only, and is not the evidence that the game occurred.

## Retained response bytes

Private captures and an index are under
`docs/audit/arena-shooting-correction/special-same-city-fixtures/`.
SHA-256 values cover decoded HTTP response bytes before local gzip compression.
The scorer PDF is retained directly, with locally extracted text for inspection.

| Source | SHA-256 |
|---|---|
| phi-spectrum-ap-postgame | 0dfc5812b11b8e87b157b046a883fb0f8aa085603cb789a33e54a424e2ac27dd |
| mil-mecca-official-final | f2d8cb5580253366dba917f9632802c4655d234f32f2bb7ff03f708bb5fb1d0c |
| mil-mecca-team-release | 0f0476438177569d49f6abeef551b24fd438893deaec6ecbc3677dc74c43ab3f |
| mil-mecca-nba-feature | 93000c8c0efb34825490f99d174bb156f735daef9f77049f9fe2e6d09ce09260 |

Verification: all four retained response hashes were recomputed successfully;
the AP actual result/building, official final report date/building/final score,
and team arena alias were checked in the authentic retained content. No
coordinate assertion or broader inventory completeness claim is made here.
