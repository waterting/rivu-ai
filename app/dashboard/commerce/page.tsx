"use client";
import Link from "next/link";
import { ShoppingCart, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";

export default function CommercePage() {
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / COMMERCE & CATALOGUE</div><h1>Commerce & Catalogue</h1><p>Catalogue intelligence, channel publishing and e-commerce data flows — backed by real PIM and channel APIs.</p></div></header>
      <div className={styles.grid2} style={{marginTop:18}}>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2>Catalogue Data Entry (PIM portal)</h2>
          <p>Upload → map → validate → enrich (advisory) → export. Separate authenticated portal with its own DB boundary and templates.</p>
          <div style={{marginTop:12}}><Link href="/our-solutions/catalogue-data-entry" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Open Catalogue Portal <ArrowUpRight size={14}/></Link></div>
        </section>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2>Channels & publishing</h2>
          <p>Connect Shopify and publish approved products as drafts via the real GraphQL flow (when credentials configured). No fake connections.</p>
          <div style={{marginTop:12}}><Link href="/dashboard/channels" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Open Channels <ArrowUpRight size={14}/></Link></div>
        </section>
      </div>
      <section className={styles.sectionBlock}>
        <h2>Product catalogue</h2>
        <p>Manage canonical SKUs and variants in Product & SKU Management.</p>
        <div style={{marginTop:12}}><Link href="/dashboard/products" className={styles.iconBtn} style={{textDecoration:"none",display:"inline-flex"}}>Open Product & SKU <ArrowUpRight size={14}/></Link></div>
      </section>
    </div>
  );
}