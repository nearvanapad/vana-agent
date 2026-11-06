/** Runs once when the server starts: warms the shared caches in the background. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { warmUp } = await import("./lib/warm");
  warmUp();
}
