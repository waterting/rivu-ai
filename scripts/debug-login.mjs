import { chromium } from "@playwright/test";
import { credentialsOrExit } from "./lib/credentials.mjs";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const { email, password } = credentialsOrExit();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("WebSocket")) console.log("[console]", m.text());
});
page.on("response", (r) => {
  if (r.url().includes("/api/")) console.log("[resp]", r.status(), r.url());
});

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.waitForTimeout(4000);

const hydrated = await page.evaluate(() => {
  const form = document.querySelector("form");
  if (!form) return "no form";
  const key = Object.keys(form).find((k) => k.startsWith("__react"));
  return key ? `hydrated:${key}` : "not hydrated";
});
console.log("hydration:", hydrated);

await page.getByLabel("Email", { exact: true }).fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: /Enter Rivu/i }).click();
await page.waitForTimeout(6000);
console.log("url:", page.url());
console.log("body:", (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n+/g, " | "));
await browser.close();