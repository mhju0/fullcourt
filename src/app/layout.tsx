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
    default: "NBA Rest Advantage",
    template: "%s · NBA Rest Advantage",
  },
  description:
    "Data-driven NBA fatigue analysis. Track rest advantage scores, travel load, and prediction accuracy across the season.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lastUpdated = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

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
              LAST UPDATED: {lastUpdated} · PIPELINE OK
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
