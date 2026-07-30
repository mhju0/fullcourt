import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";

export const metadata: Metadata = {
  title: "Shot Value — Behind the Data",
  description:
    "Expected shot value (xeFG%) by court location: the model, the zone baseline it is measured against, and the defender data public sources do not have.",
};

const MEASURED_ON = "2026-07-02";

export default function ShotValueMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · SHOT VALUE"
      title="Shot value"
      description="What a shot from a given spot on the floor is worth, league-wide. This is shot location value — not shot quality, and the difference matters."
    >
      <Section label="WHAT IS COMPUTED" descriptor="xeFG% PER CELL">
        <Prose>
          The half court is divided into a grid of one-foot cells. For each cell, the model
          estimates the probability a shot from there goes in, and converts that to an expected
          effective field goal percentage — so a cell behind the arc is credited at 1.5 times a
          cell inside it.
        </Prose>
        <Formula>
          {`xeFG% = P(make) × (1.5 if the cell is behind the three-point line, else 1)`}
        </Formula>
        <Note>
          Because the value is expressed as eFG%, the long mid-range reads as the worst real
          estate on the floor even though its make probability beats a three. That is the
          well-known result the metric exists to make visible, not a quirk of this
          implementation.
        </Note>
      </Section>

      <Section label="TWO SURFACES" descriptor={`MEASURED ${MEASURED_ON}`}>
        <Prose>
          The page renders two models side by side, on purpose. The{" "}
          <strong>zone baseline</strong> assigns every cell the average of its official zone,
          so its colour changes in blocky steps at zone boundaries. The{" "}
          <strong>gradient-boosted model</strong> reads location continuously, so its surface
          varies smoothly.
        </Prose>
        <ValueGrid
          values={[
            { label: "Location model", value: "gbm-v1", sub: "gradient boosting" },
            { label: "Baseline", value: "baseline-zone-v1", sub: "official zone averages" },
            { label: "Model's edge", value: "~1%", sub: "log-loss / Brier" },
          ]}
        />
        <Prose>
          The baseline is not a straw man — it is genuinely hard to beat, because zones were
          drawn around real differences in the first place. The location model wins by roughly
          one percent on log-loss and Brier score, which is a{" "}
          <strong>calibration improvement, not an accuracy jump</strong>. It is stated that way
          on the page rather than dressed up.
        </Prose>
      </Section>

      <Section label="WHAT THIS IS NOT" descriptor="THE NAME IS DELIBERATE">
        <Prose>
          Real shot quality models use defender distance, shot clock, touch time and dribbles —
          the tracking data that decides whether a shot was open. None of that is in public NBA
          data. A wide-open corner three and a contested one off the dribble are the same shot
          to this model, because from the floor plan alone they are indistinguishable.
        </Prose>
        <Prose>
          That is why it is called <strong>shot value</strong> rather than shot quality: it
          answers &ldquo;what is a shot from here worth on average&rdquo;, never &ldquo;was
          this a good shot&rdquo;.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "Defender distance and contest level — the single biggest determinant of whether a shot goes in.",
            "Shot clock, touch time, dribbles, and whether the shot was assisted.",
            "Who took it. This is a league-wide surface, so a career 42% shooter and a career 30% shooter get the same expected value from the same cell.",
            "Game context: score, period, and whether the possession was a scramble or a set play.",
            "Cells with few attempts are noisy by construction. The corners of the chart carry far less data than the paint.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
