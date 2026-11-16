"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, History, RefreshCw } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type DatasetRow = { id: string; name: string; current_version: number };
type VersionRow = { version_number: number; version_label: string | null; file_format: string; file_size_bytes: number; row_count: number | null; column_count: number | null; quality_score: number | null; quality_delta: number | null; created_at: string };
type JobRow = { id: string; type: string; status: string; error: string | null; queued_at: string | null; completed_at: string | null };
type TxRow = { id?: string; status?: string; operations?: unknown[]; created_at?: string; completed_at?: string };

export default function LineagePage() {
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [history, setHistory] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDatasets = useCallback(async () => {
    const res = await authFetch("/datasets/", { headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail?.message || "Could not load datasets");
    const ds: DatasetRow[] = Array.isArray(body.datasets) ? body.datasets : [];
    setDatasets(ds);
    if (ds.length > 0) setDatasetId((p) => p || ds[0].id);
  }, []);

  const loadAll = useCallback(async (id: string) => {
    if (!id) return;
    setError("");
    const [vRes, jRes, hRes] = await Promise.all([
      authFetch(`/datasets/${id}/versions`, { headers: authHeaders() }),
      authFetch(`/datasets/${id}/jobs`, { headers: authHeaders() }),
      authFetch(`/datasets/${id}/transform-history`, { headers: authHeaders() }),
    ]);
    const vBody = await vRes.json().catch(() => ({}));
    const jBody = await jRes.json().catch(() => ({}));
    const hBody = await hRes.json().catch(() => ({}));
    setVersions(Array.isArray(vBody.versions) ? vBody.versions : []);
    setJobs(Array.isArray(jBody.jobs) ? jBody.jobs : []);
    const hist = Array.isArray(hBody.history) ? hBody.history : Array.isArray(hBody.runs) ? hBody.runs : Array.isArray(hBody) ? hBody : [];
    setHistory(hist);
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true); setError("");
      try { if (!c) await loadDatasets(); } catch (e) { if (!c) setError(e instanceof Error ? e.message : "Failed"); }
      finally { if (!c) setLoading(false); }
    })();
    return () => { c = true; };
  }, [loadDatasets]);

  useEffect(() => {
    if (!datasetId) return;
    let c = false;
    (async () => { if (!c) await loadAll(datasetId); })();
    return () => { c = true; };
  }, [datasetId, loadAll]);

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA / LINEAGE & HISTORY</div>
          <h1>Data Lineage & History</h1>
          <p>Inspect versions, processing jobs, and transformation runs for a dataset. See what changed and when.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => loadAll(datasetId)} disabled={!datasetId}><RefreshCw size={14} /> Refresh</button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? <p className={styles.muted}>Loading…</p> : datasets.length === 0 ? (
        <section className={styles.sectionBlock}><h2>No datasets yet</h2><p>Upload data to see its lineage.</p></section>
      ) : (
        <>
          <section className={styles.sectionBlock}>
            <div className={styles.formGrid} style={{ maxWidth: 520 }}>
              <div>
                <label>Dataset</label>
                <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} (v{d.current_version})</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className={styles.sectionBlock}>
            <h2><GitBranch size={15} style={{ verticalAlign: -2 }} /> Versions ({versions.length})</h2>
            {versions.length === 0 ? <p className={styles.muted}>No versions found.</p> : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className={styles.table}>
                  <thead><tr><th>Version</th><th>Label</th><th>Rows</th><th>Cols</th><th>Quality</th><th>Δ</th><th>Format</th><th>Created</th></tr></thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.version_number}>
                        <td><b>v{v.version_number}</b></td>
                        <td>{v.version_label || "—"}</td>
                        <td>{v.row_count == null ? "—" : v.row_count.toLocaleString()}</td>
                        <td>{v.column_count == null ? "—" : v.column_count}</td>
                        <td>{v.quality_score == null ? "—" : v.quality_score.toFixed(1)}</td>
                        <td style={{ color: v.quality_delta != null && v.quality_delta >= 0 ? "#7de1b1" : "#ff9da8" }}>
                          {v.quality_delta == null ? "—" : `${v.quality_delta >= 0 ? "+" : ""}${v.quality_delta.toFixed(1)}`}
                        </td>
                        <td>{v.file_format}</td>
                        <td>{v.created_at ? new Date(v.created_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.sectionBlock}>
            <h2><History size={15} style={{ verticalAlign: -2 }} /> Transformation history ({history.length})</h2>
            {history.length === 0 ? <p className={styles.muted}>No transformation runs recorded.</p> : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {history.map((h, i) => (
                  <div key={(h as any).id || i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--panel2, var(--panel))" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <b style={{ fontSize: 12 }}>Run {(h as any).id ? String((h as any).id).slice(0, 8) : i + 1}</b>
                      <span className={(h.status || "").includes("fail") ? styles.statusPlanned : styles.statusLive}>{h.status || "recorded"}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      Operations: {Array.isArray(h.operations) ? h.operations.length : 0}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                      {h.created_at ? new Date(h.created_at).toLocaleString() : "—"} {h.completed_at ? `→ ${new Date(h.completed_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.sectionBlock}>
            <h2>Processing jobs ({jobs.length})</h2>
            {jobs.length === 0 ? <p className={styles.muted}>No jobs recorded.</p> : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className={styles.table}>
                  <thead><tr><th>Type</th><th>Status</th><th>Queued</th><th>Completed</th><th>Error</th></tr></thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td>{j.type}</td>
                        <td><span className={j.status === "failed" ? styles.statusPlanned : styles.statusLive}>{j.status}</span></td>
                        <td>{j.queued_at ? new Date(j.queued_at).toLocaleString() : "—"}</td>
                        <td>{j.completed_at ? new Date(j.completed_at).toLocaleString() : "—"}</td>
                        <td style={{ color: j.error ? "#ff9da8" : "var(--muted)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}