export function operationsPerSecond(runOnce, budgetMs, nowNs) {
  runOnce();
  let operations = 0;
  const start = nowNs();
  const stop = start + budgetMs * 1e6;
  let now = start;
  while (now < stop) {
    runOnce();
    operations += 1;
    now = nowNs();
  }
  return (operations * 1e9) / (now - start);
}

export function microsPerChunk(runPass, chunkCount, budgetMs, nowNs) {
  if (chunkCount <= 0) throw new Error("chunkCount must be positive");
  runPass();
  let chunks = 0;
  const start = nowNs();
  const stop = start + budgetMs * 1e6;
  let now = start;
  while (now < stop) {
    runPass();
    chunks += chunkCount;
    now = nowNs();
  }
  return (now - start) / 1e3 / chunks;
}
