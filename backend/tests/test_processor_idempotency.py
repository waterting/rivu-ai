"""Reprocessing a version must not duplicate or contradict its own artifacts.

Stale-job recovery requeues a job that was interrupted between two commits (for
example, profile written but quality not). The retry runs the pipeline from the
top, so without an explicit clear step the version ends up with two
DataProfiles, two QualityReports, duplicate ColumnProfiles and duplicate
QualityIssues. The profile endpoint then reads an arbitrary one of them.
"""

import uuid

import pytest

from app.models.profile import ColumnProfile, DataProfile
from app.models.quality import QualityIssue, QualityReport
from app.workers.processor import _clear_previous_artifacts


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._value or []


class FakeSession:
    def __init__(self, profile_ids, report_ids):
        self._profile_ids = profile_ids
        self._report_ids = report_ids
        self.deletes = []
        self.flushes = 0

    async def execute(self, statement):
        # The first two queries are the id lookups; the rest are DELETEs.
        text = str(statement)
        if "DELETE" in text.upper():
            self.deletes.append(text)
            return _Result(None)
        if "data_profiles" in text:
            return _Result(self._profile_ids)
        return _Result(self._report_ids)

    async def flush(self):
        self.flushes += 1


def _tables_in(statement: str) -> list[str]:
    return [t for t in ("column_profiles", "data_profiles", "quality_issues", "quality_reports") if t in statement.lower()]


@pytest.mark.asyncio
async def test_clear_removes_children_before_parents():
    version_id = uuid.uuid4()
    profile_ids = [uuid.uuid4()]
    report_ids = [uuid.uuid4()]
    db = FakeSession(profile_ids, report_ids)

    await _clear_previous_artifacts(db, version_id)

    assert len(db.deletes) == 4, "expected deletes for column_profiles, data_profiles, quality_issues, quality_reports"
    # Children must be deleted before the parents they reference.
    assert _tables_in(db.deletes[0]) == ["column_profiles"]
    assert _tables_in(db.deletes[1]) == ["data_profiles"]
    assert _tables_in(db.deletes[2]) == ["quality_issues"]
    assert _tables_in(db.deletes[3]) == ["quality_reports"]


@pytest.mark.asyncio
async def test_clear_is_a_noop_when_nothing_exists():
    db = FakeSession([], [])

    await _clear_previous_artifacts(db, uuid.uuid4())

    assert db.deletes == [], "nothing to delete when the version has no artifacts"
    assert db.flushes == 1