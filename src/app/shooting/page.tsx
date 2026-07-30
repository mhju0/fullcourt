import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { PlayerRestContentLazy } from "@/components/player-rest-lazy";

export const metadata: Metadata = {
  title: "Shooting by Rest",
};

export default function ShootingPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="SHOOTING BY REST · eFG%"
        title="Shooting by Rest"
        description="Look up any player and see how he shot on no rest against three days off — for a season, or across his career. Rest is his own, counted from the games he actually played."
      />
      <MethodLink surfaceHref="/shooting" />

      <PlayerRestContentLazy />
    </div>
  );
}
