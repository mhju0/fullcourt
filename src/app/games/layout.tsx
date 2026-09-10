import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Games",
  description: "Browse NBA game slates and compare each team's rest and schedule context.",
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
