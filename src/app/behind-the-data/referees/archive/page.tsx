import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RefereeEffectContent } from "@/components/referee-effect-content";
import legendsData from "@/data/referee-legends.json";
import styleData from "@/data/referee-foul-style.json";
import timingData from "@/data/referee-timing.json";
import type { RefereeFoulStyle } from "@/lib/referee-foul-style";
import type { RefereeLegends } from "@/lib/referee-legends";
import type { RefereeTiming } from "@/lib/referee-timing";

const data = styleData as RefereeFoulStyle;
const timing = timingData as RefereeTiming;
const legends = legendsData as RefereeLegends;

export const metadata: Metadata = {
  title: "Referee research archive",
  description:
    "Foul types, timing, and official-player records compared with season averages and chance expectations.",
};

export default function RefereesPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="RESEARCH ARCHIVE · FOULS PER GAME"
        title="Referee research archive"
        // Two lines at 1440px is a contract, not a preference — e2e/page-headers.spec.ts
        // measures the wrapped line boxes. The population and the caveat both get said at
        // length in the body; this has room for the refusal only.
        description="Compare foul patterns in the games each official worked. Three officials share every game, and these records do not identify who made a call or whether it was correct."
      />

      <Link href="/behind-the-data/referees" className="underline">
        Research methods ↗
      </Link>

      <RefereeEffectContent style={data} timing={timing} legends={legends} />
    </div>
  );
}
