import type { Metadata } from "next";
import Link from "next/link";
import {
  UploadCloud, ScanLine, Wand2, Sparkles, ShieldCheck,
  FileSearch, GitBranch, Download, ArrowRight, CheckCircle2,
} from "lucide-react";
import styles from "../../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../../ui";

export const metadata: Metadata = {
  title: "Data Refinery",
  description:
    "The Rivu Data Refinery: ingest raw files, profile them, get an AI-assisted transformation plan, approve, execute deterministically, re-profile and export a versioned output.",
};

const FLOW = [
  { icon: UploadCloud, title: "Ingest", desc: "Upload a source file into your isolated workspace. Raw version 1 is stored immutably." },
  { icon: ScanLine, title: "Profile", desc: "Rows, columns, types, nulls, duplicates and distributions are measured." },
  { icon: ShieldCheck, title: "Score quality", desc: "Data health is measured across completeness, validity, consistency, uniqueness and integrity." },
  { icon: Wand2, title: "AI refinery plan", desc: "AI proposes a structured transformation plan grounded in measured dataset facts." },
  { icon: FileSearch, title: "Review", desc: "You inspect each operation and preview the change before approving anything." },
  { icon: Sparkles, title: "Deterministic transform", desc: "Approved operations run through the cleaning engine — no black-box mutation." },
  { icon: GitBranch, title: "Re-profile & version", desc: "The refined dataset is measured again and saved as a new, traceable version." },
  { icon: Download, title: "Export", desc: "Download the refined dataset and reports in the format you need." },
];

export default function DataRefineryPage() {
  return (
    <>
      <PageHero
        eyebrow="Core engine"
        title={<>The Data <em>Refinery.</em></>}
        lead="A structured, controlled pipeline that turns raw operational files into clean, validated, explainable and analysis-ready data — with an AI-assisted layer that keeps humans in control."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Book a Demo <ArrowRight /></Link>
        <Link href="/platform" className={`${styles.btn} ${styles.btnGhost}`}>Back to platform</Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="The pipeline"
            title="Upload → Understand → Detect → Approve → Refine → Measure → Export."
            lead="Every stage is visible, every change is reviewable, and the raw source is never rewritten."
          />
          <div className={styles.steps}>
            {FLOW.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className={styles.step}>
                  <span className={styles.stepNum} />
                  <div>
                    <h3><Icon size={20} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--violet)" }} />{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Why it matters"
            title="A green UI is not proof of a green data pipeline."
            lead="Rivu treats production readiness as a gate, not a screenshot. The refinery is built so that what you approve is exactly what runs."
          />
          <div className={styles.featureGrid}>
            {[
              { icon: ShieldCheck, title: "Immutable raw source", desc: "Version 1 stays untouched. Every refinement creates a new version." },
              { icon: FileSearch, title: "Explainable operations", desc: "Each operation states what it will do and shows a preview before approval." },
              { icon: GitBranch, title: "Full lineage", desc: "Source, template, mapping, operations, validator, user and timestamp are recorded." },
              { icon: CheckCircle2, title: "Validation before delivery", desc: "Outputs are validated before they become available for export." },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className={`${styles.card} ${styles.featureCard}`}>
                  <div className={styles.iconBadge}><Icon /></div>
                  <h3 className={styles.featureTitle}>{f.title}</h3>
                  <p className={styles.featureDesc}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Run the refinery on <em>your messy data.</em></>}
        lead="See measured quality, an AI plan you approve, and a versioned export."
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Talk to our team", href: "/contact" }}
      />
    </>
  );
}