import { NextRequest, NextResponse } from "next/server";

const maintenancePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Updating results · FullCourt</title><style>body{margin:0;background:#f3f8fc;color:#19232d;font:18px/1.6 system-ui,sans-serif}main{max-width:640px;margin:12vh auto;padding:32px;background:#fbfdff;border:1px solid #b9ccdb}h1{font-size:28px;line-height:1.3;margin:20px 0}p{margin:16px 0}@media(max-width:720px){main{margin:10vh 20px;padding:24px}}</style></head><body><main><p>FullCourt</p><h1>Updating historical results</h1><p>We’re refreshing FullCourt’s historical results. Please check back in a few minutes.</p></main></body></html>`;

export function proxy(request: NextRequest) {
  if (process.env.FULLCOURT_MAINTENANCE !== "historical-recalculation") {
    return NextResponse.next();
  }
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/health" || pathname.startsWith("/_next/static/") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Retry-After": "120",
    "X-FullCourt-Maintenance": "historical-recalculation",
  };
  if (pathname.startsWith("/api/") || pathname.startsWith("/data/")) {
    return NextResponse.json({ data: null, error: "Historical results are being updated. Please try again shortly." }, { status: 503, headers });
  }
  return new NextResponse(maintenancePage, {
    status: 503,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
