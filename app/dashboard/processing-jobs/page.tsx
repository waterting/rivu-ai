"use client";

/**
 * Processing jobs for one dataset: queued, running, completed, failed.
 *
 * The list comes from the Job rows the worker writes, so a job that never
 * started shows as queued rather than being hidden. Failures surface the error
 * message the worker recorded.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type JobRow = {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  queued_at: string | null;
  completed_at: string | null;
};

type DatasetRow = { id: string; name: string; status: string; current_version: number };

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  queued: { color: "#8b96a5", label: "Queued" },
  running: { color: "#38bdf8", label: "Running" },
  processing: { color: "#38bdf8", label: "Running" },
  completed: { color: "#7de1b1", label: "Completed" },
  failed: { color: "#ff9da8", label: "Failed" },
  cancelled: { color: "#8b96a5", label: "Cancelled" },
};

export default function ProcessingJobsPage() {
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);

  const loadDatasets = useCallback(async () => {
    const res = await authFetch("/datasets/", { headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail?.message || "Could not load datasets");
    const rows: DatasetRow[] = Array.isArray(body.datasets) ? body.datasets : [];
    setDatasets(rows);
    if (rows.length > 0) setDatasetId(rows[0].id);
  }, []);

  const loadJobs = useCallback(async (id: string) => {
    if (!id) return;
    setJobsLoading(true);
    try {
      const res = await authFetch(`/datasets/${id}/jobs`, { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || "Could not load jobs");
      setJobs(Array.isArray(body.jobs) ? body.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (!cancelled) await loadDatasets();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load datasets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDatasets]);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadJobs(datasetId);
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, loadJobs]);

  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA / PROCESSING JOBS</div>
          <h1>Processing jobs</h1>
          <p>
            Every job the pipeline has run for a dataset, with its real status, progress and
            error message. A job stuck in queued means nothing is consuming the queue.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => loadJobs(datasetId)}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className={styles.muted}>Loading datasets…</p>
      ) : datasets.length === 0 ? (
        <section className={styles.sectionBlock}>
          <h2>No datasets yet</h2>
          <p>Upload a file to create your first dataset, then its jobs will appear here.</p>
          <div style={{ marginTop: 12 }}>
            <Link className={styles.primary} href="/dashboard/data-sources">
              Upload data
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.sectionBlock}>
            <h2>Dataset</h2>
            <div className={styles.formGrid} style={{ maxWidth: 520 }}>
              <div>
                <label>Show jobs for</label>
                <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (v{d.current_version})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={styles.muted} style={{ marginTop: 10 }}>
              Current dataset status: {datasets.find((d) => d.id === datasetId)?.status || "—"}
            </p>
          </section>

          {jobsLoading ? (
            <p className={styles.muted}>Loading jobs…</p>
          ) : jobs.length === 0 ? (
            <section className={styles.sectionBlock}>
              <h2>No jobs recorded</h2>
              <p>
                This dataset has no processing jobs. If it was uploaded a while ago, the worker
                may never have picked it up.
              </p>
            </section>
          ) : (
            <>
              <section className={styles.sectionBlock}>
                <h2>Summary</h2>
                <div className={styles.grid4}>
                  {Object.entries(counts).map(([status, count]) => {
                    const meta = STATUS_STYLE[status] || { color: "#8b96a5", label: status };
                    return (
                      <div className={styles.card} key={status}>
                        <h3 style={{ color: meta.color }}>{meta.label}</h3>
                        <p style={{ fontSize: 22, color: "var(--text)", fontWeight: 600 }}>
                          {count.toLocaleString()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className={styles.sectionBlock}>
                <h2>Jobs ({jobs.length})</h2>
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {jobs.map((job) => {
                    const meta = STATUS_STYLE[job.status] || { color: "#8b96a5", label: job.status };
                    return (
                      <div
                        key={job.id}
                        style={{
                          border: "1px solid var(--line)",
                          borderRadius: 9,
                          padding: 14,
                          background: "var(--panel2, var(--panel))",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {job.status === "completed" && (
                              <CheckCircle2 size={14} style={{ color: meta.color }} />
                            )}
                            {job.status === "failed" && (
                              <XCircle size={14} style={{ color: meta.color }} />
                            )}
                            {job.status === "queued" && (
                              <Clock size={14} style={{ color: meta.color }} />
                            )}
                            <b style={{ fontSize: 12 }}>{job.type}</b>
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              padding: "3px 9px",
                              borderRadius: 10,
                              background: "#161c24",
                              color: meta.color,
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {job.message && (
                          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                            {job.message}
                          </p>
                        )}

                        {typeof job.progress === "number" && job.progress > 0 && (
                          <div className={styles.chartBar} style={{ marginTop: 10 }}>
                            <i style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} />
                          </div>
                        )}

                        {job.error && (
                          <p
                            style={{
                              fontSize: 11,
                              color: "#ff9da8",
                              marginTop: 8,
                              padding: "8px 10px",
                              background: "#28171c",
                              borderRadius: 6,
                            }}
                          >
                            {job.error}
                          </p>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: 16,
                            marginTop: 10,
                            fontSize: 9,
                            color: "var(--muted)",
                          }}
                        >
                          <span>
                            Queued {job.queued_at ? new Date(job.queued_at).toLocaleString() : "—"}
                          </span>
                          {job.completed_at && (
                            <span>Finished {new Date(job.completed_at).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}