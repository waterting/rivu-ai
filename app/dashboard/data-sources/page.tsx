"use client";
import Link from "next/link";
import { UploadCloud, Database, Sparkles, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";

export default function DataSourcesPage() {
  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA SOURCES</div>
          <h1>Data Sources</h1>
          <p>Ingest CSV, XLSX, XLS, JSON and Parquet into projects. Every upload is profiled, validated and versioned.</p>
        </div>
      </header>
      <section className={styles.sectionBlock}>
        <h2>Supported ingestion</h2>
        <p>Real parsing via the Rivu ingestion engine (encoding + delimiter detection, schema inference). Uploads are stored and queued for profiling/quality.</p>
        <div className={styles.grid4} style={{marginTop:16}}>
          {["CSV","XLSX","XLS","JSON","Parquet"].map(f=>(<div key={f} className={styles.card}><h3>{f}</h3><p>Upload, parse, profile and refine.</p></div>))}
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>How to ingest</h2>
        <div className={styles.grid3} style={{marginTop:16}}>
          <div className={styles.card}><UploadCloud size={18}/><h3 style={{marginTop:8}}>1. Create/select a project</h3><p>Datasets live inside projects in the Overview.</p></div>
          <div className={styles.card}><Database size={18}/><h3 style={{marginTop:8}}>2. Upload a file</h3><p>Use Overview &rarr; Upload data. Profiling runs inline or via the worker.</p></div>
          <div className={styles.card}><Sparkles size={18}/><h3 style={{marginTop:8}}>3. Inspect & refine</h3><p>Open the dataset to profile, validate, transform and export.</p></div>
        </div>
        <div style={{marginTop:18,display:"flex",gap:10}}>
          <Link href="/dashboard" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Go to Overview <ArrowUpRight size={14}/></Link>
          <Link href="/dashboard/refinery" className={styles.iconBtn} style={{textDecoration:"none",display:"inline-flex"}}>Open Data Refinery</Link>
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>Data source status</h2>
        <p>Connected sources are managed per project. Ingestion status is tracked per dataset version (uploaded &rarr; profiling &rarr; ready/transformed).</p>
      </section>
    </div>
  );
}