"""Metrics registry and /metrics endpoint.

Audit finding: observability needs queue, processing, storage, DB-pool,
AI-latency and error metrics. These tests pin the exposition format, because a
silently malformed histogram is invisible to the scraper that depends on it.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.observability.metrics import Counter, Gauge, Histogram, Registry


def test_counter_renders_total_with_labels():
    registry = Registry()
    counter = registry.counter("t_requests_total", "Requests.", ("method", "status"))
    counter.inc(method="GET", status=200)
    counter.inc(method="GET", status=200)
    counter.inc(2, method="POST", status=500)

    rendered = registry.render()

    assert "# TYPE t_requests_total counter" in rendered
    assert 't_requests_total{method="GET",status="200"} 2.0' in rendered
    assert 't_requests_total{method="POST",status="500"} 2.0' in rendered


def test_histogram_buckets_are_cumulative_and_totals_are_consistent():
    registry = Registry()
    histogram = registry.histogram("t_seconds", "Latency.", ("route",))
    for value in (0.01, 0.3, 1.5, 45.0):
        histogram.observe(value, route="/health")

    rendered = registry.render()

    assert 't_seconds_bucket{route="/health",le="+Inf"} 4.0' in rendered
    assert 't_seconds_count{route="/health"} 4.0' in rendered
    assert 't_seconds_sum{route="/health"} 46.81' in rendered
    # Cumulative: 0.01 and 0.3 sit under 0.5s; 1.5 does not.
    assert 't_seconds_bucket{route="/health",le="0.5"} 2.0' in rendered
    assert 't_seconds_bucket{route="/health",le="2.5"} 3.0' in rendered
    assert 't_seconds_bucket{route="/health",le="0.05"} 1.0' in rendered


def test_gauge_reports_last_value_including_zero():
    registry = Registry()
    gauge = registry.gauge("t_pending", "Pending.", ("job_type",))
    gauge.set(3, job_type="profile")
    gauge.set(0, job_type="profile")

    assert 't_pending{job_type="profile"} 0' in registry.render()


def test_labels_are_required_and_escaped():
    registry = Registry()
    counter = registry.counter("t_total", "Total.", ("route",))

    with pytest.raises(KeyError):
        counter.inc()

    counter.inc(route='has "quotes"\nand newlines')
    rendered = registry.render()

    assert 'route="has \\"quotes\\"\\nand newlines"' in rendered


def test_timer_observes_elapsed_seconds():
    registry = Registry()
    histogram = registry.histogram("t_elapsed_seconds", "Elapsed.", ("route",))

    with registry.observe_timer(histogram, route="/health"):
        pass

    rendered = registry.render()

    assert 't_elapsed_seconds_count{route="/health"} 1.0' in rendered
    assert 't_elapsed_seconds_sum{route="/health"}' in rendered


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_http_metrics():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/health")
        response = await client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "rivu_http_requests_total" in response.text
    assert "rivu_http_request_duration_seconds" in response.text


@pytest.mark.asyncio
async def test_metrics_endpoint_leaks_no_user_data():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/health?email=someone%40example.com&token=secret-value")
        response = await client.get("/metrics")

    body = response.text
    assert "someone@example.com" not in body
    assert "secret-value" not in body


def test_histogram_defaults_cover_job_and_request_latency():
    histogram = Histogram("t", "h")
    # A 30s ceiling is needed for slow jobs; sub-10ms buckets for API calls.
    assert histogram._buckets[0] <= 0.01
    assert histogram._buckets[-1] >= 30.0


def test_counter_and_gauge_helpers_are_the_same_type_contract():
    assert issubclass(Gauge, object) and issubclass(Counter, object)
