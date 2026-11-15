import type { Metadata } from "next";
import Link from "next/link";
import {
  FileJson, Table2, Wand2, Sparkles, CopyCheck, FileCheck2,
  Boxes, Sparkle, ScanBarcode, Images, GitCompare, Download,
  Gauge, Workflow, ArrowRight, CheckCircle2,
} from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";

export const metadata: Metadata = {
  title: "Tools Centre",
  description:
    "Rivu Tools Centre: independent, genuinely functional data utilities — Format Studio, Data Profiler, Mapper, Cleaner, Duplicate Finder, Validator, Catalogue Normalizer, Enrichment, SKU Manager, Media Matcher, Data Compare, Bulk Exporter, Quality Report and Transformation Builder.",
};

type Tool = {
  id: string;
  num: string;
  name: string;
  icon: React.ElementType;
  cat: string;
  desc: string;
  inFmt: string;
  outFmt: string;
};

const CATEGORIES = [
  "Data Preparation", "Data Cleaning", "Data Transformation",
  "Data Quality", "E-commerce Catalogue", "AI Enrichment",
  "Data Export", "Integrations & Automation",
];

const TOOLS: Tool[] = [
  { id: "format-studio", num: "01", name: "Format Studio", icon: FileJson, cat: "Data Transformation", desc: "Convert any supported source dataset into your desired output format, with mapping and a custom-template option.", inFmt: "CSV · XLSX · JSON", outFmt: "CSV · XLSX · JSON" },
  { id: "profiler", num: "02", name: "Data Profiler", icon: Table2, cat: "Data Quality", desc: "Detect columns and types, count records, measure missing values and duplicates, and generate a profiling report.", inFmt: "CSV · XLSX · JSON", outFmt: "Report" },
  { id: "mapper", num: "03", name: "Smart Column Mapper", icon: Wand2, cat: "Data Transformation", desc: "Source-to-target mapping with confidence-scored suggestions, manual override and type-compatibility checks.", inFmt: "Any dataset", outFmt: "Mapping spec" },
  { id: "cleaner", num: "04", name: "Data Cleaner", icon: Sparkles, cat: "Data Cleaning", desc: "Trim, standardise text and casing, normalise dates and numbers, handle nulls and malformed records.", inFmt: "CSV · XLSX · JSON", outFmt: "Cleaned dataset" },
  { id: "duplicate-finder", num: "05", name: "Duplicate Finder", icon: CopyCheck, cat: "Data Cleaning", desc: "Exact and configurable matching-field duplicate detection, with review, retain and merge actions.", inFmt: "Any dataset", outFmt: "Review + output" },
  { id: "validator", num: "06", name: "Data Validator", icon: FileCheck2, cat: "Data Quality", desc: "Required-field, type, range and pattern rules with row-level errors, warnings and an exportable report.", inFmt: "Any dataset", outFmt: "Report + cleaned" },
  { id: "catalogue-normalizer", num: "07", name: "Catalogue Normalizer", icon: Boxes, cat: "E-commerce Catalogue", desc: "Standardise product names, categories, attributes, brands, units, SKUs and pricing fields.", inFmt: "CSV · XLSX", outFmt: "Cleaned catalogue" },
  { id: "enrichment", num: "08", name: "AI Product Enrichment", icon: Sparkle, cat: "AI Enrichment", desc: "Draft descriptions, attributes, SEO titles and tags grounded in source product data — reviewable and traceable.", inFmt: "Catalogue", outFmt: "Enriched catalogue" },
  { id: "sku-manager", num: "09", name: "SKU & Variant Manager", icon: ScanBarcode, cat: "E-commerce Catalogue", desc: "Create and edit SKUs, find duplicates, link parent-child variants and export structured product data.", inFmt: "CSV · XLSX", outFmt: "Structured export" },
  { id: "media-matcher", num: "10", name: "Media Matcher", icon: Images, cat: "E-commerce Catalogue", desc: "Match product images to products by SKU or exact filename, with manual correction and a media mapping report.", inFmt: "Image ZIP + data", outFmt: "Mapping report" },
  { id: "compare", num: "11", name: "Data Compare", icon: GitCompare, cat: "Data Quality", desc: "Compare two datasets for added, removed and modified records with field-level differences and a diff report.", inFmt: "Two datasets", outFmt: "Diff report" },
  { id: "bulk-exporter", num: "12", name: "Bulk Exporter", icon: Download, cat: "Data Export", desc: "Export full, filtered or selected data in your chosen format with saved templates and export history.", inFmt: "Dataset", outFmt: "CSV · XLSX · JSON" },
  { id: "quality-report", num: "13", name: "Data Quality Report", icon: Gauge, cat: "Data Quality", desc: "Configurable quality indicators — missing, duplicates, invalid fields — with a transparent, explained score.", inFmt: "Dataset", outFmt: "Report" },
  { id: "transformation-builder", num: "14", name: "Custom Transformation Builder", icon: Workflow, cat: "Data Transformation", desc: "Build reusable transformations: rename, reorder, type-change, combine, split and conditional rules.", inFmt: "Dataset", outFmt: "Transformed dataset" },
];

export default function ToolsPage() {
  return (
    <>
      <PageHero scene="mesh"
        eyebrow="Tools Centre"
        title={<>Independent tools. <em>One processing engine.</em></>}
        lead="Each tool has its own workspace, input controls, processing logic, results, history and export. These are working utilities inside the Rivu workspace — not decorative cards."
      >
        <Link href="/signup" className={`${styles.btn} ${styles.btnPrimary}`}>Open the Tools Centre <ArrowRight /></Link>
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Book a Demo</Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Categories"
            title="Eight categories, fourteen tools."
            lead="Every tool follows the same workflow: source selection → configuration → validation → preview → process → review → export."
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {CATEGORIES.map((c) => (
              <span key={c} className={styles.statusPill} style={{ background: "var(--lavender)", color: "var(--violet-deep)" }}>{c}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.toolGrid}>
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.id}
                  id={t.id}
                  href={`/signup?tool=${t.id}`}
                  className={`${styles.card} ${styles.cardHover} ${styles.toolCard}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <span className={styles.toolId}>TOOL {t.num}</span>
                  <div className={styles.iconBadge} style={{ marginTop: 14 }}><Icon /></div>
                  <h3 className={styles.featureTitle}>{t.name}</h3>
                  <p className={styles.featureDesc}>{t.desc}</p>
                  <div className={styles.toolMeta}>
                    <span>in: {t.inFmt}</span>
                    <span>out: {t.outFmt}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Shared execution"
            title="Every run is traceable."
            lead="Each execution carries a unique job ID, input reference, configuration snapshot, status, logs, error detail, output reference, timestamp and user context."
            center
          />
          <div className={styles.featureGrid}>
            {[
              { icon: CheckCircle2, title: "Real input & output", desc: "Every tool takes real data and produces a real, downloadable result." },
              { icon: Workflow, title: "Background jobs", desc: "Large datasets run through background processing with chunking and retries." },
              { icon: Gauge, title: "Tested at scale", desc: "Built to be validated against realistic large datasets, not only tiny CSVs." },
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
        title={<>Put the tools to work <em>on real data.</em></>}
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Talk to our team", href: "/contact" }}
      />
    </>
  );
}