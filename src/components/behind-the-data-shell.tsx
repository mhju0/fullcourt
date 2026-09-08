import { Children, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BEHIND_THE_DATA_SECTIONS } from "@/lib/behind-the-data-sections";
import { ReferenceDetails } from "@/components/reference-details";
import { sectionId } from "@/components/behind-the-data-parts";
import "./reference.css";

const LIMITS: Record<string, string> = {
  "rest-advantage": "Historical rest groups also differ in home court and team strength. Their win rates do not isolate the effect of rest or predict an individual game.",
  "schedule-edge": "Worth uses pooled historical rates relative to venue baselines. It estimates schedule conditions, not the wins a team actually gained.",
  "playoff-predictions": "The tests support better probability estimates more clearly than better winner selection. Injuries and in-series adjustments are not included.",
  "player-shooting": "A positive difference means higher shooting efficiency with more rest. Opponents, shot selection and reasons for missed games can also affect the split.",
  "shot-value": "Two shots from the same location receive the same expected value, even when the shooters and defenders differ.",
  availability: "Absences are identified after games are played. These estimates cannot tell you who will be available tonight, and separate absence effects must not be added together.",
  officiating: "These are the NBA's assessments of selected close-game endings. They cannot measure whole-game accuracy or identify which official made an error.",
  referees: "This is archived research on foul frequency in games each official worked. It cannot identify who made a call or whether the call was correct.",
  "time-zones": "The tested travel-direction terms did not improve predictions. That does not establish that the biological effect is zero or validate the model's retained directional multipliers.",
  "data-and-limits": "Coverage differs by field and season. An unavailable input is not evidence that no overtime, travel or other event occurred.",
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
          {BEHIND_THE_DATA_SECTIONS.map((item) => <Link key={item.href} href={item.href} aria-current={current?.href === item.href ? "page" : undefined}>{item.title}</Link>)}
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
      {current?.surfaceHrefs.map((href) => <Link key={href} href={href}>{({ "/analysis": "View Model Results", "/games": "Browse Games", "/season": "Read Season Report", "/schedule": "Compare Schedule Edge", "/playoffs": "View Playoff Rest", "/shooting": "Compare Shooting by Rest", "/availability": "View Availability Cost", "/shot-quality": "View Expected Shot Value", "/officiating": "Browse Officiating" } as Record<string, string>)[href]} →</Link>)}
      {topic === "referees" && <Link href="/behind-the-data/referees/archive">Open referee research archive →</Link>}
      <Link href={topic === "data-and-limits" ? "/behind-the-data" : "/behind-the-data/data-and-limits"}>{topic === "data-and-limits" ? "All methods" : "Data sources and coverage"} →</Link>
    </nav>
  </div>;
}
