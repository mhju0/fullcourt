"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { wordmarkLetters } from "@/lib/brand/wordmark-kern";
import { NBA_SEASONS } from "@/lib/nba-season";
import { signedNumber } from "@/lib/signed-number";

/**
 * The marketing page. Deliberately unlike the app: dark, oversized display type — but
 * since 2026-08-20, calm. The scroll choreography (a pinned section, scrub-tied reveals,
 * full-viewport-per-section) was reviewed by hand and retired as one decision — see
 * FRONTEND.md §"/ — the front door". What remains is ONE motion grammar: content arrives
 * once, fast (350ms, 12px rise, 45ms stagger — the subtle tier), and never moves again.
 * Sections take the height their content earns. The chosen direction was prototyped and
 * approved against two alternatives; the record is docs/design/explorations/.
 *
 * Two constraints shaped it. Every visual is CSS or inline SVG rather than a remote
 * image, so the CSP in `next.config.ts` needs no widening and nothing can silently
 * fail to load in production. And GSAP is imported inside an effect, so it lands in
 * this route's chunk instead of the app's shared bundle.
 */

const INK = "#0B0D10";
const BONE = "#F5F1E8";
const DIM = "#8A8F98";

/** Film grain, inline so it costs no request and no img-src allowance. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")";

/**
 * The brand idea as geometry: a court split unevenly, which is what the model measures.
 *
 * Since 2026-08-19 this draws the canonical Split Ink construction (see
 * `src/lib/brand/court-mark-geometry.ts`): the 60×32 court and the ratified 20.6° lean,
 * with the divider drawn on the slash's *centerline* — top (36,0) to bottom (24,32),
 * centroid on the court's center — because at background opacity a stroked line reads
 * where the mark proper uses a filled band.
 */
function CourtSplit({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 44" className={className} aria-hidden="true">
      {/* The divider fades out at both ends instead of stopping dead on the court's edge.
          A butt cap on a slanted line meets a horizontal border at a slant, so each end
          showed as a blunt off-angle notch sitting just past the rule. The gradient runs
          along the line itself (userSpaceOnUse, same endpoints), so the stroke emerges and
          dissolves rather than being cut. */}
      <defs>
        <linearGradient id="fc-court-split" gradientUnits="userSpaceOnUse" x1="42" y1="6" x2="30" y2="38">
          <stop offset="0" stopColor={BONE} stopOpacity="0" />
          <stop offset="0.22" stopColor={BONE} stopOpacity="0.55" />
          <stop offset="0.78" stopColor={BONE} stopOpacity="0.55" />
          <stop offset="1" stopColor={BONE} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g transform="translate(6 6)">
        <rect x="0" y="0" width="60" height="32" rx="1.2" fill="none" stroke={BONE} strokeOpacity=".28" strokeWidth=".65" />
        {/* The two data poles, dark-tuned: teal = rested, rose = fatigued. Same hues the app
            charts use, re-stepped for this ink ground (the light-tuned tokens sit outside the
            dark lightness band) and validated as a pair against #0B0D10. */}
        <path d="M0 0 H36 L24 32 H0 Z" fill="#0E9CBE" fillOpacity=".13" />
        <path d="M36 0 H60 V32 H24 Z" fill="#F43F5E" fillOpacity=".08" />
      </g>
      <path d="M42 6 L30 38" stroke="url(#fc-court-split)" strokeWidth=".8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Card copy is held to ONE OR TWO sentences of 10–20 words. The cards sit in a 3-across
 * grid whose rows share a height, so one long description stretches its whole row.
 */
const SURFACES = [
  { name: "Games", href: "/games", copy: "Every season's slate by date, with fatigue scores, rest gaps, and live scores during the season." },
  { name: "Season Report", href: "/season", copy: "One season read end to end: how the rest call scored, and what each schedule was worth in wins." },
  { name: "Schedule Edge", href: "/schedule", copy: "Which teams a season's schedule favoured, counted in games with a real rest edge and priced in wins." },
  { name: "Model Results", href: "/analysis", copy: "The backtest that scores the model against history: thresholds, season trends, and every individual game." },
  { name: "Playoff Rest", href: "/playoffs", copy: "What surviving a long series costs the round after, and the bracket picks that price it in." },
  { name: "Player Shooting", href: "/shooting", copy: "Every player's shooting on no rest against three days off. One season of it is noise." },
];

// Shot Value is intentionally absent: this list names the six tabs in the nav bar, and Shot
// Value lives in the OTHER menu alongside the other reference surfaces. Listing it here made
// the page claim seven surfaces while the bar showed six.

/**
 * A surface card's resting skin and its interactive state.
 *
 * Every one of these is a utility rather than an inline `style`, and that is the fix itself:
 * an inline declaration outranks a class rule, so resting colors in `style={{…}}` silently
 * killed the hover utilities twice (PRs #33, #38). Never move these back into `style`.
 * Hover and focus-visible are written out twice on purpose: Tailwind scans source for literal
 * class strings, so composing `focus-visible:${…}` would compile to no CSS at all.
 */
const CARD_SKIN = [
  "border-[rgba(245,241,232,.14)]",
  "bg-[image:linear-gradient(180deg,rgba(245,241,232,.05),rgba(11,13,16,.6))]",
  "transition duration-200 motion-reduce:transition-none",
  "hover:border-[rgba(245,241,232,.48)] hover:bg-[color:rgba(245,241,232,.10)]",
  "focus-visible:border-[rgba(245,241,232,.48)] focus-visible:bg-[color:rgba(245,241,232,.10)]",
  "motion-safe:hover:-translate-y-0.5 motion-safe:focus-visible:-translate-y-0.5",
].join(" ");

/**
 * The standard each published number has to clear, and what each rule rules out.
 * The second column is the honest half: a rule is only worth stating if something
 * is given up for it.
 */
const STANDARD = [
  {
    rule: "Every number shows its sample size",
    rulesOut: "Not knowing whether a result came from three games or three hundred.",
  },
  {
    rule: "One model, used everywhere",
    rulesOut: "A game card quietly disagreeing with the backtest behind it.",
  },
  {
    rule: "Limits are published with results",
    rulesOut: "A small win being told as a big one.",
  },
];

/** What the fatigue score is assembled from, in the order the model applies it. */
const INPUTS = [
  { term: "Recent workload", detail: "Games in the last 30 days, decaying. Last night counts for far more than last week." },
  { term: "Travel", detail: "Miles between arenas, log-scaled. No phantom trips home." },
  { term: "Body clock", detail: "Time zones crossed, charged harder going east, fading as the team adjusts." },
  { term: "Back-to-backs", detail: "Weighted by the real hours between tip-offs, not just the calendar." },
  { term: "Altitude", detail: "Denver, Utah and Mexico City — plus the night after." },
  { term: "Density", detail: "Games per window against a normal pace, not a raw count." },
];

/** The naming anatomy from BRAND_GRAMMAR.md §2 — three readings of one word, not a sequence. */
const NAME_READINGS = [
  {
    term: "FULL",
    copy: `The whole record: every season since ${NBA_SEASONS[0]}, both arms of every split, the nulls published rather than buried.`,
  },
  {
    term: "COURT",
    copy: "The floor, and the trial. Home court is the confound the model refuses credit for — and the standard every claim is tried against.",
  },
  {
    term: "FULL-COURT",
    copy: "A full-court press covers both ends of the floor. So does the measurement: the rate and its baseline, the finding and its limit.",
  },
];

/* The heading counts the list rather than stating a number, so adding a surface can
   never leave the page claiming a total it no longer has. Spelled out because a
   numeral reads wrong at display size next to the rest of this page's headings. */
const COUNT_WORD = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

export interface AboutStats {
  games: number;
  /**
   * How often the home team wins regardless of rest. Both `*EdgePp` figures below are
   * measured from here rather than from 50, because every game they count is a home game.
   */
  baselinePct: number;
  overallEdgePp: number;
  widestEdgePp: number;
  widestEdgeGames: number;
}

/**
 * Sections take the height their content earns. The full-viewport-per-section rule
 * (min-h 100svh each) was retired 2026-08-20: with the motion calmed, the empty
 * theater seats between content blocks *were* the awkward scrolling.
 *
 * Hairline convention (reviewed by hand, 2026-08-20): rules on this page sit BELOW
 * text, never above — except in top-aligned row lists (the inputs grid, the naming
 * rows, the standard's rows), where a top rule is a row separator. Stated in
 * FRONTEND.md §"/ — the front door".
 */
const SECTION = "py-28";

/** Em dash, not a zero: a figure that could not be read must not look like a measurement. */
const NO_FIGURE = "—";

export function AboutContent({ stats }: { stats: AboutStats | null }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The resting CSS state is fully visible, so reduced-motion needs no effect at all.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        // The hero assembles once on load. A plain `from` is safe here alone — it has no
        // ScrollTrigger, so a refresh can never re-apply its start state.
        gsap.from(".fc-hero-in", { y: 16, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power1.out" });

        /**
         * The one grammar for everything below the hero: arrive once, fast, never move
         * again. 350ms / 12px / 45ms stagger — the subtle reveal tier; the old 900ms
         * reveals with 120ms stagger were two to three times slower than the
         * micro-interaction band and read as the page performing.
         *
         * **Anything driven by a ScrollTrigger uses `fromTo`, never `from`.** A `from`
         * tween infers its end values when built, and a later `ScrollTrigger.refresh()`
         * (which the library performs on its own after a resize or once webfonts land)
         * can re-apply the start state to a live trigger — six invisible surface cards
         * shipped exactly that way. Stating both ends removes the failure mode, and
         * `e2e/home.spec.ts` asserts the settled visibility.
         */
        const reveal = (targets: string, trigger: Element) => {
          gsap.fromTo(
            targets,
            { y: 12, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.35,
              ease: "power1.out",
              stagger: 0.045,
              scrollTrigger: { trigger, start: "top 90%", once: true },
            }
          );
        };

        for (const [sectionSel, itemSel] of [
          [".fc-thesis", ".fc-thesis p"],
          [".fc-naming", ".fc-name"],
          [".fc-evidence", ".fc-evidence-item"],
          [".fc-inputs", ".fc-input"],
          [".fc-standard", ".fc-rule"],
          [".fc-cards-section", ".fc-card"],
          [".fc-outro", ".fc-outro-item"],
        ] as const) {
          const section = root.current?.querySelector(sectionSel);
          if (section) reveal(itemSel, section);
        }
      }, root);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    // Full-bleed escape from the app's max-w-7xl / py-8 container.
    <div
      ref={root}
      className="-my-8"
      style={{ marginInline: "calc(50% - 50vw)", background: INK, color: BONE, overflowX: "clip" }}
    >
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.15, backgroundImage: GRAIN }} />

      {/* ── 1. The claim ──────────────────────────────────────── */}
      <header
        className="relative flex flex-col items-center justify-center px-6 py-16 text-center"
        style={{ minHeight: "calc(88svh - var(--term-chrome-h))" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 65% 55% at 50% 42%, rgba(14,156,190,.16) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 78% 78%, rgba(244,63,94,.12) 0%, transparent 65%)" }}
        />
        <CourtSplit className="pointer-events-none absolute left-1/2 top-1/2 w-[min(76rem,130%)] -translate-x-1/2 -translate-y-1/2 opacity-[0.13]" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <h1
            className="fc-hero-in font-heading font-bold"
            style={{ fontSize: "clamp(2.6rem,7vw,5.4rem)", lineHeight: 0.98, letterSpacing: "-0.035em" }}
          >
            Rest is a stat
          </h1>
          {/* Mechanism-led, to complete the headline: if the h1 asserts that rest is a stat,
              the line under it should name what the stat is made of. The start season is
              derived rather than typed, and it is a start date rather than a count on
              purpose — the evidence section already carries the season count. */}
          <p className="fc-hero-in mx-auto mt-7 max-w-xl" style={{ color: DIM, fontSize: "1.05rem", lineHeight: 1.65 }}>
            Travel, days off and schedule density — scored for every team in every game since{" "}
            {NBA_SEASONS[0]}.
          </p>
          {/* The early path to the product (2026-08-20): the page serves a credibility read
              AND product visitors, and its only CTA sat five screens down. Whisper weight so
              it does not compete with the headline; distinct wording from the outro CTA
              because e2e pins that accessible name at exactly one element. */}
          <Link
            href="/games"
            className="fc-hero-in relative mt-8 inline-block pb-0.5 text-sm opacity-55 transition-opacity hover:opacity-90 focus-visible:opacity-90 motion-reduce:transition-none"
            style={{ color: BONE, borderBottom: "1px solid rgba(245,241,232,.3)" }}
          >
            Skip to the games board &rarr;
          </Link>
        </div>
      </header>

      {/* ── 2. Why it matters ─────────────────────────────────── */}
      <section className={`fc-thesis mx-auto w-full max-w-5xl px-6 ${SECTION}`}>
        <p className="font-heading font-medium" style={{ fontSize: "clamp(1.9rem,4.6vw,3.4rem)", lineHeight: 1.16, letterSpacing: "-0.03em", maxWidth: "24ch" }}>
          Every game starts uneven. The schedule decided that months ago.
        </p>
      </section>

      {/* ── 3. The name ───────────────────────────────────────── */}
      {/* The naming anatomy from BRAND_GRAMMAR.md §2. COURT takes the dark-ground brand
          indigo — the one accent moment this page spends, the same rule as the nav and OG
          lockups (W4). */}
      <section className={`fc-naming mx-auto w-full max-w-5xl px-6 ${SECTION}`}>
        {/* The wordmark is this section's h2, not decoration above one — every sibling
            section leads with an h2, and this keeps the heading outline intact. */}
        <h2
          className="fc-name font-heading font-bold"
          style={{ fontSize: "clamp(2.6rem,7vw,5.4rem)", lineHeight: 0.95, letterSpacing: "-0.03em" }}
        >
          {/* Per-letter kerns from wordmark-kern.ts (2026-08-24), margins on top of the
              base tracking — same table as the nav and OG lockups. */}
          {wordmarkLetters().map((l, i) => (
            <span
              key={i}
              style={{
                color: l.accent ? "#818CF8" : undefined,
                marginLeft: l.kernEm === 0 ? undefined : `${l.kernEm}em`,
              }}
            >
              {l.char}
            </span>
          ))}
        </h2>
        <div className="mt-9 flex flex-col">
          {NAME_READINGS.map((part) => (
            // No numbering: three readings of one word, not a sequence. Top rules are row
            // separators here — the sanctioned top-aligned-list exception.
            <div
              key={part.term}
              className="fc-name grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[9rem_1fr] sm:items-baseline"
              style={{ borderTop: "1px solid rgba(245,241,232,.12)" }}
            >
              <span className="mono" style={{ fontSize: 13, letterSpacing: "0.14em" }}>{part.term}</span>
              <p className="max-w-[52ch]" style={{ color: DIM, lineHeight: 1.65 }}>{part.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. What it found ──────────────────────────────────── */}
      <section className={`fc-evidence mx-auto w-full max-w-7xl px-6 ${SECTION}`}>
        <h2 className="fc-evidence-item font-heading font-bold" style={{ fontSize: "clamp(1.7rem,3.6vw,2.6rem)", letterSpacing: "-0.03em", maxWidth: "20ch" }}>
          Evidence, not just the eye test
        </h2>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-16">
          <div className="fc-evidence-item">
            <span
              className="font-heading block font-bold"
              // The rested pole as display text: brighter than the mark-tuned #0E9CBE so a
              // headline numeral keeps headline contrast (~8:1 on this ground).
              style={{ fontSize: "clamp(4.4rem,12vw,9rem)", lineHeight: 0.85, letterSpacing: "-0.04em", color: "#2CB6D9" }}
            >
              {stats ? signedNumber(stats.widestEdgePp, 1) : NO_FIGURE}
            </span>
            <p className="mt-6 max-w-[34ch]" style={{ color: BONE, fontSize: "1.05rem", lineHeight: 1.6 }}>
              Win-rate points above what a home team wins anyway
              {stats ? ` (${stats.baselinePct.toFixed(1)}%)` : ""}, when the rest gap is at its
              widest, across{" "}
              {stats ? `${stats.widestEdgeGames.toLocaleString()} games` : "the widest rest gaps"}.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {/* Rules BELOW the stat blocks, per the hairline convention above: a rule over a
                stat read as clutter next to the centered blocks around it. */}
            <div className="fc-evidence-item" style={{ borderBottom: "1px solid rgba(245,241,232,.14)", paddingBottom: "1.25rem" }}>
              <span className="font-heading font-bold" style={{ fontSize: "clamp(1.6rem,3.2vw,2.2rem)", lineHeight: 1 }}>
                {NBA_SEASONS.length} seasons
              </span>
              <p className="mt-3 max-w-[46ch]" style={{ color: DIM, lineHeight: 1.6 }}>
                {stats ? `${stats.games.toLocaleString()} completed games` : "Every completed game"} where the model made a call. The
                ones it reads as too close carry no claim at all.
              </p>
            </div>
            <div className="fc-evidence-item" style={{ borderBottom: "1px solid rgba(245,241,232,.14)", paddingBottom: "1.25rem" }}>
              {/* Same quantity as the headline figure (edge over the venue baseline), so the
                  same rested-pole display teal. */}
              <span
                className="font-heading font-bold"
                style={{ fontSize: "clamp(1.6rem,3.2vw,2.2rem)", lineHeight: 1, color: "#2CB6D9" }}
              >
                {stats ? signedNumber(stats.overallEdgePp, 1) : NO_FIGURE}
              </span>
              <p className="mt-3 max-w-[46ch]" style={{ color: DIM, lineHeight: 1.6 }}>
                Across every call it makes, not only the strongest — and measured against home
                court rather than a coin flip, which is most of what a raw win rate here would
                be. Much of the underlying gap is structural — geography and broadcast windows,
                not favouritism.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. What the score is made of ──────────────────────── */}
      {/* No pin since 2026-08-20: holding ~1.1 viewports of scroll while the screen stood
          still was the page's one scroll-jack, and the hand review called it. The inputs
          arrive like everything else; `nav-bar.tsx` no longer needs the pinned flag. */}
      <section className={`fc-inputs mx-auto w-full max-w-7xl px-6 ${SECTION}`}>
        <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-16">
          <div>
            <h2 className="fc-input font-heading font-bold" style={{ fontSize: "clamp(1.7rem,3.6vw,2.6rem)", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              What the score is made of
            </h2>
            <p className="fc-input mt-5 max-w-sm" style={{ color: DIM, lineHeight: 1.65 }}>
              Six measurements of the same night, combined into one number per team. Each is a
              physical fact about the schedule, not a rating of the roster.
            </p>
          </div>

          <ol className="grid gap-x-10 sm:grid-cols-2">
            {INPUTS.map((input, i) => (
              <li
                key={input.term}
                className="fc-input grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 py-4"
                style={{ borderTop: "1px solid rgba(245,241,232,.12)" }}
              >
                <span className="mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(245,241,232,.3)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-heading text-lg font-bold">{input.term}</h3>
                  <p className="mt-1.5 max-w-[38ch] text-sm" style={{ color: DIM, lineHeight: 1.6 }}>{input.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 6. The standard ───────────────────────────────────── */}
      <section className={`fc-standard mx-auto w-full max-w-5xl px-6 ${SECTION}`}>
        <h2 className="fc-rule font-heading font-bold" style={{ fontSize: "clamp(1.7rem,3.6vw,2.6rem)", letterSpacing: "-0.03em", maxWidth: "22ch" }}>
          How a number earns its place
        </h2>
        <p className="fc-rule mt-4 max-w-[46ch]" style={{ color: DIM, fontSize: "1.05rem", lineHeight: 1.6 }}>
          Three rules, and what each one costs.
        </p>

        <div
          className="mt-10 overflow-hidden rounded-2xl border"
          style={{ borderColor: "rgba(245,241,232,.14)", background: "rgba(245,241,232,.035)" }}
        >
          {/* The label is a column header, stated once. */}
          <div
            className="mono hidden gap-8 px-8 py-4 md:grid md:grid-cols-[1.1fr_1fr]"
            style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(245,241,232,.4)", borderBottom: "1px solid rgba(245,241,232,.12)" }}
          >
            <span>THE RULE</span>
            <span>WHAT IT RULES OUT</span>
          </div>

          {STANDARD.map((s, i) => (
            <div
              key={s.rule}
              className="fc-rule grid gap-x-8 gap-y-2 px-8 py-6 md:grid-cols-[1.1fr_1fr] md:items-baseline"
              style={{ borderTop: i === 0 ? undefined : "1px solid rgba(245,241,232,.12)" }}
            >
              <p className="font-heading font-bold" style={{ fontSize: "clamp(1.1rem,1.8vw,1.4rem)", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
                {s.rule}
              </p>
              <p style={{ color: DIM, lineHeight: 1.6 }}>{s.rulesOut}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 7. Where to use it ────────────────────────────────── */}
      <section className={`fc-cards-section mx-auto w-full max-w-7xl px-6 ${SECTION}`}>
        <h2 className="fc-card font-heading mb-10 font-bold" style={{ fontSize: "clamp(1.7rem,3.6vw,2.6rem)", letterSpacing: "-0.03em" }}>
          {/* "tabs", not "surfaces": this row is the nav bar, and there are more surfaces than
              tabs. The OTHER menu is named underneath instead. */}
          {COUNT_WORD[SURFACES.length]} tabs
        </h2>
        {/* A labelled landmark: this is a second, distinct set of navigation links, and
            each one's accessible name is "<label> <copy>" because the card is one target.
            A 3-across grid since 2026-08-20 — the fixed-height single row went with the
            full-viewport rule, and the preview glyphs went with it: at this card size they
            read as decoration, not wayfinding (approved in the P1 prototype). */}
        <nav aria-label="Product surfaces" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              className={`fc-card group block rounded-xl border p-5 ${CARD_SKIN}`}
            >
              <span
                aria-hidden="true"
                className="mono flex items-baseline justify-between gap-2 text-[rgba(245,241,232,.34)] transition-colors duration-200 group-hover:text-[rgba(245,241,232,.62)] group-focus-visible:text-[rgba(245,241,232,.62)] motion-reduce:transition-none"
                style={{ fontSize: 11, letterSpacing: "0.1em" }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{s.href}</span>
                  <span className="transition-transform duration-200 motion-reduce:transition-none motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5">
                    &rarr;
                  </span>
                </span>
              </span>
              <span className="font-heading mt-3 block text-lg font-bold leading-tight">{s.name}</span>
              <span className="mt-2 block text-sm" style={{ color: DIM, lineHeight: 1.55 }}>
                {s.copy}
              </span>
            </Link>
          ))}
        </nav>

        {/* Outside the nav landmark on purpose: e2e/home.spec.ts asserts the card row is
            exactly six links, and these three are the bar's OTHER menu rather than tabs. */}
        <p className="mt-6 text-sm" style={{ color: DIM, lineHeight: 1.7 }}>
          Three more sit behind the bar&rsquo;s <span className="mono">OTHER</span> menu, smaller
          in scope but finished the same way:{" "}
          <Link href="/shot-quality" className="underline underline-offset-2">
            Shot Value
          </Link>
          ,{" "}
          <Link href="/availability" className="underline underline-offset-2">
            Availability Cost
          </Link>{" "}
          and{" "}
          <Link href="/referees" className="underline underline-offset-2">
            Referee Effect
          </Link>
          .
        </p>
      </section>

      {/* ── 8. The way in ─────────────────────────────────────── */}
      <section className="fc-outro px-6 pb-28 pt-32 text-center">
        <h2 className="fc-outro-item font-heading mx-auto max-w-4xl font-bold" style={{ fontSize: "clamp(2.2rem,6.5vw,4.6rem)", lineHeight: 0.98, letterSpacing: "-0.035em" }}>
          Read the schedule before it reads you
        </h2>
        {/* `/games`, not `/`: a CTA pointing at `/` would scroll the reader back to the top
            of the page they are already on. */}
        <div className="fc-outro-item">
          <Link
            href="/games"
            className="mt-10 inline-block rounded-full px-9 py-4 text-sm font-semibold transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
            style={{ background: BONE, color: INK }}
          >
            Open the games board
          </Link>
        </div>
        {/* The operating line (BRAND_GRAMMAR §8): the brand's sign-off, spent here and on
            the OG card only. */}
        <p className="fc-outro-item mono mt-9" style={{ fontSize: 11, letterSpacing: "0.24em", color: "rgba(245,241,232,.42)" }}>
          READ AGAINST THE BASELINE
        </p>
      </section>
    </div>
  );
}
