"use client";

/**
 * Tools Centre launcher.
 *
 * Every card here is generated from the backend registry and links to a real
 * workspace. Previously most cards pointed at the refinery, which meant the
 * brief's "no dead buttons, no non-functional tool cards" rule was broken; the
 * registry now decides what exists and each card links to /tools/{slug}.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import styles from "../dashboard.module.css";
import { authFetch, ApiRequestError } from "../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type Tool = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  input_formats: string[];
  output_formats: string[];
  needs_ai: boolean;
  featured: boolean;
};

type HistoryRow = {
  id: string;
  tool_slug: string;
  tool_name: string;
  status: string;
  created_at: string | null;
};

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/tools/", { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiRequestError("Could not load the tools catalogue", res.status);
      setTools(Array.isArray(body.tools) ? body.tools : []);
      setCategories(Array.isArray(body.categories) ? body.categories : []);

      const hist = await authFetch("/tools/history?limit=6", { headers: authHeaders() });
      if (hist.ok) {
        const hb = await hist.json().catch(() => ({}));
        setHistory(Array.isArray(hb.executions) ? hb.executions : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tools");
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

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tools.filter((tool) => {
      if (category && tool.category !== category) return false;
      if (!needle) return true;
      return (
        tool.name.toLowerCase().includes(needle) ||
        tool.tagline.toLowerCase().includes(needle) ||
        tool.category.toLowerCase().includes(needle)
      );
    });
  }, [tools, category, search]);

  const featured = filtered.filter((t) => t.featured);
  const rest = filtered.filter((t) => !t.featured);

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / TOOLS</div>
          <h1>Data tools</h1>
          <p>
            Every tool runs on your own data, reports measured results, and produces a real
            download. Nothing here is a mock-up.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.sectionBlock}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label>Search tools</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={search}
                placeholder=" profiler, duplicate, sku…"
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={14} style={{ color: "var(--muted)" }} />
            </div>
          </div>
          <div style={{ flex: "0 1 240px" }}>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.muted} style={{ marginTop: 12 }}>
          {filtered.length} of {tools.length} tools
        </p>
      </section>

      {loading && <p className={styles.muted}>Loading tools…</p>}

      {!loading && filtered.length === 0 && (
        <section className={styles.sectionBlock}>
          <h2>No tools match</h2>
          <p>Try a different search or clear the category filter.</p>
          <div style={{ marginTop: 12 }}>
            <button
              className={styles.iconBtn}
              onClick={() => {
                setSearch("");
                setCategory("");
              }}
            >
              Clear filters
            </button>
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>Start here</h2>
          <p>The tools most people reach for first.</p>
          <div className={styles.toolGrid}>
            {featured.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>All tools ({rest.length})</h2>
          <div className={styles.toolGrid}>
            {rest.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>Recent activity</h2>
          <p>Your most recent tool runs.</p>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/dashboard/tools/${row.tool_slug}`}>{row.tool_name}</Link>
                  </td>
                  <td>
                    <span className={row.status === "completed" ? styles.statusLive : styles.statusPlanned}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link href={`/dashboard/tools/${tool.slug}`} className={styles.toolCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className={styles.toolBadge}>{tool.category}</span>
        {tool.needs_ai && <span className={styles.statusPartial}>AI</span>}
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.tagline}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        {tool.input_formats.slice(0, 3).map((f) => (
          <span key={f} style={{ fontSize: 9, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 5px" }}>
            {f}
          </span>
        ))}
        <span style={{ fontSize: 9, color: "var(--muted)", alignSelf: "center" }}>→</span>
        {tool.output_formats.slice(0, 2).map((f) => (
          <span key={f} style={{ fontSize: 9, color: "#a59bff", border: "1px solid #2a2440", borderRadius: 4, padding: "2px 5px" }}>
            {f}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 10, color: "#a59bff" }}>
        Open workspace <ArrowRight size={11} />
      </div>
    </Link>
  );
}