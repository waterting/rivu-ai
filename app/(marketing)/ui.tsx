import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./marketing.module.css";

export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles.pageHero}>
      <div className={styles.container}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.pageHeroTitle}>{title}</h1>
        {lead && <p className={`${styles.lead} ${styles.pageHeroLead}`}>{lead}</p>}
        {children && <div className={styles.pageHeroActions}>{children}</div>}
      </div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
  center,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: string;
  center?: boolean;
}) {
  return (
    <div className={`${styles.sectionHead} ${center ? styles.center : ""}`}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h2 className={styles.display}>{title}</h2>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  );
}

export function CTAPanel({
  title,
  lead,
  primary = { label: "Start with Rivu", href: "/signup" },
  secondary = { label: "Talk to our team", href: "/contact" },
}: {
  title: React.ReactNode;
  lead?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.ctaPanel}>
          <div className={styles.ctaGlow} aria-hidden="true" />
          <span className={styles.eyebrow} style={{ color: "#b794f6" }}>Rivu AI</span>
          <h2>{title}</h2>
          {lead && <p>{lead}</p>}
          <div className={styles.ctaRow}>
            <Link href={primary.href} className={`${styles.btn} ${styles.btnViolet}`}>
              {primary.label} <ArrowRight />
            </Link>
            <Link href={secondary.href} className={`${styles.btn} ${styles.btnLight}`}>
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeatureGrid({
  items,
  columns = 3,
}: {
  items: { icon?: React.ElementType; title: string; desc: string; href?: string }[];
  columns?: 2 | 3;
}) {
  return (
    <div className={styles.featureGrid} data-cols={columns}>
      {items.map((it) => {
        const Icon = it.icon;
        const inner = (
          <>
            {Icon && (
              <div className={styles.iconBadge}>
                <Icon />
              </div>
            )}
            <h3 className={styles.featureTitle}>{it.title}</h3>
            <p className={styles.featureDesc}>{it.desc}</p>
          </>
        );
        return it.href ? (
          <Link key={it.title} href={it.href} className={`${styles.card} ${styles.cardHover} ${styles.featureCard}`}>
            {inner}
          </Link>
        ) : (
          <div key={it.title} className={`${styles.card} ${styles.featureCard}`}>{inner}</div>
        );
      })}
    </div>
  );
}