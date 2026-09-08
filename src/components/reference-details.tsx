"use client";

import { useEffect, useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ReferenceDetails({ scope }: { scope: string }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  useEffect(() => {
    const body = document.getElementById("reference-body");
    const reveal = () => {
      let id: string;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target || !body?.contains(target)) return;
      target.querySelectorAll<HTMLDetailsElement>("details").forEach((item) => { item.open = true; });
      let parent = target.closest("details");
      while (parent) { parent.open = true; parent = parent.parentElement?.closest("details") ?? null; }
      target.scrollIntoView({ behavior: "instant", block: "start" });
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href^="#"]');
      if (link) requestAnimationFrame(reveal);
    };
    let printState: [HTMLDetailsElement, boolean][] = [];
    const beforePrint = () => {
      printState = Array.from(body?.querySelectorAll<HTMLDetailsElement>("details") ?? [], (item) => [item, item.open]);
      printState.forEach(([item]) => { item.open = true; });
    };
    const afterPrint = () => printState.forEach(([item, open]) => { item.open = open; });
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", onClick);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", onClick);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [scope]);

  if (!ready) return null;
  return <div className="reference-actions flex flex-wrap gap-3">
    <button className="reference-button" onClick={() => document.querySelectorAll<HTMLDetailsElement>("#reference-body details").forEach((item) => { item.open = true; })}>Expand technical detail</button>
    <button className="reference-button" onClick={() => document.querySelectorAll<HTMLDetailsElement>("#reference-body details").forEach((item) => { item.open = false; })}>Collapse technical detail</button>
  </div>;
}
