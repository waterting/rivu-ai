import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileText, HelpCircle, ArrowUpRight } from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Guides, documentation, articles and FAQs for the Rivu data refinery — how ingestion, profiling, AI-assisted refinement, validation and export work.",
};

const GROUPS = [
  {
    icon: BookOpen,
    title: "Documentation",
    links: [
      { label: "Platform overview", href: "/platform" },
      { label: "Data Refinery", href: "/platform/data-refinery" },
      { label: "Tools Centre", href: "/tools" },
      { label: "Integrations", href: "/integrations" },
    ],
  },
  {
    icon: FileText,
    title: "Guides",
    links: [
      { label: "Preparing supplier data", href: "/solutions/supplier-data" },
      { label: "Catalogue normalization", href: "/solutions/ecommerce" },
      { label: "Custom implementations", href: "/solutions/custom" },
    ],
  },
  {
    icon: HelpCircle,
    title: "Common questions",
    links: [
      { label: "Pricing & plans", href: "/pricing" },
      { label: "Security & governance", href: "/security" },
      { label: "Contact & demo", href: "/contact" },
    ],
  },
];

const FAQS = [
  { q: "Does Rivu change my raw data?", a: "No. Raw version 1 stays immutable. Every refinement creates a new dataset version you can inspect and compare." },
  { q: "Does AI apply changes on its own?", a: "No. AI proposes a transformation plan from measured facts. A human approves it, then deterministic code executes it." },
  { q: "What file formats can I bring in?", a: "CSV, XLSX, JSON, text-based PDFs where extraction is supported, and ZIP media packages where image processing is implemented. We clearly flag unsupported formats rather than pretending." },
  { q: "Is my data isolated?", a: "Yes. Tenant isolation is enforced on the backend through authenticated organization context, not just hidden in the UI." },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title={<>Learn how the <em>refinery works.</em></>}
        lead="Documentation, guides and answers — grounded in what Rivu actually does, not marketing claims."
      />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.featureGrid}>
            {GROUPS.map((g) => {
              const Icon = g.icon;
              return (
                <div key={g.title} className={`${styles.card} ${styles.featureCard}`}>
                  <div className={styles.iconBadge}><Icon /></div>
                  <h3 className={styles.featureTitle}>{g.title}</h3>
                  <ul className={styles.specList} style={{ marginTop: 14 }}>
                    {g.links.map((l) => (
                      <li key={l.label}>
                        <ArrowUpRight />
                        <Link href={l.href}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <SectionHead eyebrow="FAQ" title="Frequently asked." center />
          <div className={styles.faq}>
            {FAQS.map((f) => (
              <details key={f.q} className={styles.faqItem}>
                <summary>{f.q}<span style={{ color: "var(--violet)", fontSize: 22, lineHeight: 1 }}>+</span></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Ready to see it <em>on your data?</em></>}
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Book a Demo", href: "/contact" }}
      />
    </>
  );
}