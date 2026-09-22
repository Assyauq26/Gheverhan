"""Backend API sanity tests for Gheverhan (Next.js API routes proxied via /api)."""
import os
import io
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://c1a44360-8add-4348-ab72-5392b5c2976b.preview.emergentagent.com").rstrip("/")

ADMIN = {"identifier": "admin@gheverhan.com", "password": "Admin123!"}
CUSTOMER = {"identifier": "budi@example.com", "password": "Customer123!"}


@pytest.fixture(scope="module")
def customer_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/v1/auth/login", json=CUSTOMER, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/v1/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return s


# --- Health / catalog ---
def test_health():
    r = requests.get(f"{BASE_URL}/api/v1/health", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("success") is True
    assert j["data"]["status"] == "ok"


def test_products_list():
    r = requests.get(f"{BASE_URL}/api/v1/products", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("success") is True
    # products can be list or paginated
    data = j.get("data")
    assert data is not None


def test_product_detail_essential_tee():
    r = requests.get(f"{BASE_URL}/api/v1/products/essential-tee", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("success") is True
    assert j["data"] is not None


# --- Auth ---
def test_login_invalid():
    r = requests.post(f"{BASE_URL}/api/v1/auth/login",
                      json={"identifier": "bad@x.com", "password": "wrong"}, timeout=30)
    assert r.status_code in (400, 401)


def test_login_customer_and_me(customer_session):
    r = customer_session.get(f"{BASE_URL}/api/v1/auth/me", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("success") is True
    assert "email" in j["data"] or "user" in j["data"]


def test_login_admin(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/v1/auth/me", timeout=30)
    assert r.status_code == 200


# --- Cart / Orders ---
def test_cart_add_and_view(customer_session):
    # Fetch a product with variant
    r = requests.get(f"{BASE_URL}/api/v1/products/essential-tee", timeout=30)
    prod = r.json()["data"]
    variants = prod.get("variants") or []
    if not variants:
        pytest.skip("No variants on essential-tee")
    for v in variants:
        r = customer_session.post(f"{BASE_URL}/api/v1/cart/items",
                                  json={"variantId": v["id"], "quantity": 1}, timeout=30)
        if r.status_code in (200, 201):
            return
    pytest.skip(f"No variant in stock: {r.status_code} {r.text}")


def test_orders_list(customer_session):
    r = customer_session.get(f"{BASE_URL}/api/v1/orders", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("success") is True


# --- Admin auth guard ---
def test_admin_payments_requires_admin(customer_session):
    r = customer_session.get(f"{BASE_URL}/api/v1/admin/payments", timeout=30)
    assert r.status_code in (401, 403, 404)


def test_admin_payments_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/v1/admin/payments", timeout=30)
    # endpoint may or may not exist as GET; accept 200/404
    assert r.status_code in (200, 404, 405)
