import type { Metadata } from "next";
import Link from "next/link";
import {
  Store, ShoppingCart, Sheet, FileJson, Database, Webhook,
  Cloud, ArrowRight, CheckCircle2, Clock, Wrench,
} from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Rivu integrations: Shopify and WooCommerce commerce connectors, plus a connector framework for Google Sheets, Excel, CSV/JSON, REST APIs, webhooks, PostgreSQL, MySQL, cloud storage and CRM/ERP systems. Every connector shows a real status.",
};

type Status = "Available" | "Connected" | "Setup Required" | "In Development" | "Planned";

const STATUS_CLASS: Record<Status, string> = {
  Available: styles.statusAvailable,
  Connected: styles.statusConnected,
  "Setup Required": styles.statusSetup,
  "In Development": styles.statusDev,
  Planned: styles.statusPlanned,
};

function StatusPill({ status }: { status: Status }) {
  const Icon = status === "Available" || status === "Connected" ? CheckCircle2 : status === "Planned" ? Clock : Wrench;
  return <span className={`${styles.statusPill} ${STATUS_CLASS[status]}`}><Icon size={13} /> {status}</span>;
}

const COMMERCE = [
  {
    id: "shopify",
    icon: Store,
    name: "Shopify",
    desc: "Connect a Shopify store via the official Admin GraphQL API: product import, field and variant mapping, draft-first product creation and updates, media association and sync history.",
    status: "Setup Required" as Status,
    note: "Requires a valid Shopify app configuration and OAuth scopes. Not live until tested against a development store. Access tokens are never exposed to the frontend.",
  },
  {
    id: "woocommerce",
    icon: ShoppingCart,
    name: "WooCommerce",
    desc: "Connect a WooCommerce store via its REST API: secure credential management, product import, category and attribute mapping, product creation and updates, image mapping, sync logs and retries.",
    status: "Setup Required" as Status,
    note: "Requires valid WooCommerce API credentials and a compatible API version. No successful connection is shown until verified against a real store.",
  },
];

const FRAMEWORK = [
  { icon: Sheet, name: "Google Sheets", status: "Planned" as Status },
  { icon: Sheet, name: "Excel", status: "Planned" as Status },
  { icon: FileJson, name: "CSV & JSON sources", status: "Available" as Status },
  { icon: Database, name: "REST APIs", status: "In Development" as Status },
  { icon: Webhook, name: "Webhooks", status: "In Development" as Status },
  { icon: Database, name: "PostgreSQL", status: "Planned" as Status },
  { icon: Database, name: "MySQL", status: "Planned" as Status },
  { icon: Cloud, name: "Cloud storage", status: "Planned" as Status },
];

export default function IntegrationsPage() {
  return (
    <>
      <PageHero
        eyebrow="Integrations"
        title={<>Connect your <em>commerce stack.</em></>}
        lead="Rivu connects to the systems your data already lives in. Every connector shows an honest status — we never present a connector as live without working credentials and tested APIs."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Request an integration <ArrowRight /></Link>
      </PageHero>

      {/* commerce connectors */}
      <section className={styles.section} id="shopify">
        <div className={styles.container}>
          <SectionHead
            eyebrow="Commerce platforms"
            title="Shopify & WooCommerce."
            lead="Product import, mapping and draft-first sync — with sync logs and retry. Both connectors require valid credentials before they go live."
          />
          <div className={styles.featureGrid} data-cols="2" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {COMMERCE.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.id} id={c.id} className={`${styles.card} ${styles.featureCard}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div className={styles.iconBadge} style={{ marginBottom: 0 }}><Icon /></div>
                    <StatusPill status={c.status} />
                  </div>
                  <h3 className={styles.featureTitle} style={{ marginTop: 18 }}>{c.name}</h3>
                  <p className={styles.featureDesc}>{c.desc}</p>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-3)", marginTop: 14, padding: "12px 14px", background: "var(--surface-alt)", borderRadius: 10 }}>
                    {c.note}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* connector framework */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="framework">
        <div className={styles.container}>
          <SectionHead
            eyebrow="Connector framework"
            title="Built to extend."
            lead="The connector framework is designed for future sources. Status is shown honestly — a logo does not mean a connector is available."
          />
          <div className={styles.featureGrid}>
            {FRAMEWORK.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.name} className={`${styles.card} ${styles.featureCard}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div className={styles.iconBadge} style={{ marginBottom: 0 }}><Icon /></div>
                    <StatusPill status={f.status} />
                  </div>
                  <h3 className={styles.featureTitle} style={{ marginTop: 18 }}>{f.name}</h3>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* status legend */}
      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead eyebrow="Status key" title="What each status means." center />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {([
              ["Available", "Working today inside the workspace."],
              ["Connected", "Authenticated to your account and syncing."],
              ["Setup Required", "Code exists; credentials/configuration are missing."],
              ["In Development", "Actively being built, not yet usable."],
              ["Planned", "On the roadmap; no implementation yet."],
            ] as [Status, string][]).map(([s, d]) => (
              <div key={s} className={styles.card}>
                <StatusPill status={s} />
                <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 12, marginBottom: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Need a connector that <em>isn&apos;t listed?</em></>}
        lead="Tell us the system and we'll scope it against the connector framework."
        primary={{ label: "Talk to our team", href: "/contact" }}
        secondary={{ label: "Explore the platform", href: "/platform" }}
      />
    </>
  );
}