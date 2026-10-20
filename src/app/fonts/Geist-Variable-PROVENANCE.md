# Pinned UI fonts

These unmodified full variable WOFF2 files replace build-time Google Fonts requests.
Both retain the prior UI families and `font-display: swap`, exposing their full 100–900
weight axes through `next/font/local`.
The existing static TTF files serve the separate Open Graph image.

| File | Official source | SHA-256 |
| --- | --- | --- |
| `Geist-Variable.woff2` | [Geist 1.800 at a6d260e6](https://github.com/vercel/geist-font/blob/a6d260e6cbc07eafdfad438f33601fe3c38b1e6f/fonts/Geist/webfonts/Geist%5Bwght%5D.woff2) | `2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1` |
| `GeistMono-Variable.woff2` | [Geist Mono 1.700 at 77f0563c](https://github.com/vercel/geist-font/blob/77f0563c03009d6c15c6342183fa53b352255b22/fonts/GeistMono/webfonts/GeistMono%5Bwght%5D.woff2) | `afaacc4c5fbba89d2ebf7a02dc4070208540874592a5504d57175782fe893101` |

Copyright 2024 The Geist Project Authors. Both source commits contain the identical
[SIL Open Font License 1.1](Geist-Variable-OFL.txt), SHA-256
`c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90`.

The successful pre-change Next.js build used Google Fonts' Geist 1.800 and Geist Mono
1.701 subsets. On 2026-10-21, FontTools compared every cached subset's Unicode-mapped
glyph at all previously loaded weights: 400/500/600/700 for Geist, 400/600/700 for
Geist Mono. Across 5,109 comparisons, the pinned full fonts had identical glyph outlines
and advance widths; vertical metrics were also identical. The Mono version label differs,
but these checks found no glyph or metric change. Full fonts preserve the former Latin,
Latin-extended, Cyrillic and Vietnamese coverage, plus Mono symbols.

The two full font preloads total 141,356 bytes, versus 52,396 bytes for the previous
Latin-only preloads. No font transformation, dependency or build-time network fetch is needed.
