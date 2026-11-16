"""Registry of every tool in the Rivu Tools Centre.

Each entry declares what the tool does, what it consumes and emits, and the
configuration fields its workspace renders. The runner and the API both read
from here, so the catalogue page, the individual workspace and the execution
endpoint can never drift apart.

Keeping this declarative matters for the Part 11 rules: a tool is only listed
here once it has a real execution path in ``runner.py``. A card with no runner
behind it would be a dead button, so ``TOOLS`` and ``runner.RUNNERS`` are
checked against each other by ``test_tools_registry.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

FieldKind = Literal["text", "number", "select", "multiselect", "columns", "boolean"]


@dataclass(frozen=True)
class ConfigField:
    """One control in a tool workspace."""

    key: str
    label: str
    kind: FieldKind
    help: str = ""
    default: Any = None
    options: list[str] = field(default_factory=list)
    required: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "kind": self.kind,
            "help": self.help,
            "default": self.default,
            "options": list(self.options),
            "required": self.required,
        }


@dataclass(frozen=True)
class ToolSpec:
    slug: str
    name: str
    category: str
    tagline: str
    description: str
    input_formats: list[str]
    output_formats: list[str]
    fields: list[ConfigField] = field(default_factory=list)
    needs_ai: bool = False
    destructive: bool = False
    featured: bool = False
    order: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "name": self.name,
            "category": self.category,
            "tagline": self.tagline,
            "description": self.description,
            "input_formats": list(self.input_formats),
            "output_formats": list(self.output_formats),
            "fields": [f.as_dict() for f in self.fields],
            "needs_ai": self.needs_ai,
            "destructive": self.destructive,
            "featured": self.featured,
            "order": self.order,
        }


# The eight categories from the brief, in display order.
CATEGORIES = [
    "Data Preparation",
    "Data Cleaning",
    "Data Transformation",
    "Data Quality",
    "E-commerce Catalogue",
    "AI Enrichment",
    "Data Export",
    "Integrations & Automation",
]


def _column_field(key: str = "column", label: str = "Column", required: bool = False) -> ConfigField:
    """A column picker. The workspace fills in the dataset's actual columns."""
    return ConfigField(
        key=key,
        label=label,
        kind="columns",
        help="Choose from the columns in the selected dataset.",
        required=required,
    )


TOOLS: list[ToolSpec] = [
    # ── Data Preparation ────────────────────────────────────────────────────
    ToolSpec(
        slug="data-profiler",
        name="Data Profiler",
        category="Data Preparation",
        tagline="Know exactly what is in your file.",
        description=(
            "Detects every column, its inferred type and semantic role, then measures "
            "null counts, uniqueness, distributions and outliers. Produces the profiling "
            "report the rest of Rivu reasons about."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["json", "csv"],
        fields=[
            ConfigField(
                key="sample_rows",
                label="Rows to sample",
                kind="number",
                help="0 profiles the whole file. A sample is faster on very large files.",
                default=0,
            )
        ],
        featured=True,
        order=1,
    ),
    ToolSpec(
        slug="smart-mapper",
        name="Smart Column Mapper",
        category="Data Preparation",
        tagline="Map source columns to target fields with a real confidence score.",
        description=(
            "Infers a source-to-target column mapping from the target field names and the "
            "observed values, then reports a confidence per field. Every suggestion is "
            "editable and nothing is applied without your say."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="target_fields",
                label="Target fields",
                kind="text",
                help="Comma-separated target field names, in order.",
                default="",
                required=True,
            )
        ],
        featured=True,
        order=2,
    ),
    # ── Data Cleaning ───────────────────────────────────────────────────────
    ToolSpec(
        slug="data-cleaner",
        name="Data Cleaner",
        category="Data Cleaning",
        tagline="Fix whitespace, casing, dates, numbers and nulls.",
        description=(
            "Applies a chosen set of deterministic cleaning rules: trim and normalise "
            "whitespace, change casing, standardise dates and datetimes, coerce numeric "
            "and boolean values, normalise currency, phone and email fields, fill or drop "
            "nulls, and drop duplicate rows."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="rules",
                label="Cleaning rules",
                kind="multiselect",
                help="Only the rules you tick are applied.",
                default=["trim_whitespace", "normalize_whitespace"],
                options=[
                    "trim_whitespace",
                    "normalize_whitespace",
                    "lowercase",
                    "uppercase",
                    "title_case",
                    "standardize_date",
                    "standardize_datetime",
                    "coerce_numeric",
                    "coerce_boolean",
                    "normalize_currency",
                    "normalize_phone",
                    "normalize_email",
                    "normalize_category",
                    "drop_nulls",
                    "remove_duplicates",
                ],
            ),
            ConfigField(
                key="drop_empty_rows",
                label="Remove rows that are entirely empty",
                kind="boolean",
                default=True,
            ),
        ],
        featured=True,
        order=3,
    ),
    ToolSpec(
        slug="duplicate-finder",
        name="Duplicate Finder",
        category="Data Cleaning",
        tagline="Find exact and near-duplicate records.",
        description=(
            "Groups rows that share a key, either across every column or across the "
            "columns you choose, with optional case-insensitive and whitespace-insensitive "
            "comparison. Reports each group with its row numbers so you can decide what "
            "to keep."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="key_columns",
                label="Match on columns",
                kind="columns",
                help="Leave empty to compare whole rows.",
            ),
            ConfigField(
                key="ignore_case",
                label="Ignore letter case",
                kind="boolean",
                default=True,
            ),
            ConfigField(
                key="ignore_whitespace",
                label="Ignore surrounding whitespace",
                kind="boolean",
                default=True,
            ),
        ],
        order=4,
    ),
    # ── Data Quality ────────────────────────────────────────────────────────
    ToolSpec(
        slug="data-validator",
        name="Data Validator",
        category="Data Quality",
        tagline="Row-level errors, not just a score.",
        description=(
            "Checks required fields, type conformance, ranges, patterns and identifier "
            "shape, then returns per-row messages separated into errors and warnings."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["csv", "json"],
        fields=[
            ConfigField(
                key="required_columns",
                label="Required columns",
                kind="columns",
                help="Rows with a blank in any of these are reported as errors.",
            ),
            ConfigField(
                key="numeric_columns",
                label="Must be numeric",
                kind="columns",
                help="Values that cannot be parsed as a number are reported.",
            ),
            ConfigField(
                key="email_columns",
                label="Must be an email",
                kind="columns",
                help="Values that are not a plausible email address are reported.",
            ),
        ],
        order=5,
    ),
    ToolSpec(
        slug="quality-report",
        name="Data Quality Report",
        category="Data Quality",
        tagline="Five measured dimensions, with the working shown.",
        description=(
            "Computes completeness, validity, consistency, uniqueness and integrity, then "
            "explains the score with the underlying issue counts. The methodology is "
            "returned with the result so the number is never a black box."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["json", "csv"],
        fields=[],
        featured=True,
        order=6,
    ),
    # ── Data Transformation ─────────────────────────────────────────────────
    ToolSpec(
        slug="transformation-builder",
        name="Custom Transformation Builder",
        category="Data Transformation",
        tagline="Chain your own rules and preview every step.",
        description=(
            "Compose a sequence of operations - rename, reorder, drop, fill, replace, "
            "clip or regex-rewrite - and preview exactly what each step changes before "
            "anything is written."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="rename_map",
                label="Rename columns",
                kind="text",
                help='JSON object, e.g. {"Item Desc": "title", "MRP": "price"}',
                default="{}",
            ),
            ConfigField(
                key="drop_columns",
                label="Drop columns",
                kind="columns",
                help="Columns to remove from the output.",
            ),
            ConfigField(
                key="trim_all",
                label="Trim whitespace on every text column",
                kind="boolean",
                default=True,
            ),
        ],
        order=7,
    ),
    # ── E-commerce Catalogue ────────────────────────────────────────────────
    ToolSpec(
        slug="catalogue-normalizer",
        name="Catalogue Normaliser",
        category="E-commerce Catalogue",
        tagline="Consistent names, categories, brands and units.",
        description=(
            "Standardises product names, normalises category and brand spellings, unifies "
            "units of measure and flags catalogue records that are missing required "
            "product attributes."
        ),
        input_formats=["csv", "xlsx", "xls", "json"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="title_column",
                label="Product name column",
                kind="columns",
                help="Normalised to title case with collapsed whitespace.",
            ),
            ConfigField(
                key="category_column",
                label="Category column",
                kind="columns",
                help="Standardised to a single canonical spelling per group.",
            ),
            ConfigField(
                key="brand_column",
                label="Brand column",
                kind="columns",
            ),
            ConfigField(
                key="price_column",
                label="Price column",
                kind="columns",
                help="Currency symbols and separators are stripped.",
            ),
        ],
        featured=True,
        order=8,
    ),
    ToolSpec(
        slug="sku-manager",
        name="SKU & Variant Manager",
        category="E-commerce Catalogue",
        tagline="Every SKU accounted for, every variant grouped.",
        description=(
            "Detects duplicate and malformed SKUs, groups variant rows under a shared "
            "parent, and reports products that are missing an identifier altogether."
        ),
        input_formats=["csv", "xlsx", "xls", "json"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="sku_column",
                label="SKU column",
                kind="columns",
                required=True,
                help="The column holding the product identifier.",
            ),
            ConfigField(
                key="parent_column",
                label="Parent / variant group column",
                kind="columns",
                help="Optional. Rows sharing this value are treated as variants of one product.",
            ),
        ],
        order=9,
    ),
    ToolSpec(
        slug="ai-enrichment",
        name="AI Product Enrichment",
        category="AI Enrichment",
        tagline="Draft descriptions and attributes, grounded in your data.",
        description=(
            "Generates draft short and long descriptions, suggests missing attributes and "
            "proposes SEO titles, all grounded in the product fields you already have. "
            "Every suggestion is returned separately for review and nothing is written "
            "back automatically."
        ),
        input_formats=["csv", "xlsx", "xls", "json"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="title_column",
                label="Product name column",
                kind="columns",
                required=True,
            ),
            ConfigField(
                key="attribute_columns",
                label="Columns to ground the text in",
                kind="columns",
                help="Values from these columns are the only source material.",
            ),
            ConfigField(
                key="row_limit",
                label="Rows to enrich",
                kind="number",
                help="AI calls cost time; keep this small for a first pass.",
                default=10,
            ),
        ],
        needs_ai=True,
        order=10,
    ),
    # ── Data Export ─────────────────────────────────────────────────────────
    ToolSpec(
        slug="bulk-exporter",
        name="Bulk Exporter",
        category="Data Export",
        tagline="Real files, in the format you asked for.",
        description=(
            "Exports the dataset, a filtered subset or a selected set of columns to CSV, "
            "XLSX or JSON, with the schema sidecar, and records the export in history."
        ),
        input_formats=["csv", "xlsx", "xls", "json", "parquet"],
        output_formats=["csv", "xlsx", "json"],
        fields=[
            ConfigField(
                key="output_format",
                label="Output format",
                kind="select",
                default="csv",
                options=["csv", "xlsx", "json"],
            ),
            ConfigField(
                key="columns",
                label="Columns to include",
                kind="columns",
                help="Leave empty to include every column.",
            ),
            ConfigField(
                key="row_limit",
                label="Row limit",
                kind="number",
                help="0 exports every row.",
                default=0,
            ),
        ],
        featured=True,
        order=11,
    ),
]

TOOLS_BY_SLUG: dict[str, ToolSpec] = {t.slug: t for t in TOOLS}

TOOL_SLUGS: list[str] = [t.slug for t in TOOLS]


def list_tools() -> list[dict[str, Any]]:
    return [t.as_dict() for t in sorted(TOOLS, key=lambda t: (t.order, t.name))]


def get_tool(slug: str) -> ToolSpec | None:
    return TOOLS_BY_SLUG.get(slug)


def tools_by_category() -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for tool in sorted(TOOLS, key=lambda t: (t.order, t.name)):
        grouped.setdefault(tool.category, []).append(tool.as_dict())
    return grouped