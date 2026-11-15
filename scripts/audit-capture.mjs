// UI/UX audit capture: logs in through the real UI against the dev proxy and
// screenshots every authenticated surface at desktop, tablet and mobile widths.
//
// Usage: node scripts/audit-capture.mjs [--pages-only]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3010";
const OUT = path.resolve(".audit");
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const email = process.env.E2E_EMAIL || "rivu-smoke-1107@example.com";
const password = process.env.E2E_PASSWORD || "SmokeTest123";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORTS[0] });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

// ---- login -----------------------------------------------------------------
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("Email", { exact: true }).fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: /Enter Rivu|Sign in/i }).click();
await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
await page.waitForLoadState("networkidle");
console.log("logged in");

// ---- dataset id ------------------------------------------------------------
const token = await page.evaluate(() => localStorage.getItem("rivu_access_token"));
const headers = { Authorization: `Bearer ${token}` };
const projects = await (await fetch(`${API}/projects/`, { headers })).json();
const firstProject = projects.projects?.[0];
let datasetId = null;
if (firstProject) {
  const detail = await (await fetch(`${API}/projects/${firstProject.id}`, { headers })).json();
  datasetId = detail.datasets?.[0]?.id || null;
}
console.log("dataset:", datasetId || "(none)");

const routes = [
  ["/dashboard", "overview"],
  ["/dashboard/data-sources", "data-sources"],
  ["/dashboard/refinery", "refinery"],
  ["/dashboard/tools", "tools"],
  ["/dashboard/analytics", "analytics"],
  ["/dashboard/visualization", "visualization"],
  ["/dashboard/intelligence", "intelligence"],
  ["/dashboard/commerce", "commerce"],
  ["/dashboard/products", "products"],
  ["/dashboard/suppliers", "suppliers"],
  ["/dashboard/integrations", "integrations"],
  ["/dashboard/workflows", "workflows"],
  ["/dashboard/services", "services"],
  ["/dashboard/reports", "reports"],
  ["/dashboard/billing", "billing"],
  ["/dashboard/settings", "settings"],
  ["/dashboard/tools/compare", "tool-compare"],
  ["/dashboard/tools/format-studio", "tool-format-studio"],
  ["/dashboard/tools/media-matcher", "tool-media-matcher"],
];
if (datasetId) routes.push([`/dashboard/dataset/${datasetId}`, "dataset-detail"]);

const report = [];
for (const [route, name] of routes) {
  const before = consoleErrors.length;
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, `${name}-desktop.png`), fullPage: true });

  if (name === "overview" || name === "dataset-detail" || name === "tools") {
    for (const vp of VIEWPORTS.slice(1)) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${name}-${vp.name}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
  }

  // Layout diagnostics that a screenshot alone cannot show.
  const diag = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    const clipped = [];
    const main = document.querySelector("main");
    if (main) {
      const style = getComputedStyle(main);
      const mainWidth = main.getBoundingClientRect().width;
      const inner = main.firstElementChild;
      if (inner && style.overflowX === "visible") {
        const innerWidth = inner.scrollWidth;
        if (innerWidth > mainWidth + 2) {
          clipped.push(`content ${innerWidth}px wider than main ${Math.round(mainWidth)}px`);
        }
      }
    }
    // Elements escaping the viewport horizontally.
    const escapees = [];
    document.querySelectorAll("main *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2)) {
        escapees.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 2).join(".")}`);
      }
    });
    // Buttons with no accessible name.
    const unnamedButtons = [...document.querySelectorAll("button")]
      .filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title"))
      .length;
    return { overflowX, clipped, escapees: escapees.slice(0, 6), unnamedButtons };
  });

  report.push({ route, name, errors: consoleErrors.slice(before), ...diag });
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map(({ name, overflowX, escapees, unnamedButtons, errors }) => ({ name, overflowX, escapees, unnamedButtons, errors: errors.length })), null, 1));

await browser.close();