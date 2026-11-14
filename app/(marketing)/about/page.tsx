import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Target, ShieldCheck } from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";

export const metadata: Metadata = {
  title: "About",
  description:
    "Rivu AI is a data refinery built by WaterTing — an AI-native platform that turns fragmented, messy business data into clean, usable datasets, with humans in control.",
};

const VALUES = [
  { icon: Target, title: "Clarity over hype", desc: "We describe what the product does, not what it might one day do. No invented metrics, no fabricated outcomes." },
  { icon: ShieldCheck, title: "Humans in control", desc: "AI recommends; deterministic code executes; every version preserves history. No silent mutation." },
  { icon: Building2, title: "Built for real operations", desc: "The refinery is designed around the messy middle where data work actually stalls." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Rivu"
        title={<>A data refinery built by <em>WaterTing.</em></>}
        lead="Rivu AI turns fragmented, messy and unstructured business data into clean, structured and usable datasets — with an AI-assisted layer that keeps humans in control."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Get in touch <ArrowRight /></Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.prose}>
            <SectionHead eyebrow="Our view" title="Data is not a file. It is a system." />
            <p>
              Business data rarely arrives ready for analysis. Sources change, formats drift,
              teams add context and systems disagree. Rivu gives that movement a consistent
              refinement layer: a controlled path from raw operational data to measured,
              explainable, analysis-ready intelligence.
            </p>
            <p>
              We built Rivu around a simple principle — <strong>AI recommends. Deterministic
              code executes. Versions preserve history.</strong> The result is a refinery that
              removes repetitive data preparation without ever hiding what changed or why.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <SectionHead eyebrow="What we stand for" title="Principles, not promises." />
          <div className={styles.featureGrid}>
            {VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className={`${styles.card} ${styles.featureCard}`}>
                  <div className={styles.iconBadge}><Icon /></div>
                  <h3 className={styles.featureTitle}>{v.title}</h3>
                  <p className={styles.featureDesc}>{v.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.prose}>
            <SectionHead eyebrow="Recognition & ecosystem" title="Only what's verified." />
            <p>
              Rivu displays registration and recognition badges only where the company actually
              holds the valid credential and any required permissions. If a recognition is
              pending or unconfirmed, we do not show the badge. We do not present technology
              integrations as partnerships or endorsements.
            </p>
            <p>
              Technology logos (such as Shopify and WooCommerce) are shown to indicate the
              platforms Rivu connects to — not as Rivu partners or endorsers.
            </p>
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Build with a team that <em>tells it straight.</em></>}
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Talk to our team", href: "/contact" }}
      />
    </>
  );
}