import type { Metadata } from "next";
import { AboutContentLazy } from "@/components/about-lazy";

export const metadata: Metadata = {
  title: "What FullCourt measures",
  description:
    "FullCourt measures what the schedule does to a team before the ball is tipped — travel, rest and density, across four decades of evidence.",
};

// Deliberately not a sixth nav tab: the primary nav is five plain-noun tabs naming the
// five product surfaces, and a marketing page is not one of them. Reached from the footer.
export default function AboutPage() {
  return <AboutContentLazy />;
}
