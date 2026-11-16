"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type DatasetRow = { id: string; name: string; current_version: number };
type ColumnRole = { column: string; role: string | null; reason: string | null; overridden?: boolean };

export default function SchemaLibraryPage() {
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDatasets = useCallback(async () => {
    const res = await authFetch("/datasets/", { headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail?.message || "Could not load datasets");
    const ds: DatasetRow[] = Array.isArray(body.datasets) ? body.datasets : [];
    setDatasets(ds);
    if (ds.length > 0) setDatasetId((p) => p || ds[0].id);
  }, []);

  const loadRoles = useCallback(async (id: string) => {
    if (!id) return;
    setError(""); setMessage("");
    const res = await authFetch(`/datasets/${id}/column-roles`, { headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 202) { setRoles([]); setMessage("Dataset is still being profiled."); return; }
      throw new Error(body.detail?.message || body.detail || "Could not load schema roles");
    }
    const cols: ColumnRole[] = Array.isArray(body.columns) ? body.columns : [];
    setRoles(cols);
    const ov: Record<string, string> = {};
    for (const c of cols) if (c.overridden && c.role) ov[c.column] = c.role;
    setOverrides(ov);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try { if (!cancelled) await loadDatasets(); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [loadDatasets]);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    (async () => { try { if (!cancelled) await loadRoles(datasetId); } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed"); } })();
    return () => { cancelled = true; };
  }, [datasetId, loadRoles]);

  async function save() {
    if (!datasetId) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await authFetch(`/datasets/${datasetId}/column-roles`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || body.detail || "Could not save roles");
      setMessage("Column roles saved.");
      await loadRoles(datasetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const roleOptions = ["identifier", "product_name", "category", "price", "quantity", "date", "email", "phone", "address", "description", "attribute", "unknown"];

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA / SCHEMA LIBRARY</div>
          <h1>Schema Library</h1>
          <p>Review detected column roles for your datasets and override them where needed. Overrides are saved and used by downstream tools.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => loadRoles(datasetId)} disabled={!datasetId}><RefreshCw size={14} /> Refresh</button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.message}>{message}</div>}

      {loading ? <p className={styles.muted}>Loading…</p> : datasets.length === 0 ? (
        <section className={styles.sectionBlock}><h2>No datasets yet</h2><p>Upload data to see its schema.</p></section>
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
            <h2>Columns & roles</h2>
            {roles.length === 0 ? (
              <p className={styles.muted}>No column roles available yet.</p>
            ) : (
              <>
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className={styles.table}>
                    <thead><tr><th>Column</th><th>Detected role</th><th>Reason</th><th>Override</th></tr></thead>
                    <tbody>
                      {roles.map((c) => (
                        <tr key={c.column}>
                          <td><b>{c.column}</b></td>
                          <td>{c.role || "—"} {c.overridden ? <span className={styles.statusPartial}>overridden</span> : null}</td>
                          <td style={{ color: "var(--muted)", fontSize: 11 }}>{c.reason || "—"}</td>
                          <td>
                            <select value={overrides[c.column] || ""} onChange={(e) => {
                              const v = e.target.value;
                              setOverrides((o) => { const n = { ...o }; if (!v) delete n[c.column]; else n[c.column] = v; return n; });
                            }}>
                              <option value="">(use detected)</option>
                              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className={styles.primary} onClick={save} disabled={saving}><Save size={14} /> {saving ? "Saving…" : "Save overrides"}</button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}