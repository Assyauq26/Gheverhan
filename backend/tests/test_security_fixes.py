"""SEC-001 (shipping cost server-authoritative) & SEC-002 (payment proof by id) tests + regression."""
import os
import io
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN = {"identifier": "admin@gheverhan.com", "password": "Admin123!"}
CUSTOMER = {"identifier": "budi@example.com", "password": "Customer123!"}

TRUSTED_RATES = {
    ("JNE", "REG"): 20000,
    ("J&T", "EZ"): 22000,
    ("SiCepat", "BEST"): 25000,
}


@pytest.fixture(scope="module")
def customer_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/v1/auth/login", json=CUSTOMER, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/v1/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def active_bank_id(customer_session):
    # Fetch banks via checkout preview or a dedicated endpoint. Try the checkout page HTML — else use API.
    # Prefer /api/v1/bank-accounts if exists
    for path in ["/api/v1/bank-accounts", "/api/v1/checkout/banks", "/api/v1/admin/bank-accounts"]:
        r = customer_session.get(f"{BASE_URL}{path}", timeout=15)
        if r.status_code == 200:
            j = r.json()
            data = j.get("data")
            if isinstance(data, list) and data:
                for b in data:
                    if b.get("isActive", True):
                        return b["id"]
    # Fallback: query PostgreSQL directly using psql
    import subprocess
    out = subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "gheverhan", "-t", "-A",
         "-c", 'SELECT id FROM "BankAccount" WHERE "isActive"=true LIMIT 1;'],
        env={**os.environ, "PGPASSWORD": "gheverhan_pg_pw"},
        capture_output=True, text=True,
    )
    bank_id = out.stdout.strip().splitlines()[0] if out.stdout.strip() else ""
    if bank_id:
        return bank_id
    pytest.skip("Could not find an active bank account")


def _ensure_cart(customer_session):
    """Make sure customer has at least one item in the cart (Essential Tee)."""
    r = requests.get(f"{BASE_URL}/api/v1/products/essential-tee", timeout=30)
    prod = r.json()["data"]
    variants = prod.get("variants") or []
    assert variants, "Essential Tee has no variants"
    unit_price = prod.get("price")
    last_err = None
    for v in variants:
        resp = customer_session.post(
            f"{BASE_URL}/api/v1/cart/items",
            json={"variantId": v["id"], "quantity": 1},
            timeout=30,
        )
        if resp.status_code in (200, 201):
            return v.get("price") or unit_price
        last_err = f"{resp.status_code} {resp.text}"
    pytest.skip(f"No variant in stock for Essential Tee: {last_err}")


# --------------------- SEC-001 ---------------------

def test_sec001_preview_uses_trusted_shipping(customer_session):
    _ensure_cart(customer_session)
    r = customer_session.post(
        f"{BASE_URL}/api/v1/checkout/preview",
        json={"shipping": {"courier": "JNE", "service": "REG", "cost": 0}},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["shippingCost"] == 20000, f"expected trusted 20000, got {data['shippingCost']}"


def test_sec001_preview_rejects_invalid_method(customer_session):
    _ensure_cart(customer_session)
    r = customer_session.post(
        f"{BASE_URL}/api/v1/checkout/preview",
        json={"shipping": {"courier": "FREE", "service": "X", "cost": 0}},
        timeout=30,
    )
    assert r.status_code == 400
    body = r.json()
    msg = body.get("error") or body.get("message") or ""
    assert "Metode pengiriman tidak valid" in str(body), body


def test_sec001_order_ignores_client_shipping_cost(customer_session, active_bank_id):
    unit_price = _ensure_cart(customer_session)
    payload = {
        "address": {
            "recipientName": "Budi Test",
            "phone": "08123456789",
            "line": "Jl. Testing 1",
            "city": "Jakarta",
            "province": "DKI Jakarta",
            "postalCode": "10110",
        },
        "shipping": {"courier": "JNE", "service": "REG", "cost": 0},  # MANIPULATED
        "bankAccountId": active_bank_id,
    }
    r = customer_session.post(f"{BASE_URL}/api/v1/orders", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    order = r.json()["data"]
    assert order["shippingCost"] == 20000, order
    # Total should include the trusted shipping (not 0)
    assert order["total"] == order["subtotal"] + 20000 - order.get("discount", 0), order


def test_sec001_order_rejects_invalid_method(customer_session, active_bank_id):
    _ensure_cart(customer_session)
    payload = {
        "address": {
            "recipientName": "Budi Test",
            "phone": "08123456789",
            "line": "Jl. Testing 1",
            "city": "Jakarta",
            "province": "DKI Jakarta",
            "postalCode": "10110",
        },
        "shipping": {"courier": "FREE", "service": "X", "cost": 0},
        "bankAccountId": active_bank_id,
    }
    r = customer_session.post(f"{BASE_URL}/api/v1/orders", json=payload, timeout=30)
    assert r.status_code == 400
    assert "Metode pengiriman tidak valid" in str(r.json()), r.text


# --------------------- SEC-002 ---------------------

def test_sec002_proof_requires_id(admin_session):
    # OLD-style ?path=... must be rejected with 400
    r = admin_session.get(
        f"{BASE_URL}/api/v1/admin/payments/proof?path=gheverhan/whatever.png",
        timeout=30,
    )
    assert r.status_code == 400
    assert "id diperlukan" in str(r.json()), r.text


def test_sec002_proof_bogus_id(admin_session):
    r = admin_session.get(
        f"{BASE_URL}/api/v1/admin/payments/proof?id=bogus-id-not-exist",
        timeout=30,
    )
    assert r.status_code == 404


def test_sec002_proof_requires_admin(customer_session):
    r = customer_session.get(
        f"{BASE_URL}/api/v1/admin/payments/proof?id=anything",
        timeout=30,
    )
    assert r.status_code in (401, 403)


def test_sec002_proof_valid_id_returns_image(admin_session, customer_session, active_bank_id):
    """Create an order + upload proof + fetch proof via id."""
    # Create order (fresh cart)
    _ensure_cart(customer_session)
    order_res = customer_session.post(
        f"{BASE_URL}/api/v1/orders",
        json={
            "address": {
                "recipientName": "Budi Proof",
                "phone": "08123456789",
                "line": "Jl. Bukti 1",
                "city": "Jakarta",
                "province": "DKI Jakarta",
                "postalCode": "10110",
            },
            "shipping": {"courier": "JNE", "service": "REG", "cost": 20000},
            "bankAccountId": active_bank_id,
        },
        timeout=30,
    )
    if order_res.status_code not in (200, 201):
        pytest.skip(f"Could not create order: {order_res.status_code} {order_res.text}")
    order = order_res.json()["data"]
    order_id = order["id"]

    # Upload proof via multipart
    png = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )
    files = {"proof": ("proof.png", io.BytesIO(png), "image/png")}
    data = {
        "orderId": order_id,
        "senderBank": "BCA",
        "senderName": "Budi Proof",
        "amount": str(order["total"]),
        "transferDate": "2026-01-15",
    }
    conf = customer_session.post(
        f"{BASE_URL}/api/v1/payments/confirm", files=files, data=data, timeout=60
    )
    print("CONFIRM RESPONSE", conf.status_code, conf.text[:400])
    if conf.status_code not in (200, 201):
        pytest.skip(f"Could not upload proof: {conf.status_code} {conf.text}")

    # Look up the confirmation id via Payment -> Order id
    import subprocess
    out = subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "gheverhan", "-t", "-A",
         "-c", f'SELECT pc.id FROM "PaymentConfirmation" pc JOIN "Payment" p ON pc."paymentId"=p.id WHERE p."orderId"=\'{order_id}\' ORDER BY pc."createdAt" DESC LIMIT 1;'],
        env={**os.environ, "PGPASSWORD": "gheverhan_pg_pw"},
        capture_output=True, text=True,
    )
    confirmation_id = out.stdout.strip().splitlines()[0] if out.stdout.strip() else ""
    if not confirmation_id:
        pytest.skip(f"No confirmation id found for order {order_id}")

    r = admin_session.get(
        f"{BASE_URL}/api/v1/admin/payments/proof?id={confirmation_id}",
        timeout=90,
    )
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("image/")
    assert len(r.content) > 0
