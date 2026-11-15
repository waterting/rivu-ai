"""Deterministic schema inference and identifier-safe type coercion.

Files are parsed as text so no information is lost during ingestion. This
module decides what each column actually holds and converts only the columns
whose values are unambiguously numeric. Identifiers (SKUs, barcodes, phone
numbers, account codes) stay text so leading zeroes and long digit strings
survive the round trip.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import polars as pl

CURRENCY_SYMBOLS = "$€£¥₹₽₩¢"
_CURRENCY_CODE_RE = re.compile(r"^([A-Za-z]{3})\s")
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
_URL_RE = re.compile(r"^(https?://|www\.)[^\s]+\.[^\s]{2,}$", re.IGNORECASE)
_PHONE_RE = re.compile(r"^\+?[\d][\d\s\-.()]{6,19}$")
_INT_RE = re.compile(r"^[+-]?\d+$")
_FLOAT_RE = re.compile(r"^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$")
_LEADING_ZERO_RE = re.compile(r"^[+-]?0\d+$")
_JSON_RE = re.compile(r"^[\[{].*[\]}]$")

DATE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^\d{4}-\d{2}-\d{2}$"), "YYYY-MM-DD"),
    (re.compile(r"^\d{4}/\d{2}/\d{2}$"), "YYYY/MM/DD"),
    (re.compile(r"^\d{2}/\d{2}/\d{4}$"), "MM/DD/YYYY"),
    (re.compile(r"^\d{2}-\d{2}-\d{4}$"), "DD-MM-YYYY"),
    (re.compile(r"^\d{2}\.\d{2}\.\d{4}$"), "DD.MM.YYYY"),
    (re.compile(r"^\d{1,2}/[A-Za-z]{3}/\d{4}$"), "D/Mon/YYYY"),
    (re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{4}$"), "DD-Mon-YYYY"),
    (re.compile(r"^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$"), "Mon DD, YYYY"),
    (re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}"), "ISO datetime"),
    (re.compile(r"^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}"), "MM/DD/YYYY HH:MM"),
)

_DATE_FORMATS = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "YYYY/MM/DD": "%Y/%m/%d",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD-MM-YYYY": "%d-%m-%Y",
    "DD.MM.YYYY": "%d.%m.%Y",
    "D/Mon/YYYY": "%d/%b/%Y",
    "DD-Mon-YYYY": "%d-%b-%Y",
    "Mon DD, YYYY": "%b %d, %Y",
    "ISO datetime": "%Y-%m-%dT%H:%M",
    "MM/DD/YYYY HH:MM": "%m/%d/%Y %H:%M",
}

IDENTIFIER_NAME_HINTS = (
    "id", "sku", "barcode", "ean", "upc", "gtin", "isbn", "code", "ref",
    "reference", "account", "invoice", "order_no", "order_number", "phone",
    "mobile", "telephone", "gst", "pan", "pin", "zip", "postal",
)
MEASUREMENT_NAME_HINTS = (
    "price", "cost", "amount", "revenue", "sales", "total", "subtotal", "tax",
    "discount", "margin", "profit", "qty", "quantity", "units", "stock",
    "inventory", "weight", "width", "height", "length", "depth", "rate",
    "score", "count", "age", "percent", "percentage", "pct", "ratio",
    "salary", "fee", "balance", "value",
)
BOOLEAN_NAME_HINTS = ("is_", "has_", "flag", "active", "enabled", "boolean", "bool")
MONETARY_NAME_HINTS = (
    "price", "cost", "amount", "revenue", "sales", "total", "subtotal", "tax",
    "discount", "margin", "profit", "salary", "fee", "balance", "mrp",
    "turnover", "value",
)
BOOLEAN_VALUES = {
    "true", "false", "yes", "no", "y", "n", "t", "f",
    "0", "1", "on", "off", "enabled", "disabled",
}

MAX_PATTERN_SAMPLE = 5000


@dataclass
class ColumnSchema:
    """Inferred contract for one column."""

    name: str
    semantic_type: str
    dtype: str = "Utf8"
    confidence: float = 0.0
    role: str = "other"
    role_confidence: float = 0.0
    preserved: bool = False
    null_count: int = 0
    evidence: dict[str, Any] = field(default_factory=dict)

    def as_record(self) -> dict[str, Any]:
        return {
            "column_name": self.name,
            "semantic_type": self.semantic_type,
            "dtype": self.dtype,
            "confidence": self.confidence,
            "role": self.role,
            "role_confidence": self.role_confidence,
            "preserved": self.preserved,
            "null_count": self.null_count,
            "evidence": self.evidence,
        }


def _matches(values: list[str], pattern: re.Pattern[str]) -> int:
    return sum(1 for value in values if pattern.match(value))


def _ratio(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0.0


def _scale_count(count: int, sampled: int, total: int) -> int:
    if not sampled or sampled >= total:
        return count
    return int(round(count * total / sampled))


def detect_date_formats(values: list[str], min_share: float = 0.5) -> list[str]:
    """Return the date layouts covering at least ``min_share`` of the values."""
    if not values:
        return []
    found: list[str] = []
    for pattern, label in DATE_PATTERNS:
        if _matches(values, pattern) / len(values) >= min_share:
            found.append(label)
    return found


def _looks_identifier_name(name: str) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in IDENTIFIER_NAME_HINTS)


def _looks_measurement_name(name: str) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in MEASUREMENT_NAME_HINTS)


def parse_numeric_token(raw: str) -> float | None:
    """Parse one human-formatted number, or return None when it is not numeric."""
    text = raw.strip()
    if not text:
        return None

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()

    is_percent = text.endswith("%")
    if is_percent:
        text = text[:-1].strip()

    if text and text[0] in CURRENCY_SYMBOLS:
        text = text[1:].strip()
    elif text and text[-1] in CURRENCY_SYMBOLS:
        text = text[:-1].strip()

    code_match = _CURRENCY_CODE_RE.match(text)
    if code_match:
        text = text[code_match.end():].strip()

    if not text:
        return None

    has_thousands = "," in text
    has_decimal_point = "." in text
    decimal_comma = False

    if has_thousands and has_decimal_point:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
            decimal_comma = True
        else:
            text = text.replace(",", "")
    elif has_thousands:
        tail = text.rsplit(",", 1)[1]
        if len(tail) == 3 and text.count(",") >= 1:
            text = text.replace(",", "")
        else:
            text = text.replace(",", ".")
            decimal_comma = True

    if not _FLOAT_RE.match(text):
        return None

    try:
        value = float(text)
    except ValueError:
        return None

    if negative:
        value = -abs(value)
    if is_percent:
        value = value
    return value


def _variant_counts(values: list[str]) -> dict[str, Any]:
    """Count values that deviate from the dominant spelling of the same key."""
    groups: dict[str, dict[str, int]] = {}
    for value in values:
        key = " ".join(value.split()).lower()
        if not key:
            continue
        groups.setdefault(key, {})
        groups[key][value] = groups[key].get(value, 0) + 1

    inconsistent = 0
    variants: dict[str, dict[str, int]] = {}
    for key, forms in groups.items():
        if len(forms) > 1:
            counts = dict(sorted(forms.items(), key=lambda item: -item[1]))
            variants[key] = counts
            inconsistent += sum(counts.values()) - max(counts.values())
    return {"inconsistent": inconsistent, "variants": variants}


def _calendar_invalid(values: list[str], formats: list[str]) -> int:
    patterns = [(_DATE_FORMATS[label]) for label in formats if label in _DATE_FORMATS]
    if not patterns:
        return 0
    invalid = 0
    for value in values:
        for pattern in patterns:
            try:
                datetime.strptime(value.strip(), pattern)
                break
            except ValueError:
                continue
        else:
            invalid += 1
    return invalid


def _classify(
    name: str,
    values: list[str],
    total: int,
    null_count: int,
) -> ColumnSchema:
    present = [value.strip() for value in values if value and value.strip()]
    sample = present[:MAX_PATTERN_SAMPLE]
    if not sample:
        return ColumnSchema(
            name=name,
            semantic_type="string",
            confidence=0.0,
            null_count=null_count,
            evidence={"reason": "no_values", "null_count": null_count},
        )

    size = len(sample)
    distinct = len(set(sample))
    distinct_ratio = distinct / size

    email_hits = _matches(sample, _EMAIL_RE)
    url_hits = _matches(sample, _URL_RE)
    phone_hits = _matches(sample, _PHONE_RE)
    leading_zero_hits = _matches(sample, _LEADING_ZERO_RE)
    json_hits = _matches(sample, _JSON_RE)

    date_formats = [label for label in detect_date_formats(sample) if "datetime" not in label]
    datetime_hits = _matches(sample, DATE_PATTERNS[-2][0]) + _matches(sample, DATE_PATTERNS[-1][0])
    date_hits = max(
        (_matches(sample, pattern) for pattern, label in DATE_PATTERNS if "datetime" not in label),
        default=0,
    )
    any_date_hits = sum(
        1
        for value in sample
        if any(pattern.match(value) for pattern, _ in DATE_PATTERNS)
    )

    lowered_sample = [value.lower() for value in sample]
    bool_hits = sum(1 for value in lowered_sample if value in BOOLEAN_VALUES)

    numeric_values: list[float] = []
    numeric_tokens: list[str] = []
    invalid_numeric: list[str] = []
    currency_hits = 0
    percent_hits = 0

    for value in sample:
        parsed = parse_numeric_token(value)
        if parsed is None:
            if len(invalid_numeric) < 10:
                invalid_numeric.append(value)
            continue
        numeric_values.append(parsed)
        numeric_tokens.append(value)
        if any(symbol in value for symbol in CURRENCY_SYMBOLS):
            currency_hits += 1
        elif _CURRENCY_CODE_RE.match(value.strip()):
            currency_hits += 1
        if value.strip().endswith("%"):
            percent_hits += 1

    numeric_ratio = len(numeric_values) / size
    negative_count = sum(1 for value in numeric_values if value < 0)
    avg_length = sum(len(value) for value in present) / max(len(present), 1)
    variants_info = _variant_counts(present)
    calendar_invalid = _calendar_invalid(sample, detect_date_formats(sample, min_share=0.1))

    identifier_name = _looks_identifier_name(name)
    measurement_name = _looks_measurement_name(name)

    def build(semantic_type: str, confidence: float, **evidence: Any) -> ColumnSchema:
        default_invalid = {
            "email": size - email_hits,
            "url": size - url_hits,
            "phone": size - phone_hits,
            "date": calendar_invalid,
            "datetime": calendar_invalid,
        }.get(semantic_type, 0)
        evidence.setdefault("invalid_count", default_invalid)
        evidence.setdefault("sampled", size)
        if semantic_type in ("integer", "float", "currency", "percentage"):
            evidence.setdefault("negative_count", _scale_count(negative_count, size, total))
        if variants_info["inconsistent"]:
            evidence.setdefault("variant_inconsistent", variants_info["inconsistent"])
            evidence.setdefault("variants", variants_info["variants"])
        return ColumnSchema(
            name=name,
            semantic_type=semantic_type,
            dtype=_dtype_for(semantic_type),
            confidence=round(min(1.0, confidence), 3),
            preserved=semantic_type == "id_like",
            null_count=null_count,
            evidence=evidence,
        )

    if json_hits / size >= 0.9 or (name.lower().endswith(("_json", "json")) and json_hits):
        return build("json", json_hits / size, valid=json_hits, sampled=size)

    if email_hits / size >= 0.9:
        return build("email", email_hits / size + _name_bonus("email", name), valid=email_hits, sampled=size)

    if url_hits / size >= 0.9:
        return build("url", url_hits / size, valid=url_hits, sampled=size)

    if phone_hits / size >= 0.9 and _is_phone_column(name, sample, leading_zero_hits):
        return build(
            "phone",
            phone_hits / size,
            valid=phone_hits,
            sampled=size,
            leading_zero_values=leading_zero_hits,
        )

    if leading_zero_hits and not measurement_name:
        return build(
            "id_like",
            max(0.6, leading_zero_hits / size),
            reason="leading_zeroes_preserved",
            leading_zero_values=leading_zero_hits,
            sampled=size,
        )

    if any_date_hits / size >= 0.9:
        is_datetime = datetime_hits / size >= 0.9
        return build(
            "datetime" if is_datetime else "date",
            any_date_hits / size,
            formats=detect_date_formats(sample, min_share=0.1),
            sampled=size,
        )

    if bool_hits == size and (any(hint in name.lower() for hint in BOOLEAN_NAME_HINTS) or distinct <= 2):
        return build("boolean", bool_hits / size, distinct_values=distinct)

    if numeric_ratio >= 0.9:
        all_integral = all(float(value).is_integer() for value in numeric_values)
        currency_ratio = currency_hits / size
        percent_ratio = percent_hits / size

        if identifier_name and not measurement_name:
            return build(
                "id_like",
                max(0.55, numeric_ratio - 0.1),
                reason="identifier_name_with_numeric_values",
                numeric_ratio=round(numeric_ratio, 4),
                sampled=size,
            )

        if percent_ratio >= 0.9:
            return build(
                "percentage",
                numeric_ratio,
                percent_values=percent_hits,
                invalid_count=size - len(numeric_values),
                invalid_examples=invalid_numeric[:5],
                sampled=size,
            )

        if currency_ratio >= 0.5 or (measurement_name and currency_ratio > 0):
            return build(
                "currency",
                numeric_ratio,
                currency_values=currency_hits,
                invalid_count=size - len(numeric_values),
                invalid_examples=invalid_numeric[:5],
                min=min(numeric_values),
                max=max(numeric_values),
                sampled=size,
            )

        if any(hint in name.lower() for hint in MONETARY_NAME_HINTS):
            return build(
                "currency",
                numeric_ratio,
                reason="monetary_column_name",
                invalid_count=size - len(numeric_values),
                invalid_examples=invalid_numeric[:5],
                min=min(numeric_values),
                max=max(numeric_values),
                sampled=size,
            )

        if all_integral:
            return build(
                "integer",
                numeric_ratio,
                invalid_count=size - len(numeric_values),
                invalid_examples=invalid_numeric[:5],
                min=min(numeric_values),
                max=max(numeric_values),
                sampled=size,
            )

        return build(
            "float",
            numeric_ratio,
            invalid_count=size - len(numeric_values),
            invalid_examples=invalid_numeric[:5],
            min=min(numeric_values),
            max=max(numeric_values),
            sampled=size,
        )

    if identifier_name:
        return build(
            "id_like",
            max(0.5, distinct_ratio),
            reason="identifier_name",
            distinct_ratio=round(distinct_ratio, 4),
            sampled=size,
        )

    if distinct_ratio <= 0.05 and distinct <= 50 and size >= 20:
        return build(
            "categorical",
            max(0.6, 1.0 - distinct_ratio),
            distinct_values=distinct,
            sampled=size,
        )

    if avg_length > 100:
        return build("text", 0.7, avg_length=round(avg_length, 2), sampled=size)

    if numeric_ratio > 0:
        return build(
            "string",
            0.5,
            reason="mixed_numeric_and_text",
            numeric_ratio=round(numeric_ratio, 4),
            invalid_count=len(invalid_numeric),
            invalid_examples=invalid_numeric[:5],
            non_numeric_examples=invalid_numeric[:5],
        )

    return build("string", 0.7, distinct_ratio=round(distinct_ratio, 4), sampled=size)


def _name_bonus(semantic_type: str, name: str) -> float:
    lowered = name.lower()
    hints = {
        "email": ("email", "e_mail", "mail"),
        "url": ("url", "link", "website"),
        "phone": ("phone", "mobile", "tel"),
    }
    return 0.05 if any(hint in lowered for hint in hints.get(semantic_type, ())) else 0.0


def _is_phone_column(name: str, samples: list[str], leading_zero_hits: int) -> bool:
    """A bare digit run is only a phone number when the name or format says so."""
    lowered = name.lower()
    if any(hint in lowered for hint in ("phone", "mobile", "telephone", "fax", "contact")):
        return True
    if leading_zero_hits:
        return True
    return any(value.strip().startswith("+") for value in samples)


def _dtype_for(semantic_type: str) -> str:
    return {
        "integer": "Int64",
        "float": "Float64",
        "currency": "Float64",
        "percentage": "Float64",
    }.get(semantic_type, "Utf8")


def _coerce_numeric(series: pl.Series, semantic_type: str) -> pl.Series:
    text = series.cast(pl.Utf8).str.strip_chars()
    text = text.str.replace_all(r"[,$€£¥₹₽₩¢\s]", "")
    text = text.str.replace_all(r"^\((\-?\d*\.?\d+)\)$", "-$1")
    text = text.str.replace_all(r"^[A-Za-z]{3}", "")
    text = text.str.replace_all(r"%$", "")
    numeric = text.cast(pl.Float64, strict=False)
    if semantic_type == "integer":
        integral = numeric.drop_nulls()
        if integral.len() and (integral == integral.round()).all():
            return numeric.cast(pl.Int64, strict=False)
    return numeric


def apply_schema(df: pl.DataFrame, sample_limit: int = 20000) -> tuple[pl.DataFrame, list[ColumnSchema]]:
    """Infer every column, then coerce the columns that are safely numeric."""
    if df.height > sample_limit:
        step = max(1, df.height // sample_limit)
        sample_frame = df.gather(list(range(0, df.height, step))[:sample_limit])
    else:
        sample_frame = df

    schemas: list[ColumnSchema] = []
    for name in df.columns:
        raw_values = [value if value is None else str(value) for value in sample_frame[name].to_list()]
        null_count = int(df[name].null_count())
        schema = _classify(name, raw_values, df.height, null_count)
        schemas.append(schema)

    exprs: list[pl.Expr] = []
    for schema in schemas:
        if schema.semantic_type in ("integer", "float", "currency", "percentage"):
            exprs.append(_coerce_numeric(df[schema.name], schema.semantic_type).alias(schema.name))
        else:
            exprs.append(df[schema.name])

    coerced = df if not exprs else df.select(exprs)
    return coerced, schemas


def schema_records(schemas: list[ColumnSchema]) -> list[dict[str, Any]]:
    return [schema.as_record() for schema in schemas]


def schema_summary(schemas: list[ColumnSchema]) -> dict[str, Any]:
    """Aggregate view used by the dataset profile endpoint."""
    counts: dict[str, int] = {}
    low_confidence: list[dict[str, Any]] = []
    for schema in schemas:
        counts[schema.semantic_type] = counts.get(schema.semantic_type, 0) + 1
        if schema.confidence < 0.8:
            low_confidence.append(
                {
                    "column_name": schema.name,
                    "semantic_type": schema.semantic_type,
                    "confidence": schema.confidence,
                    "evidence": schema.evidence,
                }
            )
    return {
        "type_counts": counts,
        "identifier_columns": [s.name for s in schemas if s.semantic_type == "id_like"],
        "preserved_columns": [s.name for s in schemas if s.preserved],
        "low_confidence": low_confidence,
        "columns": schema_records(schemas),
    }


def parse_json_column(series: pl.Series) -> list[Any]:
    """Decode JSON-looking cells, tolerating malformed entries."""
    decoded: list[Any] = []
    for value in series.cast(pl.Utf8).to_list():
        if value is None:
            decoded.append(None)
            continue
        try:
            decoded.append(json.loads(value))
        except (TypeError, ValueError):
            decoded.append(value)
    return decoded