import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AboutContent } from "@/components/about-content";

export const metadata: Metadata = { title: "About FullCourt" };

export default function AboutPage() {
  return <div className="flex flex-col gap-12">
    <PageHeader eyebrow="ABOUT FULLCOURT" title="About FullCourt" description="Rest, fatigue and schedule research for NBA fans, with comparison groups, sample sizes and limitations beside the results." />
    <AboutContent />
  </div>;
}
