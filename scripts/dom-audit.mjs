// DOM-based UI/UX audit. Captures measurable layout, typography, contrast and
// interaction facts for every authenticated route at desktop and mobile widths.
//
// Usage: node scripts/dom-audit.mjs [baseUrl]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL || process.argv[2] || "http://127.0.0.1:3010";
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
const OUT = path.resolve(".audit");
fs.mkdirSync(OUT, { recursive: true });

const email = process.env.E2E_EMAIL || "rivu-smoke-1107@example.com";
const password = process.env.E2E_PASSWORD || "SmokeTest123";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const ROUTES = [
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
  ["/login", "login"],
];

const MEASURE = () => {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;

  // ---- contrast helpers -----------------------------------------------------
  const parseColor = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const ch = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const effectiveBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parseColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.85) return bg;
      node = node.parentElement;
    }
    return { r: 11, g: 15, b: 23, a: 1 };
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };

  // ---- text typography ------------------------------------------------------
  const textSizes = [];
  const tinyText = [];
  const truncations = [];
  const contrastOffenders = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = (node.textContent || "").trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || !visible(el)) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;

    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    textSizes.push(size);
    if (size < 12) tinyText.push({ size, text: text.slice(0, 48), cls: String(el.className).slice(0, 40) });

    const fg = parseColor(style.color);
    const bg = effectiveBg(el);
    if (fg) {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const large = size >= 18.66 || (size >= 14 && parseInt(style.fontWeight) >= 600);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        contrastOffenders.push({
          ratio: Math.round(ratio * 100) / 100,
          size,
          color: style.color,
          bg: `rgb(${bg.r},${bg.g},${bg.b})`,
          text: text.slice(0, 48),
        });
      }
    }

    // truncation: element clips text without ellipsis/scroll affordance
    if (
      el.children.length === 0 &&
      el.scrollWidth > el.clientWidth + 1 &&
      style.overflow !== "auto" &&
      style.overflow !== "scroll"
    ) {
      truncations.push({
        text: text.slice(0, 40),
        scroll: el.scrollWidth,
        client: el.clientWidth,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        cls: String(el.className).slice(0, 40),
      });
    }
  }

  // ---- tap targets ---------------------------------------------------------
  const smallTargets = [];
  document.querySelectorAll("button, a, select, input, [role=button]").forEach((el) => {
    if (!visible(el)) return;
    if (el.type === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.height < 36 || r.width < 36) {
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 32),
        w: px(r.width),
        h: px(r.height),
      });
    }
  });

  // ---- accessible names ----------------------------------------------------
  const unnamedInputs = [];
  document.querySelectorAll("input:not([type=hidden]), select, textarea").forEach((el) => {
    if (!visible(el)) return;
    const id = el.id;
    const labelled = id && document.querySelector(`label[for="${id}"]`);
    const wrapped = el.closest("label");
    const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
    if (!labelled && !wrapped && !aria) {
      unnamedInputs.push({ tag: el.tagName.toLowerCase(), type: el.type || "", placeholder: el.getAttribute("placeholder") || "" });
    }
  });

  const unnamedButtons = [...document.querySelectorAll("button")]
    .filter((b) => visible(b) && !(b.textContent || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title"))
    .map((b) => String(b.className).slice(0, 40));

  // ---- headings -----------------------------------------------------------
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter(visible)
    .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || "").trim().slice(0, 60) }));

  // ---- tables -------------------------------------------------------------
  const tables = [...document.querySelectorAll("table")].map((t) => {
    const wrap = t.parentElement;
    return {
      rows: t.querySelectorAll("tbody tr").length,
      cols: t.querySelectorAll("thead th").length,
      tableWidth: px(t.getBoundingClientRect().width),
      wrapWidth: wrap ? px(wrap.getBoundingClientRect().width) : null,
      wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : null,
    };
  });

  // ---- overlapping fixed/sticky layers -----------------------------------
  const layers = [];
  document.querySelectorAll("*").forEach((el) => {
    const s = getComputedStyle(el);
    if ((s.position === "fixed" || s.position === "sticky") && visible(el)) {
      const r = el.getBoundingClientRect();
      layers.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 48),
        position: s.position,
        zIndex: s.zIndex,
        top: px(r.top),
        bottom: px(r.bottom),
        height: px(r.height),
      });
    }
  });

  const interactiveOverlap = [];
  const focusables = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter(visible);
  for (let i = 0; i < focusables.length; i += 1) {
    for (let j = i + 1; j < focusables.length; j += 1) {
      const a = focusables[i];
      const b = focusables[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const overlapW = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapH = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapW > 4 && overlapH > 4) {
        interactiveOverlap.push({
          a: `${a.tagName.toLowerCase()}:${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 24)}`,
          b: `${b.tagName.toLowerCase()}:${(b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 24)}`,
          overlap: `${Math.round(overlapW)}x${Math.round(overlapH)}`,
        });
      }
    }
  }

  // ---- focus visibility ---------------------------------------------------
  const focusable = document.querySelector("button, a[href], input, select");
  let focusVisible = null;
  if (focusable) {
    focusable.focus();
    const s = getComputedStyle(focusable);
    focusVisible = {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      boxShadow: s.boxShadow.slice(0, 60),
    };
  }

  // ---- spacing / density --------------------------------------------------
  const gaps = [...document.querySelectorAll("main section, main > div")]
    .slice(0, 40)
    .map((el) => parseFloat(getComputedStyle(el).rowGap || getComputedStyle(el).marginBottom || "0"))
    .filter((n) => !Number.isNaN(n));
  const contentHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const contentWidth = document.documentElement.scrollWidth;
  const viewportWidth = window.innerWidth;

  const sorted = [...textSizes].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.floor(sorted.length * q)] ?? null;

  return {
    viewport: `${viewportWidth}x${viewportHeight}`,
    content: { height: contentHeight, width: contentWidth, viewportHeight, viewportWidth, screens: Math.round(contentHeight / viewportHeight) },
    typography: {
      samples: sorted.length,
      min: sorted[0] ?? null,
      p10: pick(0.1),
      median: pick(0.5),
      p90: pick(0.9),
      max: sorted[sorted.length - 1] ?? null,
      under12px: tinyText.length,
      tinySamples: tinyText.slice(0, 6),
    },
    contrast: {
      offenders: contrastOffenders.length,
      worst: contrastOffenders.sort((a, b) => a.ratio - b.ratio).slice(0, 6),
    },
    truncation: { count: truncations.length, samples: truncations.slice(0, 5) },
    tapTargets: { under36: smallTargets.length, samples: smallTargets.slice(0, 8) },
    a11y: { unnamedInputs: unnamedInputs.length, unnamedButtons: unnamedButtons.length, headings, focus: focusVisible },
    tables,
    layers,
    overlaps: interactiveOverlap.slice(0, 8),
    density: { sectionGaps: gaps.slice(0, 10) },
  };
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORTS[0] });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.getByLabel("Email", { exact: true }).fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: /Enter Rivu|Sign in/i }).click();
await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
await page.waitForLoadState("networkidle");
console.log("logged in");

const token = await page.evaluate(() => localStorage.getItem("rivu_access_token"));
const headers = { Authorization: `Bearer ${token}` };
const projects = await (await fetch(`${API}/projects/`, { headers })).json();
const firstProject = projects.projects?.[0];
let datasetId = null;
if (firstProject) {
  const detail = await (await fetch(`${API}/projects/${firstProject.id}`, { headers })).json();
  datasetId = detail.datasets?.[0]?.id || null;
}
const routes = [...ROUTES];
if (datasetId) routes.push([`/dashboard/dataset/${datasetId}`, "dataset-detail"]);

const results = {};
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const [route, name] of routes) {
    const before = errors.length;
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    results[`${name}@${vp.name}`] = { ...(await page.evaluate(MEASURE)), consoleErrors: errors.slice(before) };
  }
}

fs.writeFileSync(path.join(OUT, "dom-audit.json"), JSON.stringify(results, null, 2));

for (const [key, r] of Object.entries(results)) {
  const t = r.typography;
  console.log(
    `${key.padEnd(30)} screens=${String(r.content.screens).padStart(2)} ` +
      `font[min=${t.min} med=${t.median} <12px=${t.under12px}] ` +
      `contrast<4.5=${r.contrast.offenders} ` +
      `trunc=${r.truncation.count} ` +
      `tap<36=${r.tapTargets.under36} ` +
      `unnamed(in=${r.a11y.unnamedInputs},btn=${r.a11y.unnamedButtons}) ` +
      `tables=${r.tables.length} layers=${r.layers.length} overlaps=${r.overlaps.length} ` +
      `errors=${r.consoleErrors.length}`
  );
}

await browser.close();