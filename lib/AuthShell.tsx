"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import BrandLogo from "./BrandLogo";
import Scene3DMount from "./three/Scene3DMount";
import styles from "./auth.module.css";

/**
 * AuthShell — the shared split-screen frame for every authentication route.
 *
 * Left: the form (vertically centred, scrolls internally on short viewports so
 * the document itself never scrolls on desktop).
 * Right: the marketing site's signature Rivu scene (`Scene3D kind="hero"` — the
 * exact component rendered by the public homepage hero), with an ambient violet
 * glow. Hidden below 900px where vertical space is scarce.
 */
export default function AuthShell({
  kicker,
  heading,
  sub,
  children,
  switchPrompt,
}: {
  kicker: string;
  heading: ReactNode;
  sub: string;
  children: ReactNode;
  switchPrompt: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />

      <header className={styles.topbar}>
        <BrandLogo href="/" className={styles.logo} />
        <span className={styles.secure}>
          <ShieldCheck size={14} />
          <span>Secure workspace</span>
        </span>
      </header>

      <div className={styles.body}>
        <section className={styles.formSide} aria-label="Authentication">
          <div className={styles.formWrap}>
            <div className={styles.kicker}>{kicker}</div>
            <h1 className={styles.heading}>{heading}</h1>
            <p className={styles.sub}>{sub}</p>
            {children}
            <p className={styles.switch}>{switchPrompt}</p>
            <p className={styles.legal}>
              Protected by Rivu workspace isolation · SOC2-aligned controls · GDPR-ready data handling
            </p>
          </div>
        </section>

        <aside className={styles.visualSide} data-auth-visual="" aria-hidden="true">
          <div className={styles.glow} />
          <Scene3DMount kind="hero" className={styles.scene} camera={{ position: [0, 0, 9], fov: 42 }} />
          <div className={styles.visualFade} />
          <div className={styles.caption}>
            <span className={styles.captionMark} />
            <div>
              <b>RIVU DATA INTELLIGENCE</b>
              <small>Profile · Refine · Analyse · Decide</small>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}