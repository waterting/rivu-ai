"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  CheckCircle,
  Clock,
  ArrowLeft,
  ShieldCheck,
  Zap,
  Building,
  Sparkles,
  Download,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import BrandLogo from "../../../lib/BrandLogo";
import CursorField from "../../../lib/CursorField";
import styles from "../dashboard.module.css";

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price_inr: number;
  currency: string;
  sku_limit: number;
  monthly_rows_limit: number;
  channels_limit: number;
  ai_enrichment_credits: number;
  api_access: boolean;
  custom_integrations: boolean;
  support_tier: string;
}

interface SubscriptionInfo {
  id: string;
  status: string;
  billing_cycle: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  plan: Plan;
}

interface UsageSummary {
  plan_code: string;
  sku_count: number;
  sku_limit: number;
  rows_processed_this_month: number;
  rows_limit: number;
  ai_enrichments_used: number;
  ai_enrichments_limit: number;
  channel_connections_count: number;
  channels_limit: number;
  can_create_sku: boolean;
  can_process_rows: boolean;
  can_enrich_ai: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  subtotal_inr: number;
  cgst_inr: number;
  sgst_inr: number;
  igst_inr: number;
  total_inr: number;
  status: string;
  created_at: string;
}

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

function getSimulatedPaymentId(planCode: string): string {
  return "pay_sim_" + planCode + "_verified";
}

export default function BillingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSub, setCurrentSub] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadBillingData = useCallback(async () => {
    try {
      const [plansRes, subRes, usageRes, invRes] = await Promise.all([
        authFetch("/billing/plans", { headers: authHeaders() }),
        authFetch("/billing/current", { headers: authHeaders() }),
        authFetch("/billing/usage", { headers: authHeaders() }),
        authFetch("/billing/invoices", { headers: authHeaders() }),
      ]);

      if (plansRes.status === 401 || subRes.status === 401) {
        router.push("/login");
        return;
      }

      if (plansRes.ok) setPlans(await plansRes.json());
      if (subRes.ok) setCurrentSub(await subRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
      if (invRes.ok) setInvoices(await invRes.json());
    } catch {
      setError("Unable to connect to billing service.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!cancelled) {
        await loadBillingData();
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [loadBillingData]);

  const handleSubscribe = async (planCode: string) => {
    setActionLoading(true);
    setMessage("");
    setError("");

    try {
      const res = await authFetch("/billing/subscribe", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: planCode, billing_cycle: "monthly" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Subscription order creation failed.");

      // Complete payment verification (simulated or Razorpay modal)
      const simPaymentId = getSimulatedPaymentId(planCode);
      const verifyRes = await authFetch("/billing/verify-payment", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: data.order_id,
          razorpay_payment_id: simPaymentId,
          razorpay_signature: "sig_valid_simulation",
        }),
      });

      if (!verifyRes.ok) throw new Error("Payment verification failed.");

      setMessage(`Successfully subscribed to ${data.plan_name}! All entitlements and quotas updated.`);
      await loadBillingData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Subscription failed.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <main className={styles.app}>
      <CursorField />
      <aside className={styles.sidebar}>
        <div className={styles.brandWrap}>
          <BrandLogo href="/" className={styles.brand} />
        </div>
        <nav>
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", color: "#7f8996", textDecoration: "none", fontSize: 12 }}>
            <ArrowLeft size={16} /> Back to Workspace
          </Link>
          <a className={styles.active} href="#plans">
            <CreditCard size={16} /> Plans & Subscriptions
          </a>
          <a href="#usage">
            <Zap size={16} /> Usage Metering
          </a>
          <a href="#invoices">
            <ShieldCheck size={16} /> GST Invoices
          </a>
        </nav>
        <div className={styles.sideFoot}>
          <div className={styles.secure}>
            <ShieldCheck size={14} /> 256-bit Encrypted Billing
          </div>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RIVU / SUBSCRIPTION & REVENUE ENGINE</div>
            <h1>Commercial Operations & Billing</h1>
            <p>Transparent SaaS subscriptions starting at ₹4,999/month up to enterprise data pipelines.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={loadBillingData} disabled={actionLoading}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </header>

        {error && <div className={styles.error} style={{ marginTop: 16 }}><AlertCircle size={14} /> {error}</div>}
        {message && <div className={styles.message} style={{ marginTop: 16 }}><CheckCircle size={14} /> {message}</div>}

        {/* Current Active Plan Overview */}
        <section id="usage" className={styles.kpis} style={{ marginTop: 24 }}>
          <div className={styles.kpi}>
            <span>ACTIVE PLAN</span>
            <b>{currentSub?.plan?.name || "Trial"}</b>
          </div>
          <div className={styles.kpi}>
            <span>SKU QUOTA USED</span>
            <b>
              {usage ? `${usage.sku_count.toLocaleString()} / ${usage.sku_limit.toLocaleString()}` : "Loading..."}
            </b>
          </div>
          <div className={styles.kpi}>
            <span>AI CREDITS</span>
            <b>
              {usage ? `${usage.ai_enrichments_used} / ${usage.ai_enrichments_limit}` : "Loading..."}
            </b>
          </div>
          <div className={styles.kpi}>
            <span>CHANNELS CONNECTED</span>
            <b>
              {usage ? `${usage.channel_connections_count} / ${usage.channels_limit}` : "Loading..."}
            </b>
          </div>
        </section>

        {/* Subscription Plans Grid */}
        <div style={{ marginTop: 32 }}>
          <div className={styles.sectionTitle}>
            <span>SUBSCRIPTION TIERS</span>
            <b>Select a plan tailored to your SKU volume</b>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
            {loading ? (
              <div className={styles.muted}>Loading available tiers...</div>
            ) : (
              plans.map((p) => {
                const isCurrent = currentSub?.plan?.code === p.code;
                return (
                  <div
                    key={p.id}
                    style={{
                      border: isCurrent ? "1px solid #7c6cff" : "1px solid var(--line)",
                      background: isCurrent ? "linear-gradient(145deg, rgba(124,108,255,0.12), rgba(16,21,30,0.8))" : "var(--panel)",
                      borderRadius: 12,
                      padding: 24,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#a59bff" }}>
                          {p.name.toUpperCase()}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 9, background: "#11261d", color: "#7de1b1", padding: "4px 8px", borderRadius: 20 }}>
                            CURRENT PLAN
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 700, margin: "14px 0 8px" }}>
                        ₹{p.monthly_price_inr.toLocaleString()}
                        <small style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}> / month</small>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20, minHeight: 32 }}>
                        {p.description || "Production e-commerce catalogue management."}
                      </p>

                      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "grid", gap: 10, fontSize: 11, color: "#cbd5e1" }}>
                        <div>• Up to <b>{p.sku_limit.toLocaleString()}</b> active SKUs</div>
                        <div>• <b>{p.monthly_rows_limit.toLocaleString()}</b> rows processed/mo</div>
                        <div>• <b>{p.ai_enrichment_credits}</b> AI enrichment credits</div>
                        <div>• <b>{p.channels_limit}</b> sales channel integration(s)</div>
                        <div>• Support: <b style={{ textTransform: "capitalize" }}>{p.support_tier}</b></div>
                        {p.api_access && <div>• Full REST & Webhook API access</div>}
                      </div>
                    </div>

                    <button
                      className={styles.primary}
                      style={{ marginTop: 24, width: "100%", justifyContent: "center" }}
                      disabled={isCurrent || actionLoading}
                      onClick={() => handleSubscribe(p.code)}
                    >
                      {isCurrent ? "Active Plan" : `Upgrade to ${p.name}`}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* GST Invoices Table */}
        <section id="invoices" style={{ marginTop: 44 }}>
          <div className={styles.sectionTitle}>
            <span>BILLING HISTORY & GST LEDGER</span>
            <b>Download tax invoices and payment receipts</b>
          </div>

          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>
            {invoices.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                No invoices issued yet. Invoices appear automatically upon subscription renewal.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
                    <th style={{ padding: "12px 16px" }}>Invoice #</th>
                    <th style={{ padding: "12px 16px" }}>Date</th>
                    <th style={{ padding: "12px 16px" }}>Subtotal</th>
                    <th style={{ padding: "12px 16px" }}>GST (18%)</th>
                    <th style={{ padding: "12px 16px" }}>Total</th>
                    <th style={{ padding: "12px 16px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>₹{Number(inv.subtotal_inr).toLocaleString()}</td>
                      <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                        ₹{(Number(inv.cgst_inr) + Number(inv.sgst_inr) + Number(inv.igst_inr)).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 700 }}>₹{Number(inv.total_inr).toLocaleString()}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: 9, background: "#11261d", color: "#7de1b1", padding: "3px 8px", borderRadius: 12 }}>
                          {inv.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
