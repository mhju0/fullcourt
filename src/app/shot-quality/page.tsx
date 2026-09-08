import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { ShotQualityContentLazy } from "@/components/shot-quality-lazy";

export const metadata: Metadata = {
  title: "Expected Shot Value",
};

export default function ShotQualityPage() {
  return (
    <div className="flex flex-col gap-12">
      <header className="page-intro"><PageHeader
        eyebrow="EXPECTED SHOT VALUE · xeFG%"
        title="Expected Shot Value"
        description="Expected shooting efficiency by court location. This model uses shot coordinates; it does not observe defenders, shot clock, or how contested a shot was."
      />
      <MethodLink surfaceHref="/shot-quality" /></header>

      <ShotQualityContentLazy />
    </div>
  );
}
