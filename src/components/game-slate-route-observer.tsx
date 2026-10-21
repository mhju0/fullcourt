"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Its local Suspense boundary keeps the board's initial markup prerendered. */
export function GameSlateRouteObserver({ onSearch }: { onSearch: (search: string) => void }) {
  const search = useSearchParams().toString();
  useEffect(() => { onSearch(search); }, [search, onSearch]);
  return null;
}
