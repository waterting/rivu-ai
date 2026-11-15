"use client";
import Link from "next/link";
import { FileText, Download, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";

export default function ReportsPage() {
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / REPORTS</div><h1>Reports</h1><p>Measured, versioned reports per dataset — JSON, dashboard, PDF and executive PDF. AI summaries are grounded in real profile/quality facts (Groq when configured, with a factual fallback).</p></div></header>
      <section className={styles.sectionBlock}>
        <h2>Available report types</h2>
        <div className={styles.grid2} style={{marginTop:16}}>
          <div className={styles.card}><FileText size={18}/><h3 style={{marginTop:8}}>Dashboard report</h3><p>Live intelligence view: profile, quality dimensions, issues, AI assessment and refinement impact.</p></div>
          <div className={styles.card}><Download size={18}/><h3 style={{marginTop:8}}>PDF / Executive PDF</h3><p>Downloadable branded reports generated from measured metrics and (when available) AI narrative.</p></div>
          <div className={styles.card}><FileText size={18}/><h3 style={{marginTop:8}}>JSON report</h3><p>Machine-readable report payload for integrations and automation.</p></div>
          <div className={styles.card}><FileText size={18}/><h3 style={{marginTop:8}}>Data Quality Report</h3><p>Completeness, validity, consistency, uniqueness, integrity with row/column-level issues.</p></div>
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>Generate a report</h2>
        <p>Reports are generated per dataset from its current version. Open a dataset to view or download its reports.</p>
        <div style={{marginTop:14}}><Link href="/dashboard" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Go to datasets <ArrowUpRight size={14}/></Link></div>
      </section>
    </div>
  );
}