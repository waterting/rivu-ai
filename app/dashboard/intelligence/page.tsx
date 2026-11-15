"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brain, RefreshCw, ShieldCheck, AlertTriangle, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type Dataset = { id: string; name: string; project_id: string; status: string; current_version: number };

type Metric = {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string | null;
  formula: string;
  available: boolean;
  missing: string[];
  margin_pct?: number | null;
};

type BIResult = {
  dataset_id: string;
  dataset_name: string;
  version: number;
  rows_scanned: number;
  rows_total: number;
  truncated: boolean;
  row_count: number;
  roles: Record<string, string | null>;
  metrics: Metric[];
  top_products: Array<{ product: string; revenue: number }>;
  demand_trend: Array<{ period: string; revenue: number }>;
  restock: Array<{ product: string; units_sold: number; stock_on_hand: number; gap: number }>;
  limitations: string[];
};

const fmt = (n: number) =>
  Math.abs(n) >= 10_000_000
    ? `${(n / 10_000_000).toFixed(2)} Cr`
    : Math.abs(n) >= 100_000
      ? `${(n / 100_000).toFixed(2)} L`
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function IntelligencePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState("");
  const [bi, setBi] = useState<BIResult | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await authFetch("/projects/", { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || body.detail || "Could not load projects");
      const projects: Array<{ id: string }> = Array.isArray(body.projects) ? body.projects : [];
      const all: Dataset[] = [];
      for (const p of projects) {
        const pr = await authFetch(`/projects/${p.id}`, { headers: authHeaders() });
        if (!pr.ok) continue;
        const pj = await pr.json().catch(() => ({}));
        const list: Dataset[] = Array.isArray(pj.datasets) ? pj.datasets : [];
        all.push(...list);
      }
      setDatasets(all);
      if (all[0]) setSelected(all[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const run = useCallback(async (id: string) => {
    if (!id) return;
    setRunning(true);
    setErr("");
    setMsg("");
    setBi(null);
    try {
      const r = await authFetch(`/datasets/${id}/bi`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (r.status === 202) {
        setMsg(j.detail?.message || "This dataset is still being profiled. Try again shortly.");
        return;
      }
      if (!r.ok) throw new Error(j.detail?.message || j.detail || "Analysis failed");
      setBi(j as BIResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled && selected) await run(selected);
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, run]);

  const maxRevenue = useMemo(
    () => Math.max(1, ...(bi?.top_products || []).map((p) => p.revenue)),
    [bi]
  );
  const maxTrend = useMemo(
    () => Math.max(1, ...(bi?.demand_trend || []).map((p) => p.revenue)),
    [bi]
  );

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / AI BUSINESS INTELLIGENCE</div>
          <h1>AI Business Intelligence</h1>
          <p>
            Metrics computed directly from your dataset rows — revenue, units, margin, demand trend and
            restock risk. Every number shows its formula, and anything that cannot be computed is listed
            instead of guessed.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => (selected ? run(selected) : load())}>
            <RefreshCw size={15} /> {running ? "Analysing..." : "Re-run"}
          </button>
        </div>
      </header>

      {err && <div className={styles.error}>{err}</div>}
      {msg && <div className={styles.message}>{msg}</div>}

      <section className={styles.sectionBlock}>
        <h2>Dataset</h2>
        {loading ? (
          <p className={styles.muted}>Loading datasets...</p>
        ) : datasets.length === 0 ? (
          <p className={styles.muted}>
            No datasets yet. Upload sales, inventory or purchase data in{" "}
            <Link href="/dashboard" style={{ color: "#a59bff" }}>
              Overview
            </Link>
            .
          </p>
        ) : (
          <div className={styles.formGrid} style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <label>Analyse</label>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {bi && (
          <p className={styles.muted} style={{ marginTop: 10 }}>
            Version {bi.version} · {bi.rows_scanned.toLocaleString()} of {bi.rows_total.toLocaleString()} rows
            scanned{bi.truncated ? " (capped)" : ""}
          </p>
        )}
      </section>

      {running && <p className={styles.muted}>Computing metrics from stored rows...</p>}

      {bi && (
        <>
          <section className={styles.sectionBlock}>
            <h2>Metrics (computed)</h2>
            <div className={styles.grid4} style={{ marginTop: 14 }}>
              {bi.metrics.map((m) => (
                <div key={m.key} className={styles.card}>
                  <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {m.label}
                    <span className={m.available ? styles.statusLive : styles.statusPlanned}>
                      {m.available ? "MEASURED" : "N/A"}
                    </span>
                  </h3>
                  <p style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                    {m.available
                      ? typeof m.value === "number"
                        ? fmt(m.value)
                        : String(m.value)
                      : "—"}
                    {m.available && m.margin_pct != null ? ` (${m.margin_pct}%)` : ""}
                  </p>
                  <small className={styles.muted}>formula: {m.formula}</small>
                  {!m.available && m.missing.length > 0 && (
                    <small className={styles.muted}>missing: {m.missing.join(", ")}</small>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className={styles.grid2}>
            <section className={styles.sectionBlock} style={{ marginTop: 0 }}>
              <h2>Top products by revenue</h2>
              {bi.top_products.length === 0 ? (
                <p className={styles.muted} style={{ marginTop: 10 }}>
                  No product/revenue columns detected.
                </p>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {bi.top_products.map((p) => (
                    <div key={p.product}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span>{p.product}</span>
                        <b>{fmt(p.revenue)}</b>
                      </div>
                      <div className={styles.chartBar}>
                        <i style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.sectionBlock} style={{ marginTop: 0 }}>
              <h2>Demand trend (by month)</h2>
              {bi.demand_trend.length === 0 ? (
                <p className={styles.muted} style={{ marginTop: 10 }}>
                  No date column detected, so no trend is available.
                </p>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {bi.demand_trend.slice(-12).map((p) => (
                    <div key={p.period}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span>{p.period}</span>
                        <b>{fmt(p.revenue)}</b>
                      </div>
                      <div className={styles.chartBar}>
                        <i style={{ width: `${(p.revenue / maxTrend) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className={styles.sectionBlock}>
            <h2>Restock risk (units sold above recorded stock)</h2>
            {bi.restock.length === 0 ? (
              <p className={styles.muted} style={{ marginTop: 10 }}>
                {bi.roles.stock && bi.roles.quantity
                  ? "No product sold more units than the recorded stock."
                  : "Requires product, quantity and stock columns."}
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Units sold</th>
                      <th>Stock on hand</th>
                      <th>Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bi.restock.map((r) => (
                      <tr key={r.product}>
                        <td>{r.product}</td>
                        <td>{r.units_sold.toLocaleString()}</td>
                        <td>{r.stock_on_hand.toLocaleString()}</td>
                        <td style={{ color: "#ff9da8" }}>{r.gap.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={styles.muted} style={{ marginTop: 10 }}>
              This is a measured comparison of sold units against recorded stock. It is not a purchase
              recommendation: raising stock or reordering needs human approval.
            </p>
          </section>

          <section className={styles.sectionBlock}>
            <h2>Column roles detected</h2>
            <p className={styles.muted} style={{ marginTop: 8 }}>
              {Object.entries(bi.roles)
                .map(([role, col]) => `${role}: ${col || "not detected"}`)
                .join(" · ")}
            </p>
          </section>

          {bi.limitations.length > 0 && (
            <section className={styles.sectionBlock}>
              <h2>
                <AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                What could not be computed
              </h2>
              <ul style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {bi.limitations.map((l) => (
                  <li key={l} className={styles.muted} style={{ fontSize: 11 }}>
                    {l}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className={styles.sectionBlock}>
        <h2>
          <ShieldCheck size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          How this stays honest
        </h2>
        <div className={styles.grid3} style={{ marginTop: 12 }}>
          <div className={styles.card}>
            <Brain size={16} />
            <h3 style={{ marginTop: 6 }}>Computed, not generated</h3>
            <p className={styles.muted}>Metrics come from summing rows of the dataset you selected.</p>
          </div>
          <div className={styles.card}>
            <ShieldCheck size={16} />
            <h3 style={{ marginTop: 6 }}>Formula shown</h3>
            <p className={styles.muted}>Each metric states the columns and arithmetic used.</p>
          </div>
          <div className={styles.card}>
            <AlertTriangle size={16} />
            <h3 style={{ marginTop: 6 }}>Gaps declared</h3>
            <p className={styles.muted}>Uncomputable metrics are marked N/A with the missing columns.</p>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Link href="/dashboard/visualization" className={styles.iconBtn} style={{ textDecoration: "none", display: "inline-flex" }}>
            Open visualization <ArrowUpRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}