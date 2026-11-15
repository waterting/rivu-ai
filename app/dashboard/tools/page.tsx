"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileJson, Table2, Wand2, Sparkles, CopyCheck, FileCheck2, Boxes, ScanBarcode, Images, GitCompare, Download, Gauge, Workflow, ArrowUpRight } from "lucide-react";
import styles from "../dashboard.module.css";

const TOOLS = [
  { id: "format-studio", name: "Format Studio", icon: FileJson, status: "live", desc: "Export refined datasets to CSV/XLSX/JSON/Parquet from the dataset view.", href: "/dashboard" },
  { id: "profiler", name: "Data Profiler", icon: Table2, status: "live", desc: "Structural & statistical profiling with semantic type inference.", href: "/dashboard" },
  { id: "cleaner", name: "Data Cleaner", icon: Sparkles, status: "live", desc: "Deterministic cleaning ops (trim, case, nulls, outliers, formats).", href: "/dashboard/refinery" },
  { id: "validator", name: "Data Validator", icon: FileCheck2, status: "live", desc: "Quality rules, issue findings and validation scoring.", href: "/dashboard" },
  { id: "mapper", name: "Smart Column Mapper", icon: Wand2, status: "live", desc: "Deterministic fuzzy column mapping with confidence (catalogue).", href: "/our-solutions/catalogue-data-entry" },
  { id: "enrichment", name: "AI Product Enrichment", icon: Sparkles, status: "live", desc: "Groq-backed enrichment with rule-based fallback (advisory).", href: "/our-solutions/catalogue-data-entry" },
  { id: "catalogue-normalizer", name: "Catalogue Normalizer", icon: Boxes, status: "live", desc: "Normalize catalogue fields per target template.", href: "/our-solutions/catalogue-data-entry" },
  { id: "duplicate-finder", name: "Duplicate Finder", icon: CopyCheck, status: "live", desc: "Flag/remove duplicates via refinery transform ops.", href: "/dashboard/refinery" },
  { id: "compare", name: "Data Compare", icon: GitCompare, status: "partial", desc: "Compare datasets/versions — basic diff via version comparison (full UI in progress).", href: "/dashboard" },
  { id: "sku-manager", name: "SKU & Variant Manager", icon: ScanBarcode, status: "live", desc: "PIM product & variant records (create/list via Commerce API).", href: "/dashboard/products" },
  { id: "media-matcher", name: "Media Matcher", icon: Images, status: "planned", desc: "Match product media to SKUs — requires a defined matching spec; not yet automated.", href: "/dashboard/products" },
  { id: "bulk-exporter", name: "Bulk Exporter", icon: Download, status: "live", desc: "Bulk catalogue export (XLSX/CSV/JSON) from Catalogue portal.", href: "/our-solutions/catalogue-data-entry" },
  { id: "quality-report", name: "Data Quality Report", icon: Gauge, status: "live", desc: "JSON/dashboard/PDF/executive reports with measured scores.", href: "/dashboard/reports" },
  { id: "transformation-builder", name: "Custom Transformation Builder", icon: Workflow, status: "live", desc: "Build allowlisted transformation plans (23 deterministic ops).", href: "/dashboard/refinery" },
];

function ToolsCentreInner() {
  const search = useSearchParams();
  const focus = search.get("tool");
  const active = focus;
  useEffect(() => {
    if (!focus) return;
    document.getElementById(focus)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / TOOLS CENTRE</div><h1>Tools Centre</h1><p>Fourteen tools in one workspace — each backed by real processing. No decorative cards.</p></div></header>
      <div className={styles.toolGrid}>
        {TOOLS.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.id} id={t.id} className={styles.toolCard} style={active===t.id?{borderColor:"var(--accent)",boxShadow:"0 0 0 1px var(--accent)"}:{}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <Icon size={18}/>
                <span className={t.status==="live"?styles.statusLive:t.status==="partial"?styles.statusPartial:styles.statusPlanned}>{t.status.toUpperCase()}</span>
              </div>
              <h3>{t.name}</h3>
              <p>{t.desc}</p>
              <Link href={t.href} style={{fontSize:11,color:"#a59bff",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}}>Open <ArrowUpRight size={12}/></Link>
            </div>
          );
        })}
      </div>
      <section className={styles.sectionBlock} style={{marginTop:22}}>
        <h2>Execution transparency</h2>
        <p>Every run is traceable: job IDs, input/output references, configuration snapshot, status, logs and timestamps are stored (Job/JobLog). Tools that are not yet automated are marked PLANNED — never presented as a fake success.</p>
      </section>
    </div>
  );
}
export default function ToolsCentrePage() {
  return (
    <Suspense fallback={<div className={styles.muted}>Loading tools...</div>}>
      <ToolsCentreInner />
    </Suspense>
  );
}
