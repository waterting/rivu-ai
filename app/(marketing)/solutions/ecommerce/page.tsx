import type { Metadata } from "next";
import Link from "next/link";
import {
  ShoppingCart, ArrowRight, CheckCircle2, FileJson, Store,
} from "lucide-react";
import styles from "../../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../../ui";

export const metadata: Metadata = {
  title: "E-commerce & retail solutions",
  description:
    "Turn inconsistent supplier spreadsheets into a defined, validated product catalogue and a Shopify- or WooCommerce-ready export.",
};

const STEPS = [
  { t: "Ingest the catalogue", d: "Bring supplier CSVs, XLSX and JSON product exports into the workspace." },
  { t: "Map to a product schema", d: "Align source columns to a product template — title, price, SKU, variants, media." },
  { t: "Normalise attributes", d: "Standardise names, categories, brands, units and pricing fields." },
  { t: "Validate SKUs and pricing", d: "Catch duplicate SKUs, missing attributes and invalid price fields." },
  { t: "Export for your platform", d: "Produce a Shopify- or WooCommerce-compatible file, reviewed before it leaves Rivu." },
];

const TOOLS = [
  { name: "Catalogue Normalizer", href: "/tools#catalogue-normalizer" },
  { name: "SKU & Variant Manager", href: "/tools#sku-manager" },
  { name: "AI Product Enrichment", href: "/tools#enrichment" },
  { name: "Format Studio", href: "/tools#format-studio" },
  { name: "Media Matcher", href: "/tools#media-matcher" },
  { name: "Data Validator", href: "/tools#validator" },
];

export default function EcommercePage() {
  return (
    <>
      <PageHero
        eyebrow="E-commerce & retail"
        title={<>Product data that is <em>consistent, validated and export-ready.</em></>}
        lead="Map supplier spreadsheets into a defined catalogue structure, flag missing fields and prepare a validated export for Shopify or WooCommerce."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Discuss your catalogue <ArrowRight /></Link>
        <Link href="/tools" className={`${styles.btn} ${styles.btnGhost}`}>Explore catalogue tools</Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div>
              <span className={styles.eyebrow}>The problem</span>
              <h2 className={styles.display} style={{ fontSize: "clamp(26px,3.2vw,38px)", margin: "16px 0 0" }}>
                Catalogues arrive inconsistent across every supplier and channel.
              </h2>
              <p className={styles.lead} style={{ marginTop: 18 }}>
                Names drift, SKUs collide, prices are formatted differently and required
                attributes go missing. Rivu gives that variation a defined, reviewable path
                to a clean output.
              </p>
            </div>
            <div className={styles.splitArt}>
              <div className={styles.splitStat}><b>SKU</b><span>duplicates surfaced for review, not auto-deleted</span></div>
              <div className={styles.splitStat}><b>Price</b><span>decimal and currency fields normalised</span></div>
              <div className={styles.splitStat}><b>Media</b><span>images matched to products by SKU or filename</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionLav}`}>
        <div className={styles.container}>
          <SectionHead eyebrow="The workflow" title="From supplier sheet to platform-ready file." />
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
          <SectionHead eyebrow="Tools involved" title="Catalogue-ready utilities." />
          <div className={styles.featureGrid}>
            {TOOLS.map((t) => (
              <Link key={t.name} href={t.href} className={`${styles.card} ${styles.cardHover} ${styles.featureCard}`}>
                <div className={styles.iconBadge}><CheckCircle2 /></div>
                <h3 className={styles.featureTitle}>{t.name}</h3>
                <p className={styles.featureDesc}>Open the tool in the Rivu tools centre.</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Prepare a catalogue <em>you can trust.</em></>}
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Book a Demo", href: "/contact" }}
      />
    </>
  );
}