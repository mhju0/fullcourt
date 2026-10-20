import { Children, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BEHIND_THE_DATA_SECTIONS, RELATED_SURFACE_LABELS } from "@/lib/behind-the-data-sections";
import { ReferenceDetails } from "@/components/reference-details";
import { sectionId } from "@/components/behind-the-data-parts";
import "./reference.css";

const LIMITS: Record<string, string> = {
  "rest-advantage": "Rested and tired teams also differ in home court and team strength. These win rates do not isolate rest, and they do not predict a single game.",
  "schedule-edge": "Worth prices the schedule with historical rates. It is not the number of wins a team actually gained.",
  "playoff-predictions": "The model gives better probabilities, but not clearly better picks. It does not see injuries or in-series changes.",
  "player-shooting": "A positive split means better shooting with more rest. Opponents, shot choice and why games were missed can also move it.",
  "shot-value": "Every shot from the same cell in the same season gets the same value, whoever shot it and however it was guarded.",
  availability: "Absences are known only after a game. Nothing here says who plays tonight, and the separate absence effects must not be added together.",
  officiating: "These are the NBA's own reviews of selected close-game endings. They cannot measure whole-game accuracy or say which official erred.",
  referees: "Archived research on how often fouls were called in each official's games. It cannot say who made a call or whether it was right.",
  "time-zones": "The time-zone terms did not improve predictions. That does not prove the biological effect is zero, and it does not confirm the model's direction multipliers.",
  "data-and-limits": "Coverage differs by field and season. A missing input is not evidence that no overtime, travel or other event happened.",
};

export function BehindTheDataShell({ eyebrow, title, description, topic, children }: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  topic: string;
  children: ReactNode;
}) {
  const current = BEHIND_THE_DATA_SECTIONS.find((item) => item.href === `/behind-the-data/${topic}`);
  const contents = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ label?: string; title?: string }>(child) || !child.props.label) return [];
    return [{ id: sectionId(child.props.label), title: child.props.title ?? child.props.label }];
  });
  return <div className="reference-page flex flex-col gap-8">
    <div className="reference-navigation flex flex-wrap items-center justify-between gap-4">
      <Link className="reference-button" href="/behind-the-data">← All methods</Link>
      <details className="reference-topics">
        <summary>Change topic: {current?.title ?? title}</summary>
        <nav aria-label="Reference sections">
          {BEHIND_THE_DATA_SECTIONS.filter((item) => item.href !== "/behind-the-data").map((item) => <Link key={item.href} href={item.href} aria-current={current?.href === item.href ? "page" : undefined}>{item.title}</Link>)}
        </nav>
      </details>
    </div>
    <PageHeader eyebrow={eyebrow} title={title} description={description} />
    <p className="reference-limit"><strong>Keep in mind</strong>{" "}{LIMITS[topic]}</p>
    <details className="reference-contents">
      <summary>On this page</summary>
      <nav aria-label="On this page">{contents.map((item) => <a key={item.id} href={`/behind-the-data/${topic}#${item.id}`}>{item.title}</a>)}</nav>
      <ReferenceDetails scope={topic} />
    </details>
    <div id="reference-body" className="flex flex-col gap-4">{children}</div>
    <nav className="reference-related" aria-label="Related pages">
      {current?.surfaceHrefs.map((href) => <Link key={href} href={href}>{RELATED_SURFACE_LABELS[href]} →</Link>)}
      {topic !== "data-and-limits" && <Link href="/behind-the-data/data-and-limits">Data sources and coverage →</Link>}
    </nav>
  </div>;
}
