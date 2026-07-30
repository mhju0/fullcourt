"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import { parseSeasonStartYear } from "@/lib/nba-season"
import { zeroRestWorkload, type PlayerRestPayload } from "@/lib/player-rest"
import { termCardStyle, termTdStyle, termThStyle } from "@/lib/terminal-styles"

const ROW_LIMIT = 15

// ponytail: the payload is a hand-run Python export, so this section goes stale mid-season
// while the rest of the page updates daily off the cron. The `generated` stamp is rendered so
// a reader can see how old it is. Upgrade path: move scripts/export_player_rest.py into the
// daily pipeline, at which point this comment and the stamp caveat both go away.
const PAYLOAD_URL = "/data/player-rest.json"

async function fetchPayload(url: string): Promise<PlayerRestPayload> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load player rest data: ${res.status}`)
  return res.json()
}

/** Formats the export's stamp for display: "2026-07-30" → "JUL 30, 2026". */
function stampLabel(generated: string): string {
  const date = new Date(`${generated}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return generated.toUpperCase()
  return date
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .toUpperCase()
}

export function ZeroRestWorkload({ season }: { season: string }) {
  const [visible, setVisible] = useState(false)
  const anchor = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = anchor.current
    if (node === null || visible) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  const { data, error } = useSWR<PlayerRestPayload>(visible ? PAYLOAD_URL : null, fetchPayload, {
    revalidateOnFocus: false,
  })

  const rows = data ? zeroRestWorkload(data, parseSeasonStartYear(season), ROW_LIMIT) : []

  return (
    <div className="flex flex-col gap-3" ref={anchor}>
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        Who took the most shots on zero days&apos; rest. This is volume, not a verdict on how well
        they shot — a single season&apos;s rest split is too small to say that.{" "}
        <a href="/shooting" style={{ color: "var(--term-blue)", fontWeight: 600 }}>
          Career rest splits live on Player Shooting →
        </a>
      </p>

      {error ? (
        <p className="mono" role="alert" style={{ fontSize: 12, color: "var(--term-red)" }}>
          FAILED TO LOAD PLAYER DATA.
        </p>
      ) : !data ? (
        <div style={{ ...termCardStyle, padding: 12 }}>
          <div className="flex flex-col gap-[2px]">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton
                key={i}
                className="h-[18px] w-full bg-[var(--term-surface-2)]"
                style={{ borderRadius: "var(--term-radius-bar)" }}
              />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="mono" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
          NO PLAYER DATA FOR {season}. THE EXPORT COVERS 1996-97 ONWARD.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="mono w-full" style={{ borderCollapse: "collapse", minWidth: 460 }}>
              <thead>
                <tr>
                  <th style={termThStyle}>PLAYER</th>
                  <th style={termThStyle}>TEAM</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>NO-REST FGA</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>NO-REST EFG%</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>GAMES</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} data-testid="zero-rest-row">
                    <td style={termTdStyle}>{r.name}</td>
                    <td style={termTdStyle}>{r.team}</td>
                    <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                      {r.noRestFga.toLocaleString()}
                    </td>
                    <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                      {r.noRestEfg.toFixed(1)}
                    </td>
                    <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{r.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Stated, not hidden: this file is a hand-run export and will lag a live season. */}
          <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
            PLAYER DATA THROUGH {stampLabel(data.generated)} · UPDATED SEPARATELY FROM THE FIGURES ABOVE
          </p>
        </>
      )}
    </div>
  )
}
