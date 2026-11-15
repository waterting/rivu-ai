"use client";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Database,
  Download, FileSpreadsheet, FolderPlus, Loader2, Plus, RefreshCw, Sparkles,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, Meter, Modal, PageHeader, SectionHead, Stat,
  buttonClass, uiStyles as s,
} from "../../lib/ui";

type Project = { id: string; name: string; description?: string; dataset_count: number; color: string };
type Dataset = {
  id: string;
  name: string;
  original_filename: string;
  file_format: string;
  status: string;
  current_version: number;
  created_at: string;
};
type Summary = {
  status: "ready" | "pending" | "error";
  rows?: number;
  columns?: number;
  quality?: number;
  issues?: number;
  critical?: number;
  headline?: string;
  summary?: string;
  readiness?: number;
};
type Intelligence = {
  dataset: { id: string; name: string };
  profile: { rows: number; columns: number; duplicates: number; null_pct: number };
  quality: Record<string, number> & { overall: number };
  issues: Array<{ id: string; title?: string; description?: string; severity?: string }>;
  ai?: {
    headline: string;
    summary: string;
    strengths: string[];
    risks: string[];
    actions: string[];
    data_readiness: number;
  };
};

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

const statusTone = (status: string) => {
  if (["profiled", "transformed", "ready"].includes(status)) return "ok" as const;
  if (["failed", "error"].includes(status)) return "bad" as const;
  if (["uploaded", "profiling", "pending", "processing"].includes(status)) return "info" as const;
  return "neutral" as const;
};

const statusLabel = (status: string) =>
  ({ uploaded: "Uploaded", profiling: "Analysing", profiled: "Ready to clean", transformed: "Cleaned", failed: "Failed" }[status] || status);

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);

  const selectProject = useCallback(
    async (project: Project) => {
      setSelected(project);
      setIntelligence(null);
      try {
        const res = await authFetch("/projects/" + project.id, { headers: authHeaders() });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail?.message || data.detail || "Could not load project");
        setDatasets(data.datasets || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load project.");
      }
    },
    [router]
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await authFetch("/projects/", { headers: authHeaders() });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setProjects(data.projects || []);
      if (data.projects?.[0]) await selectProject(data.projects[0]);
    } catch {
      setError("Could not reach the Rivu API. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [selectProject, router]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!cancelled) await load();
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Quality figures come from the real report endpoint, one call per recent dataset.
  useEffect(() => {
    let cancelled = false;
    const recent = datasets.slice(0, 6);
    if (!recent.length) {
      queueMicrotask(() => setSummaries({}));
      return;
    }
    const run = async () => {
      const next: Record<string, Summary> = {};
      await Promise.all(
        recent.map(async (dataset) => {
          try {
            const res = await authFetch(`/reports/${dataset.id}/dashboard`, { headers: authHeaders() });
            if (res.status === 202) {
              next[dataset.id] = { status: "pending" };
              return;
            }
            const data = await res.json();
            if (!res.ok || !data.quality) {
              next[dataset.id] = { status: "error" };
              return;
            }
            next[dataset.id] = {
              status: "ready",
              rows: data.profile?.row_count ?? data.profile?.rows,
              columns: data.profile?.column_count ?? data.profile?.columns,
              quality: data.quality.overall,
              issues: (data.quality.issues || data.issues || []).length,
              critical: data.quality.counts?.critical ?? 0,
              headline: data.ai?.headline,
              summary: data.ai?.summary,
              readiness: data.ai?.data_readiness,
            };
          } catch {
            next[dataset.id] = { status: "error" };
          }
        })
      );
      if (!cancelled) setSummaries(next);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [datasets]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    setError("");
    setMessage("");
    setUploadPct(8);
    const body = new FormData();
    body.append("file", file);
    body.append("name", file.name.replace(/\.[^.]+$/, ""));
    const tick = setInterval(() => setUploadPct((pct) => (pct < 90 ? pct + 7 : pct)), 400);
    try {
      const res = await authFetch(`/datasets/projects/${selected.id}/upload`, {
        method: "POST",
        headers: authHeaders(),
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Upload failed");
      setUploadPct(100);
      setMessage(`“${file.name}” uploaded. Rivu is analysing it now.`);
      await selectProject(selected);
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        await selectProject(selected);
        if (attempts < 20) setTimeout(poll, 1500);
      };
      setTimeout(poll, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      clearInterval(tick);
      setUploading(false);
      event.target.value = "";
    }
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await authFetch("/projects/", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail?.message || data.detail || "Could not create project.");
      }
      setName("");
      setShowNew(false);
      setLoading(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  async function openIntelligence(dataset: Dataset) {
    setError("");
    setMessage("");
    try {
      const res = await authFetch(`/reports/${dataset.id}/dashboard`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        setMessage("Rivu is still analysing this dataset. Try again in a moment.");
        return;
      }
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Intelligence report unavailable");
      if (!data.dataset || !data.profile || !data.quality) throw new Error("The report is incomplete. Please retry.");
      setIntelligence(data);
      document.getElementById("intelligence")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load intelligence report.");
    }
  }

  async function downloadReport(id: string, label: string) {
    setError("");
    try {
      const res = await authFetch(`/reports/${id}/pdf`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Could not generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rivu-${label.replace(/[^a-z0-9_-]+/gi, "-")}-report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate report");
    }
  }

  const recent = useMemo(
    () =>
      [...datasets]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 5),
    [datasets]
  );

  const scored = Object.values(summaries).filter((item) => typeof item.quality === "number");
  const avgQuality = scored.length
    ? scored.reduce((total, item) => total + (item.quality || 0), 0) / scored.length
    : null;
  const openIssues = scored.reduce((total, item) => total + (item.issues || 0), 0);
  const criticalIssues = scored.reduce((total, item) => total + (item.critical || 0), 0);
  const totalDatasets = projects.reduce((total, project) => total + project.dataset_count, 0);

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        sub="Upload a file, let Rivu check it, clean what needs cleaning, then export a version you can trust."
        actions={
          <>
            <button type="button" className={buttonClass("default")} onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button type="button" className={buttonClass("primary")} onClick={() => setShowNew(true)}>
              <Plus size={15} /> New project
            </button>
          </>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}
      {message ? (
        <Callout tone="info" icon={CheckCircle2}>
          {message}
        </Callout>
      ) : null}

      <div className={s.split}>
        <Card>
          <SectionHead
            icon={UploadCloud}
            title="Upload your data"
            sub="CSV, Excel, JSON or Parquet. Rivu checks the file and tells you what needs attention."
            actions={selected ? <Badge tone="neutral">{selected.name}</Badge> : null}
          />
          <CardBody>
            <label
              className={s.empty}
              style={{
                cursor: uploading ? "progress" : "pointer",
                borderColor: uploading ? "rgba(139,123,255,0.45)" : undefined,
                background: uploading ? "var(--accent-soft, rgba(139,123,255,0.1))" : undefined,
              }}
            >
              <span className={s.emptyIcon}>
                {uploading ? <Loader2 size={17} /> : <UploadCloud size={17} />}
              </span>
              <strong className={s.emptyTitle}>
                {uploading ? "Uploading and analysing..." : "Drop a file here, or click to browse"}
              </strong>
              <span className={s.emptyText}>
                Your original file is never changed. Rivu works on a copy so you can always go back.
              </span>
              <input
                type="file"
                accept=".csv,.json,.xlsx,.xls,.parquet"
                onChange={upload}
                disabled={uploading || !selected}
                style={{ display: "none" }}
              />
            </label>
            {uploading ? (
              <div style={{ marginTop: 12 }}>
                <Meter value={uploadPct} label="Uploading" hint="Large files can take a minute." />
              </div>
            ) : null}
            {!selected && !loading ? (
              <div style={{ marginTop: 12 }}>
                <Callout tone="warn" title="Create a project first">
                  Projects keep your files and their history separate.{" "}
                  <button type="button" className={buttonClass("ghost", s.btnSm)} onClick={() => setShowNew(true)}>
                    New project
                  </button>
                </Callout>
              </div>
            ) : null}
            {selected ? (
              <div style={{ marginTop: 14 }}>
                <label className={s.field}>
                  <span className={s.label}>Uploading into</span>
                  <select
                    className={s.select}
                    value={selected.id}
                    onChange={(event) => {
                      const next = projects.find((project) => project.id === event.target.value);
                      if (next) void selectProject(next);
                    }}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <SectionHead
            icon={Activity}
            title="Continue where you left off"
            sub="Your most recent files, newest first."
            actions={
              <Link href="/dashboard/data-sources" className={buttonClass("ghost", s.btnSm)}>
                See all <ArrowRight size={13} />
              </Link>
            }
          />
          <CardBody tight>
            {loading ? (
              <div className={s.stack} style={{ padding: "4px 4px 8px" }}>
                {[0, 1, 2].map((row) => (
                  <div key={row} className={s.skeleton} style={{ height: 46 }} />
                ))}
              </div>
            ) : recent.length ? (
              <div className={s.stack} style={{ gap: 2 }}>
                {recent.map((dataset) => (
                  <Link
                    key={dataset.id}
                    href={`/dashboard/dataset/${dataset.id}`}
                    className={s.row}
                    style={{
                      justifyContent: "space-between",
                      padding: "9px 4px",
                      borderBottom: "1px solid var(--line)",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span className={s.row} style={{ minWidth: 0, gap: 9 }}>
                      <FileSpreadsheet size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <span className={s.strong} style={{ display: "block", fontSize: 12.5 }}>
                          {dataset.name}
                        </span>
                        <span className={s.xs} style={{ color: "var(--faint)" }}>
                          {dataset.original_filename} · version {dataset.current_version}
                        </span>
                      </span>
                    </span>
                    <Badge tone={statusTone(dataset.status)} dot>
                      {statusLabel(dataset.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Database}
                title="No data yet"
                action={
                  <span className={s.hint}>
                    Upload a file to see it here. Everything you add appears in this list.
                  </span>
                }
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Projects" value={projects.length} hint="Separate areas for different data" icon={FolderPlus} />
        <Stat label="Datasets" value={totalDatasets} hint="Files uploaded across projects" icon={Database} />
        <Stat
          label="Average quality"
          value={avgQuality === null ? "—" : avgQuality.toFixed(1)}
          hint={avgQuality === null ? "Analysed once a file is ready" : "Across your analysed files"}
          tone={avgQuality === null ? "default" : avgQuality >= 85 ? "ok" : avgQuality >= 60 ? "warn" : "bad"}
          icon={Sparkles}
        />
        <Stat
          label="Open issues"
          value={openIssues}
          hint={criticalIssues ? `${criticalIssues} need attention first` : "Nothing critical found"}
          tone={criticalIssues ? "bad" : openIssues ? "warn" : "ok"}
          icon={AlertTriangle}
        />
      </div>

      <Card flush>
        <SectionHead
          icon={Sparkles}
          title="Data quality by file"
          sub="What Rivu found in each of your recent uploads. Open a file to fix the issues."
          actions={
            <Link href="/dashboard/refinery" className={buttonClass("ghost", s.btnSm)}>
              How cleaning works <ArrowRight size={13} />
            </Link>
          }
        />
        {loading ? (
          <CardBody>
            <div className={s.stack}>
              {[0, 1, 2].map((row) => (
                <div key={row} className={s.skeleton} style={{ height: 40 }} />
              ))}
            </div>
          </CardBody>
        ) : recent.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th style={{ width: 150 }}>Quality</th>
                  <th>Rows</th>
                  <th>Issues</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {recent.map((dataset) => {
                  const summary = summaries[dataset.id];
                  return (
                    <tr key={dataset.id}>
                      <td>
                        <span className={s.strong}>{dataset.name}</span>
                        <span className={s.xs} style={{ display: "block", color: "var(--faint)" }}>
                          {dataset.original_filename}
                        </span>
                      </td>
                      <td>
                        <Badge tone={statusTone(dataset.status)} dot>
                          {statusLabel(dataset.status)}
                        </Badge>
                      </td>
                      <td>
                        {summary?.status === "ready" && typeof summary.quality === "number" ? (
                          <div className={s.row} style={{ gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 60 }}>
                              <Meter value={summary.quality} label="" />
                            </div>
                            <span className={s.xs} style={{ fontVariantNumeric: "tabular-nums" }}>
                              {summary.quality.toFixed(0)}
                            </span>
                          </div>
                        ) : (
                          <span className={s.xs} style={{ color: "var(--faint)" }}>
                            {summary?.status === "pending" ? "Analysing..." : "—"}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {summary?.status === "ready" && summary.rows !== undefined
                          ? summary.rows.toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        {summary?.status === "ready" ? (
                          summary.issues ? (
                            <Badge tone={summary.critical ? "bad" : "warn"}>{summary.issues}</Badge>
                          ) : (
                            <Badge tone="ok" icon={CheckCircle2}>
                              Clean
                            </Badge>
                          )
                        ) : (
                          <span style={{ color: "var(--faint)" }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/dashboard/dataset/${dataset.id}`} className={buttonClass("default", s.btnSm)}>
                          Open <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody>
            <EmptyState icon={Database} title="No datasets yet">
              Upload a CSV or Excel file to see its quality score here.
            </EmptyState>
          </CardBody>
        )}
      </Card>

      <Card>
        <SectionHead
          icon={Sparkles}
          title={intelligence ? intelligence.ai?.headline || "Dataset intelligence" : "AI assessment"}
          sub={
            intelligence
              ? intelligence.ai?.summary || "Measured quality, findings and suggested next steps."
              : "Pick a file to see what Rivu makes of it — no technical knowledge needed."
          }
          actions={
            intelligence ? (
              <button
                type="button"
                className={buttonClass("primary", s.btnSm)}
                onClick={() => router.push(`/dashboard/dataset/${intelligence.dataset.id}`)}
              >
                Open full report <ArrowUpRight size={13} />
              </button>
            ) : null
          }
        />
        <CardBody>
          {!intelligence ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing selected yet"
              action={
                recent.length ? (
                  <button
                    type="button"
                    className={buttonClass("default")}
                    onClick={() => openIntelligence(recent[0])}
                  >
                    Assess “{recent[0].name}”
                  </button>
                ) : (
                  <span className={s.hint}>Upload a file first.</span>
                )
              }
            >
              Rivu reads your data, measures its quality and explains the findings in plain language.
            </EmptyState>
          ) : (
            <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div className={s.stack}>
                <div className={s.spread}>
                  <span className={s.label}>Data readiness</span>
                  <span className={s.strong}>
                    {Math.round(intelligence.ai?.data_readiness ?? intelligence.quality.overall)} / 100
                  </span>
                </div>
                <Meter value={intelligence.ai?.data_readiness ?? intelligence.quality.overall} label="" />
                <dl className={s.facts}>
                  <div className={s.fact}>
                    <dt>Rows</dt>
                    <dd>{(intelligence.profile.rows ?? 0).toLocaleString()}</dd>
                  </div>
                  <div className={s.fact}>
                    <dt>Columns</dt>
                    <dd>{intelligence.profile.columns}</dd>
                  </div>
                  <div className={s.fact}>
                    <dt>Duplicate rows</dt>
                    <dd>{intelligence.profile.duplicates ?? 0}</dd>
                  </div>
                  <div className={s.fact}>
                    <dt>Missing values</dt>
                    <dd>{(intelligence.profile.null_pct ?? 0).toFixed(1)}%</dd>
                  </div>
                  <div className={s.fact}>
                    <dt>Issues found</dt>
                    <dd>{intelligence.issues.length}</dd>
                  </div>
                </dl>
              </div>
              <div className={s.stack}>
                {[
                  { title: "What is good", items: intelligence.ai?.strengths || [] },
                  { title: "What to watch", items: intelligence.ai?.risks || [] },
                  { title: "Suggested next steps", items: intelligence.ai?.actions || [] },
                ].map((group) => (
                  <div key={group.title}>
                    <div className={s.label} style={{ marginBottom: 5 }}>
                      {group.title}
                    </div>
                    {group.items.length ? (
                      <ul style={{ margin: 0, paddingLeft: 17, display: "grid", gap: 4 }}>
                        {group.items.slice(0, 4).map((item, index) => (
                          <li key={index} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-soft)" }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className={s.hint}>Nothing reported.</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {recent.length ? (
        <Card>
          <SectionHead icon={Download} title="Quick exports" sub="Download a PDF summary of a file's quality." />
          <CardBody>
            <div className={s.chipRow}>
              {recent.slice(0, 4).map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  className={buttonClass("default", s.btnSm)}
                  onClick={() => downloadReport(dataset.id, dataset.name)}
                >
                  <Download size={12} /> {dataset.name} · PDF
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {showNew ? (
        <Modal
          title="Create a project"
          sub="A project keeps related files, versions and reports together."
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button type="button" className={buttonClass("ghost")} onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={buttonClass("primary")}
                onClick={create}
                disabled={creating || !name.trim()}
              >
                <FolderPlus size={14} /> Create project
              </button>
            </>
          }
        >
          <label className={s.field}>
            <span className={s.label}>Project name</span>
            <input
              className={s.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Supplier Catalogue 2026"
              onKeyDown={(event) => {
                if (event.key === "Enter") void create();
              }}
            />
            <span className={s.hint}>Something you will recognise later. You can rename it any time.</span>
          </label>
        </Modal>
      ) : null}
    </div>
  );
}