"""
Business Intelligence engine — deterministic, evidence-based analysis.

Every metric returned here is computed from the dataset that was passed in.
Nothing is inferred from outside the data, and nothing is estimated: when a
required column is missing the metric is reported as unavailable together with
the columns that would be needed.

Design rules:
  * Pure functions — no database, no network, no AI calls.
  * Deterministic — same input frame, same output.
  * Honest — each metric carries its formula, its inputs and an `available` flag.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import polars as pl
import structlog

logger = structlog.get_logger(__name__)


# --------------------------------------------------------------------------------------
# Column role detection
# --------------------------------------------------------------------------------------

_QUANTITY_HINTS = ("qty", "quantity", "units", "units_sold", "pcs", "pieces", "count")
_PRICE_HINTS = ("price", "unit_price", "sell_price", "selling_price", "mrp", "rate")
_REVENUE_HINTS = ("revenue", "amount", "sales", "turnover", "total", "net_sales")
_COST_HINTS = ("cost", "cogs", "unit_cost", "cost_price", "buy_price")
_STOCK_HINTS = ("stock", "inventory", "on_hand", "available_qty", "stock_qty")
_PRODUCT_HINTS = ("product", "sku", "item", "title", "variant", "article")
_DATE_HINTS = ("date", "day", "month", "period", "time", "timestamp", "invoice_date")


@dataclass
class ColumnFacts:
    """Minimal facts about a column, as produced by the profiler."""

    name: str
    semantic_type: str = "unknown"
    dtype: str = "unknown"


@dataclass
class ColumnRoles:
    """Which columns can serve which business role."""

    date: str | None = None
    quantity: str | None = None
    unit_price: str | None = None
    revenue: str | None = None
    cost: str | None = None
    stock: str | None = None
    product: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "date": self.date,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "revenue": self.revenue,
            "cost": self.cost,
            "stock": self.stock,
            "product": self.product,
        }


def _numeric(columns: list[ColumnFacts]) -> list[ColumnFacts]:
    return [c for c in columns if c.semantic_type in {"integer", "float", "currency"} or c.dtype.startswith(("Int", "UInt", "Float"))]


def _named(candidates: list[ColumnFacts], hints: tuple[str, ...]) -> ColumnFacts | None:
    for hint in hints:
        for col in candidates:
            if hint in col.name.lower():
                return col
    return None


def detect_column_roles(
    columns: list[ColumnFacts],
    overrides: dict[str, str] | None = None,
) -> tuple[ColumnRoles, dict[str, str]]:
    """Map profiled columns onto business roles using names and semantic types.

    Detection is deterministic and conservative: a column is only used for a role
    when its name matches a known hint (or, for dates, when the profiler found a
    date/datetime semantic type). A manual override always wins, because a human
    decision about what a column means outranks a heuristic.

    Returns the roles plus which roles came from an override.
    """
    overrides = overrides or {}
    known = {column.name for column in columns}

    numeric = _numeric(columns)
    dates = [c for c in columns if c.semantic_type in {"date", "datetime"}]

    date_col = _named(dates, _DATE_HINTS) or (dates[0] if len(dates) == 1 else None)

    product_candidates = [c for c in columns if c.semantic_type in {"string", "categorical", "id_like"}] or columns
    product_col = _named(product_candidates, _PRODUCT_HINTS)

    quantity = _named(numeric, _QUANTITY_HINTS)
    unit_price = _named(numeric, _PRICE_HINTS)
    revenue = _named(numeric, _REVENUE_HINTS)
    cost = _named(numeric, _COST_HINTS)
    stock = _named(numeric, _STOCK_HINTS)

    # "amount"/"total" are revenue hints, so avoid using one of them as price.
    if revenue is not None and unit_price is not None and unit_price.name == revenue.name:
        unit_price = None
    if quantity is not None and quantity.name in {unit_price.name if unit_price else "", stock.name if stock else ""}:
        quantity = None

    roles = ColumnRoles(
        date=date_col.name if date_col else None,
        quantity=quantity.name if quantity else None,
        unit_price=unit_price.name if unit_price else None,
        revenue=revenue.name if revenue else None,
        cost=cost.name if cost else None,
        stock=stock.name if stock else None,
        product=product_col.name if product_col else None,
    )

    applied: dict[str, str] = {}
    for role in roles.as_dict():
        override = overrides.get(role)
        if override is None:
            continue
        if override in ("", "none", "other"):
            setattr(roles, role, None)
            applied[role] = override
            continue
        if override not in known:
            continue
        setattr(roles, role, override)
        applied[role] = override

    return roles, applied


# --------------------------------------------------------------------------------------
# Metric helpers
# --------------------------------------------------------------------------------------

def _num(df: pl.DataFrame, column: str) -> pl.Series:
    return pl.col(column).cast(pl.Float64, strict=False)


def _metric(
    key: str,
    label: str,
    value: float | int | None,
    formula: str,
    available: bool,
    missing: list[str] | None = None,
    unit: str | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "value": value,
        "unit": unit,
        "formula": formula,
        "available": available,
        "missing": missing or [],
    }


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
        return None
    return f


# --------------------------------------------------------------------------------------
# Main analysis
# --------------------------------------------------------------------------------------

def analyse_business_data(
    df: pl.DataFrame,
    columns: list[ColumnFacts],
    top_n: int = 5,
    overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Compute evidence-based business metrics for a dataset.

    Returns a payload with:
      * `roles` — which columns were used for which purpose,
      * `metrics` — KPI definitions with values, formulas, availability,
      * `top_products` — revenue by product when product + revenue/quantity+price exist,
      * `demand_trend` — revenue by period when a date column exists,
      * `restock` — products whose sold units exceed recorded stock,
      * `limitations` — what could not be computed and why.

    The caller is responsible for supplying a frame whose dtypes match the
    profiled column facts. `overrides` maps a role to a column name and always
    wins over the heuristic detection.
    """

    if df.height == 0:
        return {
            "row_count": 0,
            "roles": ColumnRoles().as_dict(),
            "metrics": [],
            "top_products": [],
            "demand_trend": [],
            "restock": [],
            "limitations": ["Dataset contains no rows."],
        }

    roles, applied_overrides = detect_column_roles(columns, overrides)
    row_count = df.height
    metrics: list[dict[str, Any]] = []

    # --- Revenue -------------------------------------------------------------------
    revenue_expr: pl.Expr | None = None
    if roles.revenue:
        revenue_expr = _num(df, roles.revenue)
        revenue_formula = f"sum({roles.revenue})"
        revenue_missing: list[str] = []
    elif roles.quantity and roles.unit_price:
        revenue_expr = _num(df, roles.quantity) * _num(df, roles.unit_price)
        revenue_formula = f"sum({roles.quantity} * {roles.unit_price})"
        revenue_missing = []
    else:
        revenue_expr = None
        revenue_formula = "sum(revenue) or sum(quantity * unit_price)"
        revenue_missing = [m for m, v in (("revenue", roles.revenue), ("quantity", roles.quantity), ("unit_price", roles.unit_price)) if not v]

    revenue_total: float | None = None
    if revenue_expr is not None:
        value = _safe_float(df.select(revenue_expr.sum()).item())
        revenue_total = value

    metrics.append(
        _metric(
            "revenue_total",
            "Total revenue",
            revenue_total,
            revenue_formula,
            revenue_total is not None,
            revenue_missing,
        )
    )

    # --- Units ---------------------------------------------------------------------
    units_total: float | None = None
    if roles.quantity:
        units_total = _safe_float(df.select(_num(df, roles.quantity).sum()).item())
    metrics.append(
        _metric(
            "units_total",
            "Units sold",
            units_total,
            f"sum({roles.quantity})" if roles.quantity else "sum(quantity)",
            units_total is not None,
            [] if roles.quantity else ["quantity"],
        )
    )

    # --- Gross margin --------------------------------------------------------------
    margin: dict[str, Any]
    if revenue_total is not None and roles.cost and roles.quantity:
        cogs = _safe_float(df.select((_num(df, roles.quantity) * _num(df, roles.cost)).sum()).item())
        if cogs is not None:
            gross = revenue_total - cogs
            pct = (gross / revenue_total * 100.0) if revenue_total else None
            margin = _metric(
                "gross_margin",
                "Gross margin",
                round(gross, 2),
                f"{revenue_formula} - sum({roles.quantity} * {roles.cost})",
                True,
                unit="currency",
            )
            margin["margin_pct"] = round(pct, 2) if pct is not None else None
        else:
            margin = _metric("gross_margin", "Gross margin", None, f"revenue - sum({roles.quantity} * {roles.cost})", False, [roles.cost or "cost"])
    else:
        margin = _metric(
            "gross_margin",
            "Gross margin",
            None,
            "revenue - sum(quantity * unit_cost)",
            False,
            [m for m, v in (("revenue", revenue_total is not None), ("quantity", roles.quantity), ("cost", roles.cost)) if not v],
        )
    metrics.append(margin)

    # --- Average order / row value -------------------------------------------------
    if revenue_total is not None:
        denominator = row_count
        aov = revenue_total / denominator if denominator else None
        metrics.append(
            _metric(
                "avg_row_value",
                "Average revenue per row",
                round(aov, 2) if aov is not None else None,
                f"{revenue_formula} / row_count",
                aov is not None,
            )
        )

    # --- Date coverage -------------------------------------------------------------
    if roles.date:
        try:
            parsed = df.select(pl.col(roles.date).cast(pl.Utf8).str.to_datetime(strict=False).alias("d"))["d"]
            valid = parsed.drop_nulls()
            if valid.len():
                metrics.append(
                    _metric(
                        "date_range",
                        "Period covered",
                        f"{valid.min()} → {valid.max()}",
                        f"min({roles.date}) → max({roles.date})",
                        True,
                    )
                )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("bi_date_parse_failed", column=roles.date, error=str(exc))

    # --- Top products --------------------------------------------------------------
    top_products: list[dict[str, Any]] = []
    if roles.product and revenue_expr is not None:
        try:
            grouped = (
                df.with_columns(revenue_expr.alias("__revenue"))
                .group_by(roles.product)
                .agg(pl.col("__revenue").sum().alias("revenue"))
                .sort("revenue", descending=True)
                .head(top_n)
            )
            top_products = [
                {"product": str(row[roles.product]), "revenue": _safe_float(row["revenue"]) or 0.0}
                for row in grouped.iter_rows(named=True)
            ]
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("bi_top_products_failed", error=str(exc))

    # --- Demand trend --------------------------------------------------------------
    demand_trend: list[dict[str, Any]] = []
    if roles.date and revenue_expr is not None:
        try:
            trend = (
                df.with_columns(
                    pl.col(roles.date).cast(pl.Utf8).str.to_datetime(strict=False).alias("__d"),
                    revenue_expr.alias("__revenue"),
                )
                .drop_nulls("__d")
                .with_columns(pl.col("__d").dt.strftime("%Y-%m").alias("period"))
                .group_by("period")
                .agg(pl.col("__revenue").sum().alias("revenue"))
                .sort("period")
            )
            demand_trend = [
                {"period": str(row["period"]), "revenue": _safe_float(row["revenue"]) or 0.0}
                for row in trend.iter_rows(named=True)
            ]
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("bi_trend_failed", error=str(exc))

    # --- Restock risk --------------------------------------------------------------
    restock: list[dict[str, Any]] = []
    if roles.product and roles.stock and roles.quantity:
        try:
            risk = (
                df.with_columns(
                    _num(df, roles.stock).alias("__stock"),
                    _num(df, roles.quantity).alias("__sold"),
                )
                .group_by(roles.product)
                .agg(
                    pl.col("__stock").max().alias("stock_on_hand"),
                    pl.col("__sold").sum().alias("units_sold"),
                )
                .with_columns((pl.col("units_sold") - pl.col("stock_on_hand")).alias("gap"))
                .filter(pl.col("gap") > 0)
                .sort("gap", descending=True)
                .head(top_n)
            )
            restock = [
                {
                    "product": str(row[roles.product]),
                    "units_sold": _safe_float(row["units_sold"]) or 0.0,
                    "stock_on_hand": _safe_float(row["stock_on_hand"]) or 0.0,
                    "gap": _safe_float(row["gap"]) or 0.0,
                }
                for row in risk.iter_rows(named=True)
            ]
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("bi_restock_failed", error=str(exc))

    # --- Limitations ---------------------------------------------------------------
    limitations: list[str] = []
    if revenue_total is None:
        limitations.append("No revenue column and no quantity×price pair, so money metrics are unavailable.")
    if not roles.cost:
        limitations.append("No cost column, so margin cannot be computed.")
    if not roles.stock:
        limitations.append("No stock column, so restock risk cannot be computed.")
    if not roles.date:
        limitations.append("No date column, so trends over time cannot be computed.")
    if not roles.product:
        limitations.append("No product column, so per-product breakdowns are unavailable.")

    return {
        "row_count": row_count,
        "roles": roles.as_dict(),
        "roles_source": {
            role: ("override" if role in applied_overrides else "auto")
            for role in roles.as_dict()
        },
        "overrides_applied": applied_overrides,
        "metrics": metrics,
        "top_products": top_products,
        "demand_trend": demand_trend,
        "restock": restock,
        "limitations": limitations,
    }