"use client";
import Link from "next/link";
import { CreditCard, Settings, ShieldCheck, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";

export default function SettingsPage() {
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / SETTINGS</div><h1>Billing & Settings</h1><p>Subscription, usage, invoices and workspace settings. Billing uses real server-verified payments when the gateway is configured.</p></div></header>
      <div className={styles.grid2} style={{marginTop:18}}>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2><CreditCard size={16} style={{verticalAlign:"-3px",marginRight:6}}/>Billing & subscriptions</h2>
          <p>Plans, Razorpay checkout (real signature verification), GST invoices (provider GSTIN from verified config), and usage metering against real records.</p>
          <div style={{marginTop:12}}><Link href="/dashboard/billing" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Open billing <ArrowUpRight size={14}/></Link></div>
        </section>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2><Settings size={16} style={{verticalAlign:"-3px",marginRight:6}}/>Workspace settings</h2>
          <p>Organization-scoped workspace with role-based access (owner/admin/editor/viewer). Tenant isolation enforced server-side on every query.</p>
          <div style={{marginTop:12}}><span className={styles.statusLive}>TENANT ISOLATED</span></div>
        </section>
      </div>
      <section className={styles.sectionBlock}>
        <h2><ShieldCheck size={16} style={{verticalAlign:"-3px",marginRight:6}}/>Security & auth</h2>
        <p>JWT auth with token revocation, Google OAuth (when configured), email verification/reset (when SMTP configured). Catalogue portal uses a separate DB + JWT boundary.</p>
      </section>
    </div>
  );
}