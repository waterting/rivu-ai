"use client";
import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders=()=>({Authorization:"Bearer "+(typeof window!=="undefined"?localStorage.getItem("rivu_access_token")||"":"")});

export default function AnalyticsPage() {
  const [data,setData]=useState<any>(null); const [err,setErr]=useState(""); const [loading,setLoading]=useState(true);
  async function load(){
    setLoading(true); setErr("");
    try{const r=await authFetch("/analytics/organization",{headers:authHeaders()}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.detail?.message||j.detail||"Could not load analytics"); setData(j);}catch(e){setErr(e instanceof Error?e.message:"Failed to load analytics")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  const cat = data?.catalogue||{}; const sup = data?.suppliers||{}; const ch = data?.channels||{}; const bil = data?.billing||{};
  const metrics = [
    {label:"Total products (SKUs)", value: cat.total_products ?? 0},
    {label:"Valid products", value: cat.valid_products ?? 0},
    {label:"Approved / ready to publish", value: cat.approved_products ?? 0},
    {label:"Avg completeness", value: (cat.average_completeness_score ?? 0)+"%"},
    {label:"Suppliers", value: sup.total_suppliers ?? 0},
    {label:"Synced channel listings", value: ch.active_synced_listings ?? 0},
    {label:"Total paid (INR)", value: "₹"+Number(bil.total_invoiced_paid_inr||0).toLocaleString()},
  ];
  const bars = [
    {label:"Valid", v: Number(cat.valid_products||0), max: Math.max(1, Number(cat.total_products||0))},
    {label:"Invalid", v: Number(cat.invalid_products||0), max: Math.max(1, Number(cat.total_products||0))},
    {label:"Approved", v: Number(cat.approved_products||0), max: Math.max(1, Number(cat.total_products||0))},
  ];
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / DATA ANALYTICS</div><h1>Data Analytics</h1><p>Operational KPIs computed from real database records for your organization.</p></div><div className={styles.headerActions}><button className={styles.iconBtn} onClick={load}><RefreshCw size={15}/> Refresh</button></div></header>
      {err && <div className={styles.error}>{err}</div>}
      {loading ? <div className={styles.muted} style={{marginTop:16}}>Loading analytics…</div> : (
        <>
          <section className={styles.kpis} style={{marginTop:18}}>
            {metrics.map(m=>(<div key={m.label} className={styles.kpi}><span>{m.label}</span><b>{m.value}</b></div>))}
          </section>
          <section className={styles.sectionBlock}>
            <h2>Catalogue health (real counts)</h2>
            <p>Derived from canonical PIM product records in your workspace.</p>
            <div style={{marginTop:14,display:"grid",gap:12}}>
              {bars.map(b=>(<div key={b.label}><div style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span>{b.label}</span><b>{b.v}</b></div><div className={styles.chartBar}><i style={{width: (b.max? (b.v/b.max)*100:0)+"%"}}/></div></div>))}
            </div>
          </section>
          <section className={styles.sectionBlock}>
            <h2>Notes</h2>
            <p>Sales/revenue/margin/inventory trend dashboards require transactional sales & inventory datasets to be uploaded and mapped. When such data is present, charts are computed from those records — no fabricated numbers. Use Data Sources to upload sales/inventory CSVs, then refine and map them.</p>
          </section>
        </>
      )}
    </div>
  );
}