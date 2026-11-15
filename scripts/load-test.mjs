// Staged load test for the Rivu API.
//
// Runs a fixed sequence of target rates (1k -> 10k -> 50k -> 150k RPS), each for
// a bounded window, and records p50/p95/p99 latency plus the error rate. A stage
// fails when its error rate exceeds the error budget or its p95 latency exceeds
// the SLO, so the run tells you the highest rate the target can actually sustain
// instead of asserting a number.
//
// This measures whatever you point it at. A laptop will saturate well before the
// top stage; the audit's 150k RPS claim is only evidenced by running the top
// stages against the real deployment with --workers across several machines.
//
// Usage:
//   node scripts/load-test.mjs [--url URL] [--stage NAME] [--seconds N]
//                             [--workers N] [--budget PCT] [--slo-ms N]
//                             [--anonymous]
//   Credentials: E2E_EMAIL and E2E_PASSWORD (never hardcoded), unless
//   --anonymous is used to load a public endpoint such as a health probe.

import fs from "node:fs";
import path from "node:path";
import { summarize, concurrencyFor } from "./lib/stats.mjs";
import { requireCredentials } from "./lib/credentials.mjs";

const DEFAULT_URL = process.env.LOAD_TEST_URL || "http://127.0.0.1:8000";
const STAGES = [
  { name: "1k", rps: 1_000 },
  { name: "10k", rps: 10_000 },
  { name: "50k", rps: 50_000 },
  { name: "150k", rps: 150_000 },
];

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    stage: null,
    seconds: 5,
    workers: 1,
    budget: 1,
    sloMs: 800,
    anonymous: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--url": args.url = value; i += 1; break;
      case "--stage": args.stage = value; i += 1; break;
      case "--seconds": args.seconds = Number(value); i += 1; break;
      case "--workers": args.workers = Math.max(1, Number(value) || 1); i += 1; break;
      case "--budget": args.budget = Number(value); i += 1; break;
      case "--slo-ms": args.sloMs = Number(value); i += 1; break;
      case "--anonymous": args.anonymous = true; break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/load-test.mjs [--url URL] [--stage 1k|10k|50k|150k] [--seconds N] [--workers N] [--budget PCT] [--slo-ms N] [--anonymous]",
        );
        process.exit(0);
      default:
        console.error(`Unknown argument: ${key}`);
        process.exit(2);
    }
  }
  return args;
}

function loginUrl(base) {
  return base.replace(/\/$/, "") + "/api/v1/auth/login";
}

async function login(base, email, password) {
  const res = await fetch(loginUrl(base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const token = body?.tokens?.access_token;
  if (res.status !== 200 || !token) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  }
  return token;
}

// One worker: opens `concurrency` in-flight requests and refills as each
// completes, for the stage duration. Returns every observed latency + status.
async function runWorker({ url, token, concurrency, seconds, onTick }) {
  const latencies = [];
  const statuses = new Map();
  const deadline = Date.now() + seconds * 1000;
  let inFlight = 0;
  let stop = false;

  const tick = () => {
    if (stop) return;
    inFlight += 1;
    const started = process.hrtime.bigint();
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        statuses.set(res.status, (statuses.get(res.status) || 0) + 1);
        // Drain the body so the socket returns to the pool.
        return res.arrayBuffer();
      })
      .catch(() => {
        statuses.set(0, (statuses.get(0) || 0) + 1);
      })
      .finally(() => {
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        latencies.push(elapsedMs);
        inFlight -= 1;
        if (Date.now() >= deadline) stop = true;
        if (inFlight < concurrency && !stop) tick();
      });
  };

  for (let i = 0; i < concurrency; i += 1) tick();
  while (!stop || inFlight > 0) {
    await new Promise((r) => setTimeout(r, 25));
    onTick?.();
  }
  return { latencies, statuses };
}

async function runStage(stage, args, token) {
  const url = args.url.replace(/\/$/, "") + "/api/v1/health";
  const concurrency = concurrencyFor(stage.rps / args.workers, 50);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const worker = await runWorker({
    url,
    token,
    concurrency,
    seconds: args.seconds,
  });

  const elapsed = (Date.now() - t0) / 1000;
  const total = worker.latencies.length;
  const errors = [...worker.statuses.entries()]
    .filter(([status]) => status === 0 || status >= 500)
    .reduce((acc, [, count]) => acc + count, 0);
  const errorRate = total > 0 ? (errors / total) * 100 : 0;
  const achievedRps = total / Math.max(elapsed, 0.001);
  const stats = summarize(worker.latencies);

  const budgetOk = errorRate <= args.budget;
  const sloOk = stats.p95 == null || stats.p95 <= args.sloMs;
  const pass = budgetOk && sloOk;

  return {
    stage: stage.name,
    target_rps: stage.rps,
    achieved_rps: Math.round(achievedRps),
    window_seconds: args.seconds,
    concurrency,
    ...stats,
    statuses: Object.fromEntries(worker.statuses),
    error_rate_pct: Math.round(errorRate * 100) / 100,
    budget_pct: args.budget,
    slo_ms: args.sloMs,
    budget_ok: budgetOk,
    slo_ok: sloOk,
    pass,
    started_at: startedAt,
  };
}

function printStage(result) {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(
    `[${status}] ${result.stage.padEnd(5)} target=${String(result.target_rps).padStart(7)} rps ` +
      `achieved=${String(result.achieved_rps).padStart(7)} rps ` +
      `p50=${String(result.p50).padStart(7)} p95=${String(result.p95).padStart(7)} p99=${String(result.p99).padStart(7)} ms ` +
      `err=${result.error_rate_pct}%`,
  );
  if (!result.budget_ok) console.log(`        error budget exceeded: ${result.error_rate_pct}% > ${result.budget_pct}%`);
  if (!result.slo_ok) console.log(`        p95 SLO exceeded: ${result.p95}ms > ${result.sloMs}ms`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const stages = args.stage ? STAGES.filter((s) => s.name === args.stage) : STAGES;
  if (stages.length === 0) {
    console.error(`Unknown stage: ${args.stage}. Valid: ${STAGES.map((s) => s.name).join(", ")}`);
    process.exit(2);
  }

  console.log(`load test -> ${args.url} (workers=${args.workers}, budget=${args.budget}%, slo=${args.sloMs}ms)`);

  let token = null;
  if (args.anonymous) {
    console.log("anonymous mode: no login, hitting the endpoint unauthenticated");
  } else {
    let credentials;
    try {
      credentials = requireCredentials();
    } catch (error) {
      console.error(error.message);
      process.exit(2);
    }
    token = await login(args.url, credentials.email, credentials.password);
  }

  const results = [];
  for (const stage of stages) {
    results.push(await runStage(stage, args, token));
    printStage(results[results.length - 1]);
  }

  const outDir = path.resolve(".audit/load");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `load-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const highest = [...results].reverse().find((r) => r.pass);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        target_url: args.url,
        generated_at: new Date().toISOString(),
        config: { seconds: args.seconds, workers: args.workers, budget_pct: args.budget, slo_ms: args.sloMs },
        highest_passing_stage: highest ? highest.stage : null,
        results,
      },
      null,
      2,
    ),
  );

  console.log(`\nhighest passing stage: ${highest ? highest.stage + " RPS" : "none"}`);
  console.log(`report: ${outPath}`);
  if (args.workers === 1 && results.some((r) => r.target_rps >= 50_000 && !r.pass)) {
    console.log(
      "\nNote: a single Node process will not reach 50k+ RPS. Re-run the top stages against the\n" +
        "deployed target with --workers N spread across several machines before citing the result.",
    );
  }
  process.exit(highest ? 0 : 1);
}

await main();