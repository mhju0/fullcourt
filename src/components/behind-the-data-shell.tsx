"use client";

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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <nav
        aria-label="Reference sections"
        className="mono flex flex-wrap items-center gap-x-6 gap-y-2 border-y py-3"
        style={{ borderColor: "var(--term-border)", fontSize: 11, letterSpacing: TRACK.label }}
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
                "border-b-2 py-1 font-semibold transition-colors",
                active
                  ? "border-[var(--term-red)] text-[var(--term-text)]"
                  : "border-transparent text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-12">{children}</div>
    </div>
  );
}
