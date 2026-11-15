"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, BarChart3, Download, FileJson, FileText, Loader2, RefreshCw,
} from "lucide-react";
import { authFetch, requestBlob } from "../../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, Meter, PageHeader, SectionHead, Stat,
  buttonClass, uiStyles as s,
} from "../../../lib/ui";

type Project = { id: string; name: string };
type Dataset = { id: string; name: string; original_filename: string; status: string };
type Report = {
  dataset: Dataset;
  quality?: number;
  issues?: number;
  rows?: number;
  readiness?: number;
  headline?: string;
  state: "ready" | "pending" | "error";
};

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

export default function ReportsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const res = await authFetch("/projects/", { headers: authHeaders() });
      const data = await res.json();
      const list: Project[] = data.projects || [];
      setProjects(list);
      if (list[0]) setProjectId((current) => current || list[0].id);
    } catch {
      setError("Could not load your projects.");
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await loadProjects();
    };
    run();
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`/projects/${projectId}`, { headers: authHeaders() });
        const data = await res.json();
        const list: Dataset[] = data.datasets || [];
        setDatasets(list);

        const next: Record<string, Report> = {};
        await Promise.all(
          list.slice(0, 12).map(async (dataset) => {
            try {
              const reportRes = await authFetch(`/reports/${dataset.id}/dashboard`, { headers: authHeaders() });
              if (reportRes.status === 202) {
                next[dataset.id] = { dataset, state: "pending" };
                return;
              }
              const report = await reportRes.json();
              if (!reportRes.ok || !report.quality) {
                next[dataset.id] = { dataset, state: "error" };
                return;
              }
              next[dataset.id] = {
                dataset,
                state: "ready",
                quality: report.quality.overall,
                issues: (report.quality.issues || report.issues || []).length,
                rows: report.profile?.row_count ?? report.profile?.rows,
                readiness: report.ai?.data_readiness,
                headline: report.ai?.headline,
              };
            } catch {
              next[dataset.id] = { dataset, state: "error" };
            }
          })
        );
        setReports(next);
      } catch {
        setError("Could not load the datasets in this project.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [projectId]);

  const rows = useMemo(() => datasets.map((dataset) => reports[dataset.id]).filter(Boolean), [datasets, reports]);

  async function download(id: string, label: string, kind: "pdf" | "executive-pdf" | "json") {
    setBusy(id + kind);
    setError("");
    try {
      if (kind === "json") {
        const res = await authFetch(`/reports/${id}/json`, { headers: authHeaders() });
        if (!res.ok) throw new Error("Could not build the report");
        const text = await res.text();
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `rivu-${label.replace(/[^a-z0-9_-]+/gi, "-")}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
      const blob = await requestBlob(`/reports/${id}/${kind}`, { headers: authHeaders() });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rivu-${label.replace(/[^a-z0-9_-]+/gi, "-")}${kind === "executive-pdf" ? "-summary" : ""}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the report.");
    } finally {
      setBusy("");
    }
  }

  const ready = rows.filter((row) => row.state === "ready");
  const avgQuality = ready.length ? ready.reduce((total, row) => total + (row.quality || 0), 0) / ready.length : null;

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Reports"
        title="Reports"
        sub="Every file gets a measured report: how good the data is, what is wrong with it, and what changed after cleaning. Download a PDF to share it."
        actions={
          <>
            {projects.length ? (
              <select
                className={s.select}
                style={{ width: "auto", minWidth: 150 }}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                aria-label="Project"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className={buttonClass("default")}
              onClick={() => {
                setProjectId("");
                void loadProjects();
              }}
              disabled={loading}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Files with reports" value={ready.length} icon={FileText} />
        <Stat
          label="Average quality"
          value={avgQuality === null ? "—" : avgQuality.toFixed(1)}
          tone={avgQuality === null ? "default" : avgQuality >= 85 ? "ok" : avgQuality >= 60 ? "warn" : "bad"}
          icon={BarChart3}
        />
      </div>

      <Card flush>
        <SectionHead
          icon={FileText}
          title="Reports you can download"
          sub="Each report is built from the current saved version of that file."
          actions={<Badge tone="neutral">PDF · Executive PDF · JSON</Badge>}
        />
        {loading ? (
          <CardBody>
            <div className={s.stack}>
              {[0, 1, 2].map((row) => (
                <div key={row} className={s.skeleton} style={{ height: 46 }} />
              ))}
            </div>
          </CardBody>
        ) : rows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={FileText}
              title="No reports yet"
              action={
                <Link href="/dashboard/data-sources" className={buttonClass("primary")}>
                  Upload a file
                </Link>
              }
            >
              A report is created automatically as soon as Rivu has checked a file.
            </EmptyState>
          </CardBody>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>File</th>
                  <th style={{ width: 140 }}>Quality</th>
                  <th>Issues</th>
                  <th>Rows</th>
                  <th style={{ textAlign: "right" }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.dataset.id}>
                    <td>
                      <span className={s.strong}>{row.dataset.name}</span>
                      <span className={s.xs} style={{ display: "block", color: "var(--faint)" }}>
                        {row.dataset.original_filename}
                      </span>
                    </td>
                    <td>
                      {row.state === "ready" && typeof row.quality === "number" ? (
                        <div className={s.row} style={{ gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 54 }}>
                            <Meter value={row.quality} label="" />
                          </div>
                          <span className={s.xs}>{row.quality.toFixed(0)}</span>
                        </div>
                      ) : (
                        <span className={s.xs} style={{ color: "var(--faint)" }}>
                          {row.state === "pending" ? "Building..." : "—"}
                        </span>
                      )}
                    </td>
                    <td>{row.state === "ready" ? row.issues || 0 : "—"}</td>
                    <td className="num">{row.rows !== undefined ? row.rows.toLocaleString() : "—"}</td>
                    <td>
                      <div className={s.row} style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button
                          type="button"
                          className={buttonClass("default", s.btnSm)}
                          onClick={() => void download(row.dataset.id, row.dataset.name, "pdf")}
                          disabled={busy === row.dataset.id + "pdf" || row.state !== "ready"}
                        >
                          {busy === row.dataset.id + "pdf" ? <Loader2 size={12} /> : <Download size={12} />} PDF
                        </button>
                        <button
                          type="button"
                          className={buttonClass("default", s.btnSm)}
                          onClick={() => void download(row.dataset.id, row.dataset.name, "executive-pdf")}
                          disabled={busy === row.dataset.id + "executive-pdf" || row.state !== "ready"}
                          title="A shorter summary for stakeholders"
                        >
                          {busy === row.dataset.id + "executive-pdf" ? <Loader2 size={12} /> : <FileText size={12} />} Summary
                        </button>
                        <button
                          type="button"
                          className={buttonClass("default", s.btnSm)}
                          onClick={() => void download(row.dataset.id, row.dataset.name, "json")}
                          disabled={busy === row.dataset.id + "json" || row.state !== "ready"}
                          title="Machine-readable data"
                        >
                          {busy === row.dataset.id + "json" ? <Loader2 size={12} /> : <FileJson size={12} />} JSON
                        </button>
                        <Link href={`/dashboard/dataset/${row.dataset.id}`} className={buttonClass("ghost", s.btnSm)}>
                          Open <ArrowUpRight size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Callout tone="info" icon={FileText} title="What is inside a report">
        The rows and columns Rivu measured, how much data is missing or duplicated, the quality score with the issues behind
        it, and — when you have cleaned the file — what changed compared with the original.
      </Callout>
    </div>
  );
}