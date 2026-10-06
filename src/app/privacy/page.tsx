import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import styles from "@/components/reading.module.css";
import { REPORT_ERROR_HREF, SUPPORT_EMAIL } from "@/lib/contact";

const DESCRIPTION = "FullCourt has no accounts, no cookies and no ads. This page lists what is recorded when you visit, and who records it.";

export const metadata: Metadata = {
  title: "Privacy",
  description: DESCRIPTION,
};

const RECIPIENTS = [
  { name: "Vercel", role: "Hosts the site", detail: "Like any web host, it logs each request with an IP address and browser type. Its analytics count page views without cookies and do not follow you to other sites." },
  { name: "Supabase", role: "Stores the game data", detail: "On the Games page your browser opens a connection to Supabase so scores can update while you watch. Supabase sees that connection's IP address." },
  { name: "ESPN", role: "Serves the team logos", detail: "Logo images load from ESPN's image server, so ESPN receives a request for each logo your browser shows." },
  { name: "Sentry", role: "Receives error reports", detail: "If a page fails, a report with the error, the page address and your browser type is sent to Sentry so the fault can be fixed. It carries no cookies, and FullCourt has set it not to record your IP address." },
];

export default function PrivacyPage() {
  return <div className="flex flex-col gap-12">
    <PageHeader eyebrow="PRIVACY · WHAT IS RECORDED" title="Privacy" description={DESCRIPTION} />
    <div className={styles.chapters}>
      <section className={styles.chapter} aria-labelledby="privacy-collects">
        <div className={styles.heading}><h2 id="privacy-collects">What FullCourt records about you</h2></div>
        <p className={styles.lead}>FullCourt has no sign-in. It sets no cookies and saves nothing in your browser.</p>
        <p className={styles.text}>The only measurement is a count of page views, which shows which pages people read. The count is kept in total, not per person.</p>
      </section>
      <section className={styles.chapter} aria-labelledby="privacy-services">
        <div className={styles.heading}><h2 id="privacy-services">Services that receive a request when you visit</h2></div>
        <ul className={styles.grid2}>{RECIPIENTS.map((item) => <li key={item.name} className={styles.card}>
          <h3>{item.name}</h3>
          <p>{item.role}. {item.detail}</p>
        </li>)}</ul>
        <p className={styles.text}>FullCourt does not sell data, show ads or share anything with advertisers.</p>
      </section>
      <section className={styles.chapter} aria-labelledby="privacy-use">
        <div className={styles.heading}><h2 id="privacy-use">What the figures are for</h2></div>
        <p className={styles.text}>FullCourt publishes historical research about rest and scheduling. Its rates and probabilities describe past games. They are not betting advice.</p>
        <p className={styles.text}>FullCourt is an independent project. It is not affiliated with or endorsed by the NBA or its teams. Team names and logos belong to their owners.</p>
      </section>
      <section className={styles.chapter} aria-labelledby="privacy-contact">
        <div className={styles.heading}><h2 id="privacy-contact">Contact</h2></div>
        <p className={styles.text}>Write to {SUPPORT_EMAIL} with a privacy question or a figure you think is wrong. If you write, your message and address are kept only to answer you.</p>
        <a className={styles.link} href={REPORT_ERROR_HREF}>Email FullCourt</a>
        <p className={styles.text}>Last updated October 6, 2026.</p>
      </section>
    </div>
  </div>;
}
