"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders=()=>({Authorization:"Bearer "+(typeof window!=="undefined"?localStorage.getItem("rivu_access_token")||"":"")});

export default function ServicesPage() {
  const [projects,setProjects]=useState<any[]>([]); const [leads,setLeads]=useState<any[]>([]); const [err,setErr]=useState(""); const [msg,setMsg]=useState(""); const [loading,setLoading]=useState(true);
  const [pname,setPname]=useState(""); const [cname,setCname]=useState(""); const [cemail,setCemail]=useState(""); const [cphone,setCphone]=useState(""); const [note,setNote]=useState("");
  const load = useCallback(async()=>{
    setLoading(true); setErr("");
    try{
      const [pr,lr] = await Promise.all([
        authFetch("/solutions/custom-solutions/projects",{headers:authHeaders()}),
        authFetch("/solutions/crm/leads",{headers:authHeaders()}),
      ]);
      if(pr.ok) setProjects(await pr.json()); else setProjects([]);
      if(lr.ok) setLeads(await lr.json()); else { /* may be forbidden for non-admin in some setups */ setLeads([]); }
    }catch(e){setErr(e instanceof Error?e.message:"Failed")}finally{setLoading(false)}
  },[]);
  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);
  async function createProject(e:React.FormEvent){e.preventDefault(); setErr(""); setMsg(""); try{const r=await authFetch("/solutions/custom-solutions/projects",{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json"},body:JSON.stringify({name:pname})}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.detail?.message||j.detail||"Could not create project"); setMsg("Custom solution project created."); setPname(""); await load();}catch(e){setErr(e instanceof Error?e.message:"Failed")}}
  async function createLead(e:React.FormEvent){e.preventDefault(); setErr(""); setMsg(""); try{const r=await authFetch("/solutions/crm/leads",{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json"},body:JSON.stringify({company_name:cname,contact_person:cname,email:cemail||"contact@example.com",phone:cphone||undefined,notes:note||undefined})}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.detail?.message||j.detail||"Could not submit enquiry/lead"); setMsg("Service enquiry recorded."); setCname(""); setCemail(""); setCphone(""); setNote(""); await load();}catch(e){setErr(e instanceof Error?e.message:"Failed")}}
  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / SERVICES</div><h1>Services</h1><p>Custom data services, service enquiries and delivery project tracking — scoped to your organization.</p></div><div className={styles.headerActions}><button className={styles.iconBtn} onClick={load}><RefreshCw size={15}/> Refresh</button></div></header>
      {err && <div className={styles.error}>{err}</div>}{msg && <div className={styles.message}>{msg}</div>}
      <div className={styles.grid2} style={{marginTop:18}}>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2>Request / track a custom solution</h2>
          <form onSubmit={createProject} className={styles.formGrid}>
            <div><label>Project name</label><input required value={pname} onChange={e=>setPname(e.target.value)} placeholder="e.g. Supplier catalogue migration"/></div>
            <button className={styles.primary} type="submit"><Plus size={14}/> Create project</button>
          </form>
          <h3 style={{marginTop:16,fontSize:13}}>Projects</h3>
          {loading?<p className={styles.muted}>Loading…</p>:projects.length===0?<p className={styles.muted}>No projects yet.</p>:(
            <table className={styles.table} style={{marginTop:8}}><thead><tr><th>Name</th><th>Status</th><th>SKUs (est)</th></tr></thead><tbody>{projects.map(p=>(<tr key={p.id}><td>{p.name}</td><td>{p.status}</td><td>{p.sku_volume_estimate??"—"}</td></tr>))}</tbody></table>
          )}
        </section>
        <section className={styles.sectionBlock} style={{marginTop:0}}>
          <h2>Service enquiry</h2>
          <form onSubmit={createLead} className={styles.formGrid}>
            <div><label>Company / contact name</label><input required value={cname} onChange={e=>setCname(e.target.value)}/></div>
            <div><label>Email</label><input type="email" value={cemail} onChange={e=>setCemail(e.target.value)}/></div>
            <div><label>Phone</label><input value={cphone} onChange={e=>setCphone(e.target.value)}/></div>
            <div><label>Notes / requirements</label><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)}/></div>
            <button className={styles.primary} type="submit">Submit enquiry</button>
          </form>
          <h3 style={{marginTop:16,fontSize:13}}>Enquiries ({leads.length})</h3>
          {leads.length===0?<p className={styles.muted}>No enquiries recorded (or not accessible).</p>:(
            <table className={styles.table} style={{marginTop:8}}><thead><tr><th>Company</th><th>Contact</th><th>Stage</th></tr></thead><tbody>{leads.map(l=>(<tr key={l.id}><td>{l.company_name}</td><td>{l.contact_person}</td><td>{l.pipeline_stage}</td></tr>))}</tbody></table>
          )}
        </section>
      </div>
    </div>
  );
}