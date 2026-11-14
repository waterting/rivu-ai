import {
  Database, Sparkles, Workflow, FileCheck2, ShieldCheck, Plug,
  LineChart, Settings, Layers, Wand2, Table2, GitCompare,
  FileJson, Boxes, Store, Truck, ShoppingCart, Building2, Code2,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  desc?: string;
  icon?: LucideIcon;
};

export type NavGroup = {
  label: string;
  href: string;
  columns: NavLink[][];
  foot?: { title: string; desc: string; href: string; cta: string };
};

export const NAV: NavGroup[] = [
  {
    label: "Platform",
    href: "/platform",
    columns: [
      [
        { label: "Platform overview", href: "/platform", desc: "The complete Rivu refinery.", icon: Layers },
        { label: "Data Refinery", href: "/platform/data-refinery", desc: "Ingest, profile, refine, export.", icon: Database },
      ],
      [
        { label: "Ingestion & profiling", href: "/platform#ingestion", desc: "Understand data before transforming.", icon: Table2 },
        { label: "AI-assisted mapping", href: "/platform#mapping", desc: "Suggestions, never silent guesses.", icon: Wand2 },
      ],
      [
        { label: "Validation & quality", href: "/platform#quality", desc: "Measure completeness and integrity.", icon: FileCheck2 },
        { label: "Transformation & export", href: "/platform#export", desc: "Versioned, reviewable outputs.", icon: Workflow },
      ],
    ],
    foot: { title: "See the refinery end to end", desc: "A measured path from raw files to trusted data.", href: "/platform", cta: "Explore the platform" },
  },
  {
    label: "Solutions",
    href: "/solutions",
    columns: [
      [
        { label: "All solutions", href: "/solutions", desc: "Where Rivu fits your workflow.", icon: Building2 },
        { label: "E-commerce & retail", href: "/solutions/ecommerce", desc: "Catalogue-ready product data.", icon: ShoppingCart },
      ],
      [
        { label: "Supplier data", href: "/solutions/supplier-data", desc: "Inconsistent supplier sheets, reconciled.", icon: Truck },
        { label: "Custom implementations", href: "/solutions/custom", desc: "Scoped to your systems.", icon: Code2 },
      ],
    ],
    foot: { title: "Not sure which fits?", desc: "Tell us about your data shape and we'll scope it.", href: "/contact", cta: "Talk to our team" },
  },
  {
    label: "Tools",
    href: "/tools",
    columns: [
      [
        { label: "All tools", href: "/tools", desc: "Independent, functional data utilities.", icon: Boxes },
        { label: "Format Studio", href: "/tools#format-studio", desc: "Convert to any target format.", icon: FileJson },
      ],
      [
        { label: "Data Profiler", href: "/tools#profiler", desc: "Types, nulls, distributions.", icon: Table2 },
        { label: "Data Cleaner", href: "/tools#cleaner", desc: "Deterministic cleanup rules.", icon: Sparkles },
      ],
      [
        { label: "Data Validator", href: "/tools#validator", desc: "Rules, patterns, row errors.", icon: FileCheck2 },
        { label: "Data Compare", href: "/tools#compare", desc: "Field-level differences.", icon: GitCompare },
      ],
    ],
    foot: { title: "Tools are part of the workspace", desc: "Each tool has input, processing and export.", href: "/tools", cta: "Browse the tools centre" },
  },
  {
    label: "Integrations",
    href: "/integrations",
    columns: [
      [
        { label: "All integrations", href: "/integrations", desc: "Connect your commerce stack.", icon: Plug },
        { label: "Shopify", href: "/integrations#shopify", desc: "Admin GraphQL, draft-first.", icon: Store },
      ],
      [
        { label: "WooCommerce", href: "/integrations#woocommerce", desc: "REST API product sync.", icon: ShoppingCart },
        { label: "Connector framework", href: "/integrations#framework", desc: "Sheets, SQL, REST, webhooks.", icon: Workflow },
      ],
    ],
    foot: { title: "Connections show real status", desc: "Available, Connected, Setup Required, In Development, Planned.", href: "/integrations", cta: "See integration status" },
  },
];

export const SIMPLE_NAV = [
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "Company", href: "/about" },
];

export const PLATFORM_CARDS: NavLink[] = [
  { label: "Data Ingestion", href: "/platform#ingestion", desc: "Bring CSVs, JSON, spreadsheets and exports into one controlled workflow.", icon: Database },
  { label: "Data Profiling", href: "/platform#ingestion", desc: "Profile schemas, types, anomalies and distributions before transforming.", icon: Table2 },
  { label: "AI-Assisted Mapping", href: "/platform#mapping", desc: "Propose column mappings with measured confidence, never silently.", icon: Wand2 },
  { label: "Data Cleaning", href: "/platform#quality", desc: "Deterministic cleanup: nulls, duplicates, type and format normalisation.", icon: Sparkles },
  { label: "Data Validation", href: "/platform#quality", desc: "Rules, ranges, patterns and identifiers with row-level errors.", icon: FileCheck2 },
  { label: "Data Transformation", href: "/platform#export", desc: "Rename, reorder, combine, split and standardise with a visual preview.", icon: Workflow },
  { label: "Data Enrichment", href: "/platform#export", desc: "Draft descriptions, attributes and tags grounded in source data.", icon: Sparkles },
  { label: "Data Export", href: "/platform#export", desc: "Versioned outputs in CSV, XLSX, JSON and catalogue formats.", icon: FileJson },
  { label: "Data Integrations", href: "/integrations", desc: "Shopify, WooCommerce and the connector framework.", icon: Plug },
];

export const SOLUTION_CARDS: NavLink[] = [
  { label: "E-commerce & Retail", href: "/solutions/ecommerce", desc: "Product catalogues that are consistent, validated and export-ready.", icon: ShoppingCart },
  { label: "Supplier Data Management", href: "/solutions/supplier-data", desc: "Reconcile inconsistent supplier and operational sheets.", icon: Truck },
  { label: "Product Catalogue Management", href: "/solutions/ecommerce", desc: "Normalise attributes, SKUs and pricing across sources.", icon: Boxes },
  { label: "SMEs & Operations", href: "/solutions", desc: "Less repetitive preparation for lean teams.", icon: Building2 },
  { label: "Data & Technology Agencies", href: "/solutions/custom", desc: "Repeatable, reviewable pipelines for client data.", icon: Code2 },
  { label: "Custom E-commerce Data", href: "/solutions/custom", desc: "Scoped implementations against your systems.", icon: Settings },
];

export const APP_AREAS: NavLink[] = [
  { label: "Overview", href: "/dashboard", desc: "Workspace health and recent activity.", icon: LineChart },
  { label: "Data", href: "/dashboard", desc: "Datasets, upload, explorer, schema, lineage.", icon: Database },
  { label: "Tools", href: "/tools", desc: "The functional tools centre.", icon: Boxes },
  { label: "Integrations", href: "/integrations", desc: "Connection states and sync jobs.", icon: Plug },
  { label: "Settings", href: "/dashboard", desc: "Organization, roles and entitlements.", icon: Settings },
];

export const FOOTER_NAV: { title: string; links: NavLink[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Overview", href: "/platform" },
      { label: "Data Refinery", href: "/platform/data-refinery" },
      { label: "Integrations", href: "/integrations" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "All solutions", href: "/solutions" },
      { label: "E-commerce", href: "/solutions/ecommerce" },
      { label: "Supplier data", href: "/solutions/supplier-data" },
      { label: "Custom", href: "/solutions/custom" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Resources", href: "/resources" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
];