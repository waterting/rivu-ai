// Local UI audit: signs in once, then checks each dashboard route at several
// viewports for console errors, failed requests, horizontal overflow and content
// that escapes the viewport. Writes a compact JSON report plus screenshots.
//
// Usage: node scripts/ui-audit.mjs [route ...]
// Credentials: E2E_EMAIL and E2E_PASSWORD (never hardcoded).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { credentialsOrExit } from "./lib/credentials.mjs";

const BASE = process.env.UI_AUDIT_BASE || "http://127.0.0.1:3010";
const { email: EMAIL, password: PASSWORD } = credentialsOrExit();
const OUT = path.resolve(".audit/ui");
fs.mkdirSync(OUT, { recursive: true });

const DEFAULT_ROUTES = [
  "/dashboard",
  "/dashboard/data-sources",
  "/dashboard/refinery",
  "/dashboard/tools",
  "/dashboard/analytics",
  "/dashboard/visualization",
  "/dashboard/intelligence",
  "/dashboard/commerce",
  "/dashboard/products",
  "/dashboard/suppliers",
  "/dashboard/integrations",
  "/dashboard/channels",
  "/dashboard/workflows",
  "/dashboard/services",
  "/dashboard/reports",
  "/dashboard/billing",
  "/dashboard/settings",
];

const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;
const VIEWPORTS = (process.env.UI_AUDIT_VIEWPORTS || "1440x900,390x844")
  .split(",")
  .map((pair) => {
    const [width, height] = pair.split("x").map(Number);
    return { width, height, name: pair };
  });

const CHECK = () => {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const inFixed = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const pos = getComputedStyle(node).position;
      if (pos === "fixed" || pos === "sticky") return true;
      node = node.parentElement;
    }
    return false;
  };
  const offenders = [];
  document.querySelectorAll("body *").forEach((el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") return;
    if (inFixed(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (rect.right <= 0 || rect.left >= vw) return;
    if (rect.right > vw + 1.5 || rect.left < -1.5) {
      offenders.push({
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 46),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        text: (el.textContent || "").trim().slice(0, 40),
      });
    }
  });

  // Text clipped by a fixed-height box.
  const clipped = [];
  document.querySelectorAll("h1,h2,h3,h4,p,span,td,th,li,button,a").forEach((el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.overflow === "visible") return;
    if (el.scrollHeight - el.clientHeight > 3 && el.clientHeight > 0 && style.overflowY !== "auto" && style.overflowY !== "scroll") {
      clipped.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 40), text: (el.textContent || "").trim().slice(0, 40), over: el.scrollHeight - el.clientHeight });
    }
  });

  // Tap targets below 28px tall on small screens.
  const small = [];
  if (vw <= 900) {
    document.querySelectorAll("button, a[href]").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.height < 28) {
        small.push({ text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), h: Math.round(rect.height) });
      }
    });
  }

  const tiny = [];
  document.querySelectorAll("p,span,td,li,label").forEach((el) => {
    if (el.children.length) return;
    if (!(el.textContent || "").trim()) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size && size < 11) tiny.push({ size, text: (el.textContent || "").trim().slice(0, 28) });
  });

  return {
    overflowX: doc.scrollWidth - vw,
    overflowY: doc.scrollHeight - doc.clientHeight,
    offenders: offenders.slice(0, 8),
    offenderCount: offenders.length,
    clipped: clipped.slice(0, 6),
    clippedCount: clipped.length,
    small: small.slice(0, 6),
    smallCount: small.length,
    tiny: tiny.slice(0, 4),
    tinyCount: tiny.length,
    hasMain: !!document.querySelector("main"),
    title: (document.querySelector("h1")?.textContent || "").trim().slice(0, 50),
  };
};

const browser = await chromium.launch();
const results = [];

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByLabel("Work email", { exact: true }).fill(EMAIL);
await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
await page.getByRole("button", { name: /^Sign in$/ }).click();
await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
const storage = await context.storageState();
await context.close();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: storage });
  const p = await ctx.newPage();
  const errors = new Set();
  const failed = new Set();
  p.on("console", (msg) => {
    if (msg.type() === "error") errors.add(msg.text().slice(0, 150));
  });
  p.on("pageerror", (err) => errors.add("pageerror: " + err.message.slice(0, 150)));
  p.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("accounts.google.com")) {
      failed.add(`${res.status()} ${new URL(res.url()).pathname}`);
    }
  });

  for (const route of routes) {
    errors.clear();
    failed.clear();
    let status = 0;
    try {
      const res = await p.goto(BASE + route, { waitUntil: "load", timeout: 45_000 });
      status = res?.status() ?? 0;
    } catch (err) {
      results.push({ route, viewport: vp.name, status: 0, fatal: err.message.slice(0, 120) });
      continue;
    }
    await p.waitForTimeout(2200);
    const metrics = await p.evaluate(CHECK);
    const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    await p.screenshot({ path: path.join(OUT, `${vp.name}-${slug}.png`) });
    results.push({
      route,
      viewport: vp.name,
      status,
      ...metrics,
      errors: [...errors],
      failed: [...failed],
    });
  }
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));

for (const vp of VIEWPORTS) {
  console.log(`\n### ${vp.name}`);
  for (const r of results.filter((entry) => entry.viewport === vp.name)) {
    if (r.fatal) {
      console.log(`${r.route.padEnd(34)} FATAL ${r.fatal}`);
      continue;
    }
    const flags = [];
    if (r.status >= 400) flags.push(`http${r.status}`);
    if (r.overflowX > 0) flags.push(`overflowX=${r.overflowX}`);
    if (r.overflowY > 0) flags.push(`scrollY=${r.overflowY}`);
    if (r.offenderCount) flags.push(`outside=${r.offenderCount}`);
    if (r.clippedCount) flags.push(`clipped=${r.clippedCount}`);
    if (r.smallCount) flags.push(`smallTap=${r.smallCount}`);
    if (r.tinyCount) flags.push(`tinyText=${r.tinyCount}`);
    if (r.errors.length) flags.push(`console=${r.errors.length}`);
    if (r.failed.length) flags.push(`http4xx=${r.failed.length}`);
    console.log(`${r.route.padEnd(34)} ${r.title.padEnd(28).slice(0, 28)} ${flags.length ? flags.join(" ") : "ok"}`);
  }
}

const problems = results.filter(
  (r) => !r.fatal && (r.overflowX > 0 || r.offenderCount || r.clippedCount || r.errors.length || (r.failed && r.failed.length))
);
if (problems.length) {
  console.log(`\n--- first details ---`);
  for (const r of problems.slice(0, 6)) {
    console.log(`\n${r.route} @${r.viewport}`);
    if (r.offenders?.length) console.log("  outside:", JSON.stringify(r.offenders.slice(0, 3)));
    if (r.clipped?.length) console.log("  clipped:", JSON.stringify(r.clipped.slice(0, 3)));
    if (r.errors?.length) console.log("  console:", JSON.stringify(r.errors.slice(0, 3)));
    if (r.failed?.length) console.log("  failed:", JSON.stringify(r.failed.slice(0, 3)));
  }
}
await browser.close();
