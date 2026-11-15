// Dev/e2e API proxy with permissive CORS.
//
// The deployed API only allows its own origin, so a local browser session cannot
// call it directly. This tiny server forwards `/api/v1/*` (and `/health`) to the
// deployed backend and adds CORS headers, letting `npm run build && next start`
// run authenticated e2e journeys against real data without a local database.
//
// Usage: node scripts/dev-api-proxy.mjs [target] [port]
import http from "node:http";

const target = process.argv[2] || process.env.E2E_API_PROXY_TARGET || "https://rivu-ai.onrender.com";
const port = Number(process.argv[3] || process.env.E2E_API_PROXY_PORT || 8000);
const base = target.replace(/\/+$/, "");

const server = http.createServer(async (req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "content-type,authorization",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  // /api/v1/* -> <base>/api/v1/*, /health -> <base>/health
  const upstreamPath = url.pathname.startsWith("/api/") ? url.pathname : url.pathname;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  try {
    const upstream = await fetch(`${base}${upstreamPath}${url.search}`, {
      method: req.method,
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        Authorization: req.headers.authorization || "",
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      redirect: "manual",
    });

    const headers = { ...cors, "Content-Type": upstream.headers.get("content-type") || "application/json" };
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, headers);
    res.end(payload);
  } catch (error) {
    res.writeHead(502, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: { message: `proxy error: ${error.message}` } }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`api proxy listening on http://127.0.0.1:${port} -> ${base}`);
});