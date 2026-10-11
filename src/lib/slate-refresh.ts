import type { GameResponse } from "@/types";

export function shouldRefreshSlate(args: {
  selectedDate: string;
  today: string;
  games: readonly Pick<GameResponse, "status">[];
  visible: boolean;
  online: boolean;
}): boolean {
  return args.visible && args.online &&
    (args.selectedDate >= args.today || args.games.some((game) => game.status !== "final"));
}

/** One selected slate owns its requests; disposing it also rejects responses after A → B → A. */
export function createSlateRefresh<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  resolved: (value: T) => void;
  rejected: (error: unknown, background: boolean) => void;
  debounceMs?: number;
  timeoutMs?: number;
  hasData?: boolean;
  started?: (background: boolean) => void;
}) {
  let active = true;
  let running = false;
  let queued = false;
  let request = 0;
  let hasData = options.hasData ?? false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (!active) return;
    if (running) { queued = true; return; }
    running = true;
    const identity = ++request;
    controller = new AbortController();
    options.started?.(hasData);
    const signal = controller.signal;
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        controller?.abort();
        reject(new Error("Request timed out. Try again."));
      }, options.timeoutMs ?? 12_000);
    });
    try {
      const value = await Promise.race([options.load(signal), timeout]);
      if (active && identity === request) {
        hasData = true;
        options.resolved(value);
      }
    } catch (error) {
      if (active && identity === request) options.rejected(error, hasData);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      running = false;
      if (queued && active) { queued = false; refresh(); }
    }
  };
  const refresh = () => {
    if (!active || timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; void run(); }, options.debounceMs ?? 250);
  };
  void run();
  return {
    refresh,
    dispose() {
      active = false;
      request++;
      controller?.abort();
      if (deadline !== undefined) clearTimeout(deadline);
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
