"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import styles from "../dashboard.module.css";
import { authFetch } from "../../../lib/api";

const authHeaders = () => ({ Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : "") });

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sku, setSku] = useState(""); const [title, setTitle] = useState(""); const [price, setPrice] = useState("");
  const [stock, setStock] = useState(""); const [brand, setBrand] = useState(""); const [cat, setCat] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await authFetch("/commerce/products?limit=100", { headers: authHeaders() });
      const j = await r.json().catch(() => []);
      if (!r.ok) throw new Error(j.detail?.message || j.detail || "Could not load products");
      setProducts(Array.isArray(j) ? j : []);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let cancelled=false;
    (async()=>{ if(!cancelled) await load(); })();
    return ()=>{ cancelled=true; };
  },[load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    try {
      const r = await authFetch("/commerce/products", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sku, title, brand: brand || undefined, category: cat || undefined, selling_price: price ? Number(price) : undefined, stock_quantity: stock ? Number(stock) : 0 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail?.message || j.detail || "Could not create product");
      setMsg("Product created."); setSku(""); setTitle(""); setPrice(""); setStock(""); setBrand(""); setCat("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>RIVU / PRODUCT & SKU MANAGEMENT</div><h1>Product & SKU Management</h1><p>Canonical PIM records, variants and completeness scoring backed by the commerce API.</p></div><div className={styles.headerActions}><button className={styles.iconBtn} onClick={load}><RefreshCw size={15}/> Refresh</button></div></header>
      {err && <div className={styles.error}>{err}</div>}{msg && <div className={styles.message}>{msg}</div>}
      <section className={styles.sectionBlock}>
        <h2>Create product / SKU</h2>
        <form onSubmit={create} className={styles.formGrid} style={{gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
          <div><label>SKU *</label><input required value={sku} onChange={e=>setSku(e.target.value)} placeholder="SKU-001"/></div>
          <div><label>Title *</label><input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Product name"/></div>
          <div><label>Brand</label><input value={brand} onChange={e=>setBrand(e.target.value)}/></div>
          <div><label>Category</label><input value={cat} onChange={e=>setCat(e.target.value)}/></div>
          <div><label>Selling price</label><input type="number" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></div>
          <div><label>Stock qty</label><input type="number" value={stock} onChange={e=>setStock(e.target.value)}/></div>
          <div style={{display:"flex",alignItems:"end"}}><button className={styles.primary} type="submit"><Plus size={14}/> Create</button></div>
        </form>
      </section>
      <section className={styles.sectionBlock}>
        <h2>Products ({products.length})</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : products.length===0 ? <p className={styles.muted}>No products yet.</p> : (
          <div style={{overflowX:"auto",marginTop:12}}>
            <table className={styles.table}><thead><tr><th>SKU</th><th>Title</th><th>Brand</th><th>Category</th><th>Price</th><th>Stock</th><th>Completeness</th><th>Valid</th></tr></thead>
              <tbody>{products.map(p=>(<tr key={p.id}><td>{p.sku}</td><td>{p.title}</td><td>{p.brand||"—"}</td><td>{p.category||"—"}</td><td>{p.selling_price!=null?`₹${Number(p.selling_price).toLocaleString()}`:"—"}</td><td>{p.stock_quantity ?? "—"}</td><td>{p.completeness_score!=null?Number(p.completeness_score).toFixed(0)+"%":"—"}</td><td>{p.is_valid?"Yes":"No"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className={styles.sectionBlock}><h2>Variants & media matching</h2><p>Variant management is supported by the PIM model/API (ProductVariant). Media matching (SKU/image pairing) requires a defined matching spec and is marked PLANNED in Tools Centre — not presented as automated until implemented.</p></section>
    </div>
  );
}
