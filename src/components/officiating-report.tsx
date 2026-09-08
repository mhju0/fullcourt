"use client";

import { useState } from "react";
import useSWR from "swr";
import { z } from "zod";
import {
  GRADE_LABELS,
  categoryLabel,
  type ReviewGame,
} from "@/lib/officiating";
import styles from "./officiating.module.css";

const reportSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  crew: z.array(z.string()),
  source: z.string().url(),
  events: z.array(
    z.object({
      id: z.string(),
      period: z.string(),
      clock: z.string().nullable(),
      category: z.string(),
      grade: z.enum(["IC", "INC", "CC", "CNC", "Undetectable", "NCI", "NCC", ""]),
      verdict: z.string(),
      video: z.string().url().nullable(),
    }),
  ),
});
async function fetchReport(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Report unavailable");
  return reportSchema.parse(await response.json());
}
export function OfficiatingReport({
  game,
  season,
  category,
  shareHref,
}: {
  game: ReviewGame;
  season: string;
  category: string;
  shareHref: string;
}) {
  const [all, setAll] = useState(false);
  const { data, error, mutate, isValidating } = useSWR(
    `/data/officiating/${season}/${game.id}-${game.sha256.slice(0, 16)}.json`,
    fetchReport,
    { revalidateOnFocus: false },
  );
  if (error || (data && (data.id !== game.id || data.sha256 !== game.sha256)))
    return (
      <div className={styles.detail} role="status">
        <p>This report could not be loaded.</p>
        <button onClick={() => void mutate()} disabled={isValidating}>
          Try again
        </button>
        <a href={game.source} target="_blank" rel="noreferrer">
          Open NBA report ↗
        </a>
      </div>
    );
  if (!data)
    return (
      <div className={styles.detail} role="status">
        Loading the NBA’s report…
      </div>
    );
  const events = data.events.filter(
    (e) =>
      all ||
      ((e.grade === "IC" || e.grade === "INC") &&
        (!category || e.category === category)),
  );
  return (
    <div className={styles.detail}>
      <div className={styles.detailTop}>
        <button aria-pressed={all} onClick={() => setAll(!all)}>
          {all
            ? "Show identified errors"
            : `Show all assessed plays (${data.events.length})`}
        </button>
        <a href={shareHref}>Link to game ↗</a>
      </div>
      {events.length === 0 && (
        <p className={styles.muted}>
          No errors identified in this report. You can still inspect all
          assessed plays.
        </p>
      )}
      {events.map((event) => (
        <article className={styles.play} key={event.id}>
          <div className={styles.playMeta}>
            <span>
              {event.period} · {event.clock || "Clock not supplied"}
            </span>
            <span>{categoryLabel(event.category)}</span>
          </div>
          <p className={event.grade === "INC" ? styles.blue : styles.gray}>
            {GRADE_LABELS[event.grade]}
          </p>
          {event.verdict ? (
            <blockquote className={styles.verdict}>{event.verdict}</blockquote>
          ) : (
            <p className={styles.muted}>
              The NBA did not supply verdict text for this assessment.
            </p>
          )}
          <div className={styles.sourceLine}>
            <a href={game.source} target="_blank" rel="noreferrer">
              Source: NBA L2M report ↗
            </a>
            {event.video ? (
              <a href={event.video} target="_blank" rel="noreferrer">
                NBA video page ↗
              </a>
            ) : (
              <span>Video unavailable</span>
            )}
          </div>
        </article>
      ))}
      <p className={styles.crew}>
        Crew ·{" "}
        {data.crew.length ? data.crew.join(" · ") : "Assignment unavailable"}
      </p>
      {game.ungraded > 0 && (
        <p className={styles.muted}>
          {game.ungraded} assessment(s) have no classified correctness verdict. These are not counted
          as correct.
        </p>
      )}
    </div>
  );
}
