"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown, ArrowRight, Menu, X, ShieldCheck, Lock, Award,
} from "lucide-react";
import styles from "./marketing.module.css";
import { NAV, SIMPLE_NAV, FOOTER_NAV } from "./nav-config";

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Rivu home">
      <BrandMark />
      <span className={styles.brandWord}>rivu<span>ai</span></span>
    </Link>
  );
}

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prevPath, setPrevPath] = useState(pathname);

  // Reset transient nav state during render when the route changes.
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(null);
    setMobile(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(null); setMobile(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const enter = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(label);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Brand />
          <nav className={styles.navLinks} aria-label="Primary">
            {NAV.map((group) => (
              <div
                key={group.label}
                className={styles.navItem}
                onMouseEnter={() => enter(group.label)}
                onMouseLeave={leave}
              >
                <Link
                  href={group.href}
                  className={styles.navTrigger}
                  data-open={open === group.label}
                  aria-expanded={open === group.label}
                >
                  {group.label}
                  <ChevronDown />
                </Link>
                <div
                  className={`${styles.megaWrap} ${group.columns.length >= 3 ? styles.megaWide : ""}`}
                  data-open={open === group.label}
                >
                  <div className={`${styles.megaGrid} ${group.columns.length >= 3 ? styles.megaGrid3 : ""}`}>
                    {group.columns.flat().filter((l): l is NonNullable<typeof l> => Boolean(l)).map((link) => {
                      const Icon = link.icon;
                      return (
                        <Link key={link.label + link.href} href={link.href} className={styles.megaItem}>
                          <span className={styles.miTitle}>
                            {Icon && <Icon />}
                            {link.label}
                          </span>
                          {link.desc && <span className={styles.miDesc}>{link.desc}</span>}
                        </Link>
                      );
                    })}
                  </div>
                  {group.foot && (
                    <div className={styles.megaFoot}>
                      <div>
                        <b>{group.foot.title}</b>
                        <br />
                        <span>{group.foot.desc}</span>
                      </div>
                      <Link href={group.foot.href}>
                        {group.foot.cta} <ArrowRight />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {SIMPLE_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navTrigger}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.navActions}>
            <Link href="/login" className={styles.navSignIn}>Sign In</Link>
            <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>
              Book a Demo
            </Link>
            <button
              className={styles.navToggle}
              aria-label={mobile ? "Close menu" : "Open menu"}
              aria-expanded={mobile}
              aria-controls="mobile-drawer"
              onClick={() => setMobile((v) => !v)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        <div id="mobile-drawer" className={styles.mobileDrawer} data-open={mobile}>
          {NAV.map((group) => (
            <div key={group.label} className={styles.mobileGroup}>
              <button
                className={styles.mobileGroupHead}
                data-open={mobileGroup === group.label}
                onClick={() => setMobileGroup((g) => (g === group.label ? null : group.label))}
              >
                {group.label}
                <ChevronDown />
              </button>
              {mobileGroup === group.label && (
                <div className={styles.mobileSub}>
                  {group.columns.flat().filter((l): l is NonNullable<typeof l> => Boolean(l)).map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link key={link.label + link.href} href={link.href}>
                        {Icon && <Icon />}
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {SIMPLE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.mobileDirect}>
              {item.label}
            </Link>
          ))}
          <div className={styles.mobileCtas}>
            <Link href="/login" className={`${styles.btn} ${styles.btnGhost}`}>Sign In</Link>
            <Link href="/contact" className={`${styles.btn} ${styles.btnPrimary}`}>
              Book a Demo <ArrowRight />
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <div>
              <Brand />
              <p className={styles.footerBlurb}>
                An AI-native data refinery that turns fragmented, messy business data
                into clean, structured, usable datasets — with humans in control.
              </p>
            </div>
            {FOOTER_NAV.map((col) => (
              <div key={col.title} className={styles.footerCol}>
                <h4>{col.title}</h4>
                {col.links.map((l) => (
                  <Link key={l.label} href={l.href}>{l.label}</Link>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 WaterTing · Rivu AI. All rights reserved.</span>
            <div className={styles.footerBadges}>
              <span className={styles.footerBadge}><Lock /> Tenant-isolated</span>
              <span className={styles.footerBadge}><ShieldCheck /> Human-approved refinement</span>
              <span className={styles.footerBadge}><Award /> Versioned outputs</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}