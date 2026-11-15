"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Plus,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import BrandLogo from "../../../lib/BrandLogo";
import CursorField from "../../../lib/CursorField";
import styles from "../dashboard.module.css";

interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_format: string;
  is_active: boolean;
  created_at: string;
}

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Supplier form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [defaultFormat, setDefaultFormat] = useState("csv");

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await authFetch("/commerce/suppliers", { headers: authHeaders() });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) {
        setSuppliers(await res.json());
      }
    } catch {
      setError("Failed to load supplier directory.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!cancelled) {
        await loadSuppliers();
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [loadSuppliers]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const res = await authFetch("/commerce/suppliers", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: code.toUpperCase().replace(/\s+/g, "-"),
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          default_format: defaultFormat,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Could not register supplier.");

      setMessage(`Supplier ${data.name} added to directory.`);
      setShowAddModal(false);
      setName("");
      setCode("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      await loadSuppliers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Creation failed.");
    }
  };

  return (
    <div>
            <div className={styles.eyebrow}>RIVU / SUPPLIER NETWORK OPERATIONS</div>
            <h1>Supplier Directory & Ingestion</h1>
            <p>Manage vendors, manufacturers, and IndiaMART sellers with learned mapping recipes.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={loadSuppliers}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className={styles.primary} onClick={() => setShowAddModal(true)}>
              <Plus size={15} /> Add Supplier
            </button>
          </div>
        </header>

        {error && <div className={styles.error} style={{ marginTop: 16 }}><AlertCircle size={14} /> {error}</div>}
        {message && <div className={styles.message} style={{ marginTop: 16 }}><CheckCircle size={14} /> {message}</div>}

        <div style={{ marginTop: 24 }}>
          <div className={styles.sectionTitle}>
            <span>REGISTERED SUPPLIERS</span>
            <b>{suppliers.length} Active Vendors in Network</b>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 12 }}>
            {loading ? (
              <div className={styles.muted}>Loading supplier network...</div>
            ) : suppliers.length === 0 ? (
              <div style={{ background: "var(--panel)", border: "1px dashed var(--line)", borderRadius: 10, padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                No suppliers registered yet. Click <b>Add Supplier</b> to configure your first vendor.
              </div>
            ) : (
              suppliers.map((s) => (
                <div key={s.id} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#a59bff" }}>{s.code}</span>
                    <span style={{ fontSize: 9, background: "#11261d", color: "#7de1b1", padding: "3px 8px", borderRadius: 12 }}>
                      {s.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 16, margin: "10px 0 4px" }}>{s.name}</h3>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Contact: {s.contact_name || "Not specified"} ({s.contact_email || "No email"})
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
                    Default Feed Format: <b style={{ textTransform: "uppercase" }}>{s.default_format}</b>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add Supplier Modal */}
        {showAddModal && (
          <div className={styles.modal}>
            <div className={styles.modalCard}>
              <div className={styles.eyebrow}>VENDOR ONBOARDING</div>
              <h2>Add Supplier</h2>
              <p>Register a manufacturer, distributor, or IndiaMART seller.</p>

              <form onSubmit={handleCreateSupplier} style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Company / Supplier Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Textiles Pvt Ltd"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Supplier Code (Unique)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. APEX-TX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Contact Email</label>
                  <input
                    type="email"
                    placeholder="rajesh@apextextiles.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Catalogue Format</label>
                  <select
                    value={defaultFormat}
                    onChange={(e) => setDefaultFormat(e.target.value)}
                    style={{ width: "100%", background: "#090d13", border: "1px solid #29313b", color: "#fff", borderRadius: 7, padding: 10, marginTop: 4 }}
                  >
                    <option value="csv">Standard CSV</option>
                    <option value="xlsx">Excel Workbook (.xlsx)</option>
                    <option value="indiamart_excel">IndiaMART Seller Export</option>
                    <option value="json">JSON Feed</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button type="button" className={styles.iconBtn} onClick={() => setShowAddModal(false)} style={{ flex: 1, justifyContent: "center" }}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.primary} style={{ flex: 1, justifyContent: "center" }}>
                    Save Supplier
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
    </div>
  );
}
