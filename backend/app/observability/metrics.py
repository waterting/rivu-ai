"""In-process metrics in Prometheus text format.

Audit finding: observability needs queue, processing, storage, DB-pool,
AI-latency and error metrics. The service already emits structured logs, but
logs are not aggregatable without a log stack, so a small always-on registry
exposes the same facts to any Prometheus scraper with no new dependency.

Labels are bounded by construction: route templates are used instead of raw
paths, so cardinality does not grow with user-supplied URLs.
"""

from __future__ import annotations

import threading
import time
from typing import Dict, Iterable, List, Tuple


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _format_labels(labels: Dict[str, str]) -> str:
    if not labels:
        return ""
    inner = ",".join(f'{key}="{_escape(str(value))}"' for key, value in sorted(labels.items()))
    return "{" + inner + "}"


def _format_bucket_labels(labels: Dict[str, str], le: str | float) -> str:
    """Format bucket labels with ``le`` last, matching the Prometheus convention."""
    inner = ",".join(f'{key}="{_escape(str(value))}"' for key, value in sorted(labels.items()))
    suffix = f'{inner},' if inner else ""
    return "{" + f'{suffix}le="{le}"' + "}"


class _Metric:
    """Base metric with a fixed label schema per series."""

    def __init__(self, name: str, help_text: str, label_names: Tuple[str, ...] = ()):
        self.name = name
        self.help_text = help_text
        self.label_names = label_names
        self._lock = threading.Lock()

    def _key(self, labels: Dict[str, str]) -> Tuple[Tuple[str, str], ...]:
        missing = set(self.label_names) - set(labels)
        if missing:
            raise KeyError(f"{self.name} is missing labels: {sorted(missing)}")
        return tuple(sorted((name, str(labels[name])) for name in self.label_names))


class Counter(_Metric):
    def __init__(self, name: str, help_text: str, label_names: Tuple[str, ...] = ()):
        super().__init__(name, help_text, label_names)
        self._values: Dict[Tuple[Tuple[str, str], ...], float] = {}

    def inc(self, value: float = 1.0, **labels: str) -> None:
        key = self._key(labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + value

    def render(self) -> List[str]:
        lines = [f"# HELP {self.name} {self.help_text}", f"# TYPE {self.name} counter"]
        with self._lock:
            for key, value in sorted(self._values.items()):
                lines.append(f"{self.name}{_format_labels(dict(key))} {value}")
        return lines


class Gauge(_Metric):
    def __init__(self, name: str, help_text: str, label_names: Tuple[str, ...] = ()):
        super().__init__(name, help_text, label_names)
        self._values: Dict[Tuple[Tuple[str, str], ...], float] = {}

    def set(self, value: float, **labels: str) -> None:
        key = self._key(labels)
        with self._lock:
            self._values[key] = value

    def render(self) -> List[str]:
        lines = [f"# HELP {self.name} {self.help_text}", f"# TYPE {self.name} gauge"]
        with self._lock:
            for key, value in sorted(self._values.items()):
                lines.append(f"{self.name}{_format_labels(dict(key))} {value}")
        return lines


class Histogram(_Metric):
    """Cumulative histogram with fixed, documented buckets."""

    DEFAULT_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)

    def __init__(self, name: str, help_text: str, label_names: Tuple[str, ...] = (), buckets: Iterable[float] | None = None):
        super().__init__(name, help_text, label_names)
        self._buckets = tuple(sorted(buckets if buckets is not None else self.DEFAULT_BUCKETS))
        self._counts: Dict[Tuple[Tuple[str, str], ...], List[float]] = {}

    def observe(self, value: float, **labels: str) -> None:
        key = self._key(labels)
        with self._lock:
            counts = self._counts.setdefault(key, [0.0] * (len(self._buckets) + 2))
            # Store per-bucket counts; render() accumulates them, which is what
            # Prometheus expects from a cumulative histogram.
            for index, bound in enumerate(self._buckets):
                if value <= bound:
                    counts[index] += 1
                    break
            else:
                counts[len(self._buckets)] += 1  # +Inf bucket
            counts[-1] += value  # running sum

    def render(self) -> List[str]:
        lines = [f"# HELP {self.name} {self.help_text}", f"# TYPE {self.name} histogram"]
        bucket_total = len(self._buckets)
        with self._lock:
            keys = sorted(self._counts)
            for key in keys:
                counts = self._counts[key]
                labels = dict(key)
                total = sum(counts[:bucket_total + 1])
                cumulative = 0.0
                for index, bound in enumerate(self._buckets):
                    cumulative += counts[index]
                    lines.append(
                        f"{self.name}_bucket{_format_bucket_labels(labels, bound)} {cumulative}"
                    )
                lines.append(
                    f"{self.name}_bucket{_format_bucket_labels(labels, '+Inf')} {total}"
                )
                lines.append(f"{self.name}_sum{_format_labels(labels)} {counts[-1]}")
                lines.append(f"{self.name}_count{_format_labels(labels)} {total}")
        return lines


class Registry:
    def __init__(self) -> None:
        self._metrics: Dict[str, _Metric] = {}
        self._lock = threading.Lock()

    def _register(self, metric: _Metric) -> _Metric:
        with self._lock:
            self._metrics[metric.name] = metric
        return metric

    def counter(self, name: str, help_text: str, label_names: Tuple[str, ...] = ()) -> Counter:
        return self._register(Counter(name, help_text, label_names))

    def gauge(self, name: str, help_text: str, label_names: Tuple[str, ...] = ()) -> Gauge:
        return self._register(Gauge(name, help_text, label_names))

    def histogram(self, name: str, help_text: str, label_names: Tuple[str, ...] = (), buckets: Iterable[float] | None = None) -> Histogram:
        return self._register(Histogram(name, help_text, label_names, buckets))

    def render(self) -> str:
        with self._lock:
            metrics = list(self._metrics.values())
        lines: List[str] = []
        for metric in metrics:
            lines.extend(metric.render())
        return "\n".join(lines) + "\n"

    def observe_timer(self, metric: Histogram, **labels: str):
        return _Timer(metric, labels)


class _Timer:
    """Context manager that observes its own elapsed seconds."""

    def __init__(self, metric: Histogram, labels: Dict[str, str]):
        self._metric = metric
        self._labels = labels
        self._start = 0.0

    def __enter__(self) -> "_Timer":
        self._start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self._metric.observe(time.perf_counter() - self._start, **self._labels)
        return False


registry = Registry()

http_requests_total = registry.counter(
    "rivu_http_requests_total",
    "HTTP requests handled, by method, route template and status class.",
    ("method", "route", "status"),
)
http_request_duration_seconds = registry.histogram(
    "rivu_http_request_duration_seconds",
    "HTTP request latency in seconds, by method and route template.",
    ("method", "route"),
)
http_errors_total = registry.counter(
    "rivu_http_errors_total",
    "HTTP responses with a 5xx status class, by method and route template.",
    ("method", "route"),
)

jobs_total = registry.counter(
    "rivu_jobs_total",
    "Jobs by type and terminal or in-flight status.",
    ("job_type", "status"),
)
job_duration_seconds = registry.histogram(
    "rivu_job_duration_seconds",
    "Job wall-clock duration in seconds, by job type.",
    ("job_type",),
)
jobs_pending = registry.gauge(
    "rivu_jobs_pending",
    "Queued jobs waiting for a worker, by job type.",
    ("job_type",),
)
job_failures_total = registry.counter(
    "rivu_job_failures_total",
    "Jobs that exhausted their retry budget, by job type.",
    ("job_type",),
)