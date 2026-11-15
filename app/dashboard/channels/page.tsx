"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Plus,
  Send,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import BrandLogo from "../../../lib/BrandLogo";
import CursorField from "../../../lib/CursorField";
import styles from "../dashboard.module.css";

interface Channel {
  id: string;
  channel_type: string;
  name: string;
  store_url: string;
  status: string;
  last_sync_at: string | null;
  created_at: string;
}

interface ProductItem {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  selling_price: number | null;
  is_valid: boolean;
}

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Connect form state
  const [channelType, setChannelType] = useState("shopify");
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [chanRes, prodRes] = await Promise.all([
        authFetch("/commerce/channels", { headers: authHeaders() }),
        authFetch("/commerce/products", { headers: authHeaders() }),
      ]);

      if (chanRes.status === 401) {
        router.push("/login");
        return;
      }

      if (chanRes.ok) {
        const chanData: Channel[] = await chanRes.json();
        setChannels(chanData);
        if (chanData.length > 0 && !selectedChannel) {
          setSelectedChannel(chanData[0].id);
        }
      }
      if (prodRes.ok) {
        setProducts(await prodRes.json());
      }
    } catch {
      setError("Failed to load channel connections.");
    } finally {
      setLoading(false);
    }
  }, [router, selectedChannel]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!cancelled) {
        await loadData();
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const res = await authFetch("/commerce/channels/connect", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_type: channelType,
          name: storeName,
          store_url: storeUrl,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Connection failed.");

      setMessage(
        data.status === "sandbox"
          ? `Connected to ${storeName} in SANDBOX mode (no live Shopify calls).`
          : `Connected to ${storeName} successfully!`
      );
      setShowConnectModal(false);
      setStoreName("");
      setStoreUrl("");
      setAccessToken("");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    }
  };

  const handlePublishAllDrafts = async () => {
    if (!selectedChannel) {
      setError("Please select a target channel connection.");
      return;
    }
    const publishable = products.filter((p) => p.is_valid);
    if (publishable.length === 0) {
      setError("No valid products to publish. Fix validation errors first.");
      return;
    }
    setPublishing(true);
    setMessage("");
    setError("");

    try {
      const res = await authFetch("/commerce/channels/publish", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_connection_id: selectedChannel,
          product_ids: publishable.map((p) => p.id),
          publish_as_draft: true, // Always safe: creates in draft status
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Publishing failed.");

      const results: Array<{ sku: string; status: string; error?: string }> = data.results || [];
      const succeeded = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "failed").length;
      setMessage(
        `Published ${succeeded} of ${data.total_requested ?? publishable.length} products as DRAFT to store!` +
          (failed ? ` (${failed} failed)` : "")
      );
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RIVU / MULTI-CHANNEL DISTRIBUTION</div>
            <h1>Commerce Channels & Shopify</h1>
            <p>Publish verified canonical catalogues directly to Shopify Admin GraphQL API as draft products.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={loadData}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className={styles.primary} onClick={() => setShowConnectModal(true)}>
              <Plus size={15} /> Connect Store
            </button>
          </div>
        </header>

        {error && <div className={styles.error} style={{ marginTop: 16 }}><AlertCircle size={14} /> {error}</div>}
        {message && <div className={styles.message} style={{ marginTop: 16 }}><CheckCircle size={14} /> {message}</div>}

        {/* Channels List */}
        <div style={{ marginTop: 24 }}>
          <div className={styles.sectionTitle}>
            <span>CONNECTED STORES</span>
            <b>Active distribution endpoints</b>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 12 }}>
            {channels.length === 0 ? (
              <div style={{ background: "var(--panel)", border: "1px dashed var(--line)", borderRadius: 10, padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                No active sales channels connected. Click <b>Connect Store</b> above to link a Shopify or WooCommerce store.
              </div>
            ) : (
              channels.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "var(--panel)",
                    border: selectedChannel === c.id ? "1px solid #7c6cff" : "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 20,
                  }}
                  onClick={() => setSelectedChannel(c.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#a59bff", letterSpacing: 1 }}>
                      {c.channel_type.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, background: "#11261d", color: "#7de1b1", padding: "3px 8px", borderRadius: 12 }}>
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 16, margin: "10px 0 4px" }}>{c.name}</h3>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.store_url}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
                    Last synced: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : "Never"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sync / Publish Action Strip */}
        {channels.length > 0 && (
          <div style={{ marginTop: 32, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Publish to Store (Draft Status)</div>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
                Publishes your valid canonical products to the selected channel with all variants, images, and prices.
              </p>
            </div>
            <button
              className={styles.primary}
              onClick={handlePublishAllDrafts}
              disabled={publishing}
              style={{ gap: 8, whiteSpace: "nowrap" }}
            >
              <Send size={15} />
              {publishing ? "Publishing to Shopify..." : "Publish Approved SKUs as Draft"}
            </button>
          </div>
        )}

        {/* Connect Channel Modal */}
        {showConnectModal && (
          <div className={styles.modal}>
            <div className={styles.modalCard}>
              <div className={styles.eyebrow}>ADD COMMERCE CHANNEL</div>
              <h2>Connect Store</h2>
              <p>Link your Shopify or WooCommerce store to enable continuous SKU sync.</p>

              <form onSubmit={handleConnect} style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Platform</label>
                  <select
                    value={channelType}
                    onChange={(e) => setChannelType(e.target.value)}
                    style={{ width: "100%", background: "#090d13", border: "1px solid #29313b", color: "#fff", borderRadius: 7, padding: 10, marginTop: 4 }}
                  >
                    <option value="shopify">Shopify (Admin GraphQL API 2024-10)</option>
                    <option value="woocommerce">WooCommerce</option>
                    <option value="indiamart">IndiaMART Seller API</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Store Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My Brand Official Store"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Store Domain URL</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. mybrand.myshopify.com"
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>
                    Admin API Access Token (required â€” real Shopify custom-app token)
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="shpat_..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    A real token is required. Sandbox/placeholder tokens are only accepted outside production.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button type="button" className={styles.iconBtn} onClick={() => setShowConnectModal(false)} style={{ flex: 1, justifyContent: "center" }}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.primary} style={{ flex: 1, justifyContent: "center" }}>
                    Connect Channel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}
