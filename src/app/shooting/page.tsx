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
        description="Compare a player's shooting on no rest with three or more days of rest, for a season or career. Rest is counted from the player's own appearances."
      />
      <MethodLink surfaceHref="/shooting" />

      <PlayerRestContentLazy />
    </div>
  );
}
