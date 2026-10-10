"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";
import { useNow } from "@/hooks/useNow";
import { usePageQuery } from "@/hooks/useSeasonUrl";
import { ChevronDown } from "lucide-react";
import { FatigueBar, type FatigueBarTone } from "@/components/fatigue-bar";
import {
  ConfidenceBadge,
  FatigueDetailColumn,
  TeamLogo,
  teamGameFlags,
  getConfidence,
} from "@/components/matchup-parts";
import { gamePhase, spokenGameState, type GamePhase } from "@/lib/game-phase";
import { buildGameStoryline } from "@/lib/game-storyline";
import { getTeamColors } from "@/lib/nba-team-colors";
import { formatRestAdvantageDisplay } from "@/lib/rest-advantage-display";
import { getTeamBranding } from "@/lib/team-history";
import { LEAD, SPACE, SPACE_CARD, TRACK, TYPE } from "@/lib/terminal-styles";
import { cn } from "@/lib/utils";
import { ScrollCue } from "@/components/ui/scroll-cue";
import type { GameResponse } from "@/types";

/**
 * The Front Office table spine (docs/design/mocks/08-front-office.html, adopted
 * 2026-08-09): the slate as one continuous grid-table — rows, not cards — with
 * inline fatigue bars and a center-anchored REST ADVANTAGE meter.
 * Each game expands in place to the same
 * two-column fatigue detail the cards used.
 *
 * A grid of divs rather than a <table> for the same reason the cards were divs:
 * every game is one interactive row-group (main row + sub-row + expansion) whose
 * pieces span and collapse, which table semantics fight. The Explore table on
 * /analysis keeps real <table> markup — its rows are plain data.
 *
 * The whole strip scrolls in its own overflow-x container below the grid's
 * min-width, which is the app-wide rule for wide data (see docs/FRONTEND.md,
 * "Small screens") — the page itself never scrolls sideways.
 */

// One column template shared by the header row and every game row, so the header can never
// drift out of line with the cells beneath it. Below 640px `globals.css` swaps it for the
// two-column phone row, which drops the rest-days and fatigue columns (D-79).
const GRID_COLS =
  "minmax(96px,120px) minmax(210px,1.3fr) minmax(64px,80px) minmax(232px,1.1fr) minmax(190px,220px) minmax(96px,116px)";
// Sum of the column minimums plus the 16px gaps, rounded up with room.
const GRID_MIN_WIDTH = 1000;

/**
 * Width reserved for a line's flag chips, so the strip is identical on every line and the
 * fatigue numbers stay in one column however many flags a team carries.
 *
 * Sized for the widest thing it can hold: two four-character chips plus a `+N` overflow chip
 * and their gaps (~98px). A single "JET LAG" is wider than one 4-char chip but never shares
 * the strip — it sorts fifth, so it only ever appears alone or beside "ALT".
 */
const FLAG_STRIP_W = 104;

// ─── Status cell ─────────────────────────────────────────────────

function StatusCell({
  phase,
  date,
  tipOffEt,
  homeScore,
  awayScore,
  flashing,
}: {
  phase: GamePhase;
  date: string;
  tipOffEt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  flashing: boolean;
}) {
  const hasScore = phase === "final" && homeScore !== null && awayScore !== null;

  return (
    // The flash is scoped to this cell (G3, ADR 0010): the score is what changed, so the
    // score is what flashes — once, 500ms. A whole row lighting up reads as "something
    // happened somewhere on this line"; the cell says what.
    <div
      className={cn(
        "mono flex flex-col justify-center gap-1",
        flashing && "animate-[scoreFlash_0.5s_ease-out]",
      )}
    >
      {phase === "live" ? (
        <span
          className="inline-flex items-center gap-2"
          style={{
            fontSize: 10,
            letterSpacing: TRACK.label,
            color: "var(--term-accent)",
            fontWeight: 700,
          }}
        >
          {/* Still, not pulsing: most of an evening slate is live at once, and the label is
              read from the schedule, not from a feed. */}
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--term-accent)",
            }}
          />
          LIVE
        </span>
      ) : phase === "final" || phase === "awaitingFinal" ? (
        <span
          style={{
            fontSize: 10,
            letterSpacing: TRACK.label,
            color: "var(--term-text-muted)",
            fontWeight: 600,
          }}
        >
          {/* PENDING: over by the clock, and the score writer has not run yet. */}
          {phase === "final" ? "FINAL" : "PENDING"}
        </span>
      ) : null}
      {hasScore ? (
        <span
          className="fc-game-score tabular-nums"
          style={{
            fontWeight: 700,
            letterSpacing: TRACK.figure,
            color: "var(--term-text)",
            lineHeight: LEAD.figure,
          }}
        >
          {awayScore}–{homeScore}
        </span>
      ) : (
        // The ET tip time when the schedule carries one — what a schedule site puts
        // here. The date is the fallback for the rows whose feeds carried no clock
        // (pre-2002, and all of 2019-20 — docs/DATABASE.md), and never a guess.
        <span
          className="tabular-nums"
          style={{ fontSize: 11, color: "var(--term-text-muted)" }}
        >
          {tipOffEt ?? date}
        </span>
      )}
    </div>
  );
}

// ─── Matchup + fatigue cells (two aligned 26px lines each) ───────

const TEAM_LINE_H = 26;

function TeamLine({
  abbreviation,
  name,
  city,
  season,
  fallback,
  isHome,
}: {
  abbreviation: string;
  name: string;
  city: string;
  season: string;
  fallback: { name: string; city: string };
  isHome: boolean;
}) {
  const colors = getTeamColors(abbreviation);
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      style={{ height: TEAM_LINE_H }}
    >
      <TeamLogo
        abbreviation={abbreviation}
        season={season}
        fallback={fallback}
        size={20}
        color={colors.primary}
      />
      <span
        className="truncate"
        style={{
          fontSize: TYPE.data,
          fontWeight: 600,
          color: "var(--term-text)",
        }}
      >
        {name}
      </span>
      <span
        className="hidden truncate lg:inline"
        style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)" }}
      >
        {city}
      </span>
      {isHome && (
        <span
          className="mono shrink-0"
          style={{
            fontSize: TYPE.micro,
            letterSpacing: TRACK.data,
            fontWeight: 600,
            color: "var(--term-text-muted)",
            border: "1px solid var(--term-border)",
            borderRadius: "var(--term-radius-sm)",
            padding: "0 4px",
            lineHeight: "14px",
          }}
        >
          HOME
        </span>
      )}
    </div>
  );
}

/**
 * How many flags a line shows before collapsing the rest into a count. Measured over 79 games
 * across ten dates: 84% of team-lines carry two or fewer, but a visiting team can stack five
 * (B2B + 3IN4 + 4IN6 + ALT + JET LAG). Rendering all of them would either blow the column or
 * wrap the row to a second line, and a row whose height depends on its flag count is the
 * problem this replaced.
 */
const MAX_INLINE_FLAGS = 2;

/** The schedule flag chip — the fatigue score's reason, sitting next to the score. */
function FlagChip({
  label,
  muted = false,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className="mono shrink-0"
      style={{
        fontSize: TYPE.micro,
        letterSpacing: TRACK.data,
        fontWeight: 600,
        color: "var(--term-text-muted)",
        border: `1px solid var(--term-${muted ? "surface-2" : "border"})`,
        borderRadius: "var(--term-radius-sm)",
        padding: "0 4px",
        lineHeight: "14px",
      }}
    >
      {label}
    </span>
  );
}

function FatigueLine({
  score,
  tone,
  flags,
}: {
  score: number | null;
  tone: FatigueBarTone;
  flags: string[];
}) {
  const shown = flags.slice(0, MAX_INLINE_FLAGS);
  const hidden = flags.length - shown.length;

  return (
    <div className="flex items-center gap-2" style={{ height: TEAM_LINE_H }}>
      {score !== null ? (
        <FatigueBar score={score} tone={tone} className="min-w-[36px] flex-1" />
      ) : (
        <div
          className="min-w-[36px] flex-1"
          style={{
            height: 4,
            background: "var(--term-surface-2)",
            borderRadius: "var(--term-radius-bar)",
          }}
        />
      )}
      <span
        className="mono shrink-0 tabular-nums"
        style={{
          width: 30,
          fontSize: TYPE.data,
          fontWeight: 700,
          color: "var(--term-text)",
          textAlign: "right",
        }}
      >
        {score !== null ? score.toFixed(1) : "—"}
      </span>
      {/* Fixed-width so the two lines' chips align with each other and with the rows above and
          below, whether a team carries two flags, one, or none. Chips start from the strip's
          left edge rather than filling from its right: a list that grows rightward keeps its
          first item on one rail, so a team with one flag lines up with the first flag of the
          team above it instead of with that team's second. */}
      <span
        className="flex shrink-0 items-center justify-start gap-1"
        style={{ width: FLAG_STRIP_W }}
      >
        {shown.map((flag) => (
          <FlagChip key={flag} label={flag} />
        ))}
        {hidden > 0 && <FlagChip label={`+${hidden}`} muted />}
      </span>
    </div>
  );
}

/**
 * Per-team days rest, promoted from the expansion (2026-08-28): two aligned lines that
 * answer "which rest is whose" in the same read order as the team names beside them.
 * A null is a season opener — printed as the em dash every unmeasured cell uses.
 */
function RestDaysLine({ daysRest }: { daysRest: number | null | undefined }) {
  return (
    <div
      className="flex items-center justify-end"
      style={{ height: TEAM_LINE_H }}
    >
      <span
        className="mono tabular-nums"
        style={{
          fontSize: TYPE.data,
          fontWeight: 700,
          color: "var(--term-text)",
        }}
      >
        {daysRest ?? "—"}
      </span>
    </div>
  );
}

/** Which team's fatigue reads "higher" (more tired, rose) vs "lower" (teal). */
function fatigueTones(
  awayScore: number | null,
  homeScore: number | null,
): { away: FatigueBarTone; home: FatigueBarTone } {
  if (awayScore !== null && homeScore !== null) {
    if (awayScore > homeScore) return { away: "higher", home: "lower" };
    if (homeScore > awayScore) return { away: "lower", home: "higher" };
  }
  return { away: "neutral", home: "neutral" };
}

// ─── Rest-advantage cell ─────────────────────────────────────────

function RestAdvCell({
  restAdvantage,
  homeAbbr,
  awayAbbr,
  projectedFatigue,
}: {
  restAdvantage: GameResponse["restAdvantage"];
  homeAbbr: string;
  awayAbbr: string;
  projectedFatigue: boolean;
}) {
  const display = formatRestAdvantageDisplay(
    restAdvantage,
    homeAbbr,
    awayAbbr,
    projectedFatigue,
  );
  const advantageTeam = restAdvantage?.advantageTeam ?? "neutral";
  const isHomeAdv = advantageTeam === "home";
  const isAwayAdv = advantageTeam === "away";
  const value = Math.abs(restAdvantage?.differential ?? 0).toFixed(1);
  const fillPercent =
    Math.min(Math.abs(restAdvantage?.differential ?? 0) / 5, 1) * 50;
  // Not measured is not a dead heat, and this cell used to print them the same way: a game
  // with no fatigue pair read as "EVEN 0.0". The distinction lives in the formatter, so it
  // is unit-tested rather than asserted from the shape of `restAdvantage` here.
  const measured = display.kind !== "unmeasured";

  return (
    <div className="flex flex-col justify-center gap-2">
      <div
        className="mono flex items-baseline gap-2 tabular-nums"
        style={{ lineHeight: LEAD.figure }}
      >
        {display.kind === "unmeasured" ? (
          <span
            style={{
              fontSize: TYPE.emph,
              fontWeight: 700,
              letterSpacing: TRACK.figure,
              color: "var(--term-text-muted)",
            }}
          >
            {display.text}
          </span>
        ) : display.kind === "team" ? (
          <>
            {/* The named team is the more-rested side, so it wears the rested pole. */}
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: TRACK.data,
                color: "var(--term-blue-text)",
              }}
            >
              {display.teamAbbreviation}
            </span>
            <span
              style={{
                fontSize: TYPE.emph,
                fontWeight: 700,
                letterSpacing: TRACK.figure,
                color: "var(--term-text)",
              }}
            >
              {display.value}
            </span>
          </>
        ) : (
          <>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: TRACK.sub,
                color: "var(--term-text-muted)",
              }}
            >
              EVEN
            </span>
            <span
              style={{
                fontSize: TYPE.emph,
                fontWeight: 700,
                letterSpacing: TRACK.figure,
                color: "var(--term-text-muted)",
              }}
            >
              {value}
            </span>
          </>
        )}
        {/* Where the number came from, stated only when it is not the ordinary case. A projected
            differential is read off the published schedule: every input is already fixed except
            the previous game's overtime and margin, so it moves only where one of those lands.
            It shares the figure's line, so a projected row is no taller than a measured one. */}
        {display.kind !== "unmeasured" && display.projected && (
          <span
            style={{
              fontSize: TYPE.micro,
              fontWeight: 600,
              letterSpacing: TRACK.sub,
              color: "var(--term-text-muted)",
            }}
          >
            PROJECTED
          </span>
        )}
      </div>

      {/* Center-anchored differential meter: teal fill toward the rested side, ±5 scale. */}
      <div className="flex w-full items-center gap-2">
        <span
          className="mono shrink-0"
          style={{
            fontSize: TYPE.micro,
            color: "var(--term-text-muted)",
            fontWeight: 600,
          }}
        >
          A
        </span>
        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{
            height: 8,
            background: "var(--term-surface-2)",
            borderRadius: "var(--term-radius-sm)",
          }}
          aria-hidden
        >
          {/* An empty track, not the neutral marker: that marker means "measured, and the two
              sides came out level", which is a different statement from having no measurement. */}
          {!measured ? null : advantageTeam === "neutral" ? (
            <span
              style={{
                position: "absolute",
                left: "47.5%",
                top: 0,
                bottom: 0,
                width: "5%",
                background: "var(--term-hairline)",
              }}
            />
          ) : (
            <span
              style={{
                position: "absolute",
                left: isHomeAdv ? "50%" : undefined,
                right: isAwayAdv ? "50%" : undefined,
                top: 0,
                bottom: 0,
                width: `${fillPercent}%`,
                background: "var(--term-blue)",
              }}
            />
          )}
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1,
              background: "var(--term-hairline)",
            }}
          />
        </div>
        <span
          className="mono shrink-0"
          style={{
            fontSize: TYPE.micro,
            color: "var(--term-text-muted)",
            fontWeight: 600,
          }}
        >
          H
        </span>
      </div>
    </div>
  );
}

// ─── One game: main row + schedule context + expansion ───────────

function GameRow({
  game,
  index,
  isScoreFlashing,
  phase,
}: {
  game: GameResponse;
  index: number;
  isScoreFlashing: boolean;
  phase: GamePhase;
}) {
  const { params, update } = usePageQuery();
  const expanded = params.get("game") === String(game.id);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.hash === `#game-${game.id}`)
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [game.id]);

  const homeFallback = useMemo(
    () => ({ name: game.homeTeam.name, city: game.homeTeam.city }),
    [game.homeTeam.name, game.homeTeam.city],
  );
  const awayFallback = useMemo(
    () => ({ name: game.awayTeam.name, city: game.awayTeam.city }),
    [game.awayTeam.name, game.awayTeam.city],
  );
  const homeBrand = getTeamBranding(
    game.homeTeam.abbreviation,
    game.season,
    homeFallback,
  );
  const awayBrand = getTeamBranding(
    game.awayTeam.abbreviation,
    game.season,
    awayFallback,
  );

  const confidence = getConfidence(game.restAdvantage?.differential ?? null);
  const flags = teamGameFlags(game);
  const tones = fatigueTones(
    game.awayFatigue?.score ?? null,
    game.homeFatigue?.score ?? null,
  );
  const storyline = useMemo(() => buildGameStoryline(game), [game]);

  const toggle = useCallback(
    () => update({ game: expanded ? null : String(game.id) }),
    [expanded, game.id, update],
  );
  const onKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <div
      id={`game-${game.id}`}
      ref={rowRef}
      className="fc-game-row scroll-mt-20"
      style={{
        borderTop: index === 0 ? undefined : "1px solid var(--term-border)",
        // One accent at a time (Front Office): only HIGH CONF earns the indigo edge.
        // A live row is not tinted, since most of an evening slate is live at once.
        borderLeft:
          confidence === "high"
            ? "3px solid var(--term-accent)"
            : "3px solid transparent",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${awayBrand.name} at ${homeBrand.name}${spokenGameState(phase, game.awayScore, game.homeScore)} on ${game.date} game details`}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="fc-game-grid grid cursor-pointer items-center gap-x-4 transition-colors hover:bg-[var(--term-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]/40"
        style={{ gridTemplateColumns: GRID_COLS, padding: "12px 16px" }}
      >
        <div className="fc-game-status">
          <StatusCell
            phase={phase}
            date={game.date}
            tipOffEt={game.tipOffEt}
            homeScore={game.homeScore}
            awayScore={game.awayScore}
            flashing={isScoreFlashing}
          />
        </div>

        <div className="fc-game-teams flex min-w-0 flex-col gap-1">
          <TeamLine
            abbreviation={awayBrand.abbreviation}
            name={awayBrand.name}
            city={awayBrand.city ?? game.awayTeam.city}
            season={game.season}
            fallback={awayFallback}
            isHome={false}
          />
          <TeamLine
            abbreviation={homeBrand.abbreviation}
            name={homeBrand.name}
            city={homeBrand.city ?? game.homeTeam.city}
            season={game.season}
            fallback={homeFallback}
            isHome
          />
        </div>

        <div className="fc-game-extra flex flex-col gap-1">
            <RestDaysLine daysRest={game.awayFatigue?.daysRest} />
            <RestDaysLine daysRest={game.homeFatigue?.daysRest} />
        </div>

        <div className="fc-game-extra flex flex-col gap-1">
            <FatigueLine
              score={game.awayFatigue?.score ?? null}
              tone={tones.away}
              flags={flags.away}
            />
            <FatigueLine
              score={game.homeFatigue?.score ?? null}
              tone={tones.home}
              flags={flags.home}
            />
        </div>

        <div className="fc-game-edge">
          <RestAdvCell
            restAdvantage={game.restAdvantage}
            homeAbbr={homeBrand.abbreviation}
            awayAbbr={awayBrand.abbreviation}
            projectedFatigue={game.projectedFatigue}
          />
        </div>

        <div className="fc-game-chevron flex items-center justify-end gap-2">
          <span className="hidden sm:contents"><ConfidenceBadge confidence={confidence} /></span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[var(--term-text-muted)]",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </div>


      <div
        inert={!expanded}
        className={cn(
          "sticky left-0 grid max-w-[calc(100vw-40px)]",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            style={{
              background: "var(--term-bg)",
              borderTop: "1px solid var(--term-border)",
              // The row's own 16px rail, not the 12px this block used to inset by: the detail
              // cards now start on the same vertical line as the status cell above them.
              padding: `${SPACE.md}px ${SPACE_CARD}px`,
            }}
          >
            {/* The schedule sentence sits in the expansion, never in the row: a row that grew
                a line when one team was on a back-to-back made the list uneven, and the flag
                chip beside the fatigue score already says it (owner review, 2026-10-07). */}
            {storyline && (
              <p
                className="m-0"
                style={{
                  fontSize: TYPE.data,
                  lineHeight: LEAD.body,
                  color: "var(--term-text-muted)",
                  paddingBottom: SPACE.md,
                }}
              >
                {storyline}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FatigueDetailColumn
                label={`AWAY · ${awayBrand.abbreviation}`}
                fatigue={game.awayFatigue}
              />
              <FatigueDetailColumn
                label={`HOME · ${homeBrand.abbreviation}`}
                fatigue={game.homeFatigue}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── The table ───────────────────────────────────────────────────

export interface MatchupTableProps {
  games: readonly (GameResponse & { isScoreFlashing?: boolean })[];
}

export function MatchupTable({ games }: MatchupTableProps) {
  // One clock for the table: every row's LIVE and PENDING label is read against it.
  const now = useNow();
  return (
    <div
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderRadius: "var(--term-radius)",
        overflow: "hidden",
      }}
    >
      <ScrollCue className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--term-accent)]" tabIndex={0} role="region" aria-label="Matchups table; scroll horizontally for all columns">
        <div
          className="fc-game-table"
          style={{ minWidth: GRID_MIN_WIDTH }}
        >
          {/* Column header — same template as the rows, so it cannot drift. */}
          <div
            className="fc-game-header mono grid items-center gap-x-4"
            style={{
              gridTemplateColumns: GRID_COLS,
              padding: "8px 16px",
              // A row reserves 3px on its left for the accent edge; the header reserves the
              // same, or every label sits 3px left of its column.
              borderLeft: "3px solid transparent",
              background: "var(--term-surface-2)",
              borderBottom: "1px solid var(--term-border)",
              fontSize: 10,
              letterSpacing: TRACK.label,
              fontWeight: 700,
              color: "var(--term-text-muted)",
            }}
          >
            <span>GAME</span>
            <span>MATCHUP (AWAY / HOME)</span>
            <span className="text-right">REST (DAYS)</span>
            <span>FATIGUE (0–10)</span>
            <span>REST ADVANTAGE</span>
            {/* Ends over the badge, not over the chevron beside it (16px icon, 8px gap). */}
            <span className="pr-6 text-right">GAP SIZE</span>
          </div>

          {games.map((game, i) => (
            <GameRow
              key={game.id}
              game={game}
              index={i}
              isScoreFlashing={game.isScoreFlashing ?? false}
              phase={gamePhase(game.status, game.tipOffUtc, now)}
            />
          ))}
        </div>
      </ScrollCue>
    </div>
  );
}
