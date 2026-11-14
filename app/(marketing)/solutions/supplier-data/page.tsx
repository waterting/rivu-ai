import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Truck, FileSpreadsheet, GitCompare, CheckCircle2 } from "lucide-react";
import styles from "../../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../../ui";

export const metadata: Metadata = {
  title: "Supplier data solutions",
  description:
    "Reconcile inconsistent supplier and operational sheets: assess column differences, normalise formats and define quality rules before consolidating exports.",
};

const STEPS = [
  { t: "Collect supplier sheets", d: "Bring in CSVs and XLSX from multiple suppliers — each with its own columns and conventions." },
  { t: "Profile and compare", d: "Rivu profiles each file and surfaces column and value differences across sources." },
  { t: "Map to one schema", d: "Align every supplier's fields to a shared target schema with confidence-scored suggestions." },
  { t: "Normalise formats", d: "Standardise dates, numbers, units and text so the combined data is consistent." },
  { t: "Consolidate and validate", d: "Merge into one validated dataset and export a clean, reviewable output." },
];

export default function SupplierDataPage() {
  return (
    <>
      <PageHero
        eyebrow="Supplier data management"
        title={<>Reconcile inconsistent supplier <em>and operational sheets.</em></>}
        lead="Assess column differences, normalise formats and define quality rules before consolidating operational exports into one usable dataset."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Discuss your data <ArrowRight /></Link>
        <Link href="/tools#compare" className={`${styles.btn} ${styles.btnGhost}`}>Try Data Compare</Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitArt}>
              <div className={styles.splitStat}><b>14</b><span>inconsistent supplier columns reconciled</span></div>
              <div className={styles.splitStat}><b>3</b><span>source files unified into one schema</span></div>
              <div className={styles.splitStat}><b>100%</b><span>of transformations reviewable before approval</span></div>
            </div>
            <div className={styles.splitReverse}>
              <span className={styles.eyebrow}>The problem</span>
              <h2 className={styles.display} style={{ fontSize: "clamp(26px,3.2vw,38px)", margin: "16px 0 0" }}>
                Every supplier names and shapes the same field differently.
              </h2>
              <p className={styles.lead} style={{ marginTop: 18 }}>
                One supplier&apos;s &ldquo;Item Name&rdquo; is another&apos;s &ldquo;Description&rdquo;. Prices arrive in
                different formats; dates and units drift. Rivu brings that movement a
                consistent refinement layer.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionLav}`}>
        <div className={styles.container}>
          <SectionHead eyebrow="The workflow" title="From many sheets to one trusted dataset." />
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <div key={s.t} className={styles.step}>
                <span className={styles.stepNum} />
                <div><h3>{s.t}</h3><p>{s.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead eyebrow="Tools involved" title="Reconciliation utilities." />
          <div className={styles.featureGrid}>
            {[
              { icon: FileSpreadsheet, name: "Data Profiler", href: "/tools#profiler" },
              { icon: GitCompare, name: "Data Compare", href: "/tools#compare" },
              { icon: Truck, name: "Smart Column Mapper", href: "/tools#mapper" },
              { icon: CheckCircle2, name: "Data Cleaner", href: "/tools#cleaner" },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.name} href={t.href} className={`${styles.card} ${styles.cardHover} ${styles.featureCard}`}>
                  <div className={styles.iconBadge}><Icon /></div>
                  <h3 className={styles.featureTitle}>{t.name}</h3>
                  <p className={styles.featureDesc}>Open the tool in the Rivu tools centre.</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Unify your supplier data <em>without the busywork.</em></>}
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Book a Demo", href: "/contact" }}
      />
    </>
  );
}