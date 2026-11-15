"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Workflow } from "lucide-react";
import styles from "../dashboard.module.css";

export default function WorkflowsPage() {
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / WORKFLOWS & AUTOMATION</div><h1>Workflows & Automation</h1><p>Processing jobs, run history and automation built on the real DB-backed job queue (Job/JobLog). No fabricated run data.</p></div></header>
      <section className={styles.sectionBlock}>
        <h2>Job pipeline</h2>
        <p>Dataset uploads enqueue profile/quality jobs. With INLINE_PROCESSING enabled (default) jobs run in the API process; with a deployed worker they run via the DB-backed runner. Job status is tracked per dataset (see dataset &rarr; Jobs/Intelligence views).</p>
        <div className={styles.grid3} style={{marginTop:16}}>
          <div className={styles.card}><h3>Ingestion → Profiling</h3><p>Upload creates a queued profile job; processor parses, profiles and scores quality.</p></div>
          <div className={styles.card}><h3>Transformation runs</h3><p>Approved plans execute deterministically and produce new immutable versions (TransformationRun records).</p></div>
          <div className={styles.card}><h3>Channel sync</h3><p>Publish actions sync products to connected channels and record usage/sync results.</p></div>
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>Automation & approvals</h2>
        <p>Consequential actions (publishing live, applying transforms, AI-driven recommendations) require explicit human approval. Automated chains beyond the job queue require a configured worker/scheduler; if not running, status is shown honestly (queued/blocked) rather than faked.</p>
      </section>
    </div>
  );
}