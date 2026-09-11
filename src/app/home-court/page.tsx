import type { Metadata } from "next";

import { HomeCourtStudy } from "@/components/home-court-study";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Home-court advantage",
  description: "NBA home win rate and rested-at-home win rate by season in FullCourt's eligible-game population.",
};

export default function HomeCourtPage() {
  return (
    <div className="flex flex-col gap-12">
      <header>
        <PageHeader
          eyebrow="HOME-COURT ADVANTAGE"
          title="Are home teams winning less often?"
          description="Compare each season’s home win rate with the record of teams that were also more rested at home."
        />
        <MethodLink surfaceHref="/home-court" />
      </header>
      <HomeCourtStudy />
    </div>
  );
}
