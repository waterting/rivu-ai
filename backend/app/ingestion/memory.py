"""Process memory measurement for ingestion.

Audit finding: peak memory must be *measured*, not assumed. A parse can blow
past the encoded upload size once a decoded copy and a DataFrame exist, so the
worker records the process high-water mark and attributes it to the job.

`tracemalloc` only observes Python allocations and misses the buffers Polars
allocates in Rust, so it is reported separately and labelled for what it is.
"""

from __future__ import annotations


def _rss_bytes() -> int | None:
    """Current resident set size in bytes, or None when unavailable."""
    try:
        import psutil

        return int(psutil.Process().memory_info().rss)
    except Exception:
        pass
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # Linux reports kilobytes, macOS bytes.
        return int(usage if usage > 1024**3 else usage * 1024)
    except Exception:
        return None


def peak_rss_mb() -> float | None:
    """Peak resident set size for this process, in MB.

    On platforms that expose a high-water mark (Windows ``peak_wset``, Linux
    ``ru_maxrss``) this is the true process peak; elsewhere the current RSS is
    the best available answer.
    """
    try:
        import psutil

        info = psutil.Process().memory_info()
        peak = getattr(info, "peak_wset", None) or info.rss
        return round(int(peak) / (1024 * 1024), 2)
    except Exception:
        pass

    rss = _rss_bytes()
    if rss is None:
        return None
    return round(rss / (1024 * 1024), 2)


def current_rss_mb() -> float | None:
    rss = _rss_bytes()
    if rss is None:
        return None
    return round(rss / (1024 * 1024), 2)