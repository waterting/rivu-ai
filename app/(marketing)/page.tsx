import Link from "next/link";
import {
  ArrowRight, ArrowRightCircle, CheckCircle2, FileSpreadsheet,
  FileText, Braces, Server, Sparkles, ShieldCheck, UploadCloud,
} from "lucide-react";
import styles from "./marketing.module.css";
import { SectionHead, CTAPanel } from "./ui";
import { PLATFORM_CARDS } from "./nav-config";
import Scene3DMount from "../../lib/three/Scene3DMount";

const WORKFLOW = ["Raw files", "Rivu refinery", "Clean data", "Business-ready"];

const PROBLEMS = [
  { icon: FileSpreadsheet, tag: "CSV / XLSX", title: "Supplier & operational sheets", desc: "Inconsistent columns, merged cells and drifting formats across every export." },
  { icon: FileText, tag: "PDF / Docs", title: "Trapped in reports", desc: "Information locked inside documents and reports that systems can't read." },
  { icon: Server, tag: "CRM / ERP", title: "Inconsistent schemas", desc: "Every system export names and shapes the same field differently." },
  { icon: Braces, tag: "JSON / APIs", title: "Nested & irregular", desc: "Structured but messy — nested objects and unpredictable payloads." },
];

const JOURNEY = ["Clean", "Map", "Reconcile", "Validate", "Transform"];

const DEMO = {
  upload: { name: "supplier_products.csv", meta: "8,240 rows · 14 columns · 2 sheets" },
  map: [
    ["source_column", "target_field", "confidence"],
    ["Item Name", "title", "98%"],
    ["MRP", "price", "91%"],
    ["manuf_code", "sku", "94%"],
  ],
  quality: [
    ["issue", "rows", "severity"],
    ["Missing price", "212", "error"],
    ["Duplicate SKU", "37", "warn"],
    ["Invalid email", "9", "error"],
  ],
};

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className={styles.hero}>
        <Scene3DMount kind="hero" className={styles.heroScene} />
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.eyebrow}>AI-native data refinery</span>
              <h1 className={styles.heroTitle}>
                Make business data ready for <em>what comes next.</em>
              </h1>
              <p className={`${styles.lead} ${styles.heroLead}`}>
                Rivu transforms fragmented, messy and unstructured business data
                into clean, structured and usable datasets — with humans in control
                of every change.
              </p>
              <div className={styles.heroActions}>
                <Link href="/platform" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Explore Rivu <ArrowRight />
                </Link>
                <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Book a Demo
                </Link>
              </div>
              <div className={styles.heroPoints}>
                <span className={styles.heroPoint}><CheckCircle2 /> Less repetitive data preparation</span>
                <span className={styles.heroPoint}><CheckCircle2 /> Reusable mappings and templates</span>
                <span className={styles.heroPoint}><CheckCircle2 /> Reviewable transformations, human approval</span>
              </div>
            </div>

            {/* floating glass workflow card over the 3D scene */}
            <div className={styles.flow}>
              <div className={styles.flowHead}>
                <b>Rivu refinery workflow</b>
                <span>Live pipeline</span>
              </div>
              {WORKFLOW.map((stage, i) => (
                <div key={stage}>
                  <div className={`${styles.flowNode} ${i === 1 ? styles.refine : ""}`}>
                    <small>Stage 0{i + 1}</small>
                    <b>{stage}</b>
                  </div>
                  {i < WORKFLOW.length - 1 && (
                    <div className={styles.flowStage} style={{ justifyContent: "center", padding: "6px 0" }}>
                      <span className={styles.flowArrow}><ArrowRight /></span>
                    </div>
                  )}
                </div>
              ))}
              <div className={styles.flowFoot}>
                <span className={styles.dot} />
                AI recommends · deterministic code executes · every version preserved
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* format strip */}
      <div className={styles.strip}>
        <div className={`${styles.container} ${styles.stripInner}`}>
          <span>CSV</span><span>XLSX</span><span>JSON</span>
          <span>DATABASE EXPORTS</span><span>API DATA</span>
          <span>ANALYTICS-READY</span>
        </div>
      </div>

      {/* PROBLEM */}
      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="The problem"
            title={<>The messy middle is <em style={{ fontStyle: "normal", color: "var(--violet)" }}>where data work stalls.</em></>}
            lead="Business data rarely arrives ready for analysis. Rivu creates a controlled path from uncertainty to usable intelligence — across every source you rely on."
          />
          <div className={styles.problemGrid}>
            {PROBLEMS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.tag} className={`${styles.card} ${styles.problemCard}`}>
                  <span className={styles.problemTag}>{p.tag}</span>
                  <div className={styles.iconBadge} style={{ marginBottom: 14 }}><Icon /></div>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              );
            })}
          </div>
          <div className={styles.journey} aria-label="Operational journey">
            {JOURNEY.map((step, i) => (
              <div key={step} style={{ display: "contents" }}>
                <span className={styles.journeyStep}><b>{i + 1}</b>{step}</span>
                {i < JOURNEY.length - 1 && (
                  <span className={styles.journeyArrow}><ArrowRight /></span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM */}
      <section className={`${styles.section} ${styles.sectionLav}`} id="platform">
        <div className={styles.container}>
          <SectionHead
            eyebrow="The Rivu platform"
            title="One refinery. Every layer of preparation."
            lead="From ingestion to export, Rivu covers the full data-preparation lifecycle as a connected set of capabilities — not disconnected scripts."
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

      {/* 3D SIGNATURE SHOWCASE */}
      <section className={styles.showcase3d}>
        <Scene3DMount kind="mesh" className={styles.showcaseScene} camera={{ position: [2.4, 0, 7.5], fov: 46 }} />
        <div className={styles.container}>
          <div className={styles.showcaseCopy}>
            <span className={styles.eyebrow}>The refinery engine</span>
            <h2>Measured. Approved. <em>Versioned.</em></h2>
            <p>
              Every transformation is grounded in measured dataset facts, approved by a
              human, executed deterministically, and preserved as a new version. No black
              boxes, no silent mutation.
            </p>
          </div>
        </div>
      </section>

      {/* PRODUCT DEMO */}
      <section className={styles.section} id="demo">
        <div className={styles.container}>
          <SectionHead
            eyebrow="Product demonstration"
            title="See the workflow, not just the promise."
            lead="A representative view of the refinery: upload, column mapping, quality report and transformation — the same building blocks used in the workspace."
          />
          <div className={styles.demoGrid}>
            <div className={`${styles.card} ${styles.demoCard}`}>
              <div className={styles.demoCardHead}>
                <i /><i /><i />
                <b><UploadCloud size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Upload preview</b>
              </div>
              <div className={styles.demoCardBody}>
                <div className={`${styles.demoRow} ${styles.header}`}><span>file</span><span>detail</span><span>status</span></div>
                <div className={styles.demoRow}><span>{DEMO.upload.name}</span><span>{DEMO.upload.meta}</span><span><span className={`${styles.demoBadge} ${styles.ok}`}>Ready</span></span></div>
                <div className={styles.demoRow}><span>categories.json</span><span>312 rows · nested</span><span><span className={`${styles.demoBadge} ${styles.ok}`}>Ready</span></span></div>
                <div className={styles.demoRow}><span>legacy_export.xls</span><span>1,904 rows · 22 cols</span><span><span className={`${styles.demoBadge} ${styles.warn}`}>Review</span></span></div>
              </div>
            </div>

            <div className={`${styles.card} ${styles.demoCard}`}>
              <div className={styles.demoCardHead}>
                <i /><i /><i />
                <b><Sparkles size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Column mapping</b>
              </div>
              <div className={styles.demoCardBody}>
                <div className={`${styles.demoRow} ${styles.header}`}><span>source</span><span>target</span><span>conf.</span></div>
                {DEMO.map.map((r) => (
                  <div key={r[0]} className={styles.demoRow}><span>{r[0]}</span><span>{r[1]}</span><span>{r[2]}</span></div>
                ))}
              </div>
            </div>

            <div className={`${styles.card} ${styles.demoCard}`}>
              <div className={styles.demoCardHead}>
                <i /><i /><i />
                <b><ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Data-quality report</b>
              </div>
              <div className={styles.demoCardBody}>
                <div className={`${styles.demoRow} ${styles.header}`}><span>issue</span><span>rows</span><span>severity</span></div>
                {DEMO.quality.map((r) => (
                  <div key={r[0]} className={styles.demoRow}>
                    <span>{r[0]}</span><span>{r[1]}</span>
                    <span>
                      <span className={`${styles.demoBadge} ${r[2] === "error" ? styles.err : styles.warn}`}>{r[2]}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${styles.card} ${styles.demoCard}`}>
              <div className={styles.demoCardHead}>
                <i /><i /><i />
                <b>Product catalogue → export</b>
              </div>
              <div className={styles.demoCardBody}>
                <div className={`${styles.demoRow} ${styles.header}`}><span>field</span><span>rule</span><span>output</span></div>
                <div className={styles.demoRow}><span>title</span><span>trim + case</span><span>Shopify</span></div>
                <div className={styles.demoRow}><span>price</span><span>decimal normalise</span><span>WooCommerce</span></div>
                <div className={styles.demoRow}><span>sku</span><span>uppercase</span><span>CSV / JSON</span></div>
                <div className={styles.demoRow}><span>body_html</span><span>draft description</span><span>reviewable</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTIONS */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="solutions">
        <div className={styles.container}>
          <SectionHead
            eyebrow="Solutions"
            title="Built around real operational data."
            lead="Rivu adapts to the shape of your data and the systems you already run."
          />
          <div className={styles.split}>
            <div>
              <span className={styles.eyebrow}>E-commerce & retail</span>
              <h2 className={styles.display} style={{ fontSize: "clamp(28px,3.4vw,42px)", margin: "16px 0 0" }}>
                Product data that is consistent, validated and export-ready.
              </h2>
              <p className={styles.lead} style={{ marginTop: 18 }}>
                Map supplier spreadsheets into a defined catalogue structure, flag
                missing fields and prepare a validated export for Shopify or WooCommerce.
              </p>
              <div style={{ marginTop: 26 }}>
                <Link href="/solutions/ecommerce" className={`${styles.btn} ${styles.btnGhost}`}>
                  E-commerce solutions <ArrowRight />
                </Link>
              </div>
            </div>
            <div className={styles.splitArt}>
              <div className={styles.splitStat}><b>8,240</b><span>product rows processed in a single catalogue run</span></div>
              <div className={styles.splitStat}><b>37</b><span>duplicate SKUs surfaced for review</span></div>
              <div className={styles.splitStat}><b>1</b><span>validated, versioned export produced</span></div>
            </div>
          </div>

          <div className={styles.split} style={{ marginTop: 72 }}>
            <div className={`${styles.splitArt} ${styles.splitReverse}`}>
              <div className={styles.splitStat}><b>14</b><span>inconsistent supplier columns reconciled</span></div>
              <div className={styles.splitStat}><b>3</b><span>source files unified into one schema</span></div>
              <div className={styles.splitStat}><b>100%</b><span>of transformations reviewable before approval</span></div>
            </div>
            <div className={styles.splitReverse}>
              <span className={styles.eyebrow}>Supplier data management</span>
              <h2 className={styles.display} style={{ fontSize: "clamp(28px,3.4vw,42px)", margin: "16px 0 0" }}>
                Reconcile inconsistent supplier and operational sheets.
              </h2>
              <p className={styles.lead} style={{ marginTop: 18 }}>
                Assess column differences, normalise formats and define quality
                rules before consolidating operational exports.
              </p>
              <div style={{ marginTop: 26 }}>
                <Link href="/solutions/supplier-data" className={`${styles.btn} ${styles.btnGhost}`}>
                  Supplier data solutions <ArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY RIVU */}
      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Why Rivu"
            title="Controlled data movement, by design."
            lead="No silent mutations, no black boxes. Rivu keeps a human in control of every change while removing the repetitive work."
          />
          <div className={styles.featureGrid}>
            {[
              { icon: Sparkles, title: "Less repetitive preparation", desc: "Reusable mappings and templates mean you prepare a shape once and reuse it." },
              { icon: ShieldCheck, title: "Visible data exceptions", desc: "Errors, warnings and missing values are surfaced, never hidden." },
              { icon: CheckCircle2, title: "Reviewable transformations", desc: "Inspect operations and preview changes before they are applied." },
              { icon: ArrowRightCircle, title: "Consistent output formats", desc: "Every export follows the same validated, versioned structure." },
              { icon: ShieldCheck, title: "Human-controlled approval", desc: "AI recommends; deterministic code executes only after approval." },
              { icon: ArrowRight, title: "Repeatable workflows", desc: "The same process produces the same trustworthy result, every run." },
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
        title={<>Your business data deserves to be <em>ready for action.</em></>}
        lead="Start with the refinery, or talk to our team about your data shape and target systems."
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Talk to our team", href: "/contact" }}
      />
    </>
  );
}