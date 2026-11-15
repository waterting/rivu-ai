"use client";
import Link from "next/link";
import { Brain, ShieldCheck, AlertTriangle, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";

export default function IntelligencePage() {
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / AI BUSINESS INTELLIGENCE</div><h1>AI Business Intelligence</h1><p>Evidence-based answers over your uploaded, profiled datasets. Recommendations require data, show assumptions/uncertainty, and need human approval for consequential actions.</p></div></header>
      <section className={styles.sectionBlock}>
        <h2>What you can answer (with data)</h2>
        <div className={styles.grid2} style={{marginTop:16}}>
          {[
            ["What sold & how much?","Computed from uploaded sales records (quantity, date, SKU)."],
            ["Top revenue / margin products","Requires sales + cost/price fields; margins shown with the formula used."],
            ["Slow-moving / restock","Derived from sales velocity vs stock on hand and lead times when provided."],
            ["Demand & stockout risk","Trend/forecast shown with assumptions and uncertainty; not a guarantee."],
          ].map(([t,d])=>(<div key={t} className={styles.card}><h3>{t}</h3><p>{d}</p></div>))}
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>How it works (no fabricated insights)</h2>
        <div className={styles.grid3} style={{marginTop:16}}>
          <div className={styles.card}><Brain size={18}/><h3 style={{marginTop:8}}>Grounded in your data</h3><p>AI (Groq) reasons over measured dataset facts/profiles and your selected records. If required fields are missing, Rivu states what’s missing instead of guessing.</p></div>
          <div className={styles.card}><ShieldCheck size={18}/><h3 style={{marginTop:8}}>Evidence & uncertainty</h3><p>Every answer cites the dataset/version, columns used, calculations, assumptions and uncertainty. No invented numbers.</p></div>
          <div className={styles.card}><AlertTriangle size={18}/><h3 style={{marginTop:8}}>Human approval</h3><p>Purchase/restock or other consequential actions are recommendations only and require explicit human approval before execution.</p></div>
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <h2>Get started</h2>
        <p>Upload sales, inventory, purchase and catalogue data in Data Sources, refine/map it, then run intelligence from a dataset’s report view (AI assessment is generated from measured facts). AI features require a configured GROQ_API_KEY; otherwise Rivu shows measured metrics and states AI is unavailable.</p>
        <div style={{marginTop:14,display:"flex",gap:10}}>
          <Link href="/dashboard" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Open datasets <ArrowUpRight size={14}/></Link>
          <Link href="/dashboard/analytics" className={styles.iconBtn} style={{textDecoration:"none",display:"inline-flex"}}>View analytics</Link>
        </div>
      </section>
    </div>
  );
}