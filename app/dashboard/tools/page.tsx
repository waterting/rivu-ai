"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight, Boxes, CopyCheck, Download, FileCheck2, FileJson, Gauge, GitCompare,
  Images, ScanBarcode, Search, Sparkles, Table2, Wand2, Workflow,
} from "lucide-react";
import { Badge, Callout, Card, CardBody, EmptyState, PageHeader, SectionHead, buttonClass, uiStyles as s } from "../../../lib/ui";

type Category =
  | "Cleaning"
  | "Validation"
  | "Normalization"
  | "Duplicate detection"
  | "Formatting"
  | "Transformation"
  | "Product catalogue"
  | "Advanced";

type Tool = {
  id: string;
  name: string;
  category: Category;
  icon: typeof Table2;
  what: string;
  example: string;
  input: string;
  output: string;
  href: string;
  actionLabel: string;
  availability: "ready" | "refinery" | "catalogue";
};

const TOOLS: Tool[] = [
  {
    id: "clean",
    name: "Clean up my data",
    category: "Cleaning",
    icon: Sparkles,
    what: "Fixes untidy values — extra spaces, mixed capitalisation, inconsistent dates and missing entries.",
    example: "“ACME ”, “acme” and “Acme” all become “Acme”.",
    input: "A file you have uploaded",
    output: "A cleaned copy, saved as a new version",
    href: "/dashboard/refinery",
    actionLabel: "Clean a file",
    availability: "refinery",
  },
  {
    id: "duplicates",
    name: "Find duplicate records",
    category: "Duplicate detection",
    icon: CopyCheck,
    what: "Spots repeated rows, for example the same product entered twice with slightly different spelling.",
    example: "120 of 8,000 SKUs are duplicated.",
    input: "A file you have uploaded",
    output: "A list of duplicates you can remove or keep",
    href: "/dashboard/refinery",
    actionLabel: "Find duplicates",
    availability: "refinery",
  },
  {
    id: "outliers",
    name: "Spot unusual values",
    category: "Validation",
    icon: Gauge,
    what: "Flags prices, dates or quantities that look wrong compared with the rest of the column.",
    example: "A unit price of 5 among prices of 100–200.",
    input: "A file you have uploaded",
    output: "Warnings with the affected rows",
    href: "/dashboard/refinery",
    actionLabel: "Check for unusual values",
    availability: "refinery",
  },
  {
    id: "quality",
    name: "Check data quality",
    category: "Validation",
    icon: FileCheck2,
    what: "Scores how usable a file is across completeness, accuracy, consistency and uniqueness.",
    example: "Quality 72/100 — 4 issues found.",
    input: "A file you have uploaded",
    output: "A score, a list of issues and suggested fixes",
    href: "/dashboard/refinery",
    actionLabel: "Run a quality check",
    availability: "refinery",
  },
  {
    id: "profiling",
    name: "Understand my data",
    category: "Validation",
    icon: Table2,
    what: "Counts rows and columns, detects column types and shows how much of each column is empty.",
    example: "8,000 rows, 24 columns, 3% missing.",
    input: "A file you have uploaded",
    output: "A plain-language summary of the file",
    href: "/dashboard/refinery",
    actionLabel: "Summarise a file",
    availability: "refinery",
  },
  {
    id: "normalize",
    name: "Standardise categories",
    category: "Normalization",
    icon: Wand2,
    what: "Makes labels consistent so reporting is accurate — one spelling per category.",
    example: "“T-Shirts”, “tshirt” and “T Shirt” become “T-Shirts”.",
    input: "A file you have uploaded",
    output: "Consistent category values",
    href: "/dashboard/refinery",
    actionLabel: "Standardise categories",
    availability: "refinery",
  },
  {
    id: "dates",
    name: "Fix date formats",
    category: "Normalization",
    icon: Table2,
    what: "Reads dates written in different styles and rewrites them the same way.",
    example: "05/01/2026 and 2026-01-05 become one format.",
    input: "A file you have uploaded",
    output: "Consistent, sortable dates",
    href: "/dashboard/refinery",
    actionLabel: "Fix date formats",
    availability: "refinery",
  },
  {
    id: "compare",
    name: "Compare two files",
    category: "Validation",
    icon: GitCompare,
    what: "Shows what changed between two versions of a dataset — rows, columns, missing values and duplicates.",
    example: "Version 2 has 120 fewer duplicates than version 1.",
    input: "Two files in the same project",
    output: "A side-by-side difference report",
    href: "/dashboard/tools/compare",
    actionLabel: "Compare files",
    availability: "ready",
  },
  {
    id: "format",
    name: "Export and convert",
    category: "Formatting",
    icon: FileJson,
    what: "Downloads your cleaned data in the format each destination needs.",
    example: "CSV for a shop import, Excel for a manager, Parquet for a BI tool.",
    input: "A cleaned file",
    output: "CSV, Excel, JSON or Parquet download",
    href: "/dashboard/tools/format-studio",
    actionLabel: "Export a file",
    availability: "ready",
  },
  {
    id: "reports",
    name: "Build a report",
    category: "Formatting",
    icon: Gauge,
    what: "Turns the measured results into a shareable report for stakeholders.",
    example: "A PDF summary of quality and issues for a monthly review.",
    input: "A cleaned file",
    output: "PDF or JSON report",
    href: "/dashboard/reports",
    actionLabel: "Open reports",
    availability: "ready",
  },
  {
    id: "transform",
    name: "Apply multiple fixes at once",
    category: "Transformation",
    icon: Workflow,
    what: "Builds a sequence of fixes, shows a preview of every change, then applies them together.",
    example: "Trim spaces, fix dates, then remove duplicates in one run.",
    input: "A file you have uploaded",
    output: "One new version containing all approved changes",
    href: "/dashboard/refinery",
    actionLabel: "Build a set of fixes",
    availability: "refinery",
  },
  {
    id: "catalogue-map",
    name: "Map supplier columns",
    category: "Product catalogue",
    icon: Wand2,
    what: "Matches the columns in a supplier file to the fields your store needs, with a confidence score.",
    example: "“Item Desc” maps to “Title” at 92% confidence.",
    input: "A supplier spreadsheet",
    output: "A mapping you can review and confirm",
    href: "/our-solutions/catalogue-data-entry",
    actionLabel: "Open catalogue portal",
    availability: "catalogue",
  },
  {
    id: "catalogue-enrich",
    name: "Fill in missing product details",
    category: "Product catalogue",
    icon: Sparkles,
    what: "Suggests missing titles, descriptions and attributes using AI, with the original values kept for review.",
    example: "Adds a description for 45 products that had none.",
    input: "A catalogue file in the catalogue portal",
    output: "Suggested values for your approval",
    href: "/our-solutions/catalogue-data-entry",
    actionLabel: "Open catalogue portal",
    availability: "catalogue",
  },
  {
    id: "catalogue-export",
    name: "Bulk product export",
    category: "Product catalogue",
    icon: Boxes,
    what: "Exports the whole approved catalogue in a layout your marketplace expects.",
    example: "1,200 SKUs as an XLSX ready for import.",
    input: "An approved catalogue",
    output: "XLSX, CSV or JSON export",
    href: "/our-solutions/catalogue-data-entry",
    actionLabel: "Open catalogue portal",
    availability: "catalogue",
  },
  {
    id: "media",
    name: "Check product images",
    category: "Advanced",
    icon: Images,
    what: "Verifies that product image filenames actually match the SKU they belong to.",
    example: "6 images named after the wrong SKU.",
    input: "Products in your catalogue",
    output: "A list of mismatches to fix",
    href: "/dashboard/tools/media-matcher",
    actionLabel: "Run image check",
    availability: "ready",
  },
  {
    id: "sku",
    name: "Manage products and SKUs",
    category: "Product catalogue",
    icon: ScanBarcode,
    what: "Create and inspect the product records that feed your store and marketplaces.",
    example: "Add a product with price, stock and images.",
    input: "Product details",
    output: "A saved product record",
    href: "/dashboard/products",
    actionLabel: "Open products",
    availability: "ready",
  },
];

const CATEGORIES: Array<Category | "All"> = [
  "All",
  "Cleaning",
  "Duplicate detection",
  "Validation",
  "Normalization",
  "Formatting",
  "Transformation",
  "Product catalogue",
  "Advanced",
];

const AVAILABILITY: Record<Tool["availability"], { label: string; tone: "ok" | "info" | "neutral" }> = {
  ready: { label: "Ready to use", tone: "ok" },
  refinery: { label: "Included in Clean & improve data", tone: "info" },
  catalogue: { label: "Catalogue portal", tone: "neutral" },
};

function ToolsCentreInner() {
  const search = useSearchParams();
  const focus = search.get("tool");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");

  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(focus)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      if (category !== "All" && tool.category !== category) return false;
      if (!needle) return true;
      return [tool.name, tool.what, tool.example, tool.category].join(" ").toLowerCase().includes(needle);
    });
  }, [query, category]);

  const grouped = useMemo(() => {
    const map = new Map<Category, Tool[]>();
    for (const tool of filtered) {
      const list = map.get(tool.category) || [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Data tools"
        title="What would you like to fix?"
        sub="Every tool here runs on your own data. Pick one, or search for the problem you are trying to solve."
        actions={<Badge tone="neutral">{TOOLS.length} tools</Badge>}
      />

      <Callout tone="info" icon={Sparkles} title="Not sure which to use?">
        Start with <strong>Check data quality</strong> — it tells you what is wrong, then you can fix it with the matching tool.
        You can also let Rivu walk you through it step by step in{" "}
        <Link href="/dashboard/refinery" style={{ color: "inherit", fontWeight: 600 }}>
          Clean &amp; improve data
        </Link>
        .
      </Callout>

      <Card>
        <CardBody>
          <div className={s.stack} style={{ gap: 12 }}>
            <div className={s.searchWrap}>
              <Search size={15} />
              <input
                className={s.input}
                placeholder="Search tools — try “duplicates”, “dates” or “export”"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search tools"
              />
            </div>
            <div className={s.chipRow}>
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${s.chip} ${category === item ? s.chipActive : ""}`}
                  onClick={() => setCategory(item)}
                  aria-pressed={category === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {grouped.length ? (
        grouped.map(([groupName, tools]) => (
          <section key={groupName} className={s.stack} aria-label={groupName}>
            <div className={s.row} style={{ gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 620, letterSpacing: "-0.005em" }}>{groupName}</h2>
              <span className={s.xs} style={{ color: "var(--faint)" }}>
                {tools.length} {tools.length === 1 ? "tool" : "tools"}
              </span>
            </div>
            <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))" }}>
              {tools.map((tool) => {
                const Icon = tool.icon;
                const availability = AVAILABILITY[tool.availability];
                return (
                  <Card key={tool.id} className={s.stack}>
                    <div
                      id={tool.id}
                      style={{
                        scrollMarginTop: 90,
                        display: "grid",
                        gap: 10,
                        padding: 16,
                        outline: focus === tool.id ? "2px solid var(--accent)" : undefined,
                        outlineOffset: focus === tool.id ? -2 : undefined,
                        borderRadius: "var(--radius, 10px)",
                      }}
                    >
                      <div className={s.spread} style={{ alignItems: "flex-start" }}>
                        <span
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: "1px solid var(--line)",
                            background: "var(--surface-2)",
                            color: "var(--text-soft)",
                          }}
                        >
                          <Icon size={15} />
                        </span>
                        <Badge tone={availability.tone}>{availability.label}</Badge>
                      </div>

                      <div style={{ display: "grid", gap: 5 }}>
                        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em" }}>{tool.name}</h3>
                        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-soft)" }}>{tool.what}</p>
                      </div>

                      <dl className={s.facts} style={{ fontSize: 12 }}>
                        <div className={s.fact}>
                          <dt>Example</dt>
                          <dd style={{ fontWeight: 400, color: "var(--muted)", textAlign: "right", maxWidth: "62%" }}>{tool.example}</dd>
                        </div>
                        <div className={s.fact}>
                          <dt>You provide</dt>
                          <dd style={{ fontWeight: 400, color: "var(--muted)", textAlign: "right" }}>{tool.input}</dd>
                        </div>
                        <div className={s.fact}>
                          <dt>You get</dt>
                          <dd style={{ fontWeight: 400, color: "var(--muted)", textAlign: "right" }}>{tool.output}</dd>
                        </div>
                      </dl>

                      <Link href={tool.href} className={buttonClass("default", s.btnSm)} style={{ justifySelf: "start" }}>
                        {tool.actionLabel} <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              icon={Search}
              title="No tools match that search"
              action={
                <button
                  type="button"
                  className={buttonClass("default")}
                  onClick={() => {
                    setQuery("");
                    setCategory("All");
                  }}
                >
                  Clear search
                </button>
              }
            >
              Try a simpler word, such as “duplicate”, “clean” or “export”.
            </EmptyState>
          </CardBody>
        </Card>
      )}

      <Card>
        <SectionHead
          icon={FileCheck2}
          title="Nothing here is decorative"
          sub="Each tool runs the same processing engine used by the guided workflow. Results are stored as versions, so you can always return to an earlier state."
        />
      </Card>
    </div>
  );
}

export default function ToolsCentrePage() {
  return (
    <Suspense fallback={<div className={s.page}><div className={s.skeleton} style={{ height: 200 }} /></div>}>
      <ToolsCentreInner />
    </Suspense>
  );
}