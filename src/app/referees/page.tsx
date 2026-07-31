import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { RefereeStyleContent } from "@/components/referee-style-content";
import styleData from "@/data/referee-foul-style.json";
import { publishable, type RefereeFoulStyle } from "@/lib/referee-foul-style";
import { termCardStyle } from "@/lib/terminal-styles";

const data = styleData as RefereeFoulStyle;

export const metadata: Metadata = {
  title: "Referee Effect",
  description:
    "How NBA officials differ in the kinds of foul they call — shooting, personal, loose ball, offensive and technical — measured against the league's own mix, season by season.",
};

/**
 * Referee foul style.
 *
 * This page exists because the question it used to ask came back empty. Twice: no official
 * tilts the whistle home beyond noise, and crew rest does not move it either. What does
 * separate officials, clearly and repeatably, is the *mix* of fouls they call — and that is a
 * statement about style, not about fairness, which is why nothing here is called bias.
 */
export default function RefereesPage() {
  const rows = publishable(data.officials);
  const chiefs = rows.filter((r) => r.chiefGames > 0).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="REFEREE EFFECT · FOUL STYLE"
        title="What each official calls"
        description={`Officials don't call the same game the same way. Every figure is how much more or less often one calls that foul than the league does, across ${data.gamesCovered.toLocaleString()} games since ${data.firstSeason}.`}
      />

      <RefereeStyleContent data={data} />

      <section style={termCardStyle} className="flex flex-col gap-3">
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}
        >
          WHAT THIS IS NOT
        </p>
        <p style={{ fontSize: 15, color: "var(--term-text)", lineHeight: 1.6, maxWidth: "46rem" }}>
          <strong>This is style, not bias.</strong> Calling more offensive fouls says nothing about
          who benefits from them. The two questions that would be about fairness were both asked
          here and both came back empty: no official tilts free throws toward the home team beyond
          what chance predicts, and how much rest a crew had makes no measurable difference to how
          a game is called.
        </p>
        <p style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.6, maxWidth: "46rem" }}>
          <strong>A call cannot be traced to one official.</strong> Three work every game and the
          play-by-play does not record which of them blew the whistle, so every game credits all
          three and each figure above is roughly a third of the real effect. What keeps that from
          becoming bias rather than dilution is that crews barely repeat — the same trio worked
          together more than twice in only a handful of cases across{" "}
          {data.gamesCovered.toLocaleString()} games — so an official&rsquo;s colleagues average out
          over a career instead of colouring it.
        </p>
        <p style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.6, maxWidth: "46rem" }}>
          <strong>Crew chief is marked only where it can be checked.</strong> The NBA assigns a crew
          chief, a referee and an umpire to every game, but the feed behind this page carries no
          role label. The ordering it does carry matches the NBA&rsquo;s published crew chief from{" "}
          {data.crewChiefFirstSeason} on and does not before it, so the <em>As chief</em> column
          counts those seasons alone — {chiefs} of these {rows.length} officials have chiefed a game
          in them. Career totals would be larger.
        </p>
      </section>

      <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
        {data.source.toUpperCase()} · {data.firstSeason} THROUGH {data.lastSeason} · REGULAR SEASON ·
        GENERATED {data.generated}
      </p>
    </div>
  );
}
