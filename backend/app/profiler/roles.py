"""Column role detection for business metrics.

Roles describe what a column means to the business (unit price, quantity,
transaction date, SKU) independently of its storage type. Detection is
deterministic: explicit name aliases score highest, then semantic type, then
value evidence. Every role carries a confidence score and can be overridden by
the user, because a low-confidence role must never silently drive a metric.
"""

from __future__ import annotations

import re
from typing import Any

NORMALIZED_SPLIT_RE = re.compile(r"[^a-z0-9]+")

ROLE_ALIASES: dict[str, tuple[str, ...]] = {
    "product_name": (
        "product", "productname", "item", "itemname", "name", "title",
        "producttitle", "itemtitle", "description", "productdescription",
    ),
    "sku": ("sku", "itemcode", "productcode", "itemid", "productid", "stylecode", "model", "mpn"),
    "barcode": ("barcode", "ean", "upc", "gtin", "ean13", "ean8", "barcodevalue"),
    "price": (
        "price", "sellingprice", "saleprice", "unitprice", "mrp", "rate",
        "sprice", "retailprice", "listprice",
    ),
    "cost": ("cost", "unitcost", "purchaseprice", "buyingprice", "wholesaleprice", "cogs"),
    "revenue": ("revenue", "salesamount", "totalamount", "amount", "totalsales", "turnover", "salesvalue"),
    "quantity": ("qty", "quantity", "unitssold", "qty sold", "quantitysold", "units", "sold", "orderqty"),
    "stock": ("stock", "inventory", "availablequantity", "stockquantity", "onhand", "instock", "closingstock"),
    "date": (
        "date", "orderdate", "transactiondate", "invoicedate", "dateofpurchase",
        "createdat", "updatedat", "month", "year", "financialyear",
    ),
    "brand": ("brand", "brandname", "manufacturer", "make", "vendor"),
    "supplier": ("supplier", "suppliername", "vendor", "vendorname", "distributor", "seller"),
    "category": ("category", "productcategory", "producttype", "type", "segment", "department", "class"),
    "currency": ("currency", "currencycode", "ccy"),
    "customer": ("customer", "customername", "client", "clientname", "buyer", "accountname"),
    "order_id": ("orderid", "ordernumber", "orderno", "invoiceno", "invoicenumber", "transactionid", "billno"),
    "image_url": ("image", "imageurl", "img", "imgurl", "thumbnail", "photourl", "picture"),
    "email": ("email", "emailaddress", "customeremail"),
    "phone": ("phone", "mobilenumber", "contactnumber", "telephone"),
    "profit": ("profit", "grossprofit", "margin", "grossprofitamount"),
    "tax": ("tax", "gst", "taxamount", "taxtype"),
    "discount": ("discount", "discountamount", "discountpct"),
    "rating": ("rating", "stars", "review", "reviews"),
}

ROLE_TYPES: dict[str, tuple[str, ...]] = {
    "price": ("currency", "float", "integer"),
    "cost": ("currency", "float", "integer"),
    "revenue": ("currency", "float", "integer"),
    "quantity": ("integer", "float"),
    "stock": ("integer", "float"),
    "profit": ("currency", "float", "integer"),
    "discount": ("currency", "percentage", "float", "integer"),
    "tax": ("currency", "percentage", "float", "integer"),
    "date": ("date", "datetime"),
    "sku": ("id_like", "string", "categorical"),
    "barcode": ("id_like", "string"),
    "order_id": ("id_like", "string", "integer"),
    "customer": ("string", "categorical", "id_like"),
    "category": ("categorical", "string"),
    "brand": ("categorical", "string"),
    "supplier": ("categorical", "string", "id_like"),
    "image_url": ("url", "string"),
    "email": ("email",),
    "phone": ("phone", "id_like", "string"),
    "rating": ("integer", "float"),
    "product_name": ("string", "categorical", "text"),
    "currency": ("string", "categorical"),
}

EXACT_NAME_CONFIDENCE = 0.95
ALIAS_NAME_CONFIDENCE = 0.85
TYPE_ONLY_CONFIDENCE = 0.55
LOW_CONFIDENCE_THRESHOLD = 0.7


def _normalize(name: str) -> str:
    return NORMALIZED_SPLIT_RE.sub("", name.lower())


def detect_role(
    column_name: str,
    semantic_type: str,
    sample_values: list[str] | None = None,
    distinct_ratio: float | None = None,
) -> tuple[str, float, dict[str, Any]]:
    """Return (role, confidence, evidence) for one column."""
    normalized = _normalize(column_name)
    samples = [str(value) for value in (sample_values or []) if value is not None][:20]
    evidence: dict[str, Any] = {"column_name": column_name, "semantic_type": semantic_type}

    for role, aliases in ROLE_ALIASES.items():
        for alias in aliases:
            if normalized == _normalize(alias):
                evidence["matched_alias"] = alias
                return role, EXACT_NAME_CONFIDENCE, evidence
        for alias in aliases:
            alias_normalized = _normalize(alias)
            if alias_normalized and alias_normalized in normalized:
                evidence["matched_alias"] = alias
                return role, ALIAS_NAME_CONFIDENCE, evidence

    for role, types in ROLE_TYPES.items():
        if semantic_type in types and samples:
            evidence["matched_by"] = "semantic_type"
            evidence["samples"] = samples[:5]
            confidence = TYPE_ONLY_CONFIDENCE
            if role == "price" and _looks_like_price(samples):
                confidence = 0.7
                evidence["matched_by"] = "value_range"
            return role, confidence, evidence

    evidence["matched_by"] = "none"
    return "other", 0.3, evidence


def _looks_like_price(samples: list[str]) -> bool:
    values: list[float] = []
    for sample in samples:
        try:
            values.append(abs(float(str(sample).replace(",", ""))))
        except (TypeError, ValueError):
            continue
    if len(values) < 2:
        return False
    return max(values) > 0 and min(values) >= 0


def resolve_roles(
    column_schemas: list[dict[str, Any]],
    overrides: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Apply roles to schema records, honouring user overrides.

    An override is authoritative: it replaces both the role and the confidence,
    and is flagged so the UI can show that a human decided.
    """
    overrides = overrides or {}
    resolved: list[dict[str, Any]] = []
    used_roles: dict[str, list[str]] = {}

    for column in column_schemas:
        name = column.get("column_name") or column.get("name") or ""
        semantic_type = column.get("semantic_type", "string")
        role, confidence, evidence = detect_role(
            name,
            semantic_type,
            column.get("sample_values") or [],
            column.get("distinct_ratio"),
        )

        overridden = overrides.get(name)
        if overridden:
            role = overridden
            confidence = 1.0
            evidence["overridden"] = True

        used_roles.setdefault(role, []).append(name)
        resolved.append(
            {
                **column,
                "role": role,
                "role_confidence": round(confidence, 3),
                "role_evidence": evidence,
                "role_overridden": bool(overridden),
            }
        )

    for entries in resolved:
        role = entries["role"]
        if role != "other" and len(used_roles.get(role, [])) > 1:
            entries["role_ambiguous"] = True
            entries["role_peers"] = [name for name in used_roles[role] if name != entries.get("column_name")]

    return resolved


def role_summary(resolved: list[dict[str, Any]]) -> dict[str, Any]:
    """Group columns by role and surface what is still missing."""
    by_role: dict[str, list[str]] = {}
    for column in resolved:
        by_role.setdefault(column.get("role", "other"), []).append(column.get("column_name"))

    return {
        "roles": by_role,
        "unmapped": by_role.get("other", []),
        "ambiguous": [
            column.get("column_name")
            for column in resolved
            if column.get("role_ambiguous")
        ],
        "low_confidence": [
            {
                "column_name": column.get("column_name"),
                "role": column.get("role"),
                "confidence": column.get("role_confidence"),
            }
            for column in resolved
            if column.get("role", "other") != "other"
            and column.get("role_confidence", 0) < LOW_CONFIDENCE_THRESHOLD
        ],
    }