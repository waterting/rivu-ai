"""Rivu by WaterTing — FastAPI application entry point."""

from contextlib import asynccontextmanager
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog

from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.logging import configure_logging
from app.api.v1.router import api_router
from app.catalogue.auth_db import close_catalogue_db, init_catalogue_db
from app.observability.metrics import (
    http_errors_total,
    http_request_duration_seconds,
    http_requests_total,
    registry,
)

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("rivu_starting", version=settings.APP_VERSION, env=settings.APP_ENV)
    await init_db()
    logger.info("database_connected")
    await init_catalogue_db()
    yield
    await close_db()
    await close_catalogue_db()
    logger.info("rivu_shutdown")


app = FastAPI(
    title="Rivu API",
    description="AI-native Data Refinery by WaterTing",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    start = time.perf_counter()
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
        "object-src 'none'; form-action 'self'; "
        "script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; font-src 'self' data:; "
        "connect-src 'self' https:; media-src 'self' https:;"
    )
    if settings.APP_ENV.lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "public, max-age=60"
    duration_ms = (time.perf_counter() - start) * 1000
    route = request.scope.get("route")
    route_template = getattr(route, "path", None) or request.url.path
    http_requests_total.inc(method=request.method, route=route_template, status=response.status_code)
    http_request_duration_seconds.observe(
        duration_ms / 1000.0, method=request.method, route=route_template
    )
    if response.status_code >= 500:
        http_errors_total.inc(method=request.method, route=route_template)
    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        request_id=request_id,
        duration_ms=round(duration_ms, 2),
    )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    detail = "Internal server error"
    if settings.APP_ENV.lower() == "development" or settings.DEBUG:
        detail = f"{type(exc).__name__}: {exc}"
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    response = JSONResponse(status_code=500, content={"detail": detail, "type": "internal_error"})
    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "rivu-api",
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
    }


@app.get("/metrics", tags=["health"], include_in_schema=False)
async def metrics():
    """Prometheus scrape endpoint.

    Exposes aggregate counts only: route templates, job types and status
    classes. No user data, tenant identifiers or request contents appear here.
    """
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(registry.render(), media_type="text/plain; version=0.0.4")


@app.get("/", tags=["root"])
async def root():
    return {
        "product": "Rivu by WaterTing",
        "tagline": "Turn messy data into production-ready intelligence.",
        "version": settings.APP_VERSION,
    }
