// Auth page verification: layout fit, scroll behaviour, overlap, tap targets and
// the real login journey at several viewports.
//
// Usage: node scripts/auth-verify.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3010";
const OUT = path.resolve(".audit");
fs.mkdirSync(OUT, { recursive: true });

import { credentialsOrExit } from "./lib/credentials.mjs";

const { email, password } = credentialsOrExit();

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280x720", width: 1280, height: 720 },
  { name: "tablet-834", width: 834, height: 1112 },
  { name: "mobile-390", width: 390, height: 844 },
];

const CHECK = () => {
  const doc = document.documentElement;
  const body = document.body;
  const form = document.querySelector("form");
  const visual = document.querySelector('[data-auth-visual]');
  const header = document.querySelector("header");
  const logo = header?.querySelector('a[aria-label="Rivu home"]');

  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  };

  const interactive = [...document.querySelectorAll("a[href], button, input, select")].filter((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  });

  const smallTargets = interactive
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((t) => t.h < 40 || t.w < 40);

  const overlaps = [];
  for (let i = 0; i < interactive.length; i += 1) {
    for (let j = i + 1; j < interactive.length; j += 1) {
      const a = interactive[i];
      const b = interactive[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2) {
        overlaps.push({
          a: (a.getAttribute("aria-label") || a.textContent || a.tagName).trim().slice(0, 22),
          b: (b.getAttribute("aria-label") || b.textContent || b.tagName).trim().slice(0, 22),
          area: `${Math.round(w)}x${Math.round(h)}`,
        });
      }
    }
  }

  // Fonts and tap targets inside the form only.
  const fonts = [];
  document.querySelectorAll("form *, h1, p, label").forEach((el) => {
    if (!el.textContent || !el.textContent.trim() || el.children.length > 0) return;
    fonts.push(parseFloat(getComputedStyle(el).fontSize));
  });
  fonts.sort((a, b) => a - b);

  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    docScroll: { w: doc.scrollWidth, h: doc.scrollHeight, clientW: doc.clientWidth, clientH: doc.clientHeight },
    bodyScroll: { w: body.scrollWidth, h: body.scrollHeight },
    horizontalOverflow: doc.scrollWidth - doc.clientWidth,
    verticalOverflow: doc.scrollHeight - doc.clientHeight,
    header: rect(header),
    logo: rect(logo),
    form: rect(form),
    visual: visual ? rect(visual) : null,
    visualVisible: visual ? getComputedStyle(visual).display !== "none" : false,
    smallTargets: smallTargets.slice(0, 6),
    smallTargetCount: smallTargets.length,
    overlaps: overlaps.slice(0, 6),
    overlapCount: overlaps.length,
    fontMin: fonts[0] ?? null,
    fontMedian: fonts[Math.floor(fonts.length / 2)] ?? null,
    formVisibleWithoutScroll: form ? form.getBoundingClientRect().bottom <= window.innerHeight : null,
  };
};

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GSI_LOGGER")) errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  for (const route of ["/login", "/signup"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(2600);
    const shots = [];
    const metrics = await page.evaluate(CHECK);
    const shotPath = path.join(OUT, `auth-${route.slice(1)}-${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    shots.push(shotPath);
    results.push({ route, viewport: vp.name, ...metrics, errors, shots });
  }

  // Real login journey on the smallest and largest viewports.
  if (vp.name === "desktop-1440" || vp.name === "mobile-390") {
    await page.goto(`${BASE}/login`, { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.getByLabel("Work email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    let landed = true;
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
    } catch {
      landed = false;
    }
    results.push({ route: "/login-submit", viewport: vp.name, landed, url: page.url() });
  }

  await context.close();
}

fs.writeFileSync(path.join(OUT, "auth-verify.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  if (r.route === "/login-submit") {
    console.log(`login@${r.viewport.padEnd(14)} landed=${r.landed} url=${r.url}`);
    continue;
  }
  console.log(
    `${r.route.padEnd(8)} ${r.viewport.padEnd(14)} overflowX=${r.horizontalOverflow} overflowY=${r.verticalOverflow} ` +
      `visual=${r.visualVisible} formBottom=${r.form?.bottom}/${r.viewport.split("-")[1] || "?"} ` +
      `inView=${r.formVisibleWithoutScroll} tap<40=${r.smallTargetCount} overlaps=${r.overlapCount} ` +
      `font[min=${r.fontMin} med=${r.fontMedian}] errors=${r.errors.length}`
  );
}
await browser.close();