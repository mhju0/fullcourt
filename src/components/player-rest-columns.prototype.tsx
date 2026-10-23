"use client";

// Three column layouts on /shooting?variant=A|B|C; preview only, excluded from production.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BrowseRow } from "@/lib/player-rest";
import { signedNumber } from "@/lib/signed-number";
import styles from "./player-rest-columns.prototype.module.css";

const variants = ["A", "B", "C"] as const;
const names = { A: "Your column order", B: "Grouped by rest", C: "Attempts side by side" };
const descriptions = {
  A: "Each measure has its own column, in the order you proposed.",
  B: "The same five measures, with two clear group headers. My recommendation.",
  C: "Compare both attempt counts first, then compare both shooting percentages.",
};
const rate = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;

export function PlayerRestColumnsPrototype({ rows, variant }: { rows: BrowseRow[]; variant: "A" | "B" | "C" }) {
  const router = useRouter();
  const params = useSearchParams();
  const move = (step: number) => {
    const next = variants[(variants.indexOf(variant) + step + variants.length) % variants.length];
    const query = new URLSearchParams(params.toString());
    query.set("variant", next);
    router.replace(`/shooting?${query}`, { scroll: false });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const visible = rows.slice(0, 8);
  return <section className={styles.prototype} aria-label="Shooting table layout preview">
    <div className={styles.intro}>
      <p className={styles.eyebrow}>LAYOUT PREVIEW · {variant}</p>
      <h2>{names[variant]}</h2>
      <p>{descriptions[variant]}</p>
      <p className={styles.note}>Real selected-season data · {visible.length} of {rows.length} players shown · no data definitions changed</p>
    </div>
    <p className={styles.scrollHint}>Swipe the table to see all columns. Player names stay visible.</p>
    <div className={styles.scroll} tabIndex={0} aria-label="Scrollable player shooting comparison">
      <table className={`${styles.table} ${styles[variant]}`}>
        <caption className="sr-only">{names[variant]}: shot attempts and effective field goal percentage with and without rest</caption>
        {variant === "A" && <thead><tr>
          <th scope="col">Player</th>
          <th scope="col">Shot attempts<br /><span>No rest</span></th>
          <th scope="col">No rest<br /><span>eFG%</span></th>
          <th scope="col" className={styles.boundary}>Shot attempts<br /><span>With rest</span></th>
          <th scope="col">With rest<br /><span>eFG%</span></th>
          <th scope="col" className={styles.boundary}>Gap<br /><span>pp</span></th>
        </tr></thead>}
        {variant === "B" && <thead>
          <tr className={styles.groups}><th rowSpan={2} scope="col">Player</th><th colSpan={2} scope="colgroup">No rest</th><th colSpan={2} scope="colgroup" className={styles.boundary}>With rest</th><th rowSpan={2} scope="col" className={styles.boundary}>Gap<br /><span>pp</span></th></tr>
          <tr><th scope="col">Shot attempts</th><th scope="col">eFG%</th><th scope="col" className={styles.boundary}>Shot attempts</th><th scope="col">eFG%</th></tr>
        </thead>}
        {variant === "C" && <thead>
          <tr className={styles.groups}><th rowSpan={2} scope="col">Player</th><th colSpan={2} scope="colgroup">Shot attempts</th><th colSpan={2} scope="colgroup" className={styles.boundary}>eFG%</th><th rowSpan={2} scope="col" className={styles.boundary}>Gap<br /><span>pp</span></th></tr>
          <tr><th scope="col">No rest</th><th scope="col">With rest</th><th scope="col" className={styles.boundary}>No rest</th><th scope="col">With rest</th></tr>
        </thead>}
        <tbody>{visible.map(row => <tr key={row.player}>
          <th scope="row"><span>{row.name}</span><small>{row.context} · {row.games} games</small></th>
          {variant === "C" ? <>
            <td>{row.noRestFga.toLocaleString()}</td><td>{row.restedFga.toLocaleString()}</td>
            <td className={styles.boundary}>{rate(row.noRestEfg)}</td><td>{rate(row.restedEfg)}</td>
          </> : <>
            <td>{row.noRestFga.toLocaleString()}</td><td>{rate(row.noRestEfg)}</td>
            <td className={styles.boundary}>{row.restedFga.toLocaleString()}</td><td>{rate(row.restedEfg)}</td>
          </>}
          <td className={`${styles.boundary} ${styles.gap}`}>{row.effect === null ? "—" : signedNumber(row.effect, 1)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className={styles.key}>eFG% gives threes extra weight. Gap = With rest eFG% − No rest eFG%, in percentage points. Zero attempts are shown as 0; an unavailable percentage is shown as —. No rest: played yesterday. With rest: 2–29 full days off. One full day off and unknown prior rest are excluded.</p>
    <nav className={styles.switcher} aria-label="Prototype variants">
      <button onClick={() => move(-1)} aria-label="Previous layout">←</button>
      <span><strong>{variant}</strong> · {names[variant]}</span>
      <button onClick={() => move(1)} aria-label="Next layout">→</button>
    </nav>
  </section>;
}
