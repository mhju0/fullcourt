import type { Metadata } from "next"

import { GamesViewTabs } from "@/components/games-view-tabs"
import { MethodLink } from "@/components/method-link"
import { PageHeader } from "@/components/page-header"
import { TeamScheduleContentLazy } from "@/components/team-schedule-lazy"

export const metadata: Metadata = {
  title: "Games by Team",
  description: "One NBA team's season, game by game, with the rest gap from that team's side.",
}

export default function GamesByTeamPage() {
  return (
    // Same header and rhythm as the board: this is the Games page seen one team at a time.
    <div className="flex flex-col gap-2 sm:gap-6">
      <div className="page-intro">
        <PageHeader
          eyebrow="GAME SLATE · REST ADVANTAGE"
          title="Games"
          description="Compare each team’s schedule. Rest gap is a model-score difference, not a win probability."
        />
        {/* A span, not a div: `.page-intro > div` would stretch it. Phones get it in the tabs row. */}
        <span className="hidden sm:block">
          <MethodLink surfaceHref="/games" />
        </span>
      </div>
      <GamesViewTabs current="/games/team" />
      <TeamScheduleContentLazy />
    </div>
  )
}
