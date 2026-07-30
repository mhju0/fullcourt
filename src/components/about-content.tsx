"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { NBA_SEASONS } from "@/lib/nba-season";

/**
 * The marketing page. Deliberately unlike the app: dark, cinematic, motion-led.
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

/** The brand idea as geometry: a court split unevenly, which is what the model measures. */
function CourtSplit({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <rect x="8" y="8" width="224" height="134" rx="4" fill="none" stroke={BONE} strokeOpacity=".28" strokeWidth="2" />
      <path d="M8 8 H150 L96 142 H8 Z" fill="#2563EB" fillOpacity=".13" />
      <path d="M150 8 H232 V142 H96 Z" fill="#DC2626" fillOpacity=".08" />
      <path d="M150 8 L96 142" stroke={BONE} strokeOpacity=".55" strokeWidth="2.5" />
      <circle cx="120" cy="75" r="22" fill="none" stroke="#A16207" strokeOpacity=".7" strokeWidth="2" />
    </svg>
  );
}

/**
 * A miniature of what each page actually draws — fatigue bars, a diverging ranking, the
 * backtest columns, a bracket, the arc. Inline SVG, no data, no request: it fills the
 * surface cards with a preview rather than decoration, so the glyph is wayfinding.
 */
function SurfaceGlyph({ kind }: { kind: number }) {
  const blue = "#2563EB";
  const red = "#DC2626";
  const line = "rgba(245,241,232,.22)";
  const common = { viewBox: "0 0 120 56", className: "w-full", "aria-hidden": true as const };

  if (kind === 0)
    return ( // Games — two fatigue bars, unequal
      <svg {...common}>
        <rect x="4" y="14" width="112" height="7" rx="3.5" fill={line} />
        <rect x="4" y="14" width="62" height="7" rx="3.5" fill={blue} />
        <rect x="4" y="33" width="112" height="7" rx="3.5" fill={line} />
        <rect x="4" y="33" width="88" height="7" rx="3.5" fill={red} />
      </svg>
    );

  if (kind === 1)
    return ( // Schedule Edge — a ranking diverging from zero
      <svg {...common}>
        {[14, 9, 4, -6, -12].map((v, i) => (
          <rect
            key={i}
            x={v >= 0 ? 60 : 60 + v * 3.2}
            y={5 + i * 10}
            width={Math.abs(v) * 3.2}
            height="6"
            rx="3"
            fill={v >= 0 ? blue : red}
          />
        ))}
        <rect x="59.4" y="3" width="1.2" height="52" fill={line} />
      </svg>
    );

  if (kind === 2)
    return ( // Model Results — backtest columns off a coin-flip baseline
      <svg {...common}>
        {[13, 18, 27, 34].map((h, i) => (
          <rect key={i} x={12 + i * 26} y={46 - h} width="15" height={h} rx="2" fill={blue} />
        ))}
        <rect x="4" y="46" width="112" height="1.2" fill={line} />
      </svg>
    );

  if (kind === 3)
    return ( // Playoff Predictions — a bracket converging
      <svg {...common} fill="none" stroke={line} strokeWidth="1.6">
        <path d="M6 10h26v18h26M6 46h26V28" />
        <path d="M114 10H88v18H62M114 46H88V28" />
        <circle cx="60" cy="28" r="4.5" fill={blue} stroke="none" />
      </svg>
    );

  return ( // Player Shooting — the same player on no rest and on three days off
    <svg {...common}>
      {[0, 1, 2].map((g) => (
        <g key={g} transform={`translate(${6 + g * 40} 0)`}>
          <rect x="0" y={48 - [22, 31, 27][g]} width="12" height={[22, 31, 27][g]} rx="2" fill={red} opacity=".75" />
          <rect x="15" y={48 - [30, 26, 38][g]} width="12" height={[30, 26, 38][g]} rx="2" fill={blue} />
        </g>
      ))}
      <rect x="4" y="48" width="112" height="1.2" fill={line} />
    </svg>
  );
}

const SURFACES = [
  { name: "Games", href: "/", copy: "Any season's slate by date, each team's fatigue score, and the rest gap between them — with live scores." },
  { name: "Schedule Edge", href: "/schedule", copy: "Which teams a season's schedule favoured, counted in games with a real rest edge. Scoped to its own season, always." },
  { name: "Model Results", href: "/analysis", copy: "The backtest that scores the model against history: thresholds, season trends, and every individual game." },
  { name: "Playoff Predictions", href: "/playoffs", copy: "Series winners from the same rest lineage, with walk-forward accuracy shown beside in-sample." },
  { name: "Player Shooting", href: "/shooting", copy: "Every player's shooting on no rest against three days off, season by season. One season of it is noise, and the page says so." },
];

// Shot Value is intentionally absent: this list names the five tabs in the nav bar, and Shot
// Value lives in the OTHER menu alongside the other reference surfaces. Listing it here made
// the page claim six surfaces while the bar showed five.


/**
 * The standard each published number has to clear, and what each rule rules out.
 *
 * These were numbered 01/02/03 in a sticky card stack. They are three principles applied
 * in parallel, not three steps in a sequence, so the numbering encoded nothing — and the
 * stack cost a viewport per card to say one sentence. The second column is the honest half:
 * a rule is only worth stating if something is given up for it.
 */
const STANDARD = [
  {
    rule: "A number ships with its sample size",
    rulesOut:
      "Rates with no n attached. A split measured over three games would otherwise read exactly like one measured over three hundred.",
  },
  {
    rule: "One engine, never duplicated",
    rulesOut:
      "A matchup card that quietly disagrees with the backtest. Every pipeline writer and every read share one source of truth, so the number on screen is the number that was tested.",
  },
  {
    rule: "Limits publish beside results",
    rulesOut:
      "Rounding a finding up. Out-of-sample accuracy sits next to in-sample, and a calibration win is called a calibration win rather than an accuracy jump.",
  },
];

/** What the fatigue score is assembled from, in the order the model applies it. */
const INPUTS = [
  { term: "Recent workload", detail: "Every game in the last 30 days, decaying — last night counts for far more than last week." },
  { term: "Travel", detail: "Great-circle miles between consecutive arenas, log-scaled, with no phantom trips home." },
  { term: "Body clock", detail: "Two or more hours of time shift, charged harder eastward and decaying as the team re-entrains." },
  { term: "Back-to-backs", detail: "Sharpened by the real gap between tip-offs, because a late game into an early one is not 24 hours." },
  { term: "Altitude", detail: "Denver, Utah and Mexico City, plus a smaller residue the night after." },
  { term: "Density", detail: "Games per rolling window measured against a normal pace, not a raw count." },
];

/* The heading counts the list rather than stating a number, so adding a surface can
   never leave the page claiming a total it no longer has. Spelled out because a
   numeral reads wrong at display size next to the rest of this page's headings. */
const COUNT_WORD = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

export interface AboutStats {
  games: number;
  overallEdgePp: number;
  widestEdgePp: number;
  widestEdgeGames: number;
}

/** Every section is one viewport minus the sticky chrome, so nothing lands half-visible. */
const VIEW = "flex min-h-[calc(100svh-72px)] flex-col justify-center";

const signedPp = (v: number) => (v >= 0 ? `+${v.toFixed(1)}` : `\u2212${Math.abs(v).toFixed(1)}`);

export function AboutContent({ stats }: { stats: AboutStats }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
        gsap.from(".fc-hero-in", { y: 30, opacity: 0, duration: 1.1, stagger: 0.12, ease: "power3.out" });

        // Scrubbing reveal: words brighten in sequence as the sentence is read past.
        //
        // Only `end` controls when the last word lands. Under scrub the whole stagger timeline
        // is normalised across the scroll span, so raising or lowering `stagger` changes the
        // spacing of the wave but never its finish — the final word always lights exactly at
        // the end trigger. This previously ended on "center 55%", which resolves to the
        // section's top reaching 5% of the viewport: the sentence only completed once it was
        // dead centre, so the reader arrived at a paragraph that was still lighting up.
        //
        // "top 25%" finishes it while the sentence sits about three-quarters down the screen,
        // so it is fully lit on arrival and centring it is the reward rather than the trigger.
        gsap.to(".fc-word", {
          opacity: 1,
          stagger: 0.5,
          ease: "none",
          scrollTrigger: { trigger: ".fc-thesis", start: "top 80%", end: "top 25%", scrub: true },
        });

        gsap.utils.toArray<HTMLElement>(".fc-rise").forEach((el) => {
          gsap.fromTo(
            el,
            { scale: 0.94, opacity: 0.4 },
            {
              scale: 1,
              opacity: 1,
              ease: "power2.out",
              scrollTrigger: { trigger: el, start: "top 90%", end: "top 58%", scrub: true },
            }
          );
        });

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
      <header className={`relative items-center px-6 text-center ${VIEW}`}>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 65% 55% at 50% 42%, rgba(37,99,235,.16) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 78% 78%, rgba(161,98,7,.12) 0%, transparent 65%)" }}
        />
        <CourtSplit className="pointer-events-none absolute left-1/2 top-1/2 w-[min(80rem,140%)] -translate-x-1/2 -translate-y-1/2 opacity-[0.13]" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <h1
            className="fc-hero-in font-heading font-bold"
            style={{ fontSize: "clamp(2.6rem,7vw,5.6rem)", lineHeight: 0.98, letterSpacing: "-0.035em" }}
          >
            Rest is a stat
          </h1>
          <p className="fc-hero-in mx-auto mt-8 max-w-xl" style={{ color: DIM, fontSize: "1.05rem", lineHeight: 1.65 }}>
            FullCourt measures what the schedule does to a team before the ball is tipped —
            travel, rest and density, across {`${NBA_SEASONS.length} seasons`} of evidence.
          </p>
        </div>

        {/* A scroll cue rather than buttons. With nothing to click, the page still has to say
            that it continues — and a hairline says it without competing with the headline. */}
        <div aria-hidden="true" className="fc-hero-in absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(245,241,232,.34)" }}>SCROLL</span>
          <span style={{ width: 1, height: 44, background: "linear-gradient(rgba(245,241,232,.34), transparent)" }} />
        </div>
      </header>

      {/* ── 2. Why it matters ─────────────────────────────────── */}
      <section className={`fc-thesis mx-auto max-w-5xl px-6 ${VIEW}`}>
        {/* Larger than the old copy carried: at ten words this has to hold a whole screen,
            where the previous twenty-four-word version filled it by length alone. */}
        <p className="font-heading font-medium" style={{ fontSize: "clamp(2.1rem,5.6vw,4.4rem)", lineHeight: 1.15, letterSpacing: "-0.03em" }}>
          {"Every game starts uneven. The schedule decided that months ago."
            .split(" ")
            .map((w, i) => (
              <span key={i} className="fc-word" style={{ opacity: 0.12 }}>
                {w}{" "}
              </span>
            ))}
        </p>
      </section>

      {/* ── 3. What it found ──────────────────────────────────── */}
      <section className={`mx-auto w-full max-w-7xl px-6 ${VIEW}`}>
        <h2 className="font-heading font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em", maxWidth: "20ch" }}>
          Evidence, not just the eye test
        </h2>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-16">
          <div className="fc-rise">
            <span
              className="font-heading block font-bold"
              style={{ fontSize: "clamp(5rem,15vw,11rem)", lineHeight: 0.85, letterSpacing: "-0.04em", color: "#7FA9FF" }}
            >
              {signedPp(stats.widestEdgePp)}
            </span>
            <p className="mt-6 max-w-[34ch]" style={{ color: BONE, fontSize: "1.05rem", lineHeight: 1.6 }}>
              Win-rate points above a coin flip when the rest gap is at its widest, across{" "}
              {stats.widestEdgeGames.toLocaleString()} games.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <div className="fc-rise" style={{ borderTop: "1px solid rgba(245,241,232,.14)", paddingTop: "1.5rem" }}>
              <span className="font-heading font-bold" style={{ fontSize: "clamp(2rem,4vw,3rem)", lineHeight: 1 }}>
                {`${NBA_SEASONS.length} seasons`}
              </span>
              <p className="mt-3 max-w-[46ch]" style={{ color: DIM, lineHeight: 1.6 }}>
                {stats.games.toLocaleString()} completed games where the model made a call. The
                ones it reads as too close carry no claim at all.
              </p>
            </div>
            <div className="fc-rise" style={{ borderTop: "1px solid rgba(245,241,232,.14)", paddingTop: "1.5rem" }}>
              <span className="font-heading font-bold" style={{ fontSize: "clamp(2rem,4vw,3rem)", lineHeight: 1, color: "#E0A340" }}>
                {signedPp(stats.overallEdgePp)}
              </span>
              <p className="mt-3 max-w-[46ch]" style={{ color: DIM, lineHeight: 1.6 }}>
                Across every call it makes, not only the strongest. Much of the underlying gap is
                structural — geography and broadcast windows, not favouritism.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Where to use it ────────────────────────────────── */}
      <section className={`mx-auto w-full max-w-7xl px-6 ${VIEW}`}>
        <h2 className="font-heading mb-12 font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em" }}>
          {COUNT_WORD[SURFACES.length]} surfaces
        </h2>
        {/* A labelled landmark: this is a second, distinct set of navigation links, and
            each one's accessible name is "<label> <copy>" because the card is one target. */}
        <nav aria-label="Product surfaces" className="flex flex-col gap-2 lg:h-[24rem] lg:flex-row">
          {SURFACES.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-xl border p-6 transition-colors duration-300 hover:border-[rgba(245,241,232,.34)] hover:bg-[rgba(245,241,232,.04)]"
              style={{ borderColor: "rgba(245,241,232,.14)", background: "linear-gradient(180deg,rgba(245,241,232,.05),rgba(11,13,16,.6))" }}
            >
              <span
                aria-hidden="true"
                className="mono flex items-baseline justify-between gap-2"
                style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(245,241,232,.34)" }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate">{s.href}</span>
              </span>

              <div aria-hidden="true" className="my-5 px-1 opacity-70 transition-opacity duration-500 group-hover:opacity-100">
                <SurfaceGlyph kind={i} />
              </div>

              <div className="lg:min-h-[8.5rem]">
                <span className="font-heading block whitespace-nowrap text-xl font-bold">{s.name}</span>
                <span className="mt-3 block max-w-[30rem] text-sm" style={{ color: DIM, lineHeight: 1.6 }}>
                  {s.copy}
                </span>
              </div>
            </Link>
          ))}
        </nav>
      </section>

      {/* ── 5. What the score is made of ──────────────────────── */}
      <section className={`mx-auto w-full max-w-7xl px-6 ${VIEW}`}>
        <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-20">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <h2 className="font-heading font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              What the score is made of
            </h2>
            <p className="mt-6 max-w-sm" style={{ color: DIM, lineHeight: 1.65 }}>
              Six measurements of the same night, combined into one number per team. Each is a
              physical fact about the schedule, not a rating of the roster.
            </p>
          </div>

          <ol className="flex flex-col">
            {INPUTS.map((input, i) => (
              <li
                key={input.term}
                className="fc-rise grid grid-cols-[2.5rem_1fr] items-baseline gap-x-5 py-6"
                style={{ borderTop: i === 0 ? undefined : "1px solid rgba(245,241,232,.12)" }}
              >
                <span className="mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(245,241,232,.3)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-heading text-xl font-bold">{input.term}</h3>
                  <p className="mt-2 max-w-[54ch]" style={{ color: DIM, lineHeight: 1.6 }}>{input.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 6. The standard ───────────────────────────────────── */}
      <section className={`mx-auto w-full max-w-6xl px-6 ${VIEW}`}>
        <h2 className="font-heading font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em", maxWidth: "22ch" }}>
          How a number earns its place
        </h2>
        <p className="mt-6 max-w-[52ch]" style={{ color: DIM, lineHeight: 1.65 }}>
          Three rules, and what each one costs. A rule is only worth stating if something is
          given up for it.
        </p>

        <dl className="mt-14 flex flex-col">
          {STANDARD.map((s, i) => (
            <div
              key={s.rule}
              className="fc-rise grid gap-x-14 gap-y-3 py-8 md:grid-cols-2"
              style={{ borderTop: "1px solid rgba(245,241,232,.14)", borderBottom: i === STANDARD.length - 1 ? "1px solid rgba(245,241,232,.14)" : undefined }}
            >
              <dt className="font-heading font-bold" style={{ fontSize: "clamp(1.3rem,2.4vw,1.9rem)", lineHeight: 1.2, letterSpacing: "-0.015em" }}>
                {s.rule}
              </dt>
              <dd>
                <span className="mono block" style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(245,241,232,.34)" }}>
                  RULES OUT
                </span>
                <p className="mt-2.5" style={{ color: DIM, lineHeight: 1.65 }}>{s.rulesOut}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── 7. The way in ─────────────────────────────────────── */}
      <section className={`items-center px-6 text-center ${VIEW}`}>
        <h2 className="font-heading mx-auto max-w-4xl font-bold" style={{ fontSize: "clamp(2.3rem,7.5vw,6rem)", lineHeight: 0.98, letterSpacing: "-0.035em" }}>
          Read the schedule before it reads you
        </h2>
        <Link
          href="/"
          className="mt-12 inline-block rounded-full px-9 py-4 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          style={{ background: BONE, color: INK }}
        >
          Open the games board
        </Link>
      </section>
    </div>
  );
}
