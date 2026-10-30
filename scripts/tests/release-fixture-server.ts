import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { releaseDates, releaseGame, releaseRawShotQuality } from "../../e2e/fixtures/release-data";

const port = 3100;
const appPort = 3101;
// Override inherited credentials and .env values. No database API request reaches Next.
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_AUTH_TOKEN: "", CRON_SECRET: "" },
});

const server = createServer((req, res) => {
  res.setHeader("x-fullcourt-fixture-runtime", process.versions.node);
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith("/api/")) {
    let data: unknown;
    if (url.pathname === "/api/games/dates") data = releaseDates(url.searchParams.get("season") ?? "2024-25");
    else if (url.pathname === "/api/games/upcoming") data = [];
    // The board guide reads the 3+ bucket's rate from here; with no bucket it omits the sentence.
    else if (url.pathname === "/api/analysis") data = { thresholds: [] };
    else if (url.pathname === "/api/shot-quality") data = releaseRawShotQuality;
    else if (/^\/api\/games\/\d{4}-\d{2}-\d{2}$/.test(url.pathname)) {
      data = [releaseGame(url.pathname.split("/").at(-1)!)];
    } else {
      res.writeHead(501, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: null, error: `No release fixture for ${url.pathname}` }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ data, error: null }));
    return;
  }
  const upstream = request({ hostname: "127.0.0.1", port: appPort, path: req.url, method: req.method, headers: req.headers }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => { res.writeHead(502); res.end("Production app is starting"); });
  req.pipe(upstream);
});
server.listen(port, "127.0.0.1");
console.log(`Release fixture and Next runtime: Node ${process.versions.node}`);
const close = () => { server.close(); app.kill("SIGTERM"); };
process.on("SIGTERM", close);
process.on("SIGINT", close);
app.on("exit", code => { server.close(); process.exitCode = code ?? 1; });
