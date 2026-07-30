import type { Metadata } from "next";
import { BehindTheDataContent } from "@/components/behind-the-data-content";

export const metadata: Metadata = {
  title: "Behind the Data",
  description:
    "How FullCourt's fatigue score is calculated, what each term is actually worth, where the data comes from, and what the model cannot see.",
};

// Lives in the OTHER menu rather than taking a sixth tab: the bar is five plain-noun tabs
// naming the five product surfaces, and this is a reference surface, not one of them.
// Static — every number is either a model constant or a dated measurement, so there is
// nothing to fetch.
export default function BehindTheDataPage() {
  return <BehindTheDataContent />;
}
