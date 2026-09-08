import Link from "next/link";
import { methodologyHrefFor } from "@/lib/behind-the-data-sections";

export function MethodLink({ surfaceHref }: { surfaceHref: string }) {
  const href = methodologyHrefFor(surfaceHref);
  return href ? <Link href={href} className="method-link">How this is calculated <span aria-hidden="true">↗</span></Link> : null;
}
