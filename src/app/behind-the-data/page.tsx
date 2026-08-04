import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import { Note, Prose, Section } from "@/components/behind-the-data-parts";
import { BEHIND_THE_DATA_SECTIONS } from "@/lib/behind-the-data-sections";
import { NBA_SEASONS } from "@/lib/nba-season";

export const metadata: Metadata = {
  title: "Behind the Data",
  description:
    "How every FullCourt number is calculated — the fatigue model, schedule edge, playoff predictions, player shooting, shot value and availability cost, with their sources, their limits, and where each has no measurable edge.",
};

/** Every section but the overview itself, for the index list below. */
type ModelSectionHref = Exclude<
  (typeof BEHIND_THE_DATA_SECTIONS)[number]["href"],
  "/behind-the-data"
>;

const MODEL_SECTIONS = BEHIND_THE_DATA_SECTIONS.filter(
  (s): s is Extract<
    (typeof BEHIND_THE_DATA_SECTIONS)[number],
    { href: ModelSectionHref }
  > => s.href !== "/behind-the-data"
);

/**
 * Keyed exhaustively on purpose. This was a `Record<string, string>`, so when
 * `/behind-the-data/availability` was added the index rendered its label above an empty
 * description and a finished section read as an unfinished one. A missing entry is now a
 * compile error rather than a blank line nobody notices.
 */
const BLURB: Record<ModelSectionHref, string> = {
  "/behind-the-data/rest-advantage":
    "The fatigue score: eight terms, what each constant is, and which of them actually carry the result.",
  "/behind-the-data/schedule-edge":
    "How a season's schedule is scored for and against a team, and why the count is games rather than days.",
  "/behind-the-data/playoff-predictions":
    "The grind tax and whether it is just the better team, the series model's features, and why its edge is calibration rather than accuracy.",
  "/behind-the-data/player-shooting":
    "No rest against three days off, and how much of any player's split is noise.",
  "/behind-the-data/shot-value":
    "Expected shooting value by court location, and the defender data public sources do not have.",
  "/behind-the-data/availability":
    "What counts as a missing rotation player, why an absence is priced above replacement, and why the schedule terms survive the control.",
  "/behind-the-data/data-and-limits":
    "Where the data comes from, which seasons carry which fields, and what is excluded on purpose.",
};

export default function BehindTheDataPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA"
      title="Behind the data"
      description="Every model with a section here, written out: the terms, the constants, the thresholds, and the measured results. Referee Effect has no section because that surface is still being built."
    >
      <Section label="HOW TO READ ANY NUMBER HERE" descriptor="THREE RULES">
        <Prose>
          <strong>Sample size travels with the claim.</strong> A rate without an n attached is
          not evidence, so every rate on the site carries the count it came from. Where a split
          is inside the noise, it is drawn muted rather than left to look like a finding.
        </Prose>
        <Prose>
          <strong>Nothing is tuned against its own backtest.</strong>{" "}
          The fatigue model&rsquo;s constants were set by reasoning about the physical effect
          rather than fitted to the win rates this site publishes. One has since moved: the
          altitude multiplier was raised on 2026-08-02 to match altitude&rsquo;s measured size
          against a back-to-back on final margin — a different target from these win rates, and
          recorded as such. A model fitted to maximise its own reported accuracy would report
          whatever accuracy it was asked for.
        </Prose>
        <Prose>
          <strong>Limits are published beside results.</strong> Each section ends with what its
          model cannot see. Those lists are the most useful part of this reference: they are the
          conditions under which the number on the product page is wrong.
        </Prose>
        <Note>
          Data spans {`${NBA_SEASONS.length} seasons`}, 1985-86 to the present. Not every field
          reaches back that far — see Data &amp; limits for which seasons carry what.
        </Note>
      </Section>

      <Section label="SECTIONS" descriptor={`${MODEL_SECTIONS.length} PAGES`}>
        <div className="flex flex-col">
          {MODEL_SECTIONS.map((section, i) => (
            // The accent bar is an `inset` box-shadow rather than a `border-left` so hovering
            // causes no layout shift, and the row's own padding absorbs the 2px nudge. Colour
            // lives in a Tailwind class, NOT in `style` — an inline `color` outranks any
            // non-`!important` class, which is exactly why this row's hover state silently did
            // nothing before 2026-07-30 (see FRONTEND.md on inline-style specificity).
            <Link
              key={section.href}
              href={section.href}
              className="group flex flex-col gap-1 py-3.5 pl-0 transition-[box-shadow,transform,background-color,padding-left] duration-200 hover:translate-x-0.5 hover:bg-[var(--term-surface-2)] hover:pl-2.5 hover:shadow-[inset_2px_0_0_var(--term-red)] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--term-border)" }}
            >
              <span className="mono flex items-center gap-1.5 text-[var(--term-text)] transition-colors group-hover:text-[var(--term-red)]"
                style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}
              >
                {section.label}
                <ChevronRight
                  className="size-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                  aria-hidden
                />
              </span>
              <span style={{ fontSize: 14, color: "var(--term-text-muted)", lineHeight: 1.5, maxWidth: "46rem" }}>
                {BLURB[section.href]}
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </BehindTheDataShell>
  );
}
