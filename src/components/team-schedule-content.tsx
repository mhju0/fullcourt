"use client"

import { useMemo, type MouseEvent, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import useSWR from "swr"

import { restEdgeSize, TeamLogo } from "@/components/matchup-parts"
import { SeasonSelector } from "@/components/season-selector"
import { SummaryLine } from "@/components/summary-line"
import { TransitionLink } from "@/components/transition-link"
import { Bar } from "@/components/lazy-content"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { MessageCard } from "@/components/ui/message-card"
import { useNow } from "@/hooks/useNow"
import { usePageQuery, useSeasonUrl } from "@/hooks/useSeasonUrl"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { gamePhase } from "@/lib/game-phase"
import { cupPlaceholders } from "@/lib/nba-cup"
import { browsableSeasons, formatEasternDateKey } from "@/lib/nba-season"
import { formatRestAdvantageValue } from "@/lib/rest-advantage-display"
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence"
import { CURRENT_TEAM_ABBREVIATIONS, getTeamBranding } from "@/lib/team-history"
import { MONO_FONT_STACK, SPACE_CARD, termCardStyle, termSelectClass, termSelectStyle, termTdStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import type { TeamScheduleGame } from "@/types"

const SEASONS = browsableSeasons()
const LATEST_SEASON = SEASONS[SEASONS.length - 1]

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** "Oct 21" from an ET date key. Read from the key itself, so no time zone can move the day. */
function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number)
  return `${MONTHS[month - 1]} ${day}`
}

function weekday(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

/** "Dallas Mavericks", in the branding the franchise wore that season. */
function fullName(abbreviation: string, season: string, fallback?: { name: string; city: string }): string {
  const brand = getTeamBranding(abbreviation, season, fallback)
  return brand.city ? `${brand.city} ${brand.name}` : brand.name
}

type Side = "team" | "opponent" | "even" | "unmeasured"

/** Which side the rest gap favors, read from the selected team's chair. */
function sideOf(game: TeamScheduleGame): Side {
  const ra = game.restAdvantage
  if (ra === null) return "unmeasured"
  if (ra.advantageTeam === "neutral") return "even"
  return ra.advantageTeam === (game.isHome ? "home" : "away") ? "team" : "opponent"
}

// Column shares from the small breakpoint up, so the gaps between columns come out even instead
// of OPPONENT taking every spare pixel. A phone shrinks the columns to their content (`w-px`),
// because it has no room to spare and drops G and TIME anyway.
// The classes reach the heading too; NOWRAP is body-only, so a heading such as REST ADVANTAGE
// can still wrap to two lines on a phone.
const COL = {
  game: "hidden sm:table-cell sm:w-[6%]",
  date: "w-px sm:w-[18%]",
  time: "hidden sm:table-cell sm:w-[18%]",
  rest: "w-px sm:w-[20%]",
} as const
const NOWRAP = { whiteSpace: "nowrap" } as const

/** The board on this game's date with its row already open (`?game=` expands, `#game-` scrolls). */
function boardHref(game: TeamScheduleGame, season: string): string {
  return `/games?season=${encodeURIComponent(season)}&date=${game.date}&game=${game.id}#game-${game.id}`
}

/**
 * A click anywhere on a row follows the link in its OPPONENT cell, so the row behaves as one
 * target while the link stays the real, focusable element. A click on the link itself, or one
 * that selected text, is left alone.
 */
function followRowLink(event: MouseEvent<HTMLTableRowElement>) {
  if ((event.target as HTMLElement).closest("a")) return
  if (window.getSelection()?.toString()) return
  event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click()
}

/**
 * Says the row goes somewhere: it opens this game on the board. Hidden on a phone, where the gap
 * column has no room for it and the whole row is still the tap target.
 */
function RowArrow() {
  return (
    <ChevronRight
      size={16}
      aria-hidden
      className="hidden shrink-0 sm:block"
      style={{ color: "var(--term-text-muted)" }}
    />
  )
}

function RestCell({ game }: { game: TeamScheduleGame }) {
  const side = sideOf(game)
  if (side === "unmeasured")
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span style={{ color: "var(--term-text-muted)" }}>—</span>
        <RowArrow />
      </span>
    )
  const size = restEdgeSize(game.restAdvantage, game.neutralCity)
  const value = formatRestAdvantageValue(game.restAdvantage?.differential ?? 0)
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {/* The board's two sizes, filled for large and outlined for medium. Hidden on a phone,
          as on the board, where the gap column has no room for it. */}
      {size && (
        <span
          className="hidden sm:inline"
          style={{
            fontSize: TYPE.micro,
            letterSpacing: TRACK.data,
            fontWeight: 700,
            padding: "2px 8px",
            // Inset, so the outline adds no width and both sizes share one box.
            boxShadow: "inset 0 0 0 1px var(--term-accent)",
            borderRadius: "var(--term-radius-sm)",
            background: size === "large" ? "var(--term-accent)" : "transparent",
            color: size === "large" ? "var(--term-surface)" : "var(--term-accent)",
          }}
        >
          {size === "large" ? "LARGE" : "MEDIUM"}
        </span>
      )}
      {side === "even" ? (
        <span style={{ fontWeight: 700, color: "var(--term-text-muted)" }}>EVEN</span>
      ) : (
        <span
          style={{ fontWeight: 700, color: side === "team" ? "var(--term-blue-text)" : "var(--term-red-text)" }}
        >
          {/* U+2212, not a hyphen: the site's signed-number rule. */}
          {side === "team" ? "+" : "−"}
          {value}
        </span>
      )}
      <RowArrow />
    </span>
  )
}

/**
 * What a game has to report besides its date: the result once final, LIVE or PENDING once it has
 * tipped (the board's `gamePhase`, on the same clock), or nothing before it starts.
 */
function gameState(game: TeamScheduleGame, now: number): ReactNode {
  const phase = gamePhase(game.status, game.tipOffUtc, now)
  if (phase === "final" && game.teamScore !== null && game.opponentScore !== null) {
    const won = game.teamScore > game.opponentScore
    return (
      <span>
        <span style={{ fontWeight: 700, color: won ? "var(--term-blue-text)" : "var(--term-red-text)" }}>{won ? "W" : "L"}</span>{" "}
        {game.teamScore}–{game.opponentScore}
      </span>
    )
  }
  if (phase === "postponed" || phase === "cancelled") return <span style={{ fontWeight: 700, color: "var(--term-text-muted)" }}>{phase.toUpperCase()}</span>
  if (phase === "live") return <span style={{ fontWeight: 700, color: "var(--term-amber)" }}>LIVE</span>
  if (phase === "awaitingFinal") return <span style={{ fontWeight: 700, color: "var(--term-text-muted)" }}>PENDING</span>
  return null
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" style={termCardStyle}>
      {Array.from({ length: 12 }, (_, i) => (
        <Bar key={i} className="h-[33px] w-full" />
      ))}
    </div>
  )
}

export function TeamScheduleContent() {
  const { season, setSeason, fallbackNote } = useSeasonUrl(LATEST_SEASON, SEASONS)
  const { params, update } = usePageQuery()
  const requested = params.get("team")?.toUpperCase() ?? null
  const team = requested && CURRENT_TEAM_ABBREVIATIONS.includes(requested) ? requested : null

  const teamOptions = useMemo(
    () =>
      CURRENT_TEAM_ABBREVIATIONS.map((abbreviation) => ({ abbreviation, label: fullName(abbreviation, season) })).sort(
        (a, b) => a.label.localeCompare(b.label)
      ),
    [season]
  )

  const { data, error, isLoading, mutate } = useSWR<TeamScheduleGame[]>(
    team ? `/api/games/team?season=${encodeURIComponent(season)}&team=${team}` : null,
    apiFetcher,
    { revalidateOnFocus: false }
  )

  const games = useMemo(() => data ?? [], [data])
  const today = formatEasternDateKey()
  const nextGameId = games.find((g) => (g.status === "scheduled" || g.status === "live") && g.date >= today)?.id ?? null
  const anyProjected = games.some((g) => g.projectedFatigue)
  const now = useNow()
  const cup = useMemo(() => cupPlaceholders(season, games.map((g) => g.date)), [season, games])
  // Game numbers count the Cup rows too, so the season still ends at game 82.
  const gameNumber = (i: number) => i + 1 + (cup && i > cup.afterIndex ? cup.count : 0)

  const counts = useMemo(() => {
    const tally = { team: 0, opponent: 0, even: 0, marked: 0, measured: 0 }
    for (const g of games) {
      const side = sideOf(g)
      if (side === "unmeasured") continue
      tally.measured += 1
      tally[side] += 1
      if (restEdgeSize(g.restAdvantage, g.neutralCity)) tally.marked += 1
    }
    return tally
  }, [games])

  const columns: DataColumn<TeamScheduleGame>[] = [
    {
      label: "G",
      numeric: true,
      className: COL.game,
      style: NOWRAP,
      cell: (_, i) => gameNumber(i),
    },
    {
      label: "DATE",
      className: COL.date,
      style: NOWRAP,
      // A phone has no TIME column, so the result (or LIVE, PENDING) goes under the date, and
      // so does NEXT.
      cell: (g) => (
        <span className="inline-flex flex-col items-start sm:flex-row sm:items-center sm:gap-2">
          <span className="sm:hidden">{shortDate(g.date)}</span>
          <span className="hidden sm:inline">
            {weekday(g.date)} {shortDate(g.date)}
          </span>
          <span className="sm:hidden" data-testid="phone-game-state">
            {gameState(g, now)}
          </span>
          {g.id === nextGameId && (
            <span style={{ fontSize: TYPE.micro, letterSpacing: TRACK.data, fontWeight: 700, color: "var(--term-accent)" }}>
              NEXT
            </span>
          )}
        </span>
      ),
    },
    {
      label: "TIME",
      unit: "ET · RESULT",
      className: COL.time,
      style: NOWRAP,
      cell: (g) => gameState(g, now) ?? <span>{g.tipOffEt ? g.tipOffEt.replace(/ ET$/, "") : "TBD"}</span>,
    },
    {
      label: "OPPONENT",
      cell: (g) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-5 shrink-0" style={{ color: "var(--term-text-muted)" }}>
            {g.neutralCity ? "N" : g.isHome ? "vs" : "@"}
          </span>
          <TeamLogo abbreviation={g.opponent.abbreviation} season={season} fallback={g.opponent} size={20} />
          <TransitionLink
            href={boardHref(g, season)}
            data-row-link=""
            data-testid="team-game-link"
            className="min-w-0 hover:underline"
            style={{ fontFamily: "inherit", color: "inherit" }}
            aria-label={`${fullName(g.opponent.abbreviation, season, g.opponent)}, ${weekday(g.date)} ${shortDate(g.date)}: open this game on the board`}
          >
            {fullName(g.opponent.abbreviation, season, g.opponent)}
          </TransitionLink>
        </span>
      ),
    },
    {
      label: "REST ADVANTAGE",
      numeric: true,
      className: COL.rest,
      style: NOWRAP,
      cell: (g) => <RestCell game={g} />,
    },
  ]

  const teamAbbr = team ? getTeamBranding(team, season).abbreviation : null

  // The games the league has not scheduled yet. One cell spans the row after the date, so there
  // is no opponent, time or gap to misread; the phone variant spans one column fewer because it
  // has no TIME column.
  const cupRows = cup
    ? Array.from({ length: cup.count }, (_, k) => {
        const label = (
          <span style={{ fontWeight: 700, letterSpacing: TRACK.data, color: "var(--term-text-muted)" }}>NBA CUP GAME · TBD</span>
        )
        return (
          <tr key={`cup-${k}`} data-testid="cup-placeholder-row">
            <td className={`${COL.game} tabular-nums`} style={{ ...termTdStyle, ...NOWRAP, textAlign: "right" }}>
              {cup.afterIndex + 2 + k}
            </td>
            <td className={COL.date} style={{ ...termTdStyle, ...NOWRAP, color: "var(--term-text-muted)" }}>{cup.window}</td>
            <td colSpan={3} className="hidden sm:table-cell" style={termTdStyle}>{label}</td>
            <td colSpan={2} className="sm:hidden" style={termTdStyle}>{label}</td>
          </tr>
        )
      })
    : null

  return (
    <div className="flex flex-col gap-2 sm:gap-6">
      <section aria-label="Choose a team" className="flex flex-wrap items-end gap-4" style={{ ...termCardStyle, padding: SPACE_CARD }}>
        <SeasonSelector id="team-season" season={season} seasons={SEASONS} onSeasonChange={setSeason} />
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="team-select"
            className="mono"
            style={{ fontSize: TYPE.label, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 600 }}
          >
            TEAM
          </label>
          <select
            id="team-select"
            value={team ?? ""}
            onChange={(e) => update({ team: e.target.value || null })}
            className={`${termSelectClass} min-h-11 w-64 max-w-full`}
            style={{ ...termSelectStyle, fontSize: 16, fontFamily: MONO_FONT_STACK }}
          >
            <option value="">Choose a team</option>
            {teamOptions.map((o) => (
              <option key={o.abbreviation} value={o.abbreviation}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {fallbackNote && <MessageCard tone="muted" title={fallbackNote} />}

      {team === null ? (
        <MessageCard tone="muted" title="Choose a team" body="Every game of its season, with the rest gap from its side." />
      ) : error ? (
        <MessageCard
          tone="error"
          title="Could not load this schedule"
          body={errMsg(error)}
          action={
            <button type="button" className="fc-text-link" onClick={() => void mutate()}>
              Try again
            </button>
          }
        />
      ) : isLoading || !data ? (
        <TableSkeleton />
      ) : games.length === 0 ? (
        <MessageCard tone="muted" title={`No games for ${season}`} body="This season has no published games for this team." />
      ) : (
        <>
          <SummaryLine
            label="Season summary"
            testId="team-summary-line"
            // Two by two on a phone: the third cell starts a row, so it loses the divider on its left
            // and the second row takes one on top.
            className="grid grid-cols-2 sm:grid-cols-4 [&>div:nth-child(3)]:border-l-0 sm:[&>div:nth-child(3)]:border-l [&>div:nth-child(n+3)]:border-t sm:[&>div:nth-child(n+3)]:border-t-0"
            items={[
              { label: `${teamAbbr} MORE RESTED`, value: counts.measured ? String(counts.team) : "—", tone: "var(--term-blue-text)" },
              { label: "OPPONENT MORE RESTED", value: counts.measured ? String(counts.opponent) : "—", tone: "var(--term-red-text)" },
              { label: "EVEN", value: counts.measured ? String(counts.even) : "—" },
              { label: "3+ REST EDGES", value: counts.measured ? String(counts.marked) : "—", note: "RESTED TEAM AT HOME" },
            ]}
          />
          <section aria-label={`${teamAbbr} schedule`} className="flex flex-col gap-2">
            <p className="m-0" style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>
              {games.length} games{cup ? `, and ${cup.count} NBA Cup ${cup.count === 1 ? "game" : "games"} the league has not scheduled yet` : ""}. A plus means {teamAbbr} is the more rested side; EVEN is a gap under {NEUTRAL_REST_ADVANTAGE_THRESHOLD}.
              {anyProjected && " Games not yet played show a projected gap, from the schedule as it stands."}
            </p>
            <DataTable
              columns={columns}
              rows={games}
              rowKey={(g) => g.id}
              rowAttrs={(g) => ({
                "data-testid": "team-game-row",
                onClick: followRowLink,
                className: "cursor-pointer",
                "data-next": g.id === nextGameId ? "" : undefined,
                style:
                  g.id === nextGameId
                    ? { background: "color-mix(in srgb, var(--term-accent) 6%, var(--term-surface))" }
                    : undefined,
              })}
              rowExtras={(_, i) => (cup && i === cup.afterIndex ? cupRows : null)}
            >
              {cup && cup.afterIndex === -1 ? cupRows : null}
            </DataTable>
          </section>
        </>
      )}
    </div>
  )
}
