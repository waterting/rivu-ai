"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Shield, Users } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type Summary = {
  organization: { id: string; name: string; slug: string; status: string };
  viewer_role: string;
  counts: {
    users: number;
    datasets: number;
    failed_datasets: number;
    jobs: number;
    failed_jobs: number;
    tool_runs: number;
  };
};

type AdminUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  status: string;
  role: string;
  last_login_at: string | null;
};

type AdminDataset = {
  id: string;
  name: string;
  status: string;
  file_format: string;
  current_version: number;
  updated_at: string | null;
};

type AdminJob = {
  id: string;
  dataset_id: string;
  type: string;
  status: string;
  error: string | null;
  queued_at: string | null;
};

export default function AdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [datasets, setDatasets] = useState<AdminDataset[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sRes, uRes, dRes, jRes] = await Promise.all([
        authFetch("/admin/summary", { headers: authHeaders() }),
        authFetch("/admin/users", { headers: authHeaders() }),
        authFetch("/admin/datasets?limit=30", { headers: authHeaders() }),
        authFetch("/admin/jobs?limit=30", { headers: authHeaders() }),
      ]);

      if (sRes.status === 403) {
        throw new Error("You do not have admin access to this workspace.");
      }

      const [sBody, uBody, dBody, jBody] = await Promise.all([
        sRes.json().catch(() => ({})),
        uRes.json().catch(() => ({})),
        dRes.json().catch(() => ({})),
        jRes.json().catch(() => ({})),
      ]);

      if (!sRes.ok) throw new Error(sBody.detail?.message || "Could not load admin summary");
      setSummary(sBody as Summary);
      setUsers(Array.isArray(uBody.users) ? uBody.users : []);
      setDatasets(Array.isArray(dBody.datasets) ? dBody.datasets : []);
      setJobs(Array.isArray(jBody.jobs) ? jBody.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin console");
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

  if (loading) {
    return (
      <div>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RIVU / ADMIN</div>
            <h1>Admin console</h1>
          </div>
        </header>
        <p className={styles.muted}>Loading workspace overview…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RIVU / ADMIN</div>
            <h1>Admin console</h1>
            <p>Organization and workspace management.</p>
          </div>
        </header>
        <div className={styles.error} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / ADMIN / {summary?.organization.slug.toUpperCase()}</div>
          <h1>{summary?.organization.name}</h1>
          <p>
            Workspace administration. You are signed in as <b>{summary?.viewer_role}</b>. Counts are
            read from the live tables.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      <section className={styles.sectionBlock}>
        <h2>At a glance</h2>
        <div className={styles.grid4} style={{ marginTop: 14 }}>
          <div className={styles.card}>
            <h3>Users</h3>
            <p style={{ fontSize: 22, color: "var(--text)", fontWeight: 600 }}>
              {summary?.counts.users ?? 0}
            </p>
          </div>
          <div className={styles.card}>
            <h3>Datasets</h3>
            <p style={{ fontSize: 22, color: "var(--text)", fontWeight: 600 }}>
              {summary?.counts.datasets ?? 0}
            </p>
          </div>
          <div className={styles.card}>
            <h3>Failed datasets</h3>
            <p style={{ fontSize: 22, color: (summary?.counts.failed_datasets ?? 0) > 0 ? "#ff9da8" : "var(--text)", fontWeight: 600 }}>
              {summary?.counts.failed_datasets ?? 0}
            </p>
          </div>
          <div className={styles.card}>
            <h3>Tool runs</h3>
            <p style={{ fontSize: 22, color: "var(--text)", fontWeight: 600 }}>
              {summary?.counts.tool_runs ?? 0}
            </p>
          </div>
        </div>
        <div className={styles.grid4} style={{ marginTop: 12 }}>
          <div className={styles.card}>
            <h3>Processing jobs</h3>
            <p style={{ fontSize: 22, color: "var(--text)", fontWeight: 600 }}>
              {summary?.counts.jobs ?? 0}
            </p>
          </div>
          <div className={styles.card}>
            <h3>Failed jobs</h3>
            <p style={{ fontSize: 22, color: (summary?.counts.failed_jobs ?? 0) > 0 ? "#ff9da8" : "var(--text)", fontWeight: 600 }}>
              {summary?.counts.failed_jobs ?? 0}
            </p>
          </div>
          <div className={styles.card}>
            <h3>Workspace status</h3>
            <p style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
              {summary?.organization.status}
            </p>
          </div>
          <div className={styles.card}>
            <h3>Scope</h3>
            <p style={{ fontSize: 11 }}>
              This console shows the current workspace. Cross-workspace platform controls are not
              available.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionBlock}>
        <h2><Users size={15} style={{ verticalAlign: -2 }} /> Members ({users.length})</h2>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.email}</td>
                  <td>{u.full_name || "—"}</td>
                  <td>
                    <span className={u.role === "owner" ? styles.statusLive : styles.statusPartial}>
                      {u.role}
                    </span>
                  </td>
                  <td>{u.status}</td>
                  <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.sectionBlock}>
        <h2>Recent datasets ({datasets.length})</h2>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Format</th>
                <th>Status</th>
                <th>Version</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.file_format}</td>
                  <td>
                    <span className={d.status === "failed" ? styles.statusPlanned : styles.statusLive}>
                      {d.status}
                    </span>
                  </td>
                  <td>v{d.current_version}</td>
                  <td>{d.updated_at ? new Date(d.updated_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.sectionBlock}>
        <h2><Shield size={15} style={{ verticalAlign: -2 }} /> Recent jobs ({jobs.length})</h2>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Queued</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.type}</td>
                  <td>
                    <span className={j.status === "failed" ? styles.statusPlanned : styles.statusLive}>
                      {j.status}
                    </span>
                  </td>
                  <td>{j.queued_at ? new Date(j.queued_at).toLocaleString() : "—"}</td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: j.error ? "#ff9da8" : "var(--muted)" }}>
                    {j.error || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}