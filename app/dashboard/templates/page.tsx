"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import styles from "../dashboard.module.css";
import { catalogueFetch } from "../../../lib/api";

type TemplateField = { name: string; label?: string; type?: string; required?: boolean };
type Template = {
  id: string;
  name: string;
  description?: string;
  platform?: string;
  is_default?: boolean;
  fields: TemplateField[];
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [fieldsText, setFieldsText] = useState("sku, title, price, category, brand");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await catalogueFetch("/catalogue/templates");
      const body = await res.json().catch(() => []);
      if (!res.ok) throw new Error((body as any)?.detail?.message || "Could not load templates");
      setTemplates(Array.isArray(body) ? body : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates. Catalogue sign-in may be required.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { let c = false; (async () => { if (!c) await load(); })(); return () => { c = true; }; }, [load]);

  async function create() {
    const fieldNames = fieldsText.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || fieldNames.length === 0) { setError("Name and at least one field are required."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await catalogueFetch("/catalogue/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: desc.trim() || null,
          platform: "custom",
          is_default: false,
          fields: fieldNames.map((f) => ({ name: f, label: f, type: "string", required: false })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any)?.detail?.message || "Could not create template");
      setName(""); setDesc(""); setFieldsText("sku, title, price, category, brand");
      setMessage("Custom template created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await catalogueFetch(`/catalogue/templates/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any)?.detail?.message || "Could not delete template");
      setMessage("Template deleted.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const builtIn = templates.filter((t) => t.is_default || t.platform !== "custom");
  const custom = templates.filter((t) => !t.is_default && t.platform === "custom");

  return (
    <div>
      <header className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>RIVU / DATA / TEMPLATES</div>
          <h1>Templates Library</h1>
          <p>Built-in export and catalogue templates plus your custom templates. Use them to standardise output fields.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.sectionBlock}>
        <h2>Create custom template</h2>
        <p>Define a reusable set of output fields for your organisation.</p>
        <div className={styles.formGrid} style={{ marginTop: 12, maxWidth: 720 }}>
          <div><label>Template name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Shopify Export" /></div>
          <div><label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" /></div>
          <div><label>Fields (comma-separated)</label><input value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className={styles.primary} onClick={create} disabled={busy}><Plus size={14} /> Create template</button>
        </div>
      </section>

      {loading ? <p className={styles.muted}>Loading templates…</p> : (
        <>
          <section className={styles.sectionBlock}>
            <h2>Built-in templates ({builtIn.length})</h2>
            <div className={styles.toolGrid} style={{ marginTop: 12 }}>
              {builtIn.map((t) => (
                <div key={t.id} className={styles.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <h3>{t.name}</h3>
                    <span className={styles.statusLive}>{t.platform || "standard"}</span>
                  </div>
                  <p>{t.description || "Standard template"}</p>
                  <p style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>{t.fields.length} fields: {t.fields.slice(0, 6).map((f) => f.name).join(", ")}{t.fields.length > 6 ? "…" : ""}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sectionBlock}>
            <h2>Custom templates ({custom.length})</h2>
            {custom.length === 0 ? <p className={styles.muted}>No custom templates yet.</p> : (
              <div className={styles.toolGrid} style={{ marginTop: 12 }}>
                {custom.map((t) => (
                  <div key={t.id} className={styles.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <h3>{t.name}</h3>
                      <button className={styles.iconBtn} style={{ padding: "4px 8px" }} onClick={() => remove(t.id)} disabled={busy} title="Delete"><Trash2 size={12} /></button>
                    </div>
                    <p>{t.description || "Custom template"}</p>
                    <p style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>{t.fields.length} fields: {t.fields.slice(0, 6).map((f) => f.name).join(", ")}{t.fields.length > 6 ? "…" : ""}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}