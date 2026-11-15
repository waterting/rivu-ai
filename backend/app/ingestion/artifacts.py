"""Artifact serialization for dataset versions.

A refined version stores one canonical artifact (its native format) plus the
small schema.json sidecar. Other formats are derived on demand at export time
from the canonical artifact, so a refinement no longer multiplies storage by
the number of supported formats (audit finding 12).
"""

from __future__ import annotations

import io
import json

import polars as pl

CANONICAL_FORMATS = ("csv", "json", "parquet", "xlsx")
SIDE_FORMAT = "schema.json"


def dataframe_to_bytes(df: pl.DataFrame, fmt: str) -> bytes:
    """Serialize a DataFrame to the given format's bytes."""
    if fmt == "csv":
        buf = io.BytesIO()
        df.write_csv(buf)
        return buf.getvalue()
    if fmt == "json":
        return df.write_json().encode("utf-8")
    if fmt == "parquet":
        buf = io.BytesIO()
        df.write_parquet(buf)
        return buf.getvalue()
    if fmt == "xlsx":
        # openpyxl is the project's Excel writer; write a fresh workbook rather
        # than depending on optional xlsxwriter.
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(list(df.columns))
        for row in df.iter_rows():
            sheet.append([
                value.isoformat() if hasattr(value, "isoformat") and not isinstance(value, str) else value
                for value in row
            ])
        buf = io.BytesIO()
        workbook.save(buf)
        return buf.getvalue()
    raise ValueError(f"Unsupported artifact format: {fmt}")


def schema_sidecar(df: pl.DataFrame, version_number: int) -> bytes:
    payload = {
        "version": version_number,
        "row_count": df.height,
        "column_count": df.width,
        "columns": [
            {"name": n, "dtype": str(d), "nullable": bool(df[n].null_count() > 0)}
            for n, d in df.schema.items()
        ],
    }
    return json.dumps(payload, indent=2).encode("utf-8")


def canonical_format_for(source_format: str) -> str:
    """Pick the canonical artifact format for a refined version.

    Refined outputs use modern XLSX for legacy XLS sources (xlwt is intentionally
    not used); otherwise the source's own format is kept.
    """
    if source_format in CANONICAL_FORMATS:
        return source_format
    return "xlsx"


def content_type_for(fmt: str) -> str:
    return {
        "csv": "text/csv",
        "json": "application/json",
        "parquet": "application/octet-stream",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "schema.json": "application/json",
    }[fmt]