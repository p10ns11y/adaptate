export function nodeNowNs() {
  return Number(process.hrtime.bigint());
}
