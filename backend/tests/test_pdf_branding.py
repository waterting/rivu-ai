"""PDF report branding must embed a real logo (audit finding 10).

The vector wordmark is the fallback so a report is never unbranded; a configured
raster logo must be preferred when present.
"""

import io

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.api.v1.endpoints.reports import (
    _draw_raster_logo,
    _draw_vector_wordmark,
    draw_rivu_brand,
)


class _Doc:
    page = 1


def _render(draw):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    draw(c)
    c.showPage()
    c.save()
    return buf.getvalue()


def test_vector_wordmark_renders_without_error():
    data = _render(lambda c: _draw_vector_wordmark(c, 18 * 2.8346, 282 * 2.8346))
    assert data.startswith(b"%PDF")


def test_draw_rivu_brand_falls_back_to_vector_when_no_logo(monkeypatch):
    from app.api.v1.endpoints import reports

    monkeypatch.setattr(reports.settings, "BRAND_LOGO_PATH", "")
    data = _render(lambda c: draw_rivu_brand(c, _Doc()))
    # A valid PDF is produced (text is Flate-compressed, so we assert structure
    # rather than searching for the literal footer string).
    assert data.startswith(b"%PDF")
    assert data.rstrip().endswith(b"%%EOF")


def test_raster_logo_is_preferred_when_configured(monkeypatch, tmp_path):
    from reportlab.lib.utils import ImageReader

    # Build a tiny valid PNG in-memory and write it to a temp file.
    from PIL import Image

    img_path = tmp_path / "logo.png"
    Image.new("RGB", (40, 40), (85, 60, 240)).save(img_path)

    drawn = {}

    class _Recorder:
        def saveState(self):
            pass

        def restoreState(self):
            pass

        def drawImage(self, reader, x, y, width=None, height=None, mask=None):
            drawn["called"] = True
            drawn["size"] = (width, height)

        def setStrokeColorRGB(self, *a):
            pass

        def line(self, *a):
            pass

        def setFillColorRGB(self, *a):
            pass

        def setFont(self, *a):
            pass

        def drawRightString(self, *a):
            pass

    from app.api.v1.endpoints import reports

    monkeypatch.setattr(reports.settings, "BRAND_LOGO_PATH", str(img_path))
    draw_rivu_brand(_Recorder(), _Doc())

    assert drawn.get("called") is True
    assert drawn["size"][0] > 0 and drawn["size"][1] > 0


def test_raster_logo_missing_file_returns_false():
    assert _draw_raster_logo(object(), "", 0, 0, 100, 100) is False
    assert _draw_raster_logo(object(), "does-not-exist.png", 0, 0, 100, 100) is False