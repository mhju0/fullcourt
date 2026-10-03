"use client";

import { useEffect, useState } from "react";
import styles from "./reading.module.css";

/** The section list beside a long reading page. It marks the section being read. */
export function ReadingRail({ sections }: { sections: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);

  useEffect(() => {
    const targets = sections.flatMap(({ id }) => document.getElementById(id) ?? []);
    // A section counts as being read while its top is in the upper part of the window.
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).at(-1);
      if (visible) setCurrent(visible.target.id);
    }, { rootMargin: "-15% 0px -60% 0px" });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [sections]);

  return <nav className={styles.rail} aria-label="On this page">
    <p className="mono">On this page</p>
    <ol>
      {sections.map(({ id, label }, index) => <li key={id}>
        <a href={`#${id}`} aria-current={current === id ? "location" : undefined}>
          <span className="mono" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{label}
        </a>
      </li>)}
    </ol>
  </nav>;
}
