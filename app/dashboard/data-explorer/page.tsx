"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Columns3, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type DatasetRow = { id: string; name: string; status: string; current_version: number; file_format: string };
type RecordRow = Record<string, unknown>;
type ColumnMeta = { name: string; dtype: string };

export default function DataExplorerPage() {
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [showCols, setShowCols] = useState(false);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState("");

  const loadDatasets = useCallback(async () => {
    const res = await authFetch("/datasets/", { headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail?.message || "Could not load datasets");
    const ds: DatasetRow[] = Array.isArray(body.datasets) ? body.datasets : [];
    setDatasets(ds);
    if (ds.length > 0) setDatasetId((prev) => prev || ds[0].id);
    return ds;
  }, []);

  const loadRecords = useCallback(async (id: string, off = 0, lim = limit) => {
    if (!id) return;
    setLoadingRows(true);
    setError("");
    try {
      const res = await authFetch(`/datasets/${id}/records?offset=${off}&limit=${lim}`, { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail?.message || body.detail || "Could not load records");
      const cols: ColumnMeta[] = Array.isArray(body.columns) ? body.columns : [];
      setColumns(cols);
      setVisible((prev) => {
        const next = { ...prev };
        for (const c of cols) if (next[c.name] === undefined) next[c.name] = true;
        return next;
      });
      setRows(Array.isArray(body.rows) ? body.rows : []);
      setTotalRows(typeof body.row_count === "number" ? body.row_count : 0);
      setOffset(typeof body.offset === "number" ? body.offset : off);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setLoadingRows(false);
    }
  }, [limit]);

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
    return () => { cancelled = true; };
  }, [loadDatasets]);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    (async () => { if (!cancelled) await loadRecords(datasetId, 0, limit); })();
    return () => { cancelled = true; };
  }, [datasetId, limit, loadRecords]);

  const visibleColumns = useMemo(() => columns.filter((c) => visible[c.name] !== false), [columns, visible]);

  const displayRows = useMemo(() => {
    let out = [...rows];
    const needle = search.trim().toLowerCase();
    if (needle) {
      out = out.filter((r) => visibleColumns.some((c) => String(r[c.name] ?? "").toLowerCase().includes(needle)));
    }
    if (sortKey) {
      out.sort((a, b) => {
        const av = a[sortKey]; const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const an = Number(av), bn = Number(bv);
        const cmp = !Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, search, sortKey, sortDir, visibleColumns]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const canPrev = offset > 0;
  const canNext = offset + limit < totalRows;

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA / EXPLORER</div>
          <h1>Data Explorer</h1>
          <p>Browse records in the current dataset version. Search, sort, choose columns, and inspect rows.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => loadRecords(datasetId, offset, limit)} disabled={!datasetId}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <p className={styles.muted}>Loading datasets…</p>
      ) : datasets.length === 0 ? (
        <section className={styles.sectionBlock}>
          <h2>No datasets yet</h2>
          <p>Upload a file to explore its records.</p>
          <div style={{ marginTop: 12 }}><Link className={styles.primary} href="/dashboard/data-sources">Upload data</Link></div>
        </section>
      ) : (
        <>
          <section className={styles.sectionBlock}>
            <div className={styles.formGrid} style={{ gridTemplateColumns: "1fr 1fr auto auto", alignItems: "end", maxWidth: 900 }}>
              <div>
                <label>Dataset</label>
                <select value={datasetId} onChange={(e) => { setDatasetId(e.target.value); setOffset(0); setSelected(null); }}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} (v{d.current_version})</option>)}
                </select>
              </div>
              <div>
                <label>Search in page</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="text" value={search} placeholder="filter visible rows" onChange={(e) => setSearch(e.target.value)} />
                  <Search size={14} style={{ color: "var(--muted)" }} />
                </div>
              </div>
              <div>
                <label>Rows per page</label>
                <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }}>
                  {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <button className={styles.iconBtn} onClick={() => setShowCols((s) => !s)}>
                  <Columns3 size={14} /> Columns
                </button>
              </div>
            </div>
            <p className={styles.muted} style={{ marginTop: 10 }}>
              {totalRows.toLocaleString()} rows · {columns.length} columns · showing {rows.length} loaded
            </p>
            {showCols && columns.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {columns.map((c) => (
                  <label key={c.name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px" }}>
                    <input type="checkbox" checked={visible[c.name] !== false} onChange={(e) => setVisible((v) => ({ ...v, [c.name]: e.target.checked }))} />
                    {c.name} <span style={{ color: "var(--muted)" }}>({c.dtype})</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className={styles.sectionBlock}>
            <h2>Records</h2>
            {loadingRows ? (
              <p className={styles.muted}>Loading rows…</p>
            ) : rows.length === 0 ? (
              <p className={styles.muted}>No rows available. The dataset may still be processing.</p>
            ) : (
              <>
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {visibleColumns.map((c) => (
                          <th key={c.name} style={{ cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => toggleSort(c.name)}>
                            {c.name}{" "}
                            {sortKey === c.name ? (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, i) => (
                        <tr key={i} style={{ cursor: "pointer" }} onClick={() => setSelected(row)}>
                          {visibleColumns.map((c) => (
                            <td key={c.name} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row[c.name] == null || row[c.name] === "" ? "—" : String(row[c.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
                  <button className={styles.iconBtn} disabled={!canPrev} onClick={() => loadRecords(datasetId, Math.max(0, offset - limit), limit)}>Previous</button>
                  <span className={styles.muted}>Page {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(totalRows / limit))}</span>
                  <button className={styles.iconBtn} disabled={!canNext} onClick={() => loadRecords(datasetId, offset + limit, limit)}>Next</button>
                </div>
              </>
            )}
          </section>

          {selected && (
            <div className={styles.modal}>
              <div className={styles.modalCard} style={{ maxWidth: 720 }}>
                <button className={styles.close} onClick={() => setSelected(null)} aria-label="Close">✕</button>
                <h2>Row details</h2>
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className={styles.table}>
                    <thead><tr><th>Field</th><th>Value</th></tr></thead>
                    <tbody>
                      {columns.map((c) => (
                        <tr key={c.name}>
                          <td><b>{c.name}</b> <span style={{ color: "var(--muted)", fontSize: 10 }}>({c.dtype})</span></td>
                          <td style={{ whiteSpace: "pre-wrap" }}>{selected[c.name] == null || selected[c.name] === "" ? "—" : String(selected[c.name])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}