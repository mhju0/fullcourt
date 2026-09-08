"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { BEHIND_THE_DATA_SECTIONS } from "@/lib/behind-the-data-sections";
import { cn } from "@/lib/utils";
import { TRACK } from "@/lib/terminal-styles";

/**
 * Shared chrome for the reference section: one page header plus a sub-nav across the
 * sections. The sub-nav is a real list of links (not a tab widget) so every section is
 * addressable, back/forward works, and a reader can send someone a URL that lands on the
 * exact method being argued about.
 */
export function BehindTheDataShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [contents, setContents] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setContents(
        Array.from(
          bodyRef.current?.querySelectorAll("section[id]") ?? [],
        ).flatMap((section) => {
          const heading = section.querySelector("h2");
          return heading
            ? [{ id: section.id, title: heading.textContent ?? section.id }]
            : [];
        }),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <nav
        aria-label="Reference sections"
        className="mono flex flex-nowrap items-center gap-x-6 gap-y-2 overflow-x-auto border-y py-3 sm:flex-wrap"
        style={{
          borderColor: "var(--term-border)",
          fontSize: 11,
          letterSpacing: TRACK.label,
        }}
      >
        {BEHIND_THE_DATA_SECTIONS.map((section) => {
          // Exact match only: /behind-the-data is the overview, and a prefix test would
          // light it up on every child route.
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              // The active section was bolder text and nothing else, which on a row of
              // already-bold mono labels is close to no signal at all. It now carries the
              // same red underline the main nav uses for "you are here".
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 py-1 font-semibold transition-colors",
                active
                  ? "border-[var(--term-text)] text-[var(--term-text)]"
                  : "border-transparent text-[var(--term-text-muted)] hover:text-[var(--term-text)]",
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      {contents.length > 0 ? (
        <nav
          aria-label="On this page"
          className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]"
        >
          {contents.map((item) => (
            <a
              className="min-h-11 content-center text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
              href={`#${item.id}`}
              key={item.id}
            >
              {item.title}
            </a>
          ))}
        </nav>
      ) : null}
      <div ref={bodyRef} className="flex flex-col gap-12">
        {children}
      </div>
    </div>
  );
}
