"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Images, RefreshCw } from "lucide-react";
import styles from "../../dashboard.module.css";
import { authFetch } from "../../../../lib/api";

const authHeaders = () => ({
  Authorization:
    "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

type Product = {
  id: string;
  sku: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  primary_image_url?: string | null;
  additional_image_urls?: string[] | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function filenameTokens(url: string): string[] {
  const clean = url.split("?")[0].split("#")[0];
  const last = clean.split("/").filter(Boolean).pop() || "";
  const stem = last.replace(/\.[a-z0-9]+$/i, "");
  return [stem, ...stem.split(/[-_.\s]+/)].filter(Boolean).map(norm);
}

type Row = {
  product: Product;
  image: string;
  status: "matched" | "unmatched";
  reason: string;
};

export default function MediaMatcherPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await authFetch("/commerce/products?limit=100", { headers: authHeaders() });
      const j = await r.json().catch(() => []);
      if (!r.ok) throw new Error(j.detail?.message || j.detail || "Could not load products");
      setProducts(Array.isArray(j) ? j : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of products) {
      const sku = norm(p.sku || "");
      const images = [p.primary_image_url, ...((p.additional_image_urls || []) ?? [])].filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
      if (images.length === 0) {
        out.push({ product: p, image: "", status: "unmatched", reason: "no image attached" });
        continue;
      }
      for (const img of images) {
        const tokens = filenameTokens(img);
        const exact = tokens.includes(sku);
        const partial = !exact && sku.length >= 4 && tokens.some((t) => t.includes(sku) || sku.includes(t));
        out.push({
          product: p,
          image: img,
          status: exact || partial ? "matched" : "unmatched",
          reason: exact
            ? "filename contains SKU"
            : partial
              ? "filename partially matches SKU"
              : "filename does not reference SKU",
        });
      }
    }
    return out;
  }, [products]);

  const matched = rows.filter((r) => r.status === "matched").length;
  const unmatched = rows.length - matched;
  const visible = onlyIssues ? rows.filter((r) => r.status === "unmatched") : rows;

  const shortUrl = (u: string) => (u.length <= 58 ? u : `${u.slice(0, 30)}...${u.slice(-24)}`);

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / TOOLS / MEDIA MATCHER</div>
          <h1>Media Matcher</h1>
          <p>
            Audits whether each product&apos;s image filename references its SKU — a deterministic check over
            your existing PIM records. It reports what it can verify; it does not invent matches.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={load}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </header>

      {err && <div className={styles.error}>{err}</div>}

      <section className={styles.kpis} style={{ marginTop: 20 }}>
        <div className={styles.kpi}>
          <span>PRODUCTS SCANNED</span>
          <b>{products.length}</b>
        </div>
        <div className={styles.kpi}>
          <span>IMAGE REFERENCES</span>
          <b>{rows.length}</b>
        </div>
        <div className={styles.kpi}>
          <span>SKU-REFERENCED</span>
          <b>{matched}</b>
        </div>
        <div className={styles.kpi}>
          <span>NEEDS ATTENTION</span>
          <b>{unmatched}</b>
        </div>
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.sectionTitle}>
          <div>
            <span>RESULTS</span>
            <b>{onlyIssues ? "Unmatched references only" : "All image references"}</b>
          </div>
          <label className={styles.muted} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            Only issues
          </label>
        </div>

        {loading ? (
          <p className={styles.muted}>Loading products...</p>
        ) : products.length === 0 ? (
          <p className={styles.muted}>No products yet. Create products in Product &amp; SKU.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Title</th>
                  <th>Image reference</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={`${r.product.id}-${i}`}>
                    <td>{r.product.sku}</td>
                    <td>{r.product.title}</td>
                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.image ? shortUrl(r.image) : "—"}
                    </td>
                    <td>
                      <span className={r.status === "matched" ? styles.statusLive : styles.statusPartial}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className={styles.muted}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.sectionBlock}>
        <h2>How matching works</h2>
        <p>
          <Images size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Filenames are split on separators and compared to the normalized SKU (case and punctuation ignored).
          A reference is matched when the SKU appears as a token, or when one string contains the other (SKU of
          4+ characters). This verifies filename conventions only — it does not inspect image content.
        </p>
      </section>
    </div>
  );
}