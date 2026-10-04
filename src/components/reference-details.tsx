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
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.(".reference-contents a[href]");
      if (!link) return;
      const destination = new URL(link.getAttribute("href")!, location.href);
      if (destination.origin !== location.origin || destination.pathname !== location.pathname) return;
      event.preventDefault();
      // Keep the router's history entry intact for Back after an in-page jump.
      if (destination.hash !== location.hash) history.pushState(history.state, "", destination);
      reveal();
    };
    // The topic list is an overlay, so it closes like one: Escape, or a press anywhere else.
    const topics = document.querySelector<HTMLDetailsElement>(".reference-topics");
    const dismissPress = (event: MouseEvent) => {
      if (topics?.open && !topics.contains(event.target as Node)) topics.open = false;
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !topics?.open) return;
      topics.open = false;
      topics.querySelector("summary")?.focus();
    };
    let printState: [HTMLDetailsElement, boolean][] = [];
    const beforePrint = () => {
      printState = Array.from(body?.querySelectorAll<HTMLDetailsElement>("details") ?? [], (item) => [item, item.open]);
      printState.forEach(([item]) => { item.open = true; });
    };
    const afterPrint = () => printState.forEach(([item, open]) => { item.open = open; });
    reveal();
    window.addEventListener("hashchange", reveal);
    window.addEventListener("popstate", reveal);
    document.addEventListener("click", onClick);
    document.addEventListener("click", dismissPress);
    document.addEventListener("keydown", dismissKey);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("hashchange", reveal);
      window.removeEventListener("popstate", reveal);
      document.removeEventListener("click", onClick);
      document.removeEventListener("click", dismissPress);
      document.removeEventListener("keydown", dismissKey);
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
