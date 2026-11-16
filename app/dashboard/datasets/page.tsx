"use client";

/**
 * Dataset manager: list, search, filter, rename, duplicate, archive, restore.
 *
 * Every action here calls a real endpoint; the row counts and quality score are
 * read from the dataset's current version rather than recomputed in the
 * browser, so what the table shows is what the backend stored.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Copy,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type DatasetRow = {
  id: string;
  name: string;
  description: string | null;
  original_filename: string;
  file_format: string;
  status: string;
  current_version: number;
  row_count: number | null;
  column_count: number | null;
  quality_score: number | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  uploaded: "Uploaded",
  processing: "Processing",
  profiled: "Profiled",
  analyzed: "Analysed",
  transformed: "Transformed",
  failed: "Failed",
  archived: "Archived",
};

function statusClass(status: string) {
  if (status === "failed") return styles.statusPlanned;
  if (status === "archived") return styles.statusPlanned;
  return styles.statusLive;
}

export default function DatasetsPage() {
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<DatasetRow | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/datasets/", { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || "Could not load datasets");
      setRows(Array.isArray(body.datasets) ? body.datasets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load datasets");
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

  async function act(row: DatasetRow, action: "duplicate" | "archive" | "restore") {
    setBusy(row.id);
    setError("");
    try {
      const res = await authFetch(`/datasets/${row.id}/${action}`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || `Could not ${action} dataset`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} dataset`);
    } finally {
      setBusy(null);
    }
  }

  async function saveRename() {
    if (!renaming) return;
    setBusy(renaming.id);
    setError("");
    try {
      const res = await authFetch(`/datasets/${renaming.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || "Could not rename dataset");
      setRenaming(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename dataset");
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        (row.original_filename || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, search, status]);

  const active = filtered.filter((r) => r.status !== "archived");
  const archived = filtered.filter((r) => r.status === "archived");

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA / DATASETS</div>
          <h1>Datasets</h1>
          <p>
            Every dataset in your workspace, with the row and column counts of its current
            version. Rename, duplicate, archive and restore from here.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {renaming && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <button
              className={styles.close}
              onClick={() => setRenaming(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <h2>Rename dataset</h2>
            <p>Current name: {renaming.name}</p>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="New name"
              autoFocus
            />
            <button className={styles.primaryWide} onClick={saveRename} disabled={busy === renaming.id}>
              <Pencil size={14} /> Save name
            </button>
          </div>
        </div>
      )}

      <section className={styles.sectionBlock}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 260px" }}>
            <label>Search</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={search}
                placeholder="dataset name or filename"
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={14} style={{ color: "var(--muted)" }} />
            </div>
          </div>
          <div style={{ flex: "0 1 200px" }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.muted} style={{ marginTop: 12 }}>
          {filtered.length} of {rows.length} datasets · {active.length} active · {archived.length} archived
        </p>
      </section>

      {loading && <p className={styles.muted}>Loading datasets…</p>}

      {!loading && rows.length === 0 && (
        <section className={styles.sectionBlock}>
          <h2>No datasets yet</h2>
          <p>Upload a file to create your first dataset.</p>
          <div style={{ marginTop: 12 }}>
            <Link className={styles.primary} href="/dashboard/data-sources">
              <FileSpreadsheet size={14} /> Upload data
            </Link>
          </div>
        </section>
      )}

      {!loading && filtered.length === 0 && rows.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>No datasets match</h2>
          <p>Try a different search or clear the status filter.</p>
        </section>
      )}

      {active.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>Active ({active.length})</h2>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Columns</th>
                  <th>Quality</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/dashboard/dataset/${row.id}`}>{row.name}</Link>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                        {row.original_filename} · v{row.current_version}
                      </div>
                    </td>
                    <td>{row.file_format}</td>
                    <td>
                      <span className={statusClass(row.status)}>
                        {STATUS_LABEL[row.status] || row.status}
                      </span>
                    </td>
                    <td>{row.row_count === null ? "—" : row.row_count.toLocaleString()}</td>
                    <td>{row.column_count === null ? "—" : row.column_count}</td>
                    <td>
                      {row.quality_score === null ? "—" : row.quality_score.toFixed(1)}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          className={styles.iconBtn}
                          style={{ padding: "5px 8px", fontSize: 10 }}
                          onClick={() => {
                            setRenaming(row);
                            setRenameValue(row.name);
                          }}
                          disabled={busy === row.id}
                          title="Rename"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className={styles.iconBtn}
                          style={{ padding: "5px 8px", fontSize: 10 }}
                          onClick={() => act(row, "duplicate")}
                          disabled={busy === row.id}
                          title="Duplicate"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          className={styles.iconBtn}
                          style={{ padding: "5px 8px", fontSize: 10 }}
                          onClick={() => act(row, "archive")}
                          disabled={busy === row.id}
                          title="Archive"
                        >
                          <Archive size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>Archived ({archived.length})</h2>
          <p>Archived datasets keep their data and versions. Restore one to work on it again.</p>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Format</th>
                  <th>Rows</th>
                  <th>Archived</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.file_format}</td>
                    <td>{row.row_count === null ? "—" : row.row_count.toLocaleString()}</td>
                    <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        className={styles.iconBtn}
                        style={{ padding: "5px 8px", fontSize: 10 }}
                        onClick={() => act(row, "restore")}
                        disabled={busy === row.id}
                      >
                        <RotateCcw size={12} /> Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}