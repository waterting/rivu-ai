"use client";

/**
 * Generic workspace for every tool in the registry.
 *
 * One dynamic route serves all tools because the layout is identical: pick a
 * dataset, set the tool's configuration, run it, inspect measured results,
 * download the output. Only the configuration controls and the result extras
 * differ, and both are described by the backend registry rather than hardcoded
 * here - so a tool added to ``app/tools/registry.py`` appears here without a
 * frontend change.
 *
 * The three original tools (Format Studio, Media Matcher, Data Compare) keep
 * their own purpose-built pages; Next.js prefers a static segment over this
 * dynamic one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Play, RefreshCw, Wand2 } from "lucide-react";
import styles from "../../dashboard.module.css";
import { authFetch, ApiRequestError } from "../../../../lib/api";
import { ResultSummary, type ToolResult } from "../../../../lib/toolResults";

const authHeaders = () => ({
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type ConfigField = {
  key: string;
  label: string;
  kind: "text" | "number" | "select" | "multiselect" | "columns" | "boolean";
  help: string;
  default: unknown;
  options: string[];
  required: boolean;
};

type ToolSpec = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  input_formats: string[];
  output_formats: string[];
  fields: ConfigField[];
  needs_ai: boolean;
  destructive: boolean;
  featured: boolean;
};

type Dataset = { id: string; name: string; project_id: string; status: string; current_version: number };

type HistoryRow = {
  id: string;
  tool_slug: string;
  tool_name: string;
  status: string;
  rows_in: number;
  rows_out: number;
  duration_ms: number;
  created_at: string | null;
  summary?: string;
};

const MULTISELECT_SPLIT = /\s*,\s*/;

function defaultFor(field: ConfigField): unknown {
  if (field.kind === "multiselect") {
    return Array.isArray(field.default) ? field.default : [];
  }
  if (field.kind === "boolean") return Boolean(field.default);
  if (field.kind === "number") return field.default ?? 0;
  if (field.kind === "columns") return [];
  return field.default ?? "";
}

export default function ToolWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("");
  const [tool, setTool] = useState<ToolSpec | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  const loadDatasets = useCallback(async () => {
    const res = await authFetch("/projects/", { headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiRequestError("Could not load projects", res.status);
    const projects: Array<{ id: string }> = Array.isArray(body.projects) ? body.projects : [];
    const all: Dataset[] = [];
    for (const p of projects) {
      const pr = await authFetch(`/projects/${p.id}`, { headers: authHeaders() });
      if (!pr.ok) continue;
      const pj = await pr.json().catch(() => ({}));
      const list: Dataset[] = Array.isArray(pj.datasets) ? pj.datasets : [];
      all.push(...list);
    }
    return all;
  }, []);

  const loadHistory = useCallback(async (toolSlug: string) => {
    try {
      const res = await authFetch(`/tools/${toolSlug}/history?limit=8`, { headers: authHeaders() });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      setHistory(Array.isArray(body.executions) ? body.executions : []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`/tools/${slug}`, { headers: authHeaders() });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiRequestError(body.detail?.message || "Tool not found", res.status);
        if (cancelled) return;
        const spec = body as ToolSpec;
        setTool(spec);
        setConfig((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const initial: Record<string, unknown> = {};
          for (const field of spec.fields) initial[field.key] = defaultFor(field);
          return initial;
        });
        const ds = await loadDatasets();
        if (cancelled) return;
        setDatasets(ds);
        if (ds.length > 0) setDatasetId(ds[0].id);
        await loadHistory(slug);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load this tool");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, loadDatasets, loadHistory]);

  // Column pickers need the real columns of the selected dataset.
  useEffect(() => {
    if (!datasetId || !tool) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/datasets/${datasetId}/profile`, { headers: authHeaders() });
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        const cols = Array.isArray(body.columns) ? body.columns.map((c: { name: string }) => c.name) : [];
        if (!cancelled) setColumns(cols);
      } catch {
        if (!cancelled) setColumns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, tool]);

  function setField(key: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function run() {
    if (!tool || !datasetId) return;
    setError("");
    setResult(null);
    setRunning(true);
    try {
      const res = await authFetch(`/tools/${tool.slug}/run`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: datasetId, config }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiRequestError(body.detail?.message || body.detail || "The tool failed", res.status);
      }
      setResult(body as ToolResult);
      await loadHistory(tool.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The tool failed");
    } finally {
      setRunning(false);
    }
  }

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === datasetId) || null,
    [datasets, datasetId]
  );

  if (loading) {
    return (
      <div>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RIVU / TOOLS</div>
            <h1>Loading tool…</h1>
          </div>
        </header>
        <p className={styles.muted}>Fetching the tool definition and your datasets.</p>
      </div>
    );
  }

  if (!tool) {
    return (
      <div>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RIVU / TOOLS</div>
            <h1>Tool not found</h1>
            <p>{error || "This tool is not in the registry."}</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>
            RIVU / TOOLS / {tool.category.toUpperCase()}
          </div>
          <h1>{tool.name}</h1>
          <p>{tool.description}</p>
        </div>
        <div className={styles.headerActions}>
          {tool.needs_ai && <span className={styles.statusPartial}>Needs AI key</span>}
          <button className={styles.iconBtn} onClick={() => setConfig((prev) => {
            const reset: Record<string, unknown> = {};
            for (const field of tool.fields) reset[field.key] = defaultFor(field);
            return reset;
          })}>
            <RefreshCw size={14} /> Reset
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <section className={styles.sectionBlock}>
        <h2>1. Choose your data</h2>
        <p>Tools run against one version of one dataset. Nothing is written back to it.</p>
        {datasets.length === 0 ? (
          <p className={styles.muted} style={{ marginTop: 12 }}>
            No datasets yet. Upload a file from Overview to get started.
          </p>
        ) : (
          <div className={styles.formGrid} style={{ gridTemplateColumns: "1fr", maxWidth: 520 }}>
            <div>
              <label>Dataset</label>
              <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (v{d.current_version})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {selectedDataset && (
          <p className={styles.muted} style={{ marginTop: 10 }}>
            Inputs: {tool.input_formats.join(", ")} · Outputs: {tool.output_formats.join(", ")}
          </p>
        )}
      </section>

      <section className={styles.sectionBlock}>
        <h2>2. Configure</h2>
        <p>Set the options for this run. Only the rules you choose are applied.</p>

        {tool.fields.length === 0 ? (
          <p className={styles.muted} style={{ marginTop: 12 }}>
            This tool takes no configuration.
          </p>
        ) : (
          <div className={styles.formGrid} style={{ marginTop: 14, maxWidth: 720 }}>
            {tool.fields.map((field) => (
              <div key={field.key}>
                <label>
                  {field.label}
                  {field.required && <span style={{ color: "#ff9da8" }}> *</span>}
                </label>
                <FieldControl
                  field={field}
                  columns={columns}
                  value={config[field.key]}
                  onChange={(value) => setField(field.key, value)}
                />
                {field.help && (
                  <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>{field.help}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button
            className={styles.primary}
            onClick={run}
            disabled={running || !datasetId || datasets.length === 0}
          >
            <Play size={14} /> {running ? "Running…" : `Run ${tool.name}`}
          </button>
        </div>
      </section>

      {result && <ResultSummary result={result} />}

      {history.length > 0 && (
        <section className={styles.sectionBlock}>
          <h2>Recent runs</h2>
          <p>Your last {history.length} execution(s) of this tool.</p>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Rows in</th>
                <th>Rows out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
                  <td>
                    <span className={row.status === "completed" ? styles.statusLive : styles.statusPlanned}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.rows_in.toLocaleString()}</td>
                  <td>{row.rows_out.toLocaleString()}</td>
                  <td>{row.duration_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function FieldControl({
  field,
  columns,
  value,
  onChange,
}: {
  field: ConfigField;
  columns: string[];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span style={{ fontSize: 12, color: "var(--text)" }}>{value ? "Enabled" : "Disabled"}</span>
      </label>
    );
  }

  if (field.kind === "columns") {
    if (columns.length === 0) {
      return (
        <p className={styles.muted}>
          Pick a dataset first — its columns will appear here.
        </p>
      );
    }
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto", border: "1px solid #29313b", borderRadius: 7, padding: 8 }}>
        {columns.map((col) => (
          <label key={col} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={chosen.includes(col)}
              onChange={(e) =>
                onChange(e.target.checked ? [...chosen, col] : chosen.filter((c) => c !== col))
              }
              style={{ width: "auto" }}
            />
            <span style={{ fontSize: 11 }}>{col}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === "multiselect") {
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ display: "grid", gap: 4, maxHeight: 260, overflowY: "auto", border: "1px solid #29313b", borderRadius: 7, padding: 8 }}>
        {field.options.map((opt) => (
          <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={chosen.includes(opt)}
              onChange={(e) => onChange(e.target.checked ? [...chosen, opt] : chosen.filter((c) => c !== opt))}
              style={{ width: "auto" }}
            />
            <span style={{ fontSize: 11 }}>{opt.replace(/_/g, " ")}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "number") {
    return (
      <input
        type="number"
        min={0}
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }

  return (
    <input
      type="text"
      value={String(value ?? "")}
      placeholder={field.help ? "e.g. " + field.help.slice(0, 40) : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}