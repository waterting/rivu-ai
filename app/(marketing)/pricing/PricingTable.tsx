"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import styles from "../marketing.module.css";

const PLANS = [
  { name: "Starter", price: "₹4,999", period: "/month", note: "Entry plan for individuals and small teams getting started with the refinery.", cta: "Start with Starter", href: "/signup", featured: false },
  { name: "Professional", price: "Configured", period: "", note: "For growing teams that need more capacity and collaboration. Final pricing is scoped to your usage.", cta: "Talk to sales", href: "/contact", featured: false },
  { name: "Business", price: "Configured", period: "", note: "For operations teams running repeatable, high-volume data workflows across sources.", cta: "Talk to sales", href: "/contact", featured: true },
  { name: "Enterprise", price: "Up to ₹2,49,999", period: "/month", note: "Tailored contracts, advanced controls and support. Scoped with you — not a one-size price.", cta: "Contact sales", href: "/contact", featured: false },
];

const INCLUDED = [
  "AI-native data refinery",
  "All 14 tools in the Tools Centre",
  "Human-approved, versioned transformations",
  "Tenant-isolated workspace",
];

export default function PricingTable() {
  const [annual, setAnnual] = useState(false);

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
          <div className={styles.billingToggle} role="group" aria-label="Billing period">
            <button data-active={!annual} onClick={() => setAnnual(false)}>Monthly</button>
            <button data-active={annual} onClick={() => setAnnual(true)}>Annual</button>
          </div>
        </div>

        <div className={styles.priceGrid}>
          {PLANS.map((p) => (
            <div key={p.name} className={`${styles.card} ${styles.priceCard} ${p.featured ? styles.featured : ""}`}>
              <span className={styles.priceName}>{p.name}</span>
              <div className={styles.priceAmount}>
                {p.price === "Configured" ? "Custom" : p.price}
                {p.period && <small>{annual ? " /mo billed annually" : p.period}</small>}
              </div>
              <p className={styles.priceNote}>{p.note}</p>
              <ul className={styles.priceFeatures}>
                {INCLUDED.map((f) => (
                  <li key={f}><Check />{f}</li>
                ))}
                <li><Check />{p.name === "Enterprise" ? "Tailored entitlements & support" : "Configurable limits (shown once set)"}</li>
              </ul>
              <Link href={p.href} className={`${styles.btn} ${p.featured ? styles.btnPrimary : styles.btnGhost}`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: "var(--ink-3)", marginTop: 28 }}>
          Limits for files, rows, AI credits, users and integrations are displayed once configured for a plan.
        </p>
      </div>
    </section>
  );
}