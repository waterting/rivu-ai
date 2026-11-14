import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";
import PricingTable from "./PricingTable";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Rivu pricing: a Starter plan from ₹4,999/month, configurable Professional, Business and Enterprise plans up to ₹2,49,999/month, and separately scoped implementation services.",
};

const FAQS = [
  { q: "What does the Starter plan include?", a: "Starter begins at ₹4,999/month. Exact entitlements — file and row limits, AI credits, users and integrations — are shown once configured in your workspace." },
  { q: "How is Enterprise priced?", a: "Enterprise is tailored. Depending on requirements it can be configured up to ₹2,49,999/month. We scope it with you rather than assuming every enterprise customer pays the same." },
  { q: "Are implementation services included?", a: "Custom e-commerce implementations, catalogue migrations and integrations are scoped as separate services, defined before any work begins." },
  { q: "Can I change plans later?", a: "Yes. Upgrades and downgrades are handled through the subscription flow, with entitlements verified on the server — never unlocked because a browser says payment succeeded." },
  { q: "Do you show limits you haven't configured?", a: "No. We only display file, row, AI-credit and user limits once they are actually configured for a plan. We don't invent SKUs or capabilities." },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={<>Plans that scale with <em>your data work.</em></>}
        lead="A clear entry price, configurable plans as you grow, and a tailored Enterprise option. We only show limits once they are configured — no invented SKUs."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Book a Demo <ArrowRight /></Link>
        <Link href="/signup" className={`${styles.btn} ${styles.btnGhost}`}>Start Free</Link>
      </PageHero>

      <PricingTable />

      <section className={`${styles.section} ${styles.sectionLav}`}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Implementation services"
            title="Separately scoped."
            lead="Custom e-commerce implementations, catalogue migrations and integrations are scoped as their own services — defined before any work begins."
            center
          />
          <div style={{ textAlign: "center" }}>
            <Link href="/solutions/custom" className={`${styles.btn} ${styles.btnGhost}`}>About custom implementations <ArrowRight /></Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead eyebrow="FAQ" title="Questions, answered." center />
          <div className={styles.faq}>
            {FAQS.map((f) => (
              <details key={f.q} className={styles.faqItem}>
                <summary>{f.q}<Plus /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Start with the <em>refinery.</em></>}
        lead="Begin on Starter, or talk to us about a plan and implementation scoped to your data."
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Contact sales", href: "/contact" }}
      />
    </>
  );
}