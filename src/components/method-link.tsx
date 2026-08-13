import Link from "next/link";
import { methodologyHrefFor } from "@/lib/behind-the-data-sections";

/**
 * The link from a product surface to the page explaining it.
 *
 * Discoverability for a reference section is not really a navigation problem — a reader
 * wants the method at the moment they doubt a number, which is while they are looking at it.
 * This puts the door there. Renders nothing when a surface has no documented section, so
 * adding one to `BEHIND_THE_DATA_SECTIONS` is all it takes to light this up.
 */
export function MethodLink({ surfaceHref }: { surfaceHref: string }) {
  const href = methodologyHrefFor(surfaceHref);
  if (!href) return null;

  return (
    <Link
      href={href}
      // Colour is a class, not an inline `style`. It was inline until 2026-08-13, and an inline
      // declaration outranks a class rule — so `hover:text-` never painted, on all eight surfaces
      // this renders on. Measured: computed colour identical at rest and on hover. The rest of
      // the style object stays inline; none of it is contested by a utility.
      className="mono inline-flex w-fit items-center gap-2 transition-colors text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
      style={{
        fontSize: 11,
        letterSpacing: "0.07em",
        fontWeight: 600,
        borderBottom: "1px solid var(--term-border)",
        paddingBottom: 4,
      }}
    >
      HOW THIS IS CALCULATED
      <span aria-hidden>→</span>
    </Link>
  );
}
