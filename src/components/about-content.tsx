import { StudyLink } from "@/components/study-link";
import styles from "./reading.module.css";

const START = [
  { href: "/games", category: "Start with a game", title: "Games", question: "Which team comes in with more rest, travel or workload?", action: "Find a game" },
  { href: "/shooting", category: "Start with a player", title: "Shooting by Rest", question: "Do players shoot differently with more rest?", action: "Look up a player" },
];

const READ = [
  { href: "/how-it-was-built", category: "Engineering walkthrough", title: "How FullCourt was built", question: "Data flow, implementation decisions, tradeoffs and verification, with links to the implementation.", action: "Read the walkthrough" },
  { href: "/behind-the-data", category: "Methods", title: "Behind the Data", question: "Sources, calculations and limitations, including research that found no clear effect.", action: "Read the methods" },
];

export function AboutContent() {
  return <div className={styles.chapters}>
    <section className={styles.chapter} aria-labelledby="about-purpose">
      <div className={styles.heading}><h2 id="about-purpose">Look at the schedule behind the game</h2></div>
      <p className={styles.lead}>FullCourt helps NBA fans compare rest, travel and workload, then examine what happened. Start with a game or a player, and follow a finding back to its sample and sources.</p>
      <p className={styles.note}><strong className="mono">Keep in mind</strong>Home court and team strength matter too. These historical comparisons describe patterns; they do not establish that rest caused a win.</p>
      <ul className={styles.grid2}>{START.map((item) => <li key={item.href}><StudyLink {...item} heading="h3" compact /></li>)}</ul>
    </section>
    <section className={styles.chapter} aria-labelledby="about-author">
      <div className={styles.heading}><h2 id="about-author">Created by Michael Ju</h2></div>
      <p className={styles.text}>FullCourt is a public research and software project. Every result needs a sample and a comparison, so the methods and the engineering are published beside the findings.</p>
      <ul className={styles.grid2}>{READ.map((item) => <li key={item.href}><StudyLink {...item} heading="h3" compact /></li>)}</ul>
      <a className={styles.link} href="https://github.com/mhju0">Michael on GitHub ↗</a>
    </section>
  </div>;
}
