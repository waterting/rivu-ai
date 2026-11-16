"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, ServerOff } from "lucide-react";
import { authFetch } from "./api";

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type ProcessingStatus = {
  state: "queued" | "processing" | "completed" | "failed" | "stalled" | "unknown";
  stage: string;
  message: string | null;
  error: string | null;
  terminal: boolean;
  can_retry: boolean;
  progress_pct?: number;
  attempts?: number;
  max_attempts?: number;
  job_id?: string;
  reason?: string;
  worker?: {
    online: boolean;
    last_seen_at?: string | null;
    age_seconds?: number | null;
  };
  checked_at?: string;
};

const POLL_MS = 2000;

/** Real pipeline stages, so progress reflects what the worker actually does. */
const STAGES: { key: string; label: string; at: number }[] = [
  { key: "queued", label: "Queued", at: 0 },
  { key: "parsing", label: "Reading file", at: 5 },
  { key: "profiling", label: "Profiling columns", at: 20 },
  { key: "quality", label: "Scoring quality", at: 60 },
  { key: "complete", label: "Complete", at: 100 },
];

function stageIndex(stage: string): number {
  const found = STAGES.findIndex((s) => s.key === stage);
  return found < 0 ? 0 : found;
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * Polls the real processing status and renders it.
 *
 * Replaces an unconditional spinner: the previous behaviour treated "profile or
 * quality missing" as "still working" forever, so a failed job, or a queue with
 * no worker listening, produced the same infinite loading screen.
 *
 * Calls onReady once the job reaches a terminal success, and onFailure when it
 * reaches a terminal failure, so the parent can render the dataset or an error.
 */
export default function ProcessingStatusPanel({
  datasetId,
  onReady,
  onFailure,
}: {
  datasetId: string;
  onReady: () => void;
  onFailure: (message: string) => void;
}) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const response = await authFetch(`/datasets/${datasetId}/processing-status`, { headers: authHeaders() });
        if (cancelled) return;

        if (response.status === 401) {
          setLoadError("Your session has expired. Sign in again to see processing status.");
          setLoading(false);
          return;
        }
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          setLoadError(detail?.detail || "Could not read the processing status.");
          setLoading(false);
          return;
        }

        const data = (await response.json()) as ProcessingStatus;
        setStatus(data);
        setLoading(false);
        setLoadError("");

        if (data.terminal && !settled.current) {
          settled.current = true;
          if (data.state === "completed") onReady();
          else onFailure(data.error || data.message || "Processing did not complete.");
          return;
        }
        timer = window.setTimeout(poll, POLL_MS);
      } catch {
        if (cancelled) return;
        setLoadError("Could not reach the Rivu backend. Retrying automatically.");
        setLoading(false);
        timer = window.setTimeout(poll, POLL_MS * 2);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [datasetId, onReady, onFailure]);

  async function retry() {
    setRetrying(true);
    setRetryError("");
    try {
      const response = await authFetch(`/datasets/${datasetId}/retry-processing`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || "Could not retry this dataset.");
      }
      settled.current = false;
      setStatus(null);
      setLoading(true);
      // Restart polling by forcing the effect's dependency to change is not
      // possible here, so nudge the browser to re-run the flow.
      window.location.reload();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Could not retry this dataset.");
    } finally {
      setRetrying(false);
    }
  }

  const currentStage = stageIndex(status?.stage ?? "queued");
  const pct = status?.progress_pct ?? 0;

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        <Loader2 className="spin" />
        <h2>Checking your dataset…</h2>
        <p>Contacting Rivu for the latest processing state.</p>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="loading" role="alert">
        <AlertTriangle />
        <h2>Processing status unavailable</h2>
        <p>{loadError}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  if (!status) return null;

  const workerOffline = status.worker?.online === false;
  const isFailed = status.state === "failed";

  return (
    <div className="loading" role="status" aria-live="polite">
      {isFailed ? <AlertTriangle /> : status.state === "completed" ? <CheckCircle2 /> : status.reason === "no_worker" || status.reason === "worker_lost" ? <ServerOff /> : <Clock />}
      <h2>
        {isFailed
          ? "Processing failed"
          : status.state === "stalled"
            ? status.reason === "no_worker"
              ? "Waiting for a processing worker"
              : "The processing worker stopped responding"
            : status.state === "completed"
              ? "Dataset ready"
              : "Refining your dataset…"}
      </h2>

      <p>{status.message}</p>

      {status.error && <div className="error">{status.error}</div>}
      {retryError && <div className="error">{retryError}</div>}

      {/* Real stage rail, driven by the job's own progress, not a decorative timer. */}
      {!isFailed && (
        <div className="progressRail">
          <div className="progressTrack">
            <div className="progressFill" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
          <div className="progressStages">
            {STAGES.map((stage, index) => (
              <span key={stage.key} className={index <= currentStage ? "stageDone" : "stageTodo"}>
                {stage.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="statusMeta">
        <span>{pct}% complete</span>
        {typeof status.attempts === "number" && typeof status.max_attempts === "number" && (
          <span>
            Attempt {status.attempts} of {status.max_attempts}
          </span>
        )}
        {status.checked_at && <span>Updated {new Date(status.checked_at).toLocaleTimeString()}</span>}
        {workerOffline && status.state !== "completed" && (
          <span className="statusWarn">
            No worker heartbeat since {formatAge(status.worker?.age_seconds)}
          </span>
        )}
      </div>

      {status.can_retry && (
        <button onClick={retry} disabled={retrying}>
          {retrying ? "Retrying…" : "Retry processing"}
        </button>
      )}

      {workerOffline && !isFailed && (
        <p className="statusHint">
          A Rivu processing worker needs to be running for this job to continue. If you are deploying Rivu yourself,
          start the worker service described in the deployment docs.
        </p>
      )}
    </div>
  );
}