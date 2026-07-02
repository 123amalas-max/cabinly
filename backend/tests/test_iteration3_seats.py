"""
Cabinly Iteration 3 backend tests: cabin sections (AC / Non-AC), seat-based
booking, real-time availability, and backfill of legacy booking documents.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"
DEMO_OWNER = {"email": "demo.owner@cabinly.app", "password": "Owner@123"}


def _signup(role="student"):
    email = f"it3_{role}_{uuid.uuid4().hex[:8]}@cabinlytest.app"
    r = requests.post(f"{API}/auth/signup", json={
        "name": f"IT3 {role}", "email": email, "password": "Test@1234", "role": role
    })
    assert r.status_code == 200, r.text
    d = r.json()
    return {
        "email": email,
        "token": d["access_token"],
        "user": d["user"],
        "H": {"Authorization": f"Bearer {d['access_token']}",
              "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def owner():
    return _signup("owner")


@pytest.fixture(scope="module")
def student():
    return _signup("student")


@pytest.fixture(scope="module")
def student2():
    return _signup("student")


@pytest.fixture(scope="module")
def demo_owner_ctx():
    r = requests.post(f"{API}/auth/login", json=DEMO_OWNER)
    assert r.status_code == 200
    d = r.json()
    return {"user": d["user"], "H": {"Authorization": f"Bearer {d['access_token']}",
                                     "Content-Type": "application/json"}}


# ---------------- Cabin sections ----------------
class TestCabinSections:
    def test_list_cabins_have_sections(self):
        r = requests.get(f"{API}/cabins")
        assert r.status_code == 200
        cabins = r.json()
        assert len(cabins) >= 1
        for c in cabins:
            assert isinstance(c.get("sections"), list) and len(c["sections"]) >= 1
            for s in c["sections"]:
                assert s["name"] in ("AC", "Non-AC")
                assert isinstance(s["rows"], int) and s["rows"] >= 1
                assert isinstance(s["cols"], int) and s["cols"] >= 1
                assert isinstance(s["price_per_hour"], (int, float))
            # total_seats matches sum(rows*cols)
            expected_seats = sum(s["rows"] * s["cols"] for s in c["sections"])
            assert c["total_seats"] == expected_seats
            # price_per_hour == min across sections
            expected_min = min(s["price_per_hour"] for s in c["sections"])
            assert c["price_per_hour"] == pytest.approx(expected_min)

    def test_seeded_types_correct(self):
        d = {c["name"]: c for c in requests.get(f"{API}/cabins").json()}
        assert d["Silent Study Loft"]["type"] == "Both"
        assert len(d["Silent Study Loft"]["sections"]) == 2
        assert d["Focus Cabin – Koramangala"]["type"] == "AC"
        assert len(d["Focus Cabin – Koramangala"]["sections"]) == 1
        assert d["Focus Cabin – Koramangala"]["sections"][0]["name"] == "AC"
        assert d["The Reading Nook"]["type"] == "Non-AC"
        assert len(d["The Reading Nook"]["sections"]) == 1
        assert d["The Reading Nook"]["sections"][0]["name"] == "Non-AC"

    def test_filter_ac_includes_both(self):
        d = requests.get(f"{API}/cabins", params={"type": "AC"}).json()
        assert len(d) >= 1
        assert all(c["type"] in ("AC", "Both") for c in d)
        names = {c["name"] for c in d}
        assert "Silent Study Loft" in names  # Both
        assert "Focus Cabin – Koramangala" in names  # AC

    def test_filter_non_ac_includes_both(self):
        d = requests.get(f"{API}/cabins", params={"type": "Non-AC"}).json()
        assert len(d) >= 1
        assert all(c["type"] in ("Non-AC", "Both") for c in d)
        names = {c["name"] for c in d}
        assert "The Reading Nook" in names  # Non-AC
        assert "Silent Study Loft" in names  # Both


# ---------------- Owner POST /cabins auto-sections ----------------
class TestCreateCabinAutoSections:
    def test_post_type_both_no_sections(self, owner):
        payload = {
            "name": f"TEST_BOTH_{uuid.uuid4().hex[:6]}",
            "city": "SectionCity", "address": "a", "price_per_hour": 100,
            "amenities": [], "description": "", "image_url": "",
            "type": "Both",
        }
        r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["type"] == "Both"
        assert len(body["sections"]) == 2
        sec_by_name = {s["name"]: s for s in body["sections"]}
        assert sec_by_name["AC"]["rows"] == 4 and sec_by_name["AC"]["cols"] == 6
        assert sec_by_name["AC"]["price_per_hour"] == pytest.approx(100.0)
        assert sec_by_name["Non-AC"]["rows"] == 3 and sec_by_name["Non-AC"]["cols"] == 6
        assert sec_by_name["Non-AC"]["price_per_hour"] == pytest.approx(70.0)
        assert body["total_seats"] == 4 * 6 + 3 * 6
        assert body["price_per_hour"] == pytest.approx(70.0)

    def test_post_type_ac_single_section(self, owner):
        payload = {
            "name": f"TEST_AC_{uuid.uuid4().hex[:6]}",
            "city": "SectionCity", "address": "a", "price_per_hour": 90,
            "amenities": [], "description": "", "image_url": "", "type": "AC",
        }
        r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
        assert r.status_code == 200
        b = r.json()
        assert len(b["sections"]) == 1 and b["sections"][0]["name"] == "AC"

    def test_post_type_non_ac_single_section(self, owner):
        payload = {
            "name": f"TEST_NAC_{uuid.uuid4().hex[:6]}",
            "city": "SectionCity", "address": "a", "price_per_hour": 90,
            "amenities": [], "description": "", "image_url": "", "type": "Non-AC",
        }
        r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
        assert r.status_code == 200
        b = r.json()
        assert len(b["sections"]) == 1 and b["sections"][0]["name"] == "Non-AC"

    def test_post_with_explicit_sections(self, owner):
        payload = {
            "name": f"TEST_EXPL_{uuid.uuid4().hex[:6]}",
            "city": "SectionCity", "address": "a", "price_per_hour": 200,
            "amenities": [], "description": "", "image_url": "", "type": "Both",
            "sections": [
                {"name": "AC", "rows": 2, "cols": 3, "price_per_hour": 150},
                {"name": "Non-AC", "rows": 2, "cols": 2, "price_per_hour": 80},
            ],
        }
        r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
        assert r.status_code == 200
        b = r.json()
        assert b["total_seats"] == 2 * 3 + 2 * 2
        assert b["price_per_hour"] == pytest.approx(80.0)


# ---------------- Availability + Booking with seats ----------------
@pytest.fixture(scope="module")
def both_cabin(owner):
    """A newly-created 'Both' cabin used for booking flow tests."""
    payload = {
        "name": f"TEST_AVL_{uuid.uuid4().hex[:6]}",
        "city": "AvlCity", "address": "a", "price_per_hour": 100,
        "amenities": [], "description": "", "image_url": "", "type": "Both",
    }
    r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
    assert r.status_code == 200
    return r.json()


class TestSeatBookingFlow:
    DATE = "2027-06-06"
    SLOT = "10:00 AM - 12:00 PM"

    def test_availability_starts_empty(self, both_cabin):
        r = requests.get(f"{API}/cabins/{both_cabin['id']}/availability",
                         params={"date": self.DATE, "time_slot": self.SLOT})
        assert r.status_code == 200
        d = r.json()
        assert d["cabin_id"] == both_cabin["id"]
        assert d["date"] == self.DATE
        assert d["time_slot"] == self.SLOT
        assert d["booked_seats"] == []

    def test_book_seats_valid_and_price(self, both_cabin, student):
        # AC price=100, Non-AC price=70 → 2h × (100+100+70) = 540
        seats = ["AC-A1", "AC-A2", "Non-AC-A1"]
        r = requests.post(f"{API}/bookings", headers=student["H"], json={
            "cabin_id": both_cabin["id"], "date": self.DATE,
            "time_slot": self.SLOT, "seats": seats,
        })
        assert r.status_code == 200, r.text
        b = r.json()
        assert sorted(b["seats"]) == sorted(seats)
        assert b["price"] == pytest.approx(2 * (100 + 100 + 70))
        assert b["status"] == "confirmed"
        # Availability now includes these seats
        av = requests.get(f"{API}/cabins/{both_cabin['id']}/availability",
                         params={"date": self.DATE, "time_slot": self.SLOT}).json()
        assert set(av["booked_seats"]) == set(seats)
        # Save for later tests
        both_cabin["_booking_id"] = b["id"]
        both_cabin["_seats"] = seats

    def test_book_invalid_seat_400(self, both_cabin, student2):
        r = requests.post(f"{API}/bookings", headers=student2["H"], json={
            "cabin_id": both_cabin["id"], "date": self.DATE,
            "time_slot": self.SLOT, "seats": ["AC-Z9"],
        })
        assert r.status_code == 400
        assert "Invalid seats" in r.json().get("detail", "")

    def test_book_conflict_409(self, both_cabin, student2):
        r = requests.post(f"{API}/bookings", headers=student2["H"], json={
            "cabin_id": both_cabin["id"], "date": self.DATE,
            "time_slot": self.SLOT, "seats": ["AC-A1"],  # already booked
        })
        assert r.status_code == 409
        assert "already booked" in r.json().get("detail", "")

    def test_book_without_seats_422(self, both_cabin, student2):
        r = requests.post(f"{API}/bookings", headers=student2["H"], json={
            "cabin_id": both_cabin["id"], "date": self.DATE,
            "time_slot": self.SLOT,
        })
        assert r.status_code == 422

    def test_cancel_frees_seats(self, both_cabin, student):
        bid = both_cabin["_booking_id"]
        seats = both_cabin["_seats"]
        rd = requests.delete(f"{API}/bookings/{bid}", headers=student["H"])
        assert rd.status_code == 200
        av = requests.get(f"{API}/cabins/{both_cabin['id']}/availability",
                         params={"date": self.DATE, "time_slot": self.SLOT}).json()
        for s in seats:
            assert s not in av["booked_seats"]

    def test_after_cancel_seat_rebookable(self, both_cabin, student2):
        r = requests.post(f"{API}/bookings", headers=student2["H"], json={
            "cabin_id": both_cabin["id"], "date": self.DATE,
            "time_slot": self.SLOT, "seats": ["AC-A1"],
        })
        assert r.status_code == 200, r.text
        assert r.json()["seats"] == ["AC-A1"]
        # Chat auto-welcome mentions seat
        bid = r.json()["id"]
        rm = requests.get(f"{API}/bookings/{bid}/messages", headers=student2["H"])
        assert rm.status_code == 200
        msgs = rm.json()
        assert any("AC-A1" in m["text"] for m in msgs)


# ---------------- My bookings robustness ----------------
class TestMyBookingsBackfill:
    def test_get_my_bookings_ok(self, student):
        r = requests.get(f"{API}/bookings/my", headers=student["H"])
        assert r.status_code == 200
        for b in r.json():
            assert isinstance(b.get("seats"), list)


# ---------------- Regression: existing flows ----------------
class TestRegression:
    def test_signup_login_role_switch(self):
        s = _signup("student")
        # login
        r = requests.post(f"{API}/auth/login", json={
            "email": s["email"], "password": "Test@1234"
        })
        assert r.status_code == 200
        # role switch
        rr = requests.patch(f"{API}/auth/role", headers=s["H"], json={"role": "owner"})
        assert rr.status_code == 200
        assert rr.json()["user"]["role"] == "owner"

    def test_review_future_still_400(self, student, both_cabin):
        future = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
        rb = requests.post(f"{API}/bookings", headers=student["H"], json={
            "cabin_id": both_cabin["id"], "date": future,
            "time_slot": "2:00 PM - 4:00 PM", "seats": ["Non-AC-B1"],
        })
        assert rb.status_code == 200, rb.text
        bid = rb.json()["id"]
        rr = requests.post(f"{API}/bookings/{bid}/review",
                           headers=student["H"], json={"rating": 5, "text": "nice"})
        assert rr.status_code == 400

    def test_featured_boost_still_works(self, owner):
        rc = requests.post(f"{API}/cabins", headers=owner["H"], json={
            "name": f"TEST_BOOST3_{uuid.uuid4().hex[:6]}",
            "city": "BoostC", "address": "a", "price_per_hour": 100,
            "amenities": [], "description": "", "image_url": "", "type": "AC",
        })
        cid = rc.json()["id"]
        r = requests.post(f"{API}/cabins/{cid}/feature/mock-pay",
                          headers=owner["H"], json={"days": 7})
        assert r.status_code == 200
        assert r.json()["is_featured"] is True
