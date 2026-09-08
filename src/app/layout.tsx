import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { PageSearchButton } from "@/components/page-search-button";
import { BottomNav } from "@/components/bottom-nav";
import { CommandPaletteMount } from "@/components/command-palette-mount";
import { RouteTransitionLifecycle } from "@/lib/route-transition";
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
  "NBA analytics for rest, travel, and schedule density, checked against games since 1985-86. Explore shooting, playoff series, availability, and officiating with methods and limitations.";

// The app is committed light-only (globals.css sets color-scheme: light), so pin the
// mobile browser chrome to --term-bg instead of letting Safari/Chrome pick a default.
export const viewport: Viewport = {
  themeColor: "#F6F7F9",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FullCourt · NBA Analytics",
    template: "%s · FullCourt",
  },
  description: SITE_DESC,
  openGraph: {
    type: "website",
    siteName: "FullCourt",
    url: SITE_URL,
    title: "FullCourt · NBA Analytics",
    description: SITE_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "FullCourt · NBA Analytics",
    description: SITE_DESC,
  },
  // The other half of the install surface (app/manifest.ts): `capable` is what lets a
  // home-screen launch open standalone on iOS, which reads the meta tag and not the
  // manifest's `display`. Title matches the manifest short_name, not the full title —
  // the space under an icon fits one word.
  appleWebApp: {
    capable: true,
    title: "FullCourt",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-foreground">
        {/* First tab stop on every page (ESPN carries the same link; Naver's equivalent is
            본문 바로가기). A keyboard or screen-reader visitor otherwise walks the full nav —
            brand link, four tabs and a reference landmark — before every page's content.
            `sr-only` until focused, so it costs the visual design nothing at rest. */}
        <a
          href="#main"
          className="mono sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-[var(--term-radius)] focus:border focus:border-[var(--term-border)] focus:bg-[var(--term-surface)] focus:px-4 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-[var(--term-text)]"
        >
          Skip to main content
        </a>
        <RouteTransitionLifecycle />
        <NavBar />

        {/* tabIndex -1 so the skip link's fragment navigation actually moves focus here —
            without it the URL changes and the next Tab starts from the nav anyway. */}
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
        </main>

        <footer
          className="mono"
          style={{
            background: "var(--term-surface-2)",
            borderTop: "1px solid var(--term-border)",
          }}
        >
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-x-6 px-4 py-2 sm:px-6 lg:flex-row lg:items-center">
            <nav aria-label="Footer" className="site-footer-links">
              <Link href="/about">About FullCourt</Link>
              <Link href="/behind-the-data">Methods</Link>
              <Link href="/how-it-was-built">How it was built</Link>
              <a href="https://github.com/mhju0/fullcourt">Source ↗</a>
              <a href="/api/health">System status ↗</a>
              <PageSearchButton />
            </nav>
          </div>
        </footer>

        {/* The phone dock and the ⌘K palette (2026-08-29 shell merge). Both are chrome, not
            page content: the dock is fixed below `lg` (body reserves its height in
            globals.css). What mounts here is the palette's *doorbell*, not the palette — ~1KB of
            listeners, so ⌘K works on every route, while `cmdk` and the sixteen `@radix-ui/*`
            packages behind it are fetched on the first summon (2026-09-01). Do not collapse this
            back into a static `CommandPalette` import: that is the thing that was removed. */}
        <BottomNav />
        <CommandPaletteMount />

        <Analytics />
      </body>
    </html>
  );
}
