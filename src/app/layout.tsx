import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "FullCourt — NBA Analytics",
    template: "%s · FullCourt",
  },
  description:
    "FullCourt is an NBA analytics platform. Today it models rest and fatigue to surface each matchup's rest advantage, with more models on the way.",
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
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-foreground">
        <NavBar />

        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
        </main>

        <footer
          className="mono"
          style={{
            background: "#F0EEE9",
            borderTop: "1px solid #E2DFD8",
          }}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6">
            <span style={{ fontSize: "10px", color: "#8A8478", letterSpacing: "0.04em" }}>
              RENDERED: {renderedAt} ·{" "}
              <a
                href="/api/health"
                style={{ color: "#8A8478", textDecoration: "underline" }}
              >
                SYSTEM STATUS
              </a>
            </span>
            <span style={{ fontSize: "10px", color: "#8A8478", letterSpacing: "0.04em" }}>
              BUILT BY MJ
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
