/** Legacy command name retained for read-only counts. Prediction history must be preserved. */
async function main(): Promise<void> {
  // Refuse before loading environment files or any database module, even without credentials.
  if (process.argv.includes("--apply")) {
    throw new Error("Preservation policy: --apply is disabled. Historical predictions must not be deleted, rebuilt, or graded by this tool. Use the default read-only report.");
  }
  if (process.argv.length > 2) throw new Error("Usage: reset_predictions.ts (read-only counts; no flags)");
  const { readPredictionSnapshot } = await import("./verify_predictions");
  const snapshot = await readPredictionSnapshot();
  console.log(JSON.stringify({
    policy: "Report only. Prediction history is preserved; this command cannot reset, backfill, or grade rows.",
    asOf: snapshot.asOf,
    transactionReadOnly: snapshot.readOnly,
    total: snapshot.predictions.length,
    graded: snapshot.predictions.filter((row) => row.actualWinnerId !== null).length,
    open: snapshot.predictions.filter((row) => row.actualWinnerId === null).length,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
