import { TransitionLink } from "@/components/transition-link";
import { signedNumber } from "@/lib/signed-number";
import type { HomeFindings } from "@/lib/home-findings";
import styles from "./home.module.css";

function RateBar({ label, value, rested = false }: { label: string; value: number; rested?: boolean }) {
  return <div className={styles.rate}>
    <div><span>{label}</span><strong className={rested ? styles.rested : undefined}>{value.toFixed(1)}%</strong></div>
    <div className={styles.track} aria-hidden="true"><span style={{ width: `${value}%` }} className={rested ? styles.restedFill : undefined} /></div>
  </div>;
}

export function HomeContent({ findings }: { findings: HomeFindings }) {
  const { historical, schedule, shootingCoverage } = findings;
  return <div className={styles.home} data-testid="home-findings">
    <div className={styles.container}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>NBA rest · travel · schedule</p>
          <h1>Rest is a stat</h1>
          <p>Understand the schedule behind an NBA game. Compare rest and travel, then check what happened.</p>
          <TransitionLink href="/games" className={styles.primary}>Find a game <span aria-hidden="true">→</span></TransitionLink>
        </div>
      </header>

      <section className={styles.finding} aria-labelledby="rest-finding">
        <div>
          <p className={styles.eyebrow}>{historical?.coverage ? `Regular season · ${historical.coverage}` : "Historical rest comparison"}</p>
          <h2 id="rest-finding">Widest rest gaps · historical home teams</h2>
          {historical ? <>
            <p className={`${styles.big} ${historical.edgePp < 0 ? styles.tired : styles.rested}`} data-testid="home-rest-edge">
              {signedNumber(historical.edgePp, 1)}<span> pp</span>
            </p>
            <p>Percentage-point difference from the home baseline in {historical.games.toLocaleString()} games with the widest rest gaps (model score ≥ 7).</p>
            {historical.latestEvidenceDate ? <p className={styles.metadata}>Rest evidence through {historical.latestEvidenceDate}</p> : null}
          </> : <p>The historical comparison is unavailable. Model Results has the underlying evidence and data status.</p>}
        </div>
        <div>
          {historical && <>
            <RateBar label="Home teams overall" value={historical.baselinePct} />
            <RateBar label="Rested home team · widest gap" value={historical.winPct} rested />
            <p>Bars run from 0–100%. Baseline: {historical.baselineGames.toLocaleString()} games. These historical groups differ in more than rest; this is an association, not a causal estimate.</p>
          </>}
          <TransitionLink href="/analysis" className={styles.textLink}>Read the model results <span aria-hidden="true">→</span></TransitionLink>
        </div>
      </section>

      <section className={styles.support} aria-label="Schedule and player findings">
        <article>
          <p className={styles.eyebrow}>The schedule{schedule ? ` · ${schedule.season}` : ""}</p>
          <h2>Compare the rest gaps teams face.</h2>
          {schedule?.most && schedule.least ? <>
            {schedule.uniform ? <p>Every measured team has the same net edge: {signedNumber(schedule.most.value, 0)} games.</p> : <dl className={styles.teams}>
              {[{ row: schedule.most, label: "Highest" }, { row: schedule.least, label: "Lowest" }].map(({ row, label }) => <div key={label}>
                <dt>{row.name}<small>{row.tied ? `Joint ${label.toLowerCase()}` : label}</small></dt>
                <dd className={row.value < 0 ? styles.tired : styles.rested}>{signedNumber(row.value, 0)} <span>net edge games</span></dd>
              </div>)}
            </dl>}
            <p>Favorable minus unfavorable games. {schedule.measuredGames.toLocaleString()} of {schedule.scheduledGames.toLocaleString()} games compared. This is a schedule comparison, not a prediction of wins.</p>
            {schedule.latestFinalDate && <p className={styles.metadata}>Results through {schedule.latestFinalDate}{schedule.provisional ? " · Season in progress" : " · Regular season complete"}</p>}
          </> : <p>{schedule ? "No measured fatigue comparisons yet for this season. Published rest days remain available in Schedule Edge." : "The schedule comparison is unavailable. Open Schedule Edge to check a season."}</p>}
          <TransitionLink href="/schedule" className={styles.textLink}>Compare team schedules <span aria-hidden="true">→</span></TransitionLink>
        </article>
        <article>
          <p className={styles.eyebrow}>The players · shooting by rest</p>
          <h2>Does a fresh player shoot better?</h2>
          <p>Compare no-rest shooting with three or more days off, with attempts beside every rate. A large single-season gap can still be uncertain.</p>
          <p>{shootingCoverage ? `Regular-season player coverage: ${shootingCoverage}. ` : "Player coverage is unavailable. "}Career estimates pool attempts and shrink uncertain differences.</p>
          <TransitionLink href="/shooting" className={styles.textLink}>Look up a player <span aria-hidden="true">→</span></TransitionLink>
        </article>
      </section>

      <aside className={styles.discover}>
        <div><h2>More questions from the court.</h2><p>Playoff workload and other basketball studies.</p></div>
        <TransitionLink href="/explore" className={styles.textLink}>Explore the research <span aria-hidden="true">→</span></TransitionLink>
      </aside>

    </div>
  </div>;
}
