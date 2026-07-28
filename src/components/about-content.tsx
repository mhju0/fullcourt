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

  return ( // Shot Value — the arc, denser at the rim
    <svg {...common}>
      <path d="M10 50a50 50 0 0 1 100 0" fill="none" stroke={line} strokeWidth="1.4" />
      {[16, 28, 42, 60, 78, 92, 104].map((x, i) => (
        <circle key={i} cx={x} cy={50 - Math.round(Math.sin((i / 6) * Math.PI) * 26)} r="3" fill={blue} opacity=".85" />
      ))}
      <circle cx="60" cy="48" r="5" fill={red} opacity=".7" />
    </svg>
  );
}

const SURFACES = [
  { name: "Games", href: "/", copy: "Any season's slate by date, each team's fatigue score, and the rest gap between them — with live scores." },
  { name: "Schedule Edge", href: "/schedule", copy: "Which teams a season's schedule favoured, in days of rest against their opponents. Scoped to its own season, always." },
  { name: "Model Results", href: "/analysis", copy: "The backtest that scores the model against history: thresholds, season trends, and every individual game." },
  { name: "Playoff Predictions", href: "/playoffs", copy: "Series winners from the same rest lineage, with walk-forward accuracy shown beside in-sample." },
  { name: "Shot Value", href: "/shot-quality", copy: "Expected efficiency by court location. Public data has no defender distance — so this is location value, and we name that limit." },
  { name: "Player Shooting", href: "/shooting", copy: "Every player's shooting on no rest against three days off, season by season. One season of it is noise, and the page says so." },
];

/* The heading counts the list rather than stating a number, so adding a surface can
   never leave the page claiming a total it no longer has. Spelled out because a
   numeral reads wrong at display size next to the rest of this page's headings. */
const COUNT_WORD = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

const METHOD = [
  { n: "01", h: "Ingest is gated on the season", p: "A daily job runs year-round and exits cleanly in the offseason, before touching the database. Nothing is written that the calendar cannot justify." },
  { n: "02", h: "One fatigue engine, never duplicated", p: "A single source of truth is shared by every pipeline writer and every API read, so the number on the card is the number in the backtest." },
  { n: "03", h: "The limits ship with the result", p: "Out-of-sample accuracy sits beside in-sample. A calibration win is called a calibration win, not an accuracy jump." },
];

export function AboutContent() {
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
        // `end` is measured off the section's CENTER, not its bottom. Ending on "bottom 45%"
        // meant the last word only lit once the element's bottom had climbed to mid-viewport
        // — by which point the paragraph's top was already scrolled off — so the sentence was
        // still finishing after the reader had left it. Centre-based, it completes while the
        // whole paragraph is on screen.
        gsap.to(".fc-word", {
          opacity: 1,
          stagger: 0.5,
          ease: "none",
          scrollTrigger: { trigger: ".fc-thesis", start: "top 80%", end: "center 55%", scrub: true },
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

        // Card stacking: each card dims and shrinks as the next slides over it.
        // Dimming is `brightness`, NOT `opacity`. These cards are sticky and physically
        // overlap, so a card at opacity 0.45 shows the card beneath it straight through —
        // card 02's heading rendered on top of card 01's paragraph. brightness() darkens
        // the same amount while the card stays opaque.
        const cards = gsap.utils.toArray<HTMLElement>(".fc-card");
        cards.forEach((card, i) => {
          if (i === cards.length - 1) return;
          gsap.fromTo(
            card,
            { scale: 1, filter: "brightness(1)" },
            {
              scale: 0.95,
              filter: "brightness(0.45)",
              ease: "none",
              scrollTrigger: { trigger: cards[i + 1], start: "top 85%", end: "top 32%", scrub: true },
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

      {/* ── Attention ─────────────────────────────────────────── */}
      <header className="relative flex min-h-[86svh] items-center justify-center px-6 py-28 text-center">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 65% 55% at 50% 42%, rgba(37,99,235,.16) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 78% 78%, rgba(161,98,7,.12) 0%, transparent 65%)" }}
        />
        <CourtSplit className="pointer-events-none absolute left-1/2 top-1/2 w-[min(80rem,140%)] -translate-x-1/2 -translate-y-1/2 opacity-[0.13]" />

        <div className="relative z-10 mx-auto max-w-5xl">
          {/* font-bold (700), not extrabold: layout.tsx loads Space Grotesk at 400/500/600/700,
              so an 800 request resolved to the 700 face anyway. The declaration now matches
              what renders — raise both together if this page ever wants a heavier display cut. */}
          <h1
            className="fc-hero-in font-heading font-bold"
            style={{ fontSize: "clamp(2.6rem,7vw,5.6rem)", lineHeight: 0.98, letterSpacing: "-0.035em" }}
          >
            Rest is a stat
          </h1>
          <p className="fc-hero-in mx-auto mt-8 max-w-xl" style={{ color: DIM, fontSize: "1.05rem", lineHeight: 1.65 }}>
            FullCourt measures what the schedule does to a team before the ball is tipped —
            travel, rest and density, across {NBA_SEASONS.length} seasons of evidence.
          </p>
          <div className="fc-hero-in mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-full px-8 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: BONE, color: INK }}
            >
              Open the games board
            </Link>
            <Link
              href="/analysis"
              className="rounded-full border px-8 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ borderColor: "rgba(245,241,232,.26)", color: BONE }}
            >
              See the backtest
            </Link>
          </div>
        </div>
      </header>

      {/* ── Interest: the thesis, revealed on scroll ──────────── */}
      <section className="fc-thesis mx-auto max-w-5xl px-6 py-40">
        <p className="font-heading font-medium" style={{ fontSize: "clamp(1.5rem,3.6vw,2.9rem)", lineHeight: 1.28, letterSpacing: "-0.02em" }}>
          {"A back-to-back in Denver is not the same game as three days rest at home. The schedule decides part of the result, and it does it quietly."
            .split(" ")
            .map((w, i) => (
              <span key={i} className="fc-word" style={{ opacity: 0.12 }}>
                {w}{" "}
              </span>
            ))}
        </p>
      </section>

      {/* ── Interest: gapless bento ───────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-40">
        <h2 className="font-heading mb-14 font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em", maxWidth: "20ch" }}>
          Evidence, not just the eye test
        </h2>
        {/* 6 columns, dense flow: 4+2 across rows one and two, then a full 6. No dead cells. */}
        <div className="grid auto-rows-[minmax(11rem,auto)] grid-flow-dense grid-cols-2 gap-3 md:grid-cols-6">
          <article className="fc-rise relative flex flex-col justify-end overflow-hidden rounded-xl border p-8 md:col-span-4 md:row-span-2" style={{ borderColor: "rgba(245,241,232,.14)", background: "linear-gradient(160deg,rgba(37,99,235,.10),rgba(11,13,16,0) 60%)" }}>
            <CourtSplit className="pointer-events-none absolute -right-10 -top-10 w-72 opacity-[0.16]" />
            <h3 className="font-heading text-2xl font-bold">{NBA_SEASONS.length} seasons, 38,985 games</h3>
            <p className="mt-3 max-w-[42ch]" style={{ color: DIM, lineHeight: 1.65 }}>
              Every rest-advantage claim carries the historical hit rate and sample size of its
              class. Matchups the model calls neutral make no claim at all.
            </p>
          </article>

          <article className="fc-rise flex flex-col justify-end rounded-xl border p-6 md:col-span-2" style={{ borderColor: "rgba(245,241,232,.14)" }}>
            <span className="font-heading font-bold" style={{ fontSize: "2.6rem", lineHeight: 1, color: "#7FA9FF" }}>+13.4</span>
            <p className="mt-2 text-sm" style={{ color: DIM }}>Win-rate points at a rest advantage of seven or more.</p>
          </article>

          <article className="fc-rise flex flex-col justify-end rounded-xl border p-6 md:col-span-2" style={{ borderColor: "rgba(245,241,232,.14)" }}>
            <span className="font-heading font-bold" style={{ fontSize: "2.6rem", lineHeight: 1, color: "#E0A340" }}>26</span>
            <p className="mt-2 text-sm" style={{ color: DIM }}>Days between the most and least favoured schedule last season.</p>
          </article>

          <article className="fc-rise flex flex-col justify-end rounded-xl border p-8 md:col-span-6" style={{ borderColor: "rgba(245,241,232,.14)", background: "linear-gradient(100deg,rgba(161,98,7,.10),rgba(11,13,16,0) 55%)" }}>
            <h3 className="font-heading text-2xl font-bold">Much of the gap is structural</h3>
            <p className="mt-3 max-w-[62ch]" style={{ color: DIM, lineHeight: 1.65 }}>
              Geography, arena availability and broadcast windows produce rest imbalance without
              anyone favouring anyone.
            </p>
          </article>
        </div>
      </section>

      {/* ── Interest: the product surfaces ─────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-40">
        <h2 className="font-heading mb-14 font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em" }}>
          {COUNT_WORD[SURFACES.length]} surfaces
        </h2>
        {/* A labelled landmark: this is a second, distinct set of navigation links, and
            each one's accessible name is "<label> <copy>" because the card is one target. */}
        <nav aria-label="Product surfaces" className="flex flex-col gap-2 lg:h-[26rem] lg:flex-row">
          {SURFACES.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              // Equal widths, and no width animation on hover. The card used to expand to
              // flex-[3.2], which re-wrapped its whole paragraph on every frame of the
              // transition — every line re-broke continuously, which read as chaos rather
              // than motion. Hover now changes only colour, which cannot reflow text.
              className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-xl border p-6 transition-colors duration-300 hover:border-[rgba(245,241,232,.34)] hover:bg-[rgba(245,241,232,.04)]"
              style={{ borderColor: "rgba(245,241,232,.14)", background: "linear-gradient(180deg,rgba(245,241,232,.05),rgba(11,13,16,.6))" }}
            >
              {/* Decorative, and aria-hidden for it: the index is ornament and the route is
                  already carried by href. Keeping them out of the accessible name leaves it
                  as "<label> <copy>", which is what e2e/about.spec.ts anchors on. */}
              <span
                aria-hidden="true"
                className="mono flex items-baseline justify-between gap-2"
                style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(245,241,232,.34)" }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate">{s.href}</span>
              </span>

              <div aria-hidden="true" className="my-6 px-1 opacity-70 transition-opacity duration-500 group-hover:opacity-100">
                <SurfaceGlyph kind={i} />
              </div>

              {/* Fixed height, so every card's text block starts at the same y and the
                  names sit on one line. Bottom-anchored blocks of differing copy length were
                  pushing each title to its own height, which read as a ragged row. */}
              <div className="lg:min-h-[9.5rem]">
                <span className="font-heading block whitespace-nowrap text-xl font-bold">{s.name}</span>
                {/* Always legible. This copy used to be lg:opacity-0 until hover, which left
                    tall empty boxes at rest — the accordion read as a loading state. */}
                <span
                  className="mt-3 block max-w-[30rem] text-sm"
                  style={{ color: DIM, lineHeight: 1.6 }}
                >
                  {s.copy}
                </span>
              </div>
            </Link>
          ))}
        </nav>
      </section>

      {/* ── Desire: stacking method cards ─────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-40">
        <h2 className="font-heading mb-14 font-bold" style={{ fontSize: "clamp(1.9rem,4.4vw,3.2rem)", letterSpacing: "-0.03em", maxWidth: "22ch" }}>
          How a number earns its place
        </h2>
        {METHOD.map((m, i) => (
          <article
            key={m.n}
            className="fc-card sticky top-[16vh] mb-6 flex min-h-[19rem] flex-col justify-between rounded-2xl border p-10"
            style={{ borderColor: "rgba(245,241,232,.16)", background: ["#12161B", "#161B22", "#1B2129"][i] }}
          >
            <span className="font-heading font-bold" style={{ fontSize: "clamp(2.6rem,6vw,5rem)", lineHeight: 1, color: "rgba(245,241,232,.14)" }}>
              {m.n}
            </span>
            <div>
              <h3 className="font-heading font-bold" style={{ fontSize: "clamp(1.4rem,2.8vw,2.1rem)", maxWidth: "22ch" }}>{m.h}</h3>
              <p className="mt-3 max-w-[46ch]" style={{ color: DIM, lineHeight: 1.65 }}>{m.p}</p>
            </div>
          </article>
        ))}
      </section>

      {/* ── Action ────────────────────────────────────────────── */}
      <section className="px-6 pb-44 pt-16 text-center">
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
