import { Children } from "react";
import { glueOperators, splitUnbreakable } from "@/lib/keep-together";

/**
 * Applies the line-break glue in `@/lib/keep-together` to the text children. Adjacent strings
 * and numbers are joined first, so `≥{" "}{n}` is glued like the literal "≥ 5" would be.
 */
export function keepTogether(children: React.ReactNode): React.ReactNode {
  const merged: React.ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    const last = merged.length - 1;
    if ((typeof child === "string" || typeof child === "number") && typeof merged[last] === "string") {
      merged[last] += String(child);
    } else {
      merged.push(typeof child === "number" ? String(child) : child);
    }
  }
  return merged.flatMap((child, c): React.ReactNode[] =>
    typeof child === "string"
      ? splitUnbreakable(glueOperators(child)).map((part, i) =>
          i % 2 ? <span key={`${c}-${i}`} className="whitespace-nowrap">{part}</span> : part)
      : [child]);
}

export function KeepTogether({ children }: { children: React.ReactNode }) {
  return <>{keepTogether(children)}</>;
}
