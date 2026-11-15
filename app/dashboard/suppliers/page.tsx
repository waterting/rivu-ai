"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, Building2, CheckCircle2, Mail, Phone, Plus, RefreshCw, UploadCloud, User, Users,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, Modal, PageHeader, SectionHead, Stat,
  buttonClass, uiStyles as s,
} from "../../../lib/ui";

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

const FORMAT_LABEL: Record<string, string> = {
  csv: "Standard CSV",
  xlsx: "Excel workbook",
  indiamart_excel: "IndiaMART seller export",
  json: "JSON feed",
};

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [defaultFormat, setDefaultFormat] = useState("csv");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await authFetch("/commerce/suppliers", { headers: authHeaders() });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("Could not load suppliers.");
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : data.suppliers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load suppliers.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.code, supplier.contact_name, supplier.contact_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [suppliers, query]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim() || !code.trim()) {
      setError("A supplier needs a name and a short code.");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/commerce/suppliers", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.toUpperCase().replace(/\s+/g, "-"),
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          default_format: defaultFormat,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Could not register the supplier.");
      setMessage(`${data.name || name.trim()} added to your suppliers.`);
      setShowAdd(false);
      setName("");
      setCode("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register the supplier.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = suppliers.filter((supplier) => supplier.is_active).length;

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Suppliers"
        title="Suppliers"
        sub="The companies you buy product data from. Keep their details and preferred file format here, then upload their catalogues in one place."
        actions={
          <>
            <button type="button" className={buttonClass("default")} onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button type="button" className={buttonClass("primary")} onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Add supplier
            </button>
          </>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}
      {message ? (
        <Callout tone="ok" icon={CheckCircle2}>
          {message}
        </Callout>
      ) : null}

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Suppliers" value={suppliers.length} hint="Companies you buy data from" icon={Users} />
        <Stat label="Active" value={activeCount} hint="Ready to send catalogues to" icon={Building2} tone="ok" />
      </div>

      <div className={s.split}>
        <Card flush>
          <SectionHead
            icon={Users}
            title="Your suppliers"
            sub="Search by name, code or contact."
            actions={
              <div className={s.searchWrap} style={{ width: 220 }}>
                <Users size={14} />
                <input
                  className={s.input}
                  placeholder="Search suppliers"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search suppliers"
                  style={{ height: 32 }}
                />
              </div>
            }
          />
          {loading ? (
            <CardBody>
              <div className={s.stack}>
                {[0, 1].map((row) => (
                  <div key={row} className={s.skeleton} style={{ height: 88 }} />
                ))}
              </div>
            </CardBody>
          ) : suppliers.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Users}
                title="No suppliers yet"
                action={
                  <button type="button" className={buttonClass("primary")} onClick={() => setShowAdd(true)}>
                    <Plus size={14} /> Add your first supplier
                  </button>
                }
              >
                A supplier is any company that sends you product data — a manufacturer, distributor or marketplace seller.
                Adding them here keeps their details in one place and remembers the file format they use.
              </EmptyState>
            </CardBody>
          ) : filtered.length === 0 ? (
            <CardBody>
              <EmptyState icon={Users} title="No matches">
                Nothing matches “{query}”.
              </EmptyState>
            </CardBody>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Code</th>
                    <th>Contact</th>
                    <th>Prefers</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((supplier) => (
                    <tr key={supplier.id}>
                      <td className={s.strong}>{supplier.name}</td>
                      <td className="num">{supplier.code}</td>
                      <td>
                        {supplier.contact_name || supplier.contact_email ? (
                          <span style={{ display: "grid", gap: 2 }}>
                            {supplier.contact_name ? <span>{supplier.contact_name}</span> : null}
                            {supplier.contact_email ? (
                              <span className={s.xs} style={{ color: "var(--faint)" }}>
                                {supplier.contact_email}
                              </span>
                            ) : null}
                            {supplier.contact_phone ? (
                              <span className={s.xs} style={{ color: "var(--faint)" }}>
                                {supplier.contact_phone}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span style={{ color: "var(--faint)" }}>Not added</span>
                        )}
                      </td>
                      <td>{FORMAT_LABEL[supplier.default_format] || supplier.default_format}</td>
                      <td>
                        <Badge tone={supplier.is_active ? "ok" : "neutral"} dot>
                          {supplier.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className={s.stack}>
          <Card>
            <SectionHead icon={UploadCloud} title="Sending them a catalogue" />
            <CardBody>
              <div className={s.stack} style={{ gap: 10 }}>
                <p className={s.small} style={{ margin: 0, color: "var(--text-soft)", lineHeight: 1.6 }}>
                  Each supplier sends product data in its own layout. Rivu matches their columns to the fields your store
                  needs, shows you the match, and lets you confirm before anything is imported.
                </p>
                <div className={s.stack} style={{ gap: 6 }}>
                  {[
                    "Upload the supplier file",
                    "Review the column matches",
                    "Fix anything Rivu could not match",
                    "Approve the catalogue",
                  ].map((step, index) => (
                    <div key={step} className={s.row} style={{ gap: 9 }}>
                      <span
                        style={{
                          display: "grid",
                          placeItems: "center",
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          border: "1px solid var(--line)",
                          background: "var(--surface-2)",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--text-soft)",
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span className={s.small} style={{ color: "var(--text-soft)" }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/our-solutions/catalogue-data-entry" className={buttonClass("primary")}>
                  Upload a supplier catalogue <ArrowUpRight size={14} />
                </Link>
              </div>
            </CardBody>
          </Card>

          <Card>
            <SectionHead icon={User} title="Why add a code?" />
            <CardBody>
              <p className={s.small} style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>
                The code is a short name you control, used on files and reports. Something like{" "}
                <span className={s.strong}>APEX-TX</span> is easier to spot than a long company name.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {showAdd ? (
        <Modal
          title="Add a supplier"
          sub="Only the name and code are required. You can fill in the rest later."
          onClose={() => setShowAdd(false)}
          footer={
            <>
              <button type="button" className={buttonClass("ghost")} onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" form="supplier-form" className={buttonClass("primary")} disabled={saving}>
                {saving ? "Saving..." : "Save supplier"}
              </button>
            </>
          }
        >
          <form id="supplier-form" onSubmit={create} className={s.stack} style={{ gap: 13 }}>
            <label className={s.field}>
              <span className={s.label}>Company name</span>
              <input
                className={s.input}
                required
                placeholder="e.g. Apex Textiles Pvt Ltd"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <span className={s.hint}>How the supplier appears everywhere in Rivu.</span>
            </label>

            <label className={s.field}>
              <span className={s.label}>Short code</span>
              <input
                className={s.input}
                required
                placeholder="e.g. APEX-TX"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <span className={s.hint}>Used on files and reports. Letters, numbers and dashes.</span>
            </label>

            <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <label className={s.field}>
                <span className={s.label}>Contact person</span>
                <input
                  className={s.input}
                  placeholder="Optional"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                />
              </label>
              <label className={s.field}>
                <span className={s.label}>Phone</span>
                <input
                  className={s.input}
                  placeholder="Optional"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                />
              </label>
            </div>

            <label className={s.field}>
              <span className={s.label}>Contact email</span>
              <input
                className={s.input}
                type="email"
                placeholder="Optional"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </label>

            <label className={s.field}>
              <span className={s.label}>Catalogue format they send</span>
              <select className={s.select} value={defaultFormat} onChange={(event) => setDefaultFormat(event.target.value)}>
                <option value="csv">Standard CSV</option>
                <option value="xlsx">Excel workbook (.xlsx)</option>
                <option value="indiamart_excel">IndiaMART seller export</option>
                <option value="json">JSON feed</option>
              </select>
              <span className={s.hint}>Rivu uses this to suggest the right column matches when you upload.</span>
            </label>

            {error ? (
              <Callout tone="bad" icon={Mail}>
                {error}
              </Callout>
            ) : null}
          </form>
        </Modal>
      ) : null}
    </div>
  );
}