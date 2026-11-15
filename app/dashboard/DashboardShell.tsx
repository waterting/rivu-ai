"use client";
import { useEffect, useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, Database, UploadCloud, Wand2, Wrench, BarChart3, PieChart,
  Brain, ShoppingCart, Package, Users, Plug, Workflow, Briefcase, FileText,
  CreditCard, LogOut, Moon, Sun, ShieldCheck, ArrowUpRight, Menu, X
} from "lucide-react";
import styles from "./dashboard.module.css";
import BrandLogo from "../../lib/BrandLogo";
import CursorField from "../../lib/CursorField";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: Activity, exact: true },
  { href: "/dashboard/data-sources", label: "Data Sources", icon: UploadCloud },
  { href: "/dashboard/refinery", label: "Data Refinery", icon: Wand2 },
  { href: "/dashboard/tools", label: "Tools Centre", icon: Wrench },
  { href: "/dashboard/analytics", label: "Data Analytics", icon: BarChart3 },
  { href: "/dashboard/visualization", label: "Data Visualization", icon: PieChart },
  { href: "/dashboard/intelligence", label: "AI Business Intelligence", icon: Brain },
  { href: "/dashboard/commerce", label: "Commerce & Catalogue", icon: ShoppingCart },
  { href: "/dashboard/products", label: "Product & SKU", icon: Package },
  { href: "/dashboard/suppliers", label: "Supplier Management", icon: Users },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/workflows", label: "Workflows & Automation", icon: Workflow },
  { href: "/dashboard/services", label: "Services", icon: Briefcase },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/billing", label: "Billing & Settings", icon: CreditCard },
];

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
        await fetch((process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1").replace(/\/+$/, "") + "/auth/logout", {
          method: "POST", headers: { Authorization: "Bearer " + token },
        });
      } catch {}
    }
    ["rivu_access_token", "rivu_refresh_token", "rivu_user", "rivu_org", "rivu_theme"].forEach((k) => localStorage.removeItem(k));
    router.replace("/login");
  }

  return (
    <main className={styles.app}>
      <CursorField />
      <button className={styles.mobileMenuBtn} onClick={() => setOpen(!open)} aria-label="Menu">
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
        <div className={styles.brandWrap}><BrandLogo href="/" className={styles.brand} /></div>
        <button className={styles.workspaceButton} type="button" aria-label="Current workspace">
          <span className={styles.workspaceIcon}><Database size={14} /></span>
          <span><small>WORKSPACE</small><b>Rivu AI Workspace</b></span>
          <ArrowUpRight size={14} />
        </button>
        <nav>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? styles.active : ""} onClick={() => setOpen(false)}>
                <Icon size={16} />{item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sideFoot}>
          <div className={styles.secure}><ShieldCheck size={14} />Private workspace</div>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{theme === "dark" ? "Light" : "Dark"}
          </button>
          <button onClick={logout}><LogOut size={15} />Sign out</button>
        </div>
      </aside>
      <section className={styles.main}>{children}</section>
    </main>
  );
}
