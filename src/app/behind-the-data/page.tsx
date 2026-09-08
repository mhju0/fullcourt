import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import { Note, Prose, Section } from "@/components/behind-the-data-parts";
import { BEHIND_THE_DATA_SECTIONS } from "@/lib/behind-the-data-sections";
import { NBA_SEASONS } from "@/lib/nba-season";
import { LEAD, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles";

export const metadata: Metadata = {
  title: "Behind the Data",
  description:
    "Methods, data sources, results, and limitations for FullCourt's schedule, shooting, availability, playoff, and referee analyses.",
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
    "The fatigue score's terms and constants, how it is evaluated, and what changes when each term is removed.",
  "/behind-the-data/schedule-edge":
    "How a season's schedule is scored for and against a team, what one rest edge is worth in wins, and why the count is games rather than days.",
  "/behind-the-data/playoff-predictions":
    "Previous-round workload, the role of team strength, and how the series model's probabilities compare with its picks.",
  "/behind-the-data/player-shooting":
    "No rest against three days off, and how much of any player's split is noise.",
  "/behind-the-data/shot-value":
    "Expected shooting value by court location, and the shot context the model omits.",
  "/behind-the-data/availability":
    "What counts as a missing rotation player, how absence cost is estimated, and how the schedule estimates change after controlling for it.",
  "/behind-the-data/officiating":
    "What the NBA reviewed, how missed calls and incorrect whistles are counted, and why the findings describe selected close-game endings.",
  "/behind-the-data/referees":
    "How crew-level records are compared with random assignments, and why an extreme referee-and-player record needs a chance baseline.",
  "/behind-the-data/time-zones":
    "A test of eastward travel on short rest found no added predictive value after controlling for team strength and other schedule factors.",
  "/behind-the-data/data-and-limits":
    "Where the data comes from, which seasons carry which fields, and what is excluded on purpose.",
};

/**
 * The measured nulls, each linking to the section that holds its evidence. An entry earns its
 * row only once the empty result is actually published on the linked page — this list points
 * at evidence, it never carries a figure of its own.
 */
const NULL_RESULTS = [
  {
    label: "SEASON WIN TOTALS",
    href: "/behind-the-data/schedule-edge",
    finding:
      "Teams with more favorable schedules did not consistently beat their preseason win-total lines in the archived sample.",
  },
  {
    label: "TIME ZONES",
    href: "/behind-the-data/time-zones",
    finding:
      "Adding travel direction and short-rest terms did not improve held-out predictions. Team strength differs across the eastward and westward samples.",
  },
  {
    label: "REFEREE FOLKLORE",
    href: "/behind-the-data/referees",
    finding:
      "The named-pair records and home-favoring patterns tested here did not exceed their chance comparisons. Foul volume differed between officials' games.",
  },
  {
    label: "OUT-PICKING THE PLAYOFF FAVOURITE",
    href: "/behind-the-data/playoff-predictions",
    finding:
      "Overall accuracy was close to always choosing the home-court team. Log loss and Brier score improved, indicating more useful probability estimates.",
  },
] as const;

export default function BehindTheDataPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA"
      title="Behind the data"
      description="Data sources, calculations, evaluation methods, and limits for each analysis."
    >
      <Section label="HOW TO READ ANY NUMBER HERE" descriptor="THREE RULES">
        <Prose>
          <strong>Read the sample size with the rate.</strong> The count shows how many games or
          attempts support a percentage. Differences that do not clear the stated uncertainty
          threshold appear in muted text.
        </Prose>
        <Prose>
          <strong>Check how the model was evaluated.</strong>{" "}
          The fatigue model&rsquo;s constants were set by reasoning about the physical effect
          rather than fitted to the win rates this site publishes. One has since moved: the
          altitude multiplier was raised on 2026-08-02 to match altitude&rsquo;s measured size
          against a back-to-back on final margin, a different target from these win rates.
          The separate fitted models document their training samples and held-out tests.
          Performance on data used to fit a model can overstate its predictive value.
        </Prose>
        <Prose>
          <strong>Read the limitations.</strong> Each section describes missing inputs,
          assumptions, and questions the analysis cannot answer. They determine how far a
          result can reasonably be generalized.
        </Prose>
        <Note>
          Data spans {`${NBA_SEASONS.length} seasons`}, 1985-86 to the present. Not every field
          reaches back that far. See Data &amp; limits for coverage by field.
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
              className="group flex flex-col gap-1 py-4 pl-0 transition-[box-shadow,transform,background-color,padding-left] duration-200 hover:translate-x-0.5 hover:bg-[var(--term-surface-2)] hover:pl-3 hover:shadow-[inset_2px_0_0_var(--term-red)] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--term-border)" }}
            >
              <span className="mono flex items-center gap-2 text-[var(--term-text)] transition-colors group-hover:text-[var(--term-red-text)]"
                style={{ fontSize: 12, fontWeight: 700, letterSpacing: TRACK.data }}
              >
                {section.label}
                <ChevronRight
                  className="size-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                  aria-hidden
                />
              </span>
              <span style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose }}>
                {BLURB[section.href]}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* A second index over the same pages, keyed by question rather than by model. Every
          entry is a measurement that came back empty and was published anyway (ADR 0009) —
          collected here because a null filed only under its model's section reads as buried,
          and these are the site's credibility, not its footnotes. */}
      <Section label="TESTS WITHOUT A CONFIRMED EFFECT" descriptor="NULL RESULTS">
        <Prose>
          These tests did not establish the effects they examined. Each page reports the
          comparison, uncertainty, and limitations. A null result does not prove that an effect
          is exactly zero.
        </Prose>
        <div className="flex flex-col" data-testid="null-results">
          {NULL_RESULTS.map((item, i) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="group flex flex-col gap-1 py-4 pl-0 transition-[box-shadow,transform,background-color,padding-left] duration-200 hover:translate-x-0.5 hover:bg-[var(--term-surface-2)] hover:pl-3 hover:shadow-[inset_2px_0_0_var(--term-red)] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--term-border)" }}
            >
              <span
                className="mono flex items-center gap-2 text-[var(--term-text)] transition-colors group-hover:text-[var(--term-red-text)]"
                style={{ fontSize: 12, fontWeight: 700, letterSpacing: TRACK.data }}
              >
                {item.label}
                <ChevronRight
                  className="size-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                  aria-hidden
                />
              </span>
              <span style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose }}>
                {item.finding}
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </BehindTheDataShell>
  );
}
