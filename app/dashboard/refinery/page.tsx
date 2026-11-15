"use client";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, CheckCircle2, Download, FileSpreadsheet, ListChecks,
  Loader2, ScanSearch, Sparkles, UploadCloud, Wand2,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, Meter, PageHeader, SectionHead, Stat, Stepper,
  buttonClass, uiStyles as s,
  type Step,
} from "../../../lib/ui";

type Project = { id: string; name: string; dataset_count: number };
type Dataset = { id: string; name: string; original_filename: string; status: string; current_version: number };
type Column = {
  name: string;
  type: string;
  semantic_type?: string;
  null_count: number;
  null_pct: number;
  unique_count: number;
};
type Issue = {
  id: string;
  type: string;
  severity?: string;
  title?: string;
  description?: string;
  column?: string | null;
  rows?: number | null;
  suggested_fix?: string;
  auto_fixable?: boolean;
};
type Version = { version_number: number; version_label: string; quality_score: number | null; created_at: string };
type Job = { id: string; type: string; status: string; message?: string; completed_at?: string | null };

const STEPS: Step[] = [
  { key: "upload", label: "Upload", hint: "Add a file" },
  { key: "understand", label: "Understand", hint: "See what is inside" },
  { key: "clean", label: "Clean", hint: "Fix the problems" },
  { key: "review", label: "Review", hint: "Check every change" },
  { key: "export", label: "Export", hint: "Download the result" },
];

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

const severityTone = (severity?: string) =>
  severity === "critical" || severity === "high" ? "bad" : severity === "medium" ? "warn" : "info";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  profiling: "Analysing",
  profiled: "Ready to clean",
  transformed: "Cleaned",
  failed: "Failed",
};

export default function RefineryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<{ rows: number; columns: number; duplicates: number; nullPct: number } | null>(null);
  const [quality, setQuality] = useState<{ overall: number; counts: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const selected = datasets.find((dataset) => dataset.id === datasetId) || null;

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

  const loadDatasets = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const res = await authFetch(`/projects/${id}`, { headers: authHeaders() });
        const data = await res.json();
        const list: Dataset[] = data.datasets || [];
        setDatasets(list);
        setDatasetId((current) => (list.some((item) => item.id === current) ? current : list[0]?.id || ""));
      } catch {
        setError("Could not load the files in this project.");
      }
    },
    []
  );

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [profileRes, qualityRes, versionsRes, jobsRes] = await Promise.all([
        authFetch(`/datasets/${id}/profile`, { headers: authHeaders() }),
        authFetch(`/datasets/${id}/quality`, { headers: authHeaders() }),
        authFetch(`/datasets/${id}/versions`, { headers: authHeaders() }),
        authFetch(`/datasets/${id}/jobs`, { headers: authHeaders() }),
      ]);

      if (profileRes.status === 200) {
        const data = await profileRes.json();
        setColumns(data.columns || []);
        setProfile({
          rows: data.profile?.row_count ?? 0,
          columns: data.profile?.column_count ?? 0,
          duplicates: data.profile?.duplicate_row_count ?? 0,
          nullPct: data.profile?.total_null_pct ?? 0,
        });
      } else {
        setProfile(null);
        setColumns([]);
      }

      if (qualityRes.status === 200) {
        const data = await qualityRes.json();
        setIssues(data.issues || []);
        setQuality({ overall: data.overall_score ?? 0, counts: data.counts || {} });
      } else {
        setIssues([]);
        setQuality(null);
      }

      if (versionsRes.status === 200) {
        const data = await versionsRes.json();
        setVersions(data.versions || []);
      } else {
        setVersions([]);
      }

      if (jobsRes.status === 200) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      } else {
        setJobs([]);
      }
    } catch {
      setError("Could not load the details for this file.");
    } finally {
      setLoading(false);
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
      await loadDatasets(projectId);
    };
    run();
  }, [projectId, loadDatasets]);

  useEffect(() => {
    if (!datasetId) return;
    const run = async () => {
      await loadDetail(datasetId);
    };
    run();
  }, [datasetId, loadDetail]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !projectId) return;
    setUploading(true);
    setError("");
    setMessage("");
    const body = new FormData();
    body.append("file", file);
    body.append("name", file.name.replace(/\.[^.]+$/, ""));
    try {
      const res = await authFetch(`/datasets/projects/${projectId}/upload`, { method: "POST", headers: authHeaders(), body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Upload failed");
      setMessage(`“${file.name}” uploaded. Rivu is checking it now — this usually takes a few seconds.`);
      await loadDatasets(projectId);
      const created = (data.dataset?.id as string) || "";
      if (created) {
        setDatasetId(created);
        let attempts = 0;
        const poll = async () => {
          attempts += 1;
          await loadDatasets(projectId);
          await loadDetail(created);
          if (attempts < 15) setTimeout(poll, 2000);
        };
        setTimeout(poll, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const stage = useMemo(() => {
    if (!datasets.length) return "upload";
    if (!selected) return "upload";
    if (["uploaded", "profiling", "pending"].includes(selected.status)) return "understand";
    if (versions.length > 1 || selected.status === "transformed") return selected.current_version > 1 ? "review" : "export";
    return "clean";
  }, [datasets.length, selected, versions.length]);

  const completed = useMemo(() => {
    const order = ["upload", "understand", "clean", "review", "export"];
    const index = order.indexOf(stage);
    return order.slice(0, Math.max(0, index));
  }, [stage]);

  const openIssues = issues.filter((issue) => issue.severity !== "low");
  const qualityScore = quality?.overall ?? null;
  const lastJob = jobs[0];

  const stepCopy: Record<string, { title: string; body: string }> = {
    upload: {
      title: "Start by adding a file",
      body: "Choose the spreadsheet or export you want to work on. Rivu keeps your original file untouched and works on a copy.",
    },
    understand: {
      title: "Rivu is checking your file",
      body: "We count the rows and columns, look for missing values and duplicates, and score how usable the data is.",
    },
    clean: {
      title: "Fix what needs fixing",
      body: "Each issue below can be fixed with a safe, reversible operation. Nothing changes until you approve it.",
    },
    review: {
      title: "Check the changes before they are saved",
      body: "Every fix is previewed against the original values, then saved as a new version you can return to.",
    },
    export: {
      title: "Download the cleaned data",
      body: "Export the approved version as CSV, Excel, JSON or Parquet — ready for your store, BI tool or supplier.",
    },
  };

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Clean & improve data"
        title="Clean & improve data"
        sub="Follow the five steps to turn a messy file into data you can trust. Rivu does the checking; you decide what changes."
        actions={
          <>
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
              {!projects.length ? <option value="">No projects yet</option> : null}
            </select>
            {datasets.length ? (
              <select
                className={s.select}
                style={{ width: "auto", minWidth: 150 }}
                value={datasetId}
                onChange={(event) => setDatasetId(event.target.value)}
                aria-label="File"
              >
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}
      {message ? (
        <Callout tone="ok" icon={CheckCircle2}>
          {message}
        </Callout>
      ) : null}

      <Stepper steps={STEPS} current={stage} completed={completed} />

      <div className={s.split}>
        <Card>
          <SectionHead
            icon={stage === "upload" ? UploadCloud : stage === "understand" ? ScanSearch : stage === "clean" ? Wand2 : stage === "review" ? ListChecks : Download}
            title={stepCopy[stage].title}
            sub={stepCopy[stage].body}
            actions={
              selected ? (
                <Badge tone={selected.status === "transformed" ? "ok" : "info"} dot>
                  {STATUS_LABEL[selected.status] || selected.status}
                </Badge>
              ) : null
            }
          />
          <CardBody>
            {stage === "upload" ? (
              <div className={s.stack}>
                <label className={s.empty} style={{ cursor: uploading ? "progress" : "pointer" }}>
                  <span className={s.emptyIcon}>{uploading ? <Loader2 size={17} /> : <UploadCloud size={17} />}</span>
                  <strong className={s.emptyTitle}>{uploading ? "Uploading..." : "Drop a file here, or click to browse"}</strong>
                  <span className={s.emptyText}>CSV, Excel, JSON or Parquet. You can add more files later.</span>
                  <input
                    type="file"
                    accept=".csv,.json,.xlsx,.xls,.parquet"
                    onChange={upload}
                    disabled={uploading || !projectId}
                    style={{ display: "none" }}
                  />
                </label>
                {!projects.length ? (
                  <Callout tone="warn" title="No project yet">
                    Create a project on the{" "}
                    <Link href="/dashboard" style={{ color: "inherit", fontWeight: 600 }}>
                      overview page
                    </Link>{" "}
                    first — projects keep your files separate.
                  </Callout>
                ) : null}
              </div>
            ) : null}

            {stage === "understand" ? (
              loading ? (
                <div className={s.stack}>
                  <div className={s.skeleton} style={{ height: 64 }} />
                  <div className={s.skeleton} style={{ height: 120 }} />
                </div>
              ) : !selected || !profile ? (
                <EmptyState icon={ScanSearch} title="This file has not been checked yet">
                  {selected?.status === "profiling" ? "Rivu is still working on it. Refresh in a moment." : "Upload a file to see its summary."}
                </EmptyState>
              ) : (
                <div className={s.stack} style={{ gap: 16 }}>
                  <p className={s.small} style={{ margin: 0, color: "var(--text-soft)", lineHeight: 1.6 }}>
                    Your file contains <strong className={s.strong}>{profile.rows.toLocaleString()} rows</strong> and{" "}
                    <strong className={s.strong}>{profile.columns} columns</strong>. We found{" "}
                    <strong className={s.strong}>{profile.duplicates} duplicate rows</strong> and{" "}
                    <strong className={s.strong}>{profile.nullPct.toFixed(1)}% missing values</strong>.
                  </p>
                  <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                    <Stat label="Rows" value={profile.rows.toLocaleString()} />
                    <Stat label="Columns" value={profile.columns} />
                    <Stat
                      label="Quality score"
                      value={qualityScore === null ? "—" : qualityScore.toFixed(0)}
                      tone={qualityScore === null ? "default" : qualityScore >= 85 ? "ok" : qualityScore >= 60 ? "warn" : "bad"}
                    />
                  </div>
                  {columns.length ? (
                    <div className={s.tableWrap}>
                      <table className={s.table}>
                        <thead>
                          <tr>
                            <th>Column</th>
                            <th>Type</th>
                            <th>Missing</th>
                            <th>Unique values</th>
                          </tr>
                        </thead>
                        <tbody>
                          {columns.map((column) => (
                            <tr key={column.name}>
                              <td className={s.strong}>{column.name}</td>
                              <td>{column.semantic_type || column.type}</td>
                              <td>
                                {column.null_count ? (
                                  <Badge tone="warn">{column.null_pct.toFixed(1)}%</Badge>
                                ) : (
                                  <span style={{ color: "var(--faint)" }}>None</span>
                                )}
                              </td>
                              <td className="num">{column.unique_count.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className={s.row}>
                    <Link href={`/dashboard/dataset/${selected.id}`} className={buttonClass("primary")}>
                      See the full breakdown <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              )
            ) : null}

            {stage === "clean" ? (
              loading ? (
                <div className={s.stack}>
                  <div className={s.skeleton} style={{ height: 90 }} />
                  <div className={s.skeleton} style={{ height: 90 }} />
                </div>
              ) : (
                <div className={s.stack} style={{ gap: 14 }}>
                  {qualityScore !== null ? (
                    <div>
                      <div className={s.meterHead}>
                        <span>Quality score</span>
                        <b>{qualityScore.toFixed(0)} / 100</b>
                      </div>
                      <Meter value={qualityScore} label="" />
                    </div>
                  ) : null}
                  {openIssues.length ? (
                    <>
                      <p className={s.small} style={{ margin: 0, color: "var(--text-soft)" }}>
                        {openIssues.length} {openIssues.length === 1 ? "issue needs" : "issues need"} attention. Each one can be fixed safely —
                        you will see a preview before anything changes.
                      </p>
                      <div className={s.stack} style={{ gap: 8 }}>
                        {openIssues.slice(0, 5).map((issue) => (
                          <div key={issue.id} className={s.card} style={{ padding: "11px 13px" }}>
                            <div className={s.spread} style={{ marginBottom: 4 }}>
                              <span className={s.strong} style={{ fontSize: 12.5 }}>
                                {issue.title || issue.type}
                              </span>
                              <Badge tone={severityTone(issue.severity)}>{issue.severity || "info"}</Badge>
                            </div>
                            <p className={s.small} style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>
                              {issue.description}
                            </p>
                            {issue.suggested_fix ? (
                              <p className={s.xs} style={{ margin: "5px 0 0", color: "var(--faint)" }}>
                                Suggested fix: {issue.suggested_fix}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Callout tone="ok" title="Nothing to fix">
                      No issues were found in this file. You can still review the changes or export a version.
                    </Callout>
                  )}
                  <div className={s.row}>
                    <Link href={`/dashboard/dataset/${selected?.id}`} className={buttonClass("primary")}>
                      <Sparkles size={14} /> Fix these issues
                    </Link>
                    <Link href="/dashboard/tools" className={buttonClass("default")}>
                      Browse data tools
                    </Link>
                  </div>
                </div>
              )
            ) : null}

            {stage === "review" ? (
              <div className={s.stack} style={{ gap: 14 }}>
                <p className={s.small} style={{ margin: 0, color: "var(--text-soft)", lineHeight: 1.6 }}>
                  Saved versions of this file. Each one keeps the changes you approved, so you can always go back.
                </p>
                {versions.length ? (
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th>Version</th>
                          <th>Quality</th>
                          <th>Saved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {versions.map((version) => (
                          <tr key={version.version_number}>
                            <td>
                              <span className={s.strong}>Version {version.version_number}</span>{" "}
                              <span className={s.xs} style={{ color: "var(--faint)" }}>{version.version_label}</span>
                            </td>
                            <td>{typeof version.quality_score === "number" ? version.quality_score.toFixed(0) : "—"}</td>
                            <td>{new Date(version.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <span className={s.hint}>No versions saved yet.</span>
                )}
                <div className={s.row}>
                  <Link href={`/dashboard/dataset/${selected?.id}`} className={buttonClass("primary")}>
                    Review and approve changes <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ) : null}

            {stage === "export" ? (
              <div className={s.stack} style={{ gap: 14 }}>
                <p className={s.small} style={{ margin: 0, color: "var(--text-soft)", lineHeight: 1.6 }}>
                  Download the approved version of <strong className={s.strong}>{selected?.name}</strong>. Pick a format and Rivu
                  builds the file from the latest saved version.
                </p>
                <div className={s.preview}>
                  <div className={s.previewCell}>
                    <small>Best for spreadsheets</small>
                    <span className={s.strong}>CSV or Excel</span>
                  </div>
                  <div className={s.previewCell}>
                    <small>Best for developers</small>
                    <span className={s.strong}>JSON or Parquet</span>
                  </div>
                </div>
                <div className={s.row}>
                  <Link href="/dashboard/tools/format-studio" className={buttonClass("primary")}>
                    <Download size={14} /> Choose a format
                  </Link>
                  <Link href={`/dashboard/dataset/${selected?.id}`} className={buttonClass("default")}>
                    Open the file
                  </Link>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className={s.stack}>
          <Card>
            <SectionHead icon={Sparkles} title="What this means" />
            <CardBody>
              <dl className={s.facts}>
                <div className={s.fact}>
                  <dt>File</dt>
                  <dd className={s.truncate}>{selected ? selected.original_filename : "—"}</dd>
                </div>
                <div className={s.fact}>
                  <dt>Status</dt>
                  <dd>{selected ? STATUS_LABEL[selected.status] || selected.status : "—"}</dd>
                </div>
                <div className={s.fact}>
                  <dt>Saved versions</dt>
                  <dd>{versions.length}</dd>
                </div>
                <div className={s.fact}>
                  <dt>Issues found</dt>
                  <dd>{issues.length}</dd>
                </div>
                <div className={s.fact}>
                  <dt>Needs attention</dt>
                  <dd>{openIssues.length}</dd>
                </div>
              </dl>
              {lastJob ? (
                <div style={{ marginTop: 12 }}>
                  <Callout tone="info">
                    Last activity: <strong>{lastJob.message || lastJob.type}</strong> ({lastJob.status})
                  </Callout>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <SectionHead icon={FileSpreadsheet} title="Prefer to start from a file?" />
            <CardBody>
              <div className={s.stack}>
                <p className={s.small} style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55 }}>
                  You can also upload from the overview, then come back here to clean it.
                </p>
                <Link href="/dashboard/data-sources" className={buttonClass("default")}>
                  Go to upload <ArrowUpRight size={14} />
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}