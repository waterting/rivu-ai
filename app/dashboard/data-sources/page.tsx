"use client";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Database, FileSpreadsheet, FileText, FolderPlus, Loader2,
  RefreshCw, UploadCloud,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, Modal, PageHeader, SectionHead, Stat,
  buttonClass, uiStyles as s,
} from "../../../lib/ui";

type Project = { id: string; name: string; dataset_count: number; created_at: string };
type Dataset = {
  id: string;
  name: string;
  original_filename: string;
  file_format: string;
  status: string;
  current_version: number;
  created_at: string;
};

const MAX_UPLOAD_MB = 500;

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

const STATUS: Record<string, { label: string; tone: "ok" | "info" | "warn" | "bad" | "neutral" }> = {
  uploaded: { label: "Uploaded", tone: "info" },
  profiling: { label: "Analysing", tone: "info" },
  profiled: { label: "Ready", tone: "ok" },
  transformed: { label: "Cleaned", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

export default function DataSourcesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const res = await authFetch("/projects/", { headers: authHeaders() });
      const data = await res.json();
      const list: Project[] = data.projects || [];
      setProjects(list);
      setActiveProject((current) => current ?? list[0] ?? null);
    } catch {
      setError("Could not load your projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDatasets = useCallback(async (projectId: string) => {
    setListLoading(true);
    try {
      const res = await authFetch(`/projects/${projectId}`, { headers: authHeaders() });
      const data = await res.json();
      setDatasets(data.datasets || []);
    } catch {
      setError("Could not load the files in this project.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await loadProjects();
    };
    run();
  }, [loadProjects]);

  useEffect(() => {
    if (!activeProject) return;
    const run = async () => {
      await loadDatasets(activeProject.id);
    };
    run();
  }, [activeProject, loadDatasets]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !activeProject) return;
    setError("");
    setMessage("");
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_UPLOAD_MB} MB. Split it into smaller files and upload those.`);
      event.target.value = "";
      return;
    }
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("name", file.name.replace(/\.[^.]+$/, ""));
    try {
      const res = await authFetch(`/datasets/projects/${activeProject.id}/upload`, {
        method: "POST",
        headers: authHeaders(),
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.detail?.message || data.detail;
        throw new Error(typeof detail === "string" ? detail : "Upload failed");
      }
      setMessage(`“${file.name}” uploaded. Rivu is checking it now.`);
      await loadDatasets(activeProject.id);
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        await loadDatasets(activeProject.id);
        if (attempts < 15) setTimeout(poll, 2000);
      };
      setTimeout(poll, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function createProject() {
    if (!newName.trim()) return;
    setError("");
    try {
      const res = await authFetch("/projects/", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Could not create the project.");
      setNewName("");
      setShowNew(false);
      setMessage(`“${data.name || newName.trim()}” created. Upload your first file into it.`);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
    }
  }

  const totalFiles = useMemo(() => projects.reduce((total, project) => total + project.dataset_count, 0), [projects]);

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Upload data"
        title="Upload data"
        sub="Bring in a spreadsheet or export. Rivu checks it as soon as it arrives and shows you what needs attention."
        actions={
          <>
            <button type="button" className={buttonClass("default")} onClick={() => void loadProjects()} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button type="button" className={buttonClass("primary")} onClick={() => setShowNew(true)}>
              <FolderPlus size={15} /> New project
            </button>
          </>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}
      {message ? (
        <Callout tone="ok" icon={CheckCircle2}>
          {message}
        </Callout>
      ) : null}

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Projects" value={projects.length} icon={FolderPlus} hint="A project per topic or client" />
        <Stat label="Files uploaded" value={totalFiles} icon={Database} hint="Across all projects" />
      </div>

      <div className={s.split}>
        <Card>
          <SectionHead
            icon={UploadCloud}
            title={activeProject ? `Upload into ${activeProject.name}` : "Upload a file"}
            sub={`CSV, Excel, JSON or Parquet · up to ${MAX_UPLOAD_MB} MB per file`}
          />
          <CardBody>
            {loading ? (
              <div className={s.stack}>
                <div className={s.skeleton} style={{ height: 130 }} />
              </div>
            ) : !activeProject ? (
              <EmptyState
                icon={FolderPlus}
                title="Create a project first"
                action={
                  <button type="button" className={buttonClass("primary")} onClick={() => setShowNew(true)}>
                    <FolderPlus size={14} /> New project
                  </button>
                }
              >
                Projects keep related files together. One for each topic, client or supplier works well.
              </EmptyState>
            ) : (
              <div className={s.stack} style={{ gap: 14 }}>
                <label className={s.empty} style={{ cursor: uploading ? "progress" : "pointer" }}>
                  <span className={s.emptyIcon}>{uploading ? <Loader2 size={17} /> : <UploadCloud size={17} />}</span>
                  <strong className={s.emptyTitle}>{uploading ? "Uploading and checking..." : "Drop a file here, or click to browse"}</strong>
                  <span className={s.emptyText}>
                    Your original stays untouched — Rivu works on a copy so you can always start again.
                  </span>
                  <input
                    type="file"
                    accept=".csv,.json,.xlsx,.xls,.parquet"
                    onChange={upload}
                    disabled={uploading}
                    style={{ display: "none" }}
                  />
                </label>

                <label className={s.field}>
                  <span className={s.label}>Upload into</span>
                  <select
                    className={s.select}
                    value={activeProject.id}
                    onChange={(event) => {
                      const next = projects.find((project) => project.id === event.target.value) || null;
                      setActiveProject(next);
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
            )}
          </CardBody>
        </Card>

        <Card flush>
          <SectionHead icon={FileSpreadsheet} title="Recent files" sub="Everything you have added, newest first." />
          {listLoading && !datasets.length ? (
            <CardBody>
              <div className={s.stack}>
                {[0, 1].map((row) => (
                  <div key={row} className={s.skeleton} style={{ height: 44 }} />
                ))}
              </div>
            </CardBody>
          ) : datasets.length === 0 ? (
            <CardBody>
              <EmptyState icon={FileText} title="No files yet">
                Upload something above. Every file gets checked automatically.
              </EmptyState>
            </CardBody>
          ) : (
            <div style={{ display: "grid", gap: 1 }}>
              {datasets.slice(0, 12).map((dataset) => {
                const status = STATUS[dataset.status] || { label: dataset.status, tone: "neutral" as const };
                return (
                  <Link
                    key={dataset.id}
                    href={`/dashboard/dataset/${dataset.id}`}
                    className={s.row}
                    style={{
                      justifyContent: "space-between",
                      padding: "11px 18px",
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
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Card>
          <SectionHead icon={Database} title="Projects, not folders" sub="Each project keeps its own files, versions and reports." />
          <CardBody>
            <div className={s.stack} style={{ gap: 6 }}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setActiveProject(project)}
                  className={buttonClass(activeProject?.id === project.id ? "primary" : "default", s.btnSm)}
                  style={{ justifyContent: "flex-start", height: 34 }}
                >
                  <FolderPlus size={13} /> {project.name}
                  <span className={s.xs} style={{ opacity: 0.7 }}>
                    {project.dataset_count}
                  </span>
                </button>
              ))}
              {!projects.length ? <span className={s.hint}>No projects yet.</span> : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <SectionHead icon={ArrowRight} title="After you upload" sub="What happens next, in order." />
          <CardBody>
            <div className={s.stack} style={{ gap: 8 }}>
              {[
                "Rivu reads the file and detects the column types",
                "It scores quality and lists anything worth fixing",
                "You review and approve the fixes you want",
                "You export the cleaned version",
              ].map((step, index) => (
                <div key={step} className={s.row} style={{ gap: 9 }}>
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      border: "1px solid var(--line)",
                      background: "var(--surface-2)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-soft)",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className={s.small} style={{ color: "var(--text-soft)" }}>
                    {step}
                  </span>
                </div>
              ))}
              <Link href="/dashboard/refinery" className={buttonClass("primary")} style={{ marginTop: 4, justifySelf: "start" }}>
                Start cleaning <ArrowRight size={14} />
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

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
                onClick={() => void createProject()}
                disabled={!newName.trim()}
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
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Supplier Catalogue 2026"
              onKeyDown={(event) => {
                if (event.key === "Enter") void createProject();
              }}
            />
          </label>
        </Modal>
      ) : null}
    </div>
  );
}