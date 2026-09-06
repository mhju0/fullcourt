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
  title: "Shot Value · Behind the Data",
  description:
    "Expected shot value (xeFG%) by court location, its zone baseline, and the shooting context the model does not observe.",
};

const MEASURED_ON = "2026-07-02";

export default function ShotValueMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · SHOT VALUE"
      title="Shot value"
      description="The average value of a shot from each court location, measured across the league. Defender position and shooter skill are outside this model."
    >
      <Section label="WHAT IS COMPUTED" descriptor="xeFG% PER CELL">
        <Prose>
          The half court is divided into a grid of one-foot cells. For each cell, the model
          estimates the probability a shot from there goes in, and converts that to an expected
          effective field goal percentage, so a cell behind the arc is credited at 1.5 times a
          cell inside it.
        </Prose>
        <Formula>
          {`xeFG% = P(make) × (1.5 if the cell is behind the three-point line, else 1)`}
        </Formula>
        <Prose>
          Expected eFG% is what an average shooter converts from a given spot. The gap between
          what a team actually shot and what the surface expected from those same spots is{" "}
          <strong>shots above expected</strong>. It compares shooting results with the value
          expected from those locations.
        </Prose>
        <Note>
          A three-pointer can have a lower make probability and still have a higher expected
          value than a two-pointer. The eFG% scale accounts for the extra point.
        </Note>
      </Section>

      <Section label="TWO SURFACES" descriptor={`MEASURED ${MEASURED_ON}`}>
        <Prose>
          The page compares two models. The{" "}
          <strong>zone baseline</strong> assigns every cell the average of its official zone,
          so its colour changes in blocky steps at zone boundaries. The{" "}
          <strong>gradient-boosted model</strong> uses court coordinates, so its estimates
          can vary within a zone.
        </Prose>
        <ValueGrid
          values={[
            { label: "Location model", value: "gbm-v1", sub: "gradient boosting" },
            { label: "Baseline", value: "baseline-zone-v1", sub: "official zone averages" },
            { label: "Model's edge", value: "~1%", sub: "log-loss / Brier" },
          ]}
        />
        <Prose>
          The location model improves log-loss and Brier score by roughly one percent over
          the zone baseline. Those metrics assess its probability estimates; the improvement
          does not mean it predicts one percent more makes and misses correctly.
        </Prose>
        <Note>
          Both surfaces are trained on prior seasons under an expanding window, so a season is
          never scored by a model that has seen it. Shot efficiency drifts upward over time,
          which means the most recent season&rsquo;s expected values can run slightly low;
          shots above expected for the current season are therefore biased a little high.
        </Note>
      </Section>

      <Section label="WHAT THIS IS NOT" descriptor="THE NAME IS DELIBERATE">
        <Prose>
          Defender distance, shot clock, touch time, and dribbles can help describe a shot.
          Those inputs are absent from the location data used here. A wide-open corner three
          and a contested one off the dribble receive the same expected value at the same location.
        </Prose>
        <Prose>
          That is why it is called <strong>shot value</strong>{" "}
          rather than shot quality: it
          answers &ldquo;what is a shot from here worth on average&rdquo;, never &ldquo;was
          this a good shot&rdquo;.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="LIMITATIONS">
        <LimitList
          items={[
            "Defender distance and contest level.",
            "Shot clock, touch time, dribbles, and whether the shot was assisted.",
            "Shooter skill. Players with different shooting records receive the same expected value from the same cell.",
            "Game context: score, period, and whether the possession was a scramble or a set play.",
            "Cells with few attempts are noisy by construction. The corners of the chart carry far less data than the paint.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
