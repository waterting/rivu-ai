"use client";
import { useEffect, useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, Database, UploadCloud, Wand2, Wrench, BarChart3, PieChart,
  Brain, ShoppingCart, Package, Users, Plug, Workflow, Briefcase, FileText,
  CreditCard, LogOut, Moon, Sun, ShieldCheck, ArrowUpRight, Menu, X, Settings,
  GitCompare, FileOutput, Image as ImageIcon, Store, ListChecks
} from "lucide-react";
import styles from "./dashboard.module.css";
import BrandLogo from "../../lib/BrandLogo";
import CursorField from "../../lib/CursorField";

type NavItem = { href: string; label: string; icon: typeof Activity; exact?: boolean };

/**
 * Navigation is grouped the way the work is actually done, and every label is
 * written in business language. Every route that exists in the app is reachable
 * from here — nothing was removed, only regrouped and renamed.
 */
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: Activity, exact: true },
      { href: "/dashboard/data-sources", label: "Upload data", icon: UploadCloud },
      { href: "/dashboard/datasets", label: "Datasets", icon: Database },
      { href: "/dashboard/processing-jobs", label: "Processing jobs", icon: ListChecks },
      { href: "/dashboard/refinery", label: "Clean & improve data", icon: Wand2 },
    ],
  },
  {
    title: "Data operations",
    items: [
      { href: "/dashboard/tools", label: "Data tools", icon: Wrench },
      { href: "/dashboard/tools/compare", label: "Compare datasets", icon: GitCompare },
      { href: "/dashboard/tools/format-studio", label: "Export & format", icon: FileOutput },
      { href: "/dashboard/tools/media-matcher", label: "Image checker", icon: ImageIcon },
      { href: "/dashboard/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "Product management",
    items: [
      { href: "/dashboard/commerce", label: "Commerce", icon: ShoppingCart },
      { href: "/dashboard/products", label: "Products & SKUs", icon: Package },
      { href: "/dashboard/suppliers", label: "Suppliers", icon: Users },
      { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
      { href: "/dashboard/channels", label: "Store connections", icon: Store },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/visualization", label: "Charts", icon: PieChart },
      { href: "/dashboard/intelligence", label: "AI insights", icon: Brain },
    ],
  },
  {
    title: "Automation",
    items: [{ href: "/dashboard/workflows", label: "Workflows", icon: Workflow }],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/services", label: "Services", icon: Briefcase },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/admin", label: "Admin", icon: ShieldCheck },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1").replace(/\/+$/, "");

export default function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("rivu_access_token")) {
      queueMicrotask(() => router.replace("/login"));
    }
  }, [router]);

  useEffect(() => {
    const stored = localStorage.getItem("rivu_theme") as "dark" | "light" | null;
    if (stored === "dark" || stored === "light") {
      queueMicrotask(() => setTheme(stored));
    }
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("rivu_theme", theme); }, [theme]);

  async function logout() {
    const token = localStorage.getItem("rivu_access_token");
    if (token) {
      try {
        await fetch(API + "/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + token } });
      } catch {}
    }
    ["rivu_access_token", "rivu_refresh_token", "rivu_user", "rivu_org", "rivu_theme"].forEach((k) => localStorage.removeItem(k));
    router.replace("/login");
  }

  return (
    <main className={styles.app}>
      <CursorField />
      <button className={styles.mobileMenuBtn} onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open ? <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" /> : null}

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
        <div className={styles.brandWrap}>
          <BrandLogo href="/" className={styles.brand} />
        </div>
        <div className={styles.workspaceButton} role="group" aria-label="Current workspace">
          <span className={styles.workspaceIcon}><Database size={14} /></span>
          <span><small>WORKSPACE</small><b>My workspace</b></span>
        </div>

        <nav aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div className={styles.navGroup} key={group.title}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? styles.active : ""}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sideFoot}>
          <div className={styles.secure}><ShieldCheck size={13} />Private workspace</div>
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button type="button" onClick={logout}><LogOut size={15} />Sign out</button>
        </div>
      </aside>

      <section className={styles.main}>{children}</section>
    </main>
  );
}