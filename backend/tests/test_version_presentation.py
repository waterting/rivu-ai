"""Detected CSV encoding/delimiter must be persisted on the dataset version.

Audit finding #5: the parser detects encoding and delimiter but they were only
kept in memory, so a later re-read or re-export of the same version could not
reproduce the original presentation.
"""

import uuid

from app.schemas.datasets import DatasetVersionResponse
from app.workers.processor import persist_detected_presentation


class _Result:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _Session:
    """Minimal async stand-in for an AsyncSession."""

    def __init__(self, row):
        self._row = row
        self.commits = 0

    async def execute(self, _statement):
        return _Result(self._row)

    async def commit(self):
        self.commits += 1


def _version():
    return type(
        "Version",
        (),
        {"encoding": None, "delimiter": None, "id": uuid.uuid4()},
    )()


async def test_detected_presentation_is_persisted():
    version = _version()
    db = _Session(version)

    updated = await persist_detected_presentation(db, version.id, {"encoding": "utf-8", "delimiter": ","})

    assert updated is True
    assert version.encoding == "utf-8"
    assert version.delimiter == ","
    assert db.commits == 1


async def test_unchanged_presentation_is_not_rewritten():
    version = _version()
    version.encoding = "utf-8"
    version.delimiter = ","
    db = _Session(version)

    updated = await persist_detected_presentation(db, version.id, {"encoding": "utf-8", "delimiter": ","})

    assert updated is False
    assert db.commits == 0


async def test_missing_version_is_tolerated():
    db = _Session(None)

    updated = await persist_detected_presentation(db, uuid.uuid4(), {"encoding": "utf-8", "delimiter": ","})

    assert updated is False
    assert db.commits == 0


async def test_no_detection_leaves_version_untouched():
    version = _version()
    db = _Session(version)

    updated = await persist_detected_presentation(db, version.id, {})

    assert updated is False
    assert version.encoding is None
    assert db.commits == 0


def test_version_response_exposes_encoding_and_delimiter():
    fields = DatasetVersionResponse.model_fields

    assert "encoding" in fields
    assert "delimiter" in fields