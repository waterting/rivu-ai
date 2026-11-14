import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck, Lock, KeyRound, FileCheck2, Database,
  ArrowRight, CheckCircle2,
} from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead, CTAPanel } from "../ui";

export const metadata: Metadata = {
  title: "Security & governance",
  description:
    "Rivu security: tenant isolation enforced on the backend, JWT authentication, PBKDF2 password hashing, immutable raw versions, human-approved refinement and traceable operations.",
};

const PILLARS = [
  { icon: Database, title: "Tenant isolation", desc: "Organizations are isolated on the backend through authenticated organization context — enforced server-side, not just hidden in the frontend." },
  { icon: KeyRound, title: "Authentication", desc: "JWT authentication protects API access. Passwords are hashed with PBKDF2-SHA256. Production disables automatic schema creation." },
  { icon: FileCheck2, title: "Controlled data movement", desc: "Raw version 1 is immutable. Refinement requires explicit approval. Every refinement creates a new, traceable version." },
  { icon: Lock, title: "Secrets stay server-side", desc: "Credentials belong in deployment environment stores — never in Git and never exposed to the frontend." },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security & governance"
        title={<>Controlled data movement, <em>by design.</em></>}
        lead="Rivu is built so that what you approve is exactly what runs — with isolation, traceability and human control at every step."
      >
        <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>Talk to our team <ArrowRight /></Link>
      </PageHero>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead eyebrow="Principles" title="What we enforce." />
          <div className={styles.featureGrid}>
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className={`${styles.card} ${styles.featureCard}`}>
                  <div className={styles.iconBadge}><Icon /></div>
                  <h3 className={styles.featureTitle}>{p.title}</h3>
                  <p className={styles.featureDesc}>{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div>
              <span className={styles.eyebrow}>Release discipline</span>
              <h2 className={styles.display} style={{ fontSize: "clamp(26px,3.2vw,38px)", margin: "16px 0 0" }}>
                A green UI is not proof of a green data pipeline.
              </h2>
              <p className={styles.lead} style={{ marginTop: 18 }}>
                Rivu treats production readiness as a gate. A release verifies the pipeline —
                authentication, tenant isolation, ingestion, profiling, quality, AI planning,
                deterministic transformation, versioning, downloads and the full flow — not just the interface.
              </p>
            </div>
            <div className={styles.splitArt}>
              <ul className={styles.specList}>
                <li><CheckCircle2 />Immutable raw source</li>
                <li><CheckCircle2 />Human-approved refinement</li>
                <li><CheckCircle2 />Versioned, traceable outputs</li>
                <li><CheckCircle2 />Backend-enforced tenant isolation</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="Need assurance?"
            title="Ask us anything about data handling."
            lead="We're happy to walk through isolation, retention and access controls for your environment."
            center
          />
          <div style={{ textAlign: "center" }}>
            <Link href="/contact" className={`${styles.btn} ${styles.btnGhost}`}>Contact us <ArrowRight /></Link>
          </div>
        </div>
      </section>

      <CTAPanel
        title={<>Security that <em>holds up.</em></>}
        primary={{ label: "Start with Rivu", href: "/signup" }}
        secondary={{ label: "Talk to our team", href: "/contact" }}
      />
    </>
  );
}