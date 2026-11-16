"use client";

/**
 * Result rendering shared by every tool workspace.
 *
 * Tools return a uniform envelope (summary, metrics, issues, preview_rows) plus
 * whatever extra their domain needs. This module renders the common parts and
 * each tool-specific extra, so a new tool only has to describe its extras.
 */

import { AlertTriangle, CheckCircle2, Download, Info, XCircle } from "lucide-react";
import styles from "../app/dashboard/dashboard.module.css";

export type ToolResult = {
  tool?: string;
  tool_name?: string;
  summary?: string;
  metrics?: Record<string, unknown>;
  columns?: Array<Record<string, unknown>>;
  preview_rows?: Array<Record<string, unknown>>;
  issues?: Array<{ severity?: string; type?: string; message?: string; column?: string | null; row?: number | null }>;
  output_url?: string | null;
  output_filename?: string | null;
  duration_ms?: number;
  has_output?: boolean;
  // tool-specific
  mappings?: Array<{ target_field: string; source_column: string | null; confidence: number; matched: boolean }>;
  suggestions?: Array<Record<string, unknown>>;
  duplicate_groups?: Array<Record<string, unknown>>;
  duplicate_skus?: Array<Record<string, unknown>>;
  malformed_skus?: Array<Record<string, unknown>>;
  variants?: Record<string, number>;
  operations_log?: Array<Record<string, unknown>>;
  failed_operations?: Array<Record<string, unknown>>;
  errors?: Array<{ severity?: string; type?: string; message?: string; column?: string | null; row?: number | null }>;
  warnings?: Array<{ severity?: string; type?: string; message?: string; column?: string | null; row?: number | null }>;
  methodology?: Record<string, unknown>;
  schema?: Array<Record<string, unknown>>;
  rename_map?: Record<string, string>;
};

const SEVERITY_ICON = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const SEVERITY_COLOR: Record<string, string> = {
  error: "#ff9da8",
  warning: "#f0c674",
  info: "#8b96a5",
};

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ResultSummary({ result }: { result: ToolResult }) {
  if (!result) return null;
  const metrics = Object.entries(result.metrics || {}).filter(
    ([key]) => !["rules", "review_required"].includes(key)
  );

  return (
    <>
      <div className={styles.sectionBlock}>
        <h2>Result</h2>
        <p>{result.summary || "The tool finished."}</p>
        {metrics.length > 0 && (
          <div className={styles.grid4} style={{ marginTop: 16 }}>
            {metrics.slice(0, 8).map(([key, value]) => (
              <div className={styles.card} key={key}>
                <h3 style={{ textTransform: "capitalize", fontSize: 11, color: "var(--muted)" }}>
                  {key.replace(/_/g, " ")}
                </h3>
                <p style={{ fontSize: 18, color: "var(--text)", fontWeight: 600 }}>
                  {typeof value === "object" ? JSON.stringify(value) : fmt(value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {result.issues && result.issues.length > 0 && <IssuesBlock issues={result.issues} />}

      {(result.errors?.length || result.warnings?.length) ? (
        <div className={styles.grid2} style={{ marginTop: 18 }}>
          {result.errors && result.errors.length > 0 && (
            <div className={styles.sectionBlock} style={{ marginTop: 0 }}>
              <h2>Errors ({result.errors.length})</h2>
              <IssueList issues={result.errors} severity="error" />
            </div>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <div className={styles.sectionBlock} style={{ marginTop: 0 }}>
              <h2>Warnings ({result.warnings.length})</h2>
              <IssueList issues={result.warnings} severity="warning" />
            </div>
          )}
        </div>
      ) : null}

      {result.mappings && result.mappings.length > 0 && <MappingsBlock mappings={result.mappings} />}

      {result.duplicate_groups && result.duplicate_groups.length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Duplicate groups</h2>
          <p>Each group lists the rows that share the same key value.</p>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Column</th>
                <th>Value</th>
                <th>Rows</th>
                <th>Row numbers</th>
              </tr>
            </thead>
            <tbody>
              {result.duplicate_groups.slice(0, 50).map((g, i) => (
                <tr key={i}>
                  <td>{fmt(g.column)}</td>
                  <td>{fmt(g.value)}</td>
                  <td>{fmt(g.count)}</td>
                  <td>{Array.isArray(g.row_indices) ? (g.row_indices as number[]).join(", ") || "—" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.duplicate_skus && result.duplicate_skus.length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Duplicate SKUs</h2>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Occurrences</th>
              </tr>
            </thead>
            <tbody>
              {result.duplicate_skus.slice(0, 50).map((row, i) => (
                <tr key={i}>
                  <td>{fmt(Object.values(row)[0])}</td>
                  <td>{fmt(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.malformed_skus && result.malformed_skus.length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Malformed SKUs ({result.malformed_skus.length})</h2>
          <p>SKUs containing characters outside letters, digits, dot, dash, underscore and slash.</p>
          <p style={{ marginTop: 8, fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
            {result.malformed_skus.slice(0, 30).map((row) => fmt(Object.values(row)[0])).join(", ")}
          </p>
        </div>
      )}

      {result.variants && Object.keys(result.variants).length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Variant groups ({Object.keys(result.variants).length})</h2>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Parent</th>
                <th>Variants</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.variants).slice(0, 50).map(([key, count]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.suggestions && result.suggestions.length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Drafted copy — review before use</h2>
          <p>
            These are suggestions generated from the product fields you selected. Nothing has been
            written back to your dataset. Edit or discard anything that is not accurate.
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {result.suggestions.slice(0, 25).map((s, i) => (
              <div className={styles.card} key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <h3>{fmt(s.product)}</h3>
                  {s.ok ? (
                    <span className={styles.statusLive}>Draft</span>
                  ) : (
                    <span className={styles.statusPlanned}>Failed</span>
                  )}
                </div>
                {s.ok ? (
                  <>
                    <p style={{ marginTop: 8 }}>{fmt(s.description)}</p>
                    <p style={{ marginTop: 8, fontSize: 10 }}>
                      Grounded in: {Array.isArray(s.grounded_in) ? (s.grounded_in as string[]).join(", ") || "nothing" : "nothing"}
                    </p>
                  </>
                ) : (
                  <p style={{ marginTop: 8, color: "var(--muted)" }}>{fmt(s.error)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.operations_log && result.operations_log.length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Step-by-step log</h2>
          <p>Every operation with what it actually changed.</p>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Column</th>
                <th>Status</th>
                <th>Cells changed</th>
                <th>Rows removed</th>
              </tr>
            </thead>
            <tbody>
              {result.operations_log.slice(0, 60).map((entry, i) => (
                <tr key={i}>
                  <td>{fmt(entry.op)}</td>
                  <td>{fmt(entry.column) === "—" ? "all" : fmt(entry.column)}</td>
                  <td style={{ color: entry.status === "failed" ? "#ff9da8" : "var(--muted)" }}>
                    {fmt(entry.status)}
                  </td>
                  <td>{fmt(entry.changed_cells)}</td>
                  <td>{fmt(entry.rows_removed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.schema && result.schema.length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>Inferred schema</h2>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Column</th>
                <th>Inferred type</th>
                <th>Semantic type</th>
                <th>Nulls</th>
              </tr>
            </thead>
            <tbody>
              {result.schema.slice(0, 60).map((col, i) => (
                <tr key={i}>
                  <td>{fmt(col.name ?? col.column)}</td>
                  <td>{fmt(col.dtype ?? col.inferred_type)}</td>
                  <td>{fmt(col.semantic_type)}</td>
                  <td>{fmt(col.null_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.methodology && Object.keys(result.methodology).length > 0 && (
        <div className={styles.sectionBlock}>
          <h2>How the score is calculated</h2>
          <p>
            The score is a weighted mean of the dimensions below. No part of it is estimated or
            invented; every input is counted from your rows.
          </p>
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Weight / detail</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.methodology).map(([key, value]) => (
                <tr key={key}>
                  <td style={{ textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</td>
                  <td>{typeof value === "object" ? JSON.stringify(value) : fmt(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.preview_rows && result.preview_rows.length > 0 && (
        <PreviewBlock rows={result.preview_rows} />
      )}

      {result.output_url && (
        <div className={styles.sectionBlock}>
          <h2>Download the result</h2>
          <p>A real file was generated from this run.</p>
          <div style={{ marginTop: 12 }}>
            <a className={styles.primary} href={result.output_url} download={result.output_filename || undefined}>
              <Download size={14} /> Download {result.output_filename || "result"}
            </a>
          </div>
        </div>
      )}

      {!result.output_url && result.has_output && (
        <div className={styles.sectionBlock}>
          <p className={styles.muted}>
            This tool produced an output but no download link was returned. Re-run it to generate one.
          </p>
        </div>
      )}

      {result.duration_ms !== undefined && (
        <p className={styles.muted} style={{ marginTop: 14 }}>
          Completed in {result.duration_ms} ms.
        </p>
      )}
    </>
  );
}

function IssuesBlock({ issues }: { issues: NonNullable<ToolResult["issues"]> }) {
  const counts = issues.reduce<Record<string, number>>((acc, issue) => {
    const key = issue.severity || "info";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.sectionBlock}>
      <h2>Findings</h2>
      <p>
        {Object.entries(counts)
          .map(([severity, count]) => `${count} ${severity}`)
          .join(" · ")}
      </p>
      <IssueList issues={issues} />
    </div>
  );
}

function IssueList({ issues, severity }: { issues: NonNullable<ToolResult["issues"]>; severity?: string }) {
  const filtered = severity ? issues.filter((i) => (i.severity || "info") === severity) : issues;

  if (filtered.length === 0) {
    return (
      <div className={styles.emptyReport} style={{ minHeight: 90 }}>
        <CheckCircle2 size={20} />
        <b>Nothing to report</b>
        <span>No findings at this level.</span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
      {filtered.slice(0, 100).map((issue, i) => {
        const level = issue.severity || "info";
        const Icon = SEVERITY_ICON[level as keyof typeof SEVERITY_ICON] || Info;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "9px 11px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--panel2, var(--panel))",
            }}
          >
            <Icon size={14} style={{ color: SEVERITY_COLOR[level] || "#8b96a5", marginTop: 2, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11 }}>
                {issue.message || issue.type || "Issue"}
                {issue.row !== null && issue.row !== undefined && (
                  <span style={{ color: "var(--muted)" }}> (row {issue.row})</span>
                )}
              </div>
              {(issue.column || issue.type) && (
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                  {issue.column ? `column: ${issue.column}` : ""}
                  {issue.column && issue.type ? " · " : ""}
                  {issue.type || ""}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MappingsBlock({ mappings }: { mappings: NonNullable<ToolResult["mappings"]> }) {
  return (
    <div className={styles.sectionBlock}>
      <h2>Column mapping</h2>
      <p>
        Confidence is the overlap between the target field name and the source column name. Anything
        below 34% is reported as unmatched rather than guessed.
      </p>
      <table className={styles.table} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Target field</th>
            <th>Source column</th>
            <th>Confidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m) => (
            <tr key={m.target_field}>
              <td>{m.target_field}</td>
              <td>{m.source_column || "—"}</td>
              <td>
                <div className={styles.chartBar} style={{ width: 90 }}>
                  <i style={{ width: `${Math.max(0, Math.min(100, m.confidence))}%` }} />
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{m.confidence}%</span>
              </td>
              <td>
                <span className={m.matched ? styles.statusLive : styles.statusPlanned}>
                  {m.matched ? "Matched" : "Unmatched"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewBlock({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows || rows.length === 0) return null;
  const columns = Object.keys(rows[0]);

  return (
    <div className={styles.sectionBlock}>
      <h2>Data preview</h2>
      <p>First {rows.length} row(s) of the current result.</p>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fmt(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}