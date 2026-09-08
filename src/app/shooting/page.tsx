import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { PlayerRestContentLazy } from "@/components/player-rest-lazy";

export const metadata: Metadata = {
  title: "Shooting by Rest",
};

export default function ShootingPage() {
  return (
    <div className="flex flex-col gap-3 sm:gap-6">
      <header className="page-intro"><PageHeader
        eyebrow="SHOOTING BY REST · eFG%"
        title="Shooting by Rest"
        description="Compare a player’s shooting with and without rest, across seasons."
      />
      <MethodLink surfaceHref="/shooting" /></header>

      <PlayerRestContentLazy />
    </div>
  );
}
