import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";
import { SOLUTION_CARDS } from "../nav-config";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Where Rivu fits: e-commerce and retail, supplier data management, product catalogue management, SME operations, data agencies and custom implementations.",
};

export default function SolutionsPage() {
  return (
    <>
      <PageHero scene="globe"
        eyebrow="Solutions"
        title={<>Rivu fits the shape of <em>your data.</em></>}
        lead="Every solution below describes a real workflow — the problem, the Rivu path through it, the expected output and the tools involved. No invented outcomes."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Discuss your workflow <ArrowRight /></Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead eyebrow="By scenario" title="Built around real operational data." />
          <div className={styles.featureGrid}>
            {SOLUTION_CARDS.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.label} href={s.href} className={`${styles.card} ${styles.cardHover} ${styles.featureCard}`}>
                  {Icon && <div className={styles.iconBadge}><Icon /></div>}
                  <h3 className={styles.featureTitle}>{s.label}</h3>
                  <p className={styles.featureDesc}>{s.desc}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Not sure where you fit?"
            title="Start with the data, not the category."
            lead="Tell us the systems you export from and the output you need. We'll scope the workflow before proposing anything."
            center
          />
          <div style={{ textAlign: "center" }}>
            <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Talk to our team <ArrowRight /></Link>
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Bring your <em>real use case.</em></>}
        lead="We assess data shape, target schema and workflow before proposing an implementation."
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Book a Demo", href: "/contact" }}
      />
    </>
  );
}