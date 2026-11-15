"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders=()=>({Authorization:"Bearer "+(typeof window!=="undefined"?localStorage.getItem("rivu_access_token")||"":"")});

export default function VisualizationPage() {
  const [products,setProducts]=useState<any[]>([]); const [err,setErr]=useState(""); const [loading,setLoading]=useState(true);
  const load = useCallback(async()=>{
    setLoading(true); setErr("");
    try{const r=await authFetch("/commerce/products?limit=50",{headers:authHeaders()}); const j=await r.json().catch(()=>[]); if(!r.ok) throw new Error(j.detail?.message||j.detail||"Could not load products"); setProducts(Array.isArray(j)?j:[]);}catch(e){setErr(e instanceof Error?e.message:"Failed to load data")}finally{setLoading(false)}
  },[]);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{ if(!cancelled) await load(); })();
    return ()=>{ cancelled=true; };
  },[load]);
  const byCat: Record<string,number> = {};
  products.forEach(p=>{ const c = (p.category||"Uncategorized"); byCat[c]=(byCat[c]||0)+1; });
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max = Math.max(1, ...cats.map(c=>c[1]));
  const completeness = products.map(p=>Number(p.completeness_score||0));
  const avgComp = completeness.length? (completeness.reduce((a,b)=>a+b,0)/completeness.length).toFixed(1):"—";
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / DATA VISUALIZATION</div><h1>Data Visualization</h1><p>Charts built from actual workspace records (PIM products). Upload & map sales/inventory datasets to extend charts to revenue and stock.</p></div><div className={styles.headerActions}><button className={styles.iconBtn} onClick={load}><RefreshCw size={15}/> Refresh</button></div></header>
      {err && <div className={styles.error}>{err}</div>}
      {loading ? <div className={styles.muted} style={{marginTop:16}}>Loading…</div> : (
        <div className={styles.grid2} style={{marginTop:18}}>
          <section className={styles.sectionBlock} style={{marginTop:0}}>
            <h2>Products by category</h2>
            <p>Top categories from your PIM catalogue (real records).</p>
            {cats.length===0 ? <p style={{marginTop:12}}>No products yet. Add products in Commerce & Catalogue / Product & SKU.</p> : (
              <div style={{marginTop:14,display:"grid",gap:10}}>
                {cats.map(([c,v])=>(<div key={c}><div style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span>{c}</span><b>{v}</b></div><div className={styles.chartBar}><i style={{width:(v/max*100)+"%"}}/></div></div>))}
              </div>
            )}
          </section>
          <section className={styles.sectionBlock} style={{marginTop:0}}>
            <h2>Catalogue quality snapshot</h2>
            <p>Average completeness score across loaded products.</p>
            <div className={styles.scoreCard} style={{marginTop:14}}><span>AVG COMPLETENESS</span><strong>{avgComp}</strong><small>/ 100</small><div className={styles.progress}><i style={{width:(Number(avgComp)||0)+"%"}}/></div></div>
            <p style={{marginTop:12,fontSize:11,color:"var(--muted)"}}>Records sampled: {products.length} (latest). Charts show measured values only.</p>
          </section>
        </div>
      )}
      <section className={styles.sectionBlock}>
        <h2>Sales / revenue / inventory charts</h2>
        <p>To render sales, revenue, product performance, margins and inventory reports from real data: upload your sales and inventory datasets (Data Sources), refine & map them, then this view aggregates those records. No sample or fabricated figures are shown.</p>
      </section>
    </div>
  );
}