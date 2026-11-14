import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, Plug, Workflow } from "lucide-react";
import styles from "../../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../../ui";

export const metadata: Metadata = {
  title: "Custom implementations",
  description:
    "Scoped implementation services: catalogue migrations, integrations and bespoke data workflows built around your systems and target schema.",
};

const SERVICES = [
  { icon: Code2, title: "Bespoke workflows", desc: "Custom transformation and validation workflows built around your source and target systems." },
  { icon: Plug, title: "Integration work", desc: "Connect Rivu to Shopify, WooCommerce or your internal systems via the connector framework." },
  { icon: Workflow, title: "Catalogue migrations", desc: "Plan and execute a structured migration of an existing catalogue into a clean, validated format." },
];

export default function CustomPage() {
  return (
    <>
      <PageHero
        eyebrow="Custom implementations"
        title={<>Scoped to <em>your systems.</em></>}
        lead="When your data shape, source systems or target schema don't fit a standard workflow, we scope a custom implementation with you."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Scope a project <ArrowRight /></Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="What we scope"
            title="Implementation, defined before it starts."
            lead="We assess your data shape, target schema and workflow requirements before proposing anything — and we don't invent outcomes."
          />
          <div className={styles.featureGrid}>
            {SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className={`${styles.card} ${styles.featureCard}`}>
                  <div className={styles.iconBadge}><Icon /></div>
                  <h3 className={styles.featureTitle}>{s.title}</h3>
                  <p className={styles.featureDesc}>{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.prose} style={{ maxWidth: 760 }}>
            <SectionHead eyebrow="How it works" title="A defined path, not an open-ended promise." />
            <ul className={styles.specList} style={{ marginTop: 8 }}>
              <li><CheckCircle2 />We review your source files and the systems you export from.</li>
              <li><CheckCircle2 />We define the target schema and the validation rules that matter to you.</li>
              <li><CheckCircle2 />We agree scope, deliverables and what is explicitly out of scope.</li>
              <li><CheckCircle2 />Every transformation stays reviewable and traceable inside Rivu.</li>
            </ul>
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Have a use case that <em>doesn&apos;t fit a template?</em></>}
        lead="Tell us about your data shape and we'll assess the workflow before proposing an implementation."
        primary={{ label: "Talk to our team", href: "/contact" }}
        secondary={{ label: "Explore the platform", href: "/platform" }}
      />
    </>
  );
}