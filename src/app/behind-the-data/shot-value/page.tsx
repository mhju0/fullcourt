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
  title: "Expected Shot Value · Behind the Data",
  description:
    "Expected shot value (xeFG%) by court location, its zone baseline, and the shooting context the model does not observe.",
};

const EVALUATED_ON = "2026-07-02";

export default function ShotValueMethodPage() {
  return (
    <BehindTheDataShell
      topic="shot-value"
      eyebrow="BEHIND THE DATA · SHOT VALUE"
      title="Expected Shot Value"
      description="A model estimate of shot value at each court location, fitted to league shooting data. Defender position and shooter skill are outside this model."
    >
      <Section label="WHAT IS COMPUTED" title="Expected value by court location">
        <Prose>
          The half court is split into one-foot cells. For each cell, the model estimates how
          often a two and a three go in, then blends them by how often the league shoots each
          from that cell in that season.
        </Prose>
        <Formula>
          {`r3    = threes ÷ all shots in the cell

xeFG% = 100 × [ (1 − r3) × P(two)
              + r3 × 1.5 × P(three) ]`}
        </Formula>
        <Prose>
          P(two) and P(three) are make probabilities. The 1.5 is the eFG% credit for the extra
          point on a three.
        </Prose>
        <Prose>
          xeFG% is the model&rsquo;s estimate for league-average shooting at a spot. The
          difference view shows the <strong>location model minus the zone baseline</strong>,
          in percentage points. It compares two models, not a team&rsquo;s shooting with an
          expectation.
        </Prose>
        <Note>
          A three can go in less often than a two and still be worth more. The eFG% scale
          accounts for the extra point.
        </Note>
      </Section>

      <Section label="TWO SURFACES" title="Comparing the two location models" descriptor={`Evaluation recorded ${EVALUATED_ON}`} disclosure>
        <Prose>
          The <strong>zone baseline</strong> uses the average make rate for each cell&rsquo;s
          official zone and distance range. A category missing from training falls back to the
          overall make rate. The <strong>gradient-boosted model</strong> uses distance and
          angle from the basket, so its estimate can change within a zone. It treats the left
          and right sides as one.
        </Prose>
        <ValueGrid
          values={[
            { label: "Location model", value: "gbm-v1", sub: "gradient boosting" },
            { label: "Baseline", value: "baseline-zone-v1", sub: "official zone averages" },
            { label: "Model's edge", value: "~1%", sub: "log-loss / Brier" },
          ]}
        />
        <Prose>
          Tested season by season, each season predicted from earlier ones only, the location
          model improved log loss and Brier score by about one percent over the zone baseline.
          Those scores measure probability quality. It does not mean one percent more shots
          called correctly.
        </Prose>
        <Note>
          The maps use models refitted on every training season, including the seasons shown.
          They are reference surfaces, not the held-out predictions that were tested. Period is
          fixed at the training average and home/away at 0.5, so neither varies by cell. New
          seasons need a separate data and surface update.
        </Note>
      </Section>

      <Section label="WHAT THIS IS NOT" title="Shot context the model cannot see" disclosure>
        <Prose>
          The location data has no defender distance, shot clock, touch time or dribbles. A
          wide-open corner three and a contested one off the dribble get the same value in the
          same cell and season.
        </Prose>
        <Prose>
          <strong>Shot value</strong> is what a shot from a spot is worth on average. It cannot
          say whether one particular shot was a good one.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "Defender distance and contest level.",
            "Shot clock, touch time, dribbles, and whether the shot was assisted.",
            "Shooter skill. Players with different shooting records receive the same expected value from the same cell.",
            "Cell values do not change with the score, the period, or whether the play was a scramble or a set.",
            "Sparse cells rest on few shots. The values are model outputs, not each cell's raw make rate; square size shows how many shots were taken there.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
