import type { Metadata } from "next";
import Link from "next/link";
import {
  Database, Table2, Wand2, Sparkles, FileCheck2, Workflow,
  FileJson, ArrowRight, CheckCircle2,
} from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";
import { PLATFORM_CARDS } from "../nav-config";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "The complete Rivu platform: ingestion, profiling, smart mapping, cleaning, validation, transformation, enrichment and export — one connected refinery.",
};

const STAGES = [
  { id: "ingestion", n: "01", icon: Database, title: "Ingestion & profiling", desc: "Bring CSVs, XLSX, JSON and operational exports into a tenant-isolated workspace. Rivu profiles schema, types, nulls, duplicates and distributions before anything changes.", points: ["CSV, XLSX, JSON, text-PDF, ZIP media", "Automatic schema & column detection", "Profile report with distributions and outliers"] },
  { id: "mapping", n: "02", icon: Wand2, title: "Smart, rule-based mapping", desc: "Rivu suggests column-to-target mappings by matching header synonyms and measured dataset facts, with a confidence score you can inspect. You can always override — uncertain mappings are never applied silently.", points: ["Confidence-scored suggestions", "Manual override on every field", "Type-compatibility checks before approval"] },
  { id: "quality", n: "03", icon: FileCheck2, title: "Cleaning & validation", desc: "Deterministic cleanup for nulls, duplicates, type and format normalisation, plus rule-based validation with row-level errors and warnings.", points: ["Trim, casing, date and number normalisation", "Required-field, range and pattern rules", "Error and warning separation per row"] },
  { id: "export", n: "04", icon: Workflow, title: "Transformation & export", desc: "Rename, reorder, combine, split and standardise fields with a visual preview. Every approved run produces a new, versioned output — never a silent rewrite.", points: ["Visual transformation builder", "Versioned, reviewable outputs", "CSV, XLSX, JSON and catalogue formats"] },
];

export default function PlatformPage() {
  return (
    <>
      <PageHero scene="hero"
        eyebrow="The platform"
        title={<>One refinery. <em>Every layer</em> of data preparation.</>}
        lead="Rivu covers the full data-preparation lifecycle as a connected set of capabilities — so your team stops stitching together disconnected scripts."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Book a Demo <ArrowRight /></Link>
        <Link href="/platform/data-refinery" className={`${styles.btn} ${styles.btnGhost}`}>Explore the Data Refinery</Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Capabilities"
            title="Nine capabilities, one workflow."
            lead="Each capability opens a real product area in the workspace — not a marketing card."
          />
          <div className={styles.featureGrid}>
            {PLATFORM_CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.label} href={c.href} className={`${styles.card} ${styles.cardHover} ${styles.featureCard}`}>
                  {Icon && <div className={styles.iconBadge}><Icon /></div>}
                  <h3 className={styles.featureTitle}>{c.label}</h3>
                  <p className={styles.featureDesc}>{c.desc}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionLav}`}>
        <div className={styles.container}>
          <SectionHead eyebrow="How it works" title="The refinery, stage by stage." />
          <div className={styles.steps}>
            {STAGES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} id={s.id} className={styles.step}>
                  <span className={styles.stepNum} />
                  <div>
                    <h3><Icon size={20} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--violet)" }} />{s.title}</h3>
                    <p>{s.desc}</p>
                    <ul className={styles.specList} style={{ marginTop: 14 }}>
                      {s.points.map((pt) => (
                        <li key={pt}><CheckCircle2 />{pt}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div>
              <span className={styles.eyebrow}>The core principle</span>
              <h2 className={styles.display} style={{ fontSize: "clamp(28px,3.4vw,42px)", margin: "16px 0 0" }}>
                AI recommends. Deterministic code executes. Versions preserve history.
              </h2>
              <p className={styles.lead} style={{ marginTop: 18 }}>
                Rivu never silently mutates an uploaded dataset. The AI layer proposes a
                transformation plan from measured facts; a human approves it; deterministic
                code runs it; and every run creates a new dataset version you can inspect.
              </p>
              <div style={{ marginTop: 26 }}>
                <Link href="/platform/data-refinery" className={`${styles.btn} ${styles.btnGhost}`}>
                  See the Data Refinery <ArrowRight />
                </Link>
              </div>
            </div>
            <div className={styles.splitArt}>
              <div className={styles.splitStat}><b>Measured</b><span>facts drive the plan, not guesses</span></div>
              <div className={styles.splitStat}><b>Approved</b><span>humans control every change</span></div>
              <div className={styles.splitStat}><b>Versioned</b><span>raw source stays immutable</span></div>
            </div>
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>See the refinery on <em>your data.</em></>}
        lead="Bring a real dataset and watch it move from raw to ready."
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Book a Demo", href: "/contact" }}
      />
    </>
  );
}