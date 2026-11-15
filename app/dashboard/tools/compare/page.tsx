"use client";

import { useCallback, useEffect, useState } from "react";
import { GitCompare, RefreshCw } from "lucide-react";
import styles from "../../dashboard.module.css";
import { authFetch } from "../../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type Dataset = { id: string; name: string; project_id: string; status: string; current_version: number };
type Column = {
  name: string;
  type: string;
  semantic_type: string | null;
  null_count: number;
  null_pct: number;
  unique_count: number;
  uniqueness_pct: number;
};
type Profile = {
  row_count: number;
  column_count: number;
  duplicate_row_count: number;
  duplicate_row_pct: number;
  total_null_count: number;
  total_null_pct: number;
};

export default function CompareToolPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [aProfile, setAProfile] = useState<{ profile: Profile; columns: Column[] } | null>(null);
  const [bProfile, setBProfile] = useState<{ profile: Profile; columns: Column[] } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

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
      if (all.length >= 2) {
        setAId(all[0].id);
        setBId(all[1].id);
      } else if (all.length === 1) {
        setAId(all[0].id);
      }
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

  const fetchProfile = async (id: string) => {
    const r = await authFetch(`/datasets/${id}/profile`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail?.message || j.detail || "Profile unavailable (dataset may still be processing)");
    return j as { profile: Profile; columns: Column[] };
  };

  async function compare() {
    setErr("");
    setComparing(true);
    setAProfile(null);
    setBProfile(null);
    try {
      const [pa, pb] = await Promise.all([fetchProfile(aId), fetchProfile(bId)]);
      setAProfile(pa);
      setBProfile(pb);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setComparing(false);
    }
  }

  const nameOf = (id: string) => datasets.find((d) => d.id === id)?.name || "—";

  const colDiff = (() => {
    if (!aProfile || !bProfile) return null;
    const aMap = new Map(aProfile.columns.map((c) => [c.name.toLowerCase(), c]));
    const bMap = new Map(bProfile.columns.map((c) => [c.name.toLowerCase(), c]));
    const added = Array.from(bMap.keys()).filter((k) => !aMap.has(k));
    const removed = Array.from(aMap.keys()).filter((k) => !bMap.has(k));
    const retyped = Array.from(aMap.entries())
      .filter(([k, c]) => bMap.has(k) && bMap.get(k)!.type !== c.type)
      .map(([k, c]) => ({ column: c.name, from: c.type, to: bMap.get(k)!.type }));
    const nullShift = Array.from(aMap.entries())
      .filter(([k, c]) => bMap.has(k))
      .map(([k, c]) => ({ column: c.name, a: c.null_pct, b: bMap.get(k)!.null_pct }))
      .filter((x) => Math.abs(x.b - x.a) >= 0.01)
      .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
      .slice(0, 10);
    return { added, removed, retyped, nullShift, common: aMap.size - removed.length };
  })();

  const delta = (x: number | undefined, y: number | undefined) =>
    x == null || y == null ? "—" : `${y - x >= 0 ? "+" : ""}${(y - x).toFixed(1)}`;

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / TOOLS / DATA COMPARE</div>
          <h1>Data Compare</h1>
          <p>
            Compare two profiled datasets (or two versions) using measured profile facts: rows, columns,
            quality, nulls, duplicates, column types and null-rate shifts. No estimates.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={load}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </header>

      {err && <div className={styles.error}>{err}</div>}

      <section className={styles.sectionBlock}>
        <h2>Select datasets</h2>
        {loading ? (
          <p className={styles.muted}>Loading datasets...</p>
        ) : datasets.length < 2 ? (
          <p className={styles.muted}>
            At least two profiled datasets are required to compare. Upload data in Overview.
          </p>
        ) : (
          <>
            <div className={styles.formGrid} style={{ gridTemplateColumns: "1fr 1fr auto" }}>
              <div>
                <label>Dataset A</label>
                <select value={aId} onChange={(e) => setAId(e.target.value)}>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Dataset B</label>
                <select value={bId} onChange={(e) => setBId(e.target.value)}>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "end" }}>
                <button className={styles.primary} onClick={compare} disabled={comparing}>
                  <GitCompare size={14} /> {comparing ? "Comparing..." : "Compare"}
                </button>
              </div>
            </div>
            <p className={styles.muted} style={{ marginTop: 10 }}>
              Profiles are read from each dataset&apos;s current version.
            </p>
          </>
        )}
      </section>

      {aProfile && bProfile && (
        <>
          <section className={styles.sectionBlock}>
            <h2>Measured deltas ({nameOf(aId)} → {nameOf(bId)})</h2>
            <div className={styles.grid4} style={{ marginTop: 14 }}>
              <div className={styles.card}>
                <h3>Rows</h3>
                <p>
                  {aProfile.profile.row_count} → {bProfile.profile.row_count} ({delta(aProfile.profile.row_count, bProfile.profile.row_count)})
                </p>
              </div>
              <div className={styles.card}>
                <h3>Columns</h3>
                <p>
                  {aProfile.profile.column_count} → {bProfile.profile.column_count} ({delta(aProfile.profile.column_count, bProfile.profile.column_count)})
                </p>
              </div>
              <div className={styles.card}>
                <h3>Null cells</h3>
                <p>
                  {aProfile.profile.total_null_pct.toFixed(2)}% → {bProfile.profile.total_null_pct.toFixed(2)}%
                </p>
              </div>
              <div className={styles.card}>
                <h3>Duplicate rows</h3>
                <p>
                  {aProfile.profile.duplicate_row_count} → {bProfile.profile.duplicate_row_count} (
                  {delta(aProfile.profile.duplicate_row_count, bProfile.profile.duplicate_row_count)})
                </p>
              </div>
            </div>
          </section>

          {colDiff && (
            <section className={styles.sectionBlock}>
              <h2>Column-level differences</h2>
              <div className={styles.grid2} style={{ marginTop: 14 }}>
                <div className={styles.card}>
                  <h3>Added in B ({colDiff.added.length})</h3>
                  {colDiff.added.length === 0 ? (
                    <p className={styles.muted}>None</p>
                  ) : (
                    <p>{colDiff.added.join(", ")}</p>
                  )}
                  <h3 style={{ marginTop: 14 }}>Removed from A ({colDiff.removed.length})</h3>
                  {colDiff.removed.length === 0 ? (
                    <p className={styles.muted}>None</p>
                  ) : (
                    <p>{colDiff.removed.join(", ")}</p>
                  )}
                  <h3 style={{ marginTop: 14 }}>Unchanged ({colDiff.common})</h3>
                  <p className={styles.muted}>Columns present in both with identical inferred type.</p>
                </div>
                <div className={styles.card}>
                  <h3>Type changes ({colDiff.retyped.length})</h3>
                  {colDiff.retyped.length === 0 ? (
                    <p className={styles.muted}>No inferred type changes.</p>
                  ) : (
                    colDiff.retyped.map((r) => (
                      <div key={r.column} className={styles.bar}>
                        <div>
                          <span>{r.column}</span>
                          <b>
                            {r.from} → {r.to}
                          </b>
                        </div>
                      </div>
                    ))
                  )}
                  <h3 style={{ marginTop: 14 }}>Largest null-rate shifts</h3>
                  {colDiff.nullShift.length === 0 ? (
                    <p className={styles.muted}>No column moved by more than 0.01 percentage points.</p>
                  ) : (
                    colDiff.nullShift.map((n) => (
                      <div key={n.column} className={styles.bar}>
                        <div>
                          <span>{n.column}</span>
                          <b>
                            {n.a.toFixed(2)}% → {n.b.toFixed(2)}%
                          </b>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}