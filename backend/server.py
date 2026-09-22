"""Thin reverse proxy.

The platform ingress routes external `/api/*` traffic to this service on port 8001.
Gheverhan is a full-stack Next.js app that owns its own `/api/v1` route handlers on
port 3000, so this proxy simply forwards everything to Next.js. No business logic lives here.
"""
import httpx
from fastapi import FastAPI, Request, Response

NEXT_ORIGIN = "http://localhost:3000"
_HOP_BY_HOP = {
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "host",
}

app = FastAPI(title="Gheverhan Proxy")
client = httpx.AsyncClient(base_url=NEXT_ORIGIN, timeout=120.0)


@app.get("/api/_proxy/health")
async def health():
    return {"status": "ok", "proxy": "gheverhan-next"}


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    url = httpx.URL(path=request.url.path, query=request.url.query.encode("utf-8"))
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    body = await request.body()
    upstream = await client.request(
        request.method, url, headers=fwd_headers, content=body
    )
    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
    )
