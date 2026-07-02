"""
Cabinly backend API tests.
Covers auth, cabins, bookings + role switching.
Uses EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env for public URL testing.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load public URL from frontend env
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"

DEMO_OWNER = {"email": "demo.owner@cabinly.app", "password": "Owner@123"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def student_ctx(s):
    """Create a fresh student and yield {token, user, headers}."""
    email = f"test_student_{uuid.uuid4().hex[:8]}@cabinlytest.app"
    r = s.post(f"{API}/auth/signup", json={
        "name": "Test Student", "email": email, "password": "Test@1234", "role": "student"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["access_token"], "user": d["user"], "email": email,
            "headers": {"Authorization": f"Bearer {d['access_token']}",
                        "Content-Type": "application/json"}}


@pytest.fixture(scope="session")
def owner_ctx(s):
    """Fresh owner user."""
    email = f"test_owner_{uuid.uuid4().hex[:8]}@cabinlytest.app"
    r = s.post(f"{API}/auth/signup", json={
        "name": "Test Owner", "email": email, "password": "Test@1234", "role": "owner"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["access_token"], "user": d["user"], "email": email,
            "headers": {"Authorization": f"Bearer {d['access_token']}",
                        "Content-Type": "application/json"}}


# ---------------- Auth ----------------
class TestAuth:
    def test_signup_returns_token_and_user(self, s):
        email = f"test_su_{uuid.uuid4().hex[:8]}@cabinlytest.app"
        r = s.post(f"{API}/auth/signup", json={
            "name": "SU", "email": email, "password": "Test@1234", "role": "student"
        })
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and d["token_type"] == "bearer"
        assert d["user"]["email"] == email
        assert d["user"]["role"] == "student"
        assert "id" in d["user"] and d["user"]["name"] == "SU"

    def test_signup_duplicate_email_400(self, s, student_ctx):
        r = s.post(f"{API}/auth/signup", json={
            "name": "Dup", "email": student_ctx["email"],
            "password": "Test@1234", "role": "student"
        })
        assert r.status_code == 400

    def test_login_success(self, s, student_ctx):
        r = s.post(f"{API}/auth/login",
                   json={"email": student_ctx["email"], "password": "Test@1234"})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d
        assert d["user"]["email"] == student_ctx["email"]

    def test_login_wrong_password_401(self, s, student_ctx):
        r = s.post(f"{API}/auth/login",
                   json={"email": student_ctx["email"], "password": "WRONG_PASS!!"})
        assert r.status_code == 401

    def test_me_without_token_401(self, s):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, s, student_ctx):
        r = requests.get(f"{API}/auth/me", headers=student_ctx["headers"])
        assert r.status_code == 200
        assert r.json()["email"] == student_ctx["email"]

    def test_role_switch_returns_new_token(self, s):
        # Fresh user for this test to avoid mutating shared fixtures
        email = f"test_role_{uuid.uuid4().hex[:8]}@cabinlytest.app"
        r = s.post(f"{API}/auth/signup", json={
            "name": "R", "email": email, "password": "Test@1234", "role": "student"
        })
        assert r.status_code == 200
        old_token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {old_token}",
             "Content-Type": "application/json"}
        r2 = requests.patch(f"{API}/auth/role", json={"role": "owner"}, headers=h)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["user"]["role"] == "owner"
        assert d["access_token"] != old_token
        # New token should let user POST cabins
        newh = {"Authorization": f"Bearer {d['access_token']}",
                "Content-Type": "application/json"}
        r3 = requests.post(f"{API}/cabins", headers=newh, json={
            "name": "TEST role_switch cabin", "city": "TestCity",
            "address": "1 test rd", "price_per_hour": 50,
            "amenities": ["Wi-Fi"], "description": "t", "image_url": ""
        })
        assert r3.status_code == 200, r3.text


# ---------------- Cabins ----------------
class TestCabins:
    def test_list_returns_at_least_10(self, s):
        r = s.get(f"{API}/cabins")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 10
        assert {"id", "name", "city", "price_per_hour"}.issubset(data[0].keys())

    def test_city_filter_bengaluru(self, s):
        r = s.get(f"{API}/cabins", params={"city": "Bengaluru"})
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1
        assert all(c["city"].lower() == "bengaluru" for c in d)

    def test_search_silent(self, s):
        r = s.get(f"{API}/cabins", params={"q": "silent"})
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1
        for c in d:
            hay = f"{c['name']} {c['city']} {c['description']}".lower()
            assert "silent" in hay

    def test_cities_sorted_distinct(self, s):
        r = s.get(f"{API}/cabins/cities")
        assert r.status_code == 200
        cities = r.json()
        assert cities == sorted(cities)
        assert len(cities) == len(set(cities))
        for c in ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"]:
            assert c in cities

    def test_get_cabin_by_id_and_404(self, s):
        first = s.get(f"{API}/cabins").json()[0]
        r = s.get(f"{API}/cabins/{first['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == first["id"]
        r2 = s.get(f"{API}/cabins/does-not-exist")
        assert r2.status_code == 404

    def test_student_cannot_create_cabin_403(self, student_ctx):
        r = requests.post(f"{API}/cabins", headers=student_ctx["headers"], json={
            "name": "should not", "city": "X", "address": "y",
            "price_per_hour": 10, "amenities": [], "description": "", "image_url": ""
        })
        assert r.status_code == 403

    def test_owner_can_create_and_lists_in_my(self, owner_ctx):
        payload = {
            "name": f"test_ownercabin_{uuid.uuid4().hex[:6]}",
            "city": "TestCity",
            "address": "1 Test Road",
            "price_per_hour": 75.0,
            "amenities": ["Wi-Fi", "AC"],
            "description": "unit-test cabin",
            "image_url": "",
        }
        r = requests.post(f"{API}/cabins", headers=owner_ctx["headers"], json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["owner_id"] == owner_ctx["user"]["id"]
        assert created["name"] == payload["name"]

        r2 = requests.get(f"{API}/cabins/my", headers=owner_ctx["headers"])
        assert r2.status_code == 200
        names = [c["name"] for c in r2.json()]
        assert payload["name"] in names


# ---------------- Bookings ----------------
class TestBookings:
    def test_create_booking_and_price_x2(self, s, student_ctx):
        cabin = s.get(f"{API}/cabins").json()[0]
        r = requests.post(f"{API}/bookings", headers=student_ctx["headers"], json={
            "cabin_id": cabin["id"], "date": "2026-02-01",
            "time_slot": "10:00 AM - 12:00 PM"
        })
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["cabin_name"] == cabin["name"]
        assert b["cabin_city"] == cabin["city"]
        assert b["cabin_image"] == cabin["image_url"]
        assert b["price"] == pytest.approx(cabin["price_per_hour"] * 2)
        assert b["status"] == "confirmed"
        student_ctx["last_booking_id"] = b["id"]

    def test_my_bookings_returns_created(self, student_ctx):
        r = requests.get(f"{API}/bookings/my", headers=student_ctx["headers"])
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert student_ctx.get("last_booking_id") in ids

    def test_cancel_booking(self, student_ctx):
        bid = student_ctx["last_booking_id"]
        r = requests.delete(f"{API}/bookings/{bid}", headers=student_ctx["headers"])
        assert r.status_code == 200
        r2 = requests.get(f"{API}/bookings/my", headers=student_ctx["headers"])
        b = next(x for x in r2.json() if x["id"] == bid)
        assert b["status"] == "cancelled"

    def test_cannot_cancel_others_booking_404(self, s, student_ctx):
        # Second student
        email = f"test_stu2_{uuid.uuid4().hex[:8]}@cabinlytest.app"
        r = s.post(f"{API}/auth/signup", json={
            "name": "S2", "email": email, "password": "Test@1234", "role": "student"
        })
        h2 = {"Authorization": f"Bearer {r.json()['access_token']}",
              "Content-Type": "application/json"}
        cabin = s.get(f"{API}/cabins").json()[0]
        rb = requests.post(f"{API}/bookings", headers=h2, json={
            "cabin_id": cabin["id"], "date": "2026-02-02",
            "time_slot": "2:00 PM - 4:00 PM"
        })
        other_bid = rb.json()["id"]
        # Student 1 tries to cancel Student 2's booking → 404
        r_del = requests.delete(f"{API}/bookings/{other_bid}",
                                headers=student_ctx["headers"])
        assert r_del.status_code == 404

    def test_owner_bookings_only_own_cabins(self, s, owner_ctx):
        # Create cabin as owner, then book it as fresh student, then owner_bookings returns it
        r = requests.post(f"{API}/cabins", headers=owner_ctx["headers"], json={
            "name": f"test_bkcabin_{uuid.uuid4().hex[:6]}",
            "city": "TestCity", "address": "addr", "price_per_hour": 40,
            "amenities": [], "description": "", "image_url": "",
        })
        cabin_id = r.json()["id"]

        se = f"test_stubk_{uuid.uuid4().hex[:8]}@cabinlytest.app"
        rs = s.post(f"{API}/auth/signup", json={
            "name": "S", "email": se, "password": "Test@1234", "role": "student"
        })
        sh = {"Authorization": f"Bearer {rs.json()['access_token']}",
              "Content-Type": "application/json"}
        rb = requests.post(f"{API}/bookings", headers=sh, json={
            "cabin_id": cabin_id, "date": "2026-02-03", "time_slot": "9:00 AM - 11:00 AM"
        })
        assert rb.status_code == 200

        ro = requests.get(f"{API}/bookings/owner", headers=owner_ctx["headers"])
        assert ro.status_code == 200
        cabin_ids = {b["cabin_id"] for b in ro.json()}
        assert cabin_id in cabin_ids


# ---------------- Seeded owner login ----------------
class TestSeededOwner:
    def test_login_demo_owner(self, s):
        r = s.post(f"{API}/auth/login", json=DEMO_OWNER)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "owner"
