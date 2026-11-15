// Read-only API probe: logs in and dumps compact summaries of the endpoints the
// dashboard relies on, so UI work can be checked against real payloads.
//
// Credentials come from the environment (E2E_EMAIL / E2E_PASSWORD); nothing is
// hardcoded. Overrides: E2E_API_URL, E2E_EMAIL.
import fs from "node:fs";
import { withCredentials } from "./lib/credentials.mjs";

const BASE = process.env.PROBE_API || "http://127.0.0.1:8000/api/v1";

async function json(path, token, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

await withCredentials(async ({ email, password }) => {
const login = await json("/auth/login", null, { method: "POST", body: JSON.stringify({ email, password }) });
if (login.status !== 200) {
  console.log("LOGIN FAILED", login.status, JSON.stringify(login.body).slice(0, 200));
  process.exit(1);
}
const token = login.body.tokens.access_token;

const shape = (value, depth = 0) => {
  if (Array.isArray(value)) return value.length ? [`${value.length} items`, shape(value[0], depth + 1)] : ["0 items"];
  if (value && typeof value === "object") {
    return Object.entries(value).map(([k, v]) => {
      if (v && typeof v === "object") return `${k}: ${Array.isArray(v) ? `[${v.length}]` : "{" + Object.keys(v).slice(0, 8).join(",") + "}"}`;
      return `${k}: ${JSON.stringify(v)?.slice(0, 40)}`;
    });
  }
  return [String(value)];
};

const targets = process.argv[2] === "--all" ? [] : null;
const paths = [
  "/projects/",
  "/analytics/organization",
  "/commerce/products?limit=5",
  "/commerce/suppliers",
  "/commerce/channels",
  "/billing/current",
  "/billing/usage",
];

const out = [];
for (const path of paths) {
  const r = await json(path, token);
  out.push({ path, status: r.status, summary: r.status === 200 ? shape(r.body) : String(JSON.stringify(r.body)).slice(0, 160) });
}

const projects = await json("/projects/", token);
const firstProject = projects.body?.[0] ?? projects.body?.items?.[0];
if (firstProject) {
  out.push({ path: "/projects/{id}", id: firstProject.id, summary: shape(firstProject) });
  const datasets = await json(`/projects/${firstProject.id}`, token);
  const datasetId = datasets.body?.datasets?.[0]?.id ?? datasets.body?.datasets?.items?.[0]?.id;
  if (datasetId) {
    for (const suffix of ["/profile", "/quality", "/jobs", "/preview?limit=3"]) {
      const r = await json(`/datasets/${datasetId}${suffix}`, token);
      out.push({ path: `/datasets/{id}${suffix}`, id: datasetId, status: r.status, summary: r.status === 200 ? shape(r.body) : String(JSON.stringify(r.body)).slice(0, 200) });
    }
  } else {
    out.push({ path: "/projects/{id}", note: "no datasets on first project", body: JSON.stringify(datasets.body).slice(0, 200) });
  }
} else {
  out.push({ path: "/projects/", note: "no projects", body: JSON.stringify(projects.body).slice(0, 200) });
}

fs.writeFileSync(".audit/api-probe.json", JSON.stringify(out, null, 2));
for (const entry of out) {
  console.log(`\n== ${entry.path}${entry.id ? " " + entry.id : ""} [${entry.status ?? "-"}]`);
  (entry.summary ?? []).slice(0, 14).forEach((line) => console.log("   " + line));
  if (entry.note) console.log("   ! " + entry.note + " " + (entry.body ?? ""));
}
});