"use client";
import Link from "next/link";
import { Wand2, ShieldCheck, GitBranch, Download, ArrowUpRight, Sparkles } from "lucide-react";
import styles from "../dashboard.module.css";

export default function RefineryPage() {
  const steps = [
    {t:"1. Ingest",d:"Upload CSV/XLSX/XLS/JSON/Parquet. Encoding and schema detected."},
    {t:"2. Profile",d:"Structural & statistical profiling: rows, columns, nulls, duplicates, types."},
    {t:"3. Quality",d:"Weighted completeness/validity/consistency/uniqueness/integrity scoring + issues."},
    {t:"4. AI Plan",d:"Groq generates an allowlisted transformation plan (validated). Human approves."},
    {t:"5. Transform",d:"Deterministic Polars ops: preview → approve → execute → new immutable version."},
    {t:"6. Export",d:"Download CSV/XLSX/JSON/Parquet of the refined version."},
  ];
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / DATA REFINERY</div><h1>Data Refinery</h1><p>Profile, clean, validate, normalize and transform data with human-approved, deterministic operations and version history.</p></div></header>
      <section className={styles.sectionBlock}>
        <h2>Refinery workflow</h2>
        <div className={styles.grid3} style={{marginTop:16}}>
          {steps.map(s=>(<div key={s.t} className={styles.card}><h3>{s.t}</h3><p>{s.d}</p></div>))}
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>Capabilities</h2>
        <div className={styles.grid2} style={{marginTop:16}}>
          <div className={styles.card}><Wand2 size={18}/><h3 style={{marginTop:8}}>Cleaning & normalization</h3><p>23 deterministic ops: trim, case, date/datetime, numeric/boolean/currency/phone/email, fill/drop nulls, duplicates, outliers, replace, regex, clip, rename/drop column.</p></div>
          <div className={styles.card}><ShieldCheck size={18}/><h3 style={{marginTop:8}}>Validation & quality</h3><p>Issue findings with severity, affected columns/rows, and suggested fixes. Quality dimensions scored from measured facts.</p></div>
          <div className={styles.card}><Sparkles size={18}/><h3 style={{marginTop:8}}>AI-assisted planning</h3><p>Groq proposes a validated, allowlisted plan. AI never executes — deterministic engine applies after human approval.</p></div>
          <div className={styles.card}><GitBranch size={18}/><h3 style={{marginTop:8}}>Preview & version history</h3><p>Preview before apply. Every execution produces a new immutable dataset version; history preserved.</p></div>
        </div>
        <div style={{marginTop:18,display:"flex",gap:10}}>
          <Link href="/dashboard" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Open a dataset <ArrowUpRight size={14}/></Link>
          <Link href="/dashboard/dataset" className={styles.iconBtn} style={{textDecoration:"none",display:"inline-flex"}}><Download size={14}/> Export from dataset view</Link>
        </div>
      </section>
    </div>
  );
}