// Latency statistics for the load-test harness.
//
// Pure functions, no I/O, so they can be unit-tested without a server. Percentiles
// use nearest-rank with linear interpolation between the two closest ranks, which
// is what p50/p95/p99 reporting in the audit expects.

export function percentile(sortedValues, p) {
  const n = sortedValues.length;
  if (n === 0) return null;
  if (n === 1) return sortedValues[0];
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (n - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower];
  const weight = rank - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function summarize(latenciesMs) {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  }
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: n,
    min: round(sorted[0]),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[n - 1]),
    mean: round(sum / n),
  };
}

export function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

// Little's Law: to sustain `rps` with mean latency `latencyMs` seconds of
// in-flight work, you need ceil(rps * latency) concurrent requests.
export function concurrencyFor(rps, latencyMs) {
  if (!rps || rps <= 0) return 1;
  const seconds = Math.max(latencyMs, 1) / 1000;
  return Math.max(1, Math.ceil(rps * seconds));
}