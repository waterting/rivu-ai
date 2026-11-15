"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Timer, XCircle,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, PageHeader, SectionHead, Stat,
  buttonClass, uiStyles as s,
} from "../../../lib/ui";

type Project = { id: string; name: string };
type Dataset = { id: string; name: string; status: string };
type Job = {
  id: string;
  type: string;
  status: string;
  progress?: number;
  message?: string | null;
  error?: string | null;
  queued_at?: string;
  completed_at?: string | null;
};
type Row = { dataset: Dataset; job: Job };

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

const JOB_LABEL: Record<string, string> = {
  profile: "Checking the file",
  quality: "Scoring quality",
  transform: "Applying fixes",
  export: "Building an export",
};

const tone = (status: string) =>
  status === "completed" ? "ok" : status === "failed" ? "bad" : status === "running" || status === "processing" ? "info" : "warn";

const label = (status: string) =>
  ({ completed: "Completed", failed: "Failed", running: "Running", queued: "Waiting", pending: "Waiting", blocked: "Waiting" }[status] || status);

export default function WorkflowsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const projectsRes = await authFetch("/projects/", { headers: authHeaders() });
      const projectsData = await projectsRes.json();
      const projects: Project[] = projectsData.projects || [];
      if (!projects.length) {
        setRows([]);
        return;
      }
      const project = projects[0];
      setScope(project.name);

      const projectRes = await authFetch(`/projects/${project.id}`, { headers: authHeaders() });
      const projectData = await projectRes.json();
      const datasets: Dataset[] = (projectData.datasets || []).slice(0, 8);

      const collected: Row[] = [];
      await Promise.all(
        datasets.map(async (dataset) => {
          try {
            const res = await authFetch(`/datasets/${dataset.id}/jobs`, { headers: authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            for (const job of (data.jobs || []).slice(0, 4) as Job[]) {
              collected.push({ dataset, job });
            }
          } catch {
            /* a missing job log should not break the page */
          }
        })
      );
      collected.sort((a, b) => ((a.job.queued_at || "") < (b.job.queued_at || "") ? 1 : -1));
      setRows(collected);
    } catch {
      setError("Could not load processing activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  const counts = useMemo(() => {
    const base = { completed: 0, failed: 0, active: 0 };
    for (const row of rows) {
      if (row.job.status === "completed") base.completed += 1;
      else if (row.job.status === "failed") base.failed += 1;
      else base.active += 1;
    }
    return base;
  }, [rows]);

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Workflows"
        title="Processing activity"
        sub="Every check and change Rivu runs is recorded here, so you can see what finished, what is still running and what needs a second look."
        actions={
          <button type="button" className={buttonClass("default")} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Stat label="Completed" value={counts.completed} tone="ok" icon={CheckCircle2} />
        <Stat label="Running or waiting" value={counts.active} tone="warn" icon={Clock} />
        <Stat label="Needs attention" value={counts.failed} tone={counts.failed ? "bad" : "default"} icon={XCircle} />
      </div>

      <Callout tone="info" icon={Activity} title="What runs automatically">
        Uploading a file starts a check, then a quality score. Applying fixes creates a new saved version. Nothing is published
        to a store or applied to your data without you approving it first.
      </Callout>

      <Card flush>
        <SectionHead
          icon={Timer}
          title="Recent activity"
          sub={scope ? `Showing the newest jobs in ${scope}.` : "The newest jobs across your workspace."}
        />
        {loading ? (
          <CardBody>
            <div className={s.stack}>
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className={s.skeleton} style={{ height: 44 }} />
              ))}
            </div>
          </CardBody>
        ) : rows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={Activity}
              title="No activity yet"
              action={
                <Link href="/dashboard/data-sources" className={buttonClass("primary")}>
                  Upload a file to get started
                </Link>
              }
            >
              Processing history appears here as soon as Rivu checks or changes a file.
            </EmptyState>
          </CardBody>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>What ran</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>When</th>
                  <th>Detail</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row) => (
                  <tr key={row.job.id}>
                    <td className={s.strong}>{JOB_LABEL[row.job.type] || row.job.type}</td>
                    <td>{row.dataset.name}</td>
                    <td>
                      <Badge tone={tone(row.job.status)} dot>
                        {label(row.job.status)}
                      </Badge>
                    </td>
                    <td>
                      <span className={s.xs} style={{ color: "var(--muted)" }}>
                        {new Date(row.job.completed_at || row.job.queued_at || "").toLocaleString()}
                      </span>
                    </td>
                    <td>
                      {row.job.status === "failed" && row.job.error ? (
                        <span className={s.row} style={{ gap: 6, color: "#fca5a5", fontSize: 12 }}>
                          <AlertTriangle size={13} /> {row.job.error.slice(0, 60)}
                        </span>
                      ) : (
                        <span className={s.xs} style={{ color: "var(--muted)" }}>
                          {row.job.message || "—"}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/dashboard/dataset/${row.dataset.id}`} className={buttonClass("default", s.btnSm)}>
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionHead
          icon={Loader2}
          title="If something is waiting"
          sub="A job can stay in the waiting state briefly after a large upload. Refresh in a moment; if it stays there, open the file and try the action again."
        />
      </Card>
    </div>
  );
}