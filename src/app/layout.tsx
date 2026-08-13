import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";

// One family for body AND headings — the Front Office direction (docs/design/
// mocks/08-front-office.html, adopted 2026-08-09) separates titles from prose by
// weight, not by face. Replaces Inter (body) + Space Grotesk (display); the base
// heading weight moves 500 → 600 in globals.css alongside this.
//
// Outfit is still bundled under src/app/fonts for the OG card: that wordmark is a
// fixed brand asset, and a logotype does not have to share the UI's display face.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
  // 700 is loaded for /about, whose display statements set font-bold — without it the
  // browser synthesizes a faux bold from the 600 face.
  weight: ["400", "500", "600", "700"],
});

// The data face. Replaces IBM Plex Mono with the direction's Geist Mono — same
// tabular discipline, one voice with the UI face. Weights mirror what Plex loaded
// so existing font-semibold/font-bold mono text keeps a real face behind it.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700"],
});

const SITE_URL = "https://fullcourt-nba.vercel.app";
// No route count and no "completed": both aged. This named three surfaces while the site
// carried nine, because it was written before Schedule Edge, Season Report, Availability
// Cost and Referee Effect shipped. Names the subjects instead, which a new module extends
// rather than invalidates.
const SITE_DESC =
  "FullCourt models what the NBA schedule does to a game — rest advantage, schedule edge, playoff series rest, player shooting by rest, shot value, the cost of a missing player, and referee foul style — checked against every season since 1985-86.";

// The app is committed light-only (globals.css sets color-scheme: light), so pin the
// mobile browser chrome to --term-bg instead of letting Safari/Chrome pick a default.
export const viewport: Viewport = {
  themeColor: "#F6F7F9",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FullCourt — NBA Analytics",
    template: "%s · FullCourt",
  },
  description: SITE_DESC,
  openGraph: {
    type: "website",
    siteName: "FullCourt",
    url: SITE_URL,
    title: "FullCourt — NBA Analytics",
    description: SITE_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "FullCourt — NBA Analytics",
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The time this layout was rendered — NOT data freshness. Labeled "RENDERED"
  // so it makes no claim about pipeline/DB liveness. Live health lives behind
  // the SYSTEM STATUS link (/api/health), which this footer never calls.
  const renderedAt =
    new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-foreground">
        <NavBar />

        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
        </main>

        <footer
          className="mono"
          style={{
            background: "var(--term-surface-2)",
            borderTop: "1px solid var(--term-border)",
          }}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6">
            <span style={{ fontSize: "11px", color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
              RENDERED: {renderedAt} ·{" "}
              <a
                href="/api/health"
                // Colour is a class, not an inline `style`. It was inline until 2026-08-13, and
                // an inline declaration outranks a class rule — so `hover:text-` never painted on
                // any of these four links. Measured: computed colour identical at rest and hover.
                className="underline transition-colors text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
              >
                SYSTEM STATUS
              </a>
            </span>
            <span style={{ fontSize: "11px", color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
              {/* `/` since 2026-08-12, when that page became the front door. `/about` still
                  redirects here, but pointing straight at it saves the hop. `Link` rather than
                  `<a>`: this is an internal route now, and `no-html-link-for-pages` enforces it. */}
              <Link
                href="/"
                // Colour is a class, not an inline `style`. It was inline until 2026-08-13, and
                // an inline declaration outranks a class rule — so `hover:text-` never painted on
                // any of these four links. Measured: computed colour identical at rest and hover.
                className="underline transition-colors text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
              >
                WHAT THIS MEASURES
              </Link>
              {" · "}
              <a
                href="https://github.com/mhju0"
                target="_blank"
                rel="noopener noreferrer"
                // Colour is a class, not an inline `style`. It was inline until 2026-08-13, and
                // an inline declaration outranks a class rule — so `hover:text-` never painted on
                // any of these four links. Measured: computed colour identical at rest and hover.
                className="underline transition-colors text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
              >
                BUILT BY MJ
              </a>
              {" · "}
              <a
                href="https://github.com/mhju0/fullcourt"
                target="_blank"
                rel="noopener noreferrer"
                // Colour is a class, not an inline `style`. It was inline until 2026-08-13, and
                // an inline declaration outranks a class rule — so `hover:text-` never painted on
                // any of these four links. Measured: computed colour identical at rest and hover.
                className="underline transition-colors text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
              >
                SOURCE
              </a>
            </span>
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}
