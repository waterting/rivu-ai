"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, ArrowUpRight, AlertTriangle, CheckCircle } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders=()=>({Authorization:"Bearer "+(typeof window!=="undefined"?localStorage.getItem("rivu_access_token")||"":"")});

export default function IntegrationsPage() {
  const [channels,setChannels]=useState<any[]>([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{try{const r=await authFetch("/commerce/channels",{headers:authHeaders()}); if(r.ok) setChannels(await r.json());}catch{}finally{setLoading(false)}})()},[]);
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / INTEGRATIONS</div><h1>Integrations</h1><p>Connect stores and services with genuine, credential-backed flows. No fake success — connections are verified or explicitly marked sandbox/unconfigured.</p></div></header>
      <div className={styles.grid2} style={{marginTop:18}}>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2>Shopify (Admin GraphQL)</h2>
          <p>Draft-first product publish via custom-app access token. Real API calls when configured; sandbox tokens rejected in production and marked sandbox in non-prod. OAuth/webhook lifecycle is a credential/setup milestone.</p>
          <div style={{marginTop:12}} className={channels.some(c=>c.channel_type==="shopify")?styles.statusLive:styles.statusPartial}>{channels.some(c=>c.channel_type==="shopify")?"CONNECTED":"SETUP REQUIRED"}</div>
          <div style={{marginTop:12}}><Link href="/dashboard/channels" className={styles.primary} style={{textDecoration:"none",display:"inline-flex"}}>Manage channels <ArrowUpRight size={14}/></Link></div>
        </section>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2>WooCommerce</h2>
          <p>Export templates exist in the catalogue flow. Direct WooCommerce REST API integration requires authorized credentials and is not yet implemented — presented as a setup blocker, not a working connection.</p>
          <div style={{marginTop:12}} className={styles.statusPlanned}>CREDENTIAL / IMPLEMENTATION BLOCKER</div>
        </section>
      </div>
      <section className={styles.sectionBlock}>
        <h2>Connected channels ({channels.length})</h2>
        {loading?<p className={styles.muted}>Loading…</p>:channels.length===0?<p className={styles.muted}>No channels connected.</p>:(
          <table className={styles.table} style={{marginTop:10}}><thead><tr><th>Type</th><th>Name</th><th>Store</th><th>Status</th><th>Last sync</th></tr></thead>
          <tbody>{channels.map(c=>(<tr key={c.id}><td>{c.channel_type}</td><td>{c.name}</td><td>{c.store_url}</td><td>{c.status}</td><td>{c.last_sync_at?new Date(c.last_sync_at).toLocaleString():"—"}</td></tr>))}</tbody></table>
        )}
      </section>
      <section className={styles.sectionBlock}>
        <h2>Integration principles</h2>
        <div className={styles.grid3} style={{marginTop:12}}>
          <div className={styles.card}><CheckCircle size={16}/><h3 style={{marginTop:6}}>Verified or explicit</h3><p>Every connection is verified against the provider or clearly marked sandbox/unconfigured.</p></div>
          <div className={styles.card}><AlertTriangle size={16}/><h3 style={{marginTop:6}}>No fake success</h3><p>Missing credentials or unimplemented flows are shown as blockers, never as completed connections.</p></div>
          <div className={styles.card}><Plug size={16}/><h3 style={{marginTop:6}}>Draft-first publish</h3><p>Shopify publishes as drafts by default; live publish requires explicit approval.</p></div>
        </div>
      </section>
    </div>
  );
}