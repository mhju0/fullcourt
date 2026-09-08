import Link from "next/link";
export function AboutContent() {
  return <div className="flex flex-col gap-12">
    <section className="build-section">
      <h2>Look at the schedule behind the game</h2>
      <p>FullCourt helps NBA fans compare rest, travel and workload, then examine what happened. Start with a game or a player, and follow a finding back to its sample and sources.</p>
      <p>Home court and team strength matter too. These historical comparisons describe patterns; they do not establish that rest caused a win.</p>
      <div className="flex flex-wrap gap-3"><Link className="build-action" href="/games">Find a game</Link><Link className="build-action" href="/shooting">Look up a player</Link></div>
    </section>
    <section className="build-section">
      <h2>Created by Michael Ju</h2>
      <p>FullCourt is a public research and software project. The engineering walkthrough explains how the application collects data, serves findings and checks its results, with links to the implementation.</p>
      <Link className="build-case-link" href="/how-it-was-built"><strong>How FullCourt was built</strong><span>Data flow, implementation decisions, tradeoffs and verification →</span></Link>
      <a className="method-link" href="https://github.com/mhju0">Michael on GitHub ↗</a>
    </section>
    <section className="build-section">
      <h2>Follow the evidence</h2>
      <p>Every result needs a sample and a comparison. Behind the Data explains the methods, coverage and limitations, including research that found no clear effect.</p>
      <Link className="method-link" href="/behind-the-data">Sources, calculations and limitations ↗</Link>
    </section>
  </div>;
}
