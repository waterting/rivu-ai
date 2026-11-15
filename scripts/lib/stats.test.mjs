import assert from "node:assert/strict";
import test from "node:test";
import { percentile, summarize, concurrencyFor, round } from "./stats.mjs";

test("percentile interpolates between ranks", () => {
  const data = [1, 2, 3, 4, 5];
  assert.equal(percentile(data, 0), 1);
  assert.equal(percentile(data, 50), 3);
  assert.equal(percentile(data, 100), 5);
  // p95 of 5 points: rank = 0.95 * 4 = 3.8 -> between 4 and 5
  assert.ok(Math.abs(percentile(data, 95) - 4.8) < 1e-9);
});

test("percentile handles single and empty input", () => {
  assert.equal(percentile([7], 50), 7);
  assert.equal(percentile([], 50), null);
});

test("summarize reports the full set", () => {
  const s = summarize([10, 20, 30, 40, 50]);
  assert.equal(s.count, 5);
  assert.equal(s.min, 10);
  assert.equal(s.max, 50);
  assert.equal(s.p50, 30);
  assert.equal(s.mean, 30);
  assert.ok(s.p95 >= s.p50 && s.p99 >= s.p95 && s.p99 <= 50);
});

test("summarize of empty input is nulls, not NaN", () => {
  const s = summarize([]);
  assert.equal(s.count, 0);
  assert.equal(s.p50, null);
  assert.equal(s.mean, null);
});

test("concurrencyFor uses Little's Law", () => {
  // 1000 rps at 100ms mean latency -> ~100 in flight
  assert.equal(concurrencyFor(1000, 100), 100);
  // Never returns zero even for tiny rates
  assert.equal(concurrencyFor(1, 1), 1);
  assert.equal(concurrencyFor(0, 50), 1);
});

test("round keeps two decimals", () => {
  assert.equal(round(1.23456), 1.23);
  assert.equal(round(null), null);
});