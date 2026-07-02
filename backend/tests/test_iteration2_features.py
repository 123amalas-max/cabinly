"""
Iteration 2 backend tests: Cabin type (AC/Non-AC), Mock UPI boost, Reviews
(past-date only), Chat threads (auto-welcome, participant-only, roles).
"""
import os
import uuid
import asyncio
import pytest
import requests
from pathlib import Path
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"
DEMO_OWNER = {"email": "demo.owner@cabinly.app", "password": "Owner@123"}


# ------------------ fixtures ------------------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _signup(role="student"):
    email = f"it2_{role}_{uuid.uuid4().hex[:8]}@cabinlytest.app"
    r = requests.post(f"{API}/auth/signup", json={
        "name": f"IT2 {role}", "email": email, "password": "Test@1234", "role": role
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
def demo_owner_ctx():
    r = requests.post(f"{API}/auth/login", json=DEMO_OWNER)
    assert r.status_code == 200
    d = r.json()
    return {"user": d["user"], "H": {"Authorization": f"Bearer {d['access_token']}",
                                     "Content-Type": "application/json"}}


# ------------------ Cabin Type ------------------
class TestCabinType:
    def test_list_has_type_and_new_fields(self):
        r = requests.get(f"{API}/cabins")
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1
        c = d[0]
        for k in ["avg_rating", "review_count", "is_featured", "featured_until", "type"]:
            assert k in c, f"missing {k}"
        assert c["type"] in ("AC", "Non-AC")

    def test_filter_ac(self):
        r = requests.get(f"{API}/cabins", params={"type": "AC"})
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1
        assert all(c["type"] == "AC" for c in d)

    def test_filter_non_ac(self):
        r = requests.get(f"{API}/cabins", params={"type": "Non-AC"})
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1
        assert all(c["type"] == "Non-AC" for c in d)

    def test_filter_all(self):
        r_all = requests.get(f"{API}/cabins", params={"type": "All"})
        r_none = requests.get(f"{API}/cabins")
        assert r_all.status_code == 200 and r_none.status_code == 200
        # Both should return the full list
        assert len(r_all.json()) == len(r_none.json())

    def test_seeded_types_correct(self):
        d = requests.get(f"{API}/cabins").json()
        by_name = {c["name"]: c["type"] for c in d}
        assert by_name.get("Silent Study Loft") == "AC"
        assert by_name.get("The Reading Nook") == "Non-AC"
        assert by_name.get("Focus Cabin – Koramangala") == "AC"

    def test_post_cabin_accepts_type(self, owner):
        payload = {
            "name": f"TEST_NAC_{uuid.uuid4().hex[:6]}",
            "city": "TestCity", "address": "addr", "price_per_hour": 60,
            "amenities": [], "description": "", "image_url": "",
            "type": "Non-AC",
        }
        r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["type"] == "Non-AC"

    def test_post_cabin_default_type_ac(self, owner):
        payload = {
            "name": f"TEST_DEF_{uuid.uuid4().hex[:6]}",
            "city": "TestCity", "address": "addr", "price_per_hour": 60,
            "amenities": [], "description": "", "image_url": "",
        }
        r = requests.post(f"{API}/cabins", headers=owner["H"], json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["type"] == "AC"


# ------------------ Featured Boost (Mock UPI) ------------------
class TestFeatureBoost:
    def test_owner_can_boost_and_non_owner_gets_403(self, owner):
        # Owner1 creates cabin
        rc = requests.post(f"{API}/cabins", headers=owner["H"], json={
            "name": f"TEST_BOOST_{uuid.uuid4().hex[:6]}",
            "city": "BoostCity", "address": "a", "price_per_hour": 100,
            "amenities": [], "description": "", "image_url": "", "type": "AC"
        })
        cabin_id = rc.json()["id"]

        # A different owner tries to boost -> 403
        other = _signup("owner")
        r_forbidden = requests.post(
            f"{API}/cabins/{cabin_id}/feature/mock-pay",
            headers=other["H"], json={"days": 7}
        )
        assert r_forbidden.status_code == 403

        # Owner boosts
        r = requests.post(f"{API}/cabins/{cabin_id}/feature/mock-pay",
                          headers=owner["H"], json={"days": 7})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_featured"] is True
        assert body["featured_until"] is not None
        fu = datetime.fromisoformat(body["featured_until"].replace("Z", "+00:00"))
        delta = fu - datetime.now(timezone.utc)
        # ~7 days (allow small clock drift): between 6.9d and 7d
        assert timedelta(days=6, hours=23) <= delta <= timedelta(days=7, seconds=5)

    def test_featured_cabins_appear_first(self, owner):
        # Boost a cabin, then check that GET /cabins returns it before non-featured
        rc = requests.post(f"{API}/cabins", headers=owner["H"], json={
            "name": f"TEST_FIRST_{uuid.uuid4().hex[:6]}",
            "city": "SortCity", "address": "a", "price_per_hour": 50,
            "amenities": [], "description": "", "image_url": "", "type": "AC"
        })
        cid = rc.json()["id"]
        r = requests.post(f"{API}/cabins/{cid}/feature/mock-pay",
                          headers=owner["H"], json={"days": 7})
        assert r.status_code == 200
        all_cabins = requests.get(f"{API}/cabins").json()
        # Find index of our cabin; all cabins BEFORE it must be featured
        idx = next(i for i, c in enumerate(all_cabins) if c["id"] == cid)
        for c in all_cabins[:idx]:
            assert c["is_featured"] is True
        # And our cabin is featured
        assert all_cabins[idx]["is_featured"] is True


# ------------------ Reviews ------------------
class TestReviews:
    def test_future_date_400(self, student):
        cabin = requests.get(f"{API}/cabins").json()[0]
        future = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
        rb = requests.post(f"{API}/bookings", headers=student["H"], json={
            "cabin_id": cabin["id"], "date": future,
            "time_slot": "10:00 AM - 12:00 PM"
        })
        assert rb.status_code == 200, rb.text
        bid = rb.json()["id"]
        rr = requests.post(f"{API}/bookings/{bid}/review",
                           headers=student["H"], json={"rating": 5, "text": "nice"})
        assert rr.status_code == 400
        assert "after the booking date has passed" in rr.json().get("detail", "")

    def test_today_date_also_400(self, student):
        cabin = requests.get(f"{API}/cabins").json()[0]
        today = datetime.utcnow().strftime("%Y-%m-%d")
        rb = requests.post(f"{API}/bookings", headers=student["H"], json={
            "cabin_id": cabin["id"], "date": today,
            "time_slot": "10:00 AM - 12:00 PM"
        })
        assert rb.status_code == 200
        bid = rb.json()["id"]
        rr = requests.post(f"{API}/bookings/{bid}/review",
                           headers=student["H"], json={"rating": 4, "text": "meh"})
        assert rr.status_code == 400

    def test_other_user_review_gets_404(self, student):
        cabin = requests.get(f"{API}/cabins").json()[0]
        rb = requests.post(f"{API}/bookings", headers=student["H"], json={
            "cabin_id": cabin["id"], "date": "2027-01-01",
            "time_slot": "10:00 AM - 12:00 PM"
        })
        bid = rb.json()["id"]
        other = _signup("student")
        rr = requests.post(f"{API}/bookings/{bid}/review",
                           headers=other["H"], json={"rating": 5, "text": "x"})
        assert rr.status_code == 404

    def test_success_path_past_date_via_mongo(self):
        """
        Insert a past-dated confirmed booking directly via motor and then hit
        the review endpoint; verify avg_rating/review_count update and
        duplicate review returns 400.
        """
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL") or _read_env("/app/backend/.env", "MONGO_URL")
        db_name = os.environ.get("DB_NAME") or _read_env("/app/backend/.env", "DB_NAME")
        assert mongo_url and db_name

        stu = _signup("student")
        cabin = requests.get(f"{API}/cabins").json()[0]
        cabin_id = cabin["id"]
        booking_id = str(uuid.uuid4())

        async def _insert():
            cli = AsyncIOMotorClient(mongo_url)
            db = cli[db_name]
            await db.bookings.insert_one({
                "id": booking_id,
                "cabin_id": cabin_id,
                "user_id": stu["user"]["id"],
                "date": (datetime.utcnow() - timedelta(days=2)).strftime("%Y-%m-%d"),
                "time_slot": "10:00 AM - 12:00 PM",
                "price": 200.0,
                "status": "confirmed",
                "created_at": datetime.now(timezone.utc),
            })
            cli.close()

        asyncio.run(_insert())

        # Confirm can_review true via GET /bookings/{id}
        rg = requests.get(f"{API}/bookings/{booking_id}", headers=stu["H"])
        assert rg.status_code == 200, rg.text
        assert rg.json()["can_review"] is True
        assert rg.json()["has_review"] is False
        assert "cabin_type" in rg.json()
        assert "owner_id" in rg.json()

        # Baseline stats
        c0 = requests.get(f"{API}/cabins/{cabin_id}").json()
        base_count = c0["review_count"]

        rr = requests.post(f"{API}/bookings/{booking_id}/review",
                           headers=stu["H"], json={"rating": 4, "text": "TEST review OK"})
        assert rr.status_code == 200, rr.text
        assert rr.json()["rating"] == 4

        # Duplicate → 400
        dup = requests.post(f"{API}/bookings/{booking_id}/review",
                            headers=stu["H"], json={"rating": 5, "text": "dup"})
        assert dup.status_code == 400

        # Cabin reviews contains the new one
        rl = requests.get(f"{API}/cabins/{cabin_id}/reviews")
        assert rl.status_code == 200
        assert any(rv["booking_id"] == booking_id for rv in rl.json())

        # Cabin's avg_rating/review_count updated
        c1 = requests.get(f"{API}/cabins/{cabin_id}").json()
        assert c1["review_count"] == base_count + 1
        assert c1["avg_rating"] > 0

        # Booking now has_review=true, can_review=false
        rg2 = requests.get(f"{API}/bookings/{booking_id}", headers=stu["H"]).json()
        assert rg2["has_review"] is True
        assert rg2["can_review"] is False


def _read_env(path, key):
    try:
        for line in Path(path).read_text().splitlines():
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        return None


# ------------------ Chat & Booking Access ------------------
class TestChatAndBookingAccess:
    def test_auto_welcome_message_and_chat_flow(self, student, demo_owner_ctx):
        # Book a seeded cabin (owned by demo owner)
        cabin = next(c for c in requests.get(f"{API}/cabins").json()
                     if c["owner_id"] == demo_owner_ctx["user"]["id"])
        rb = requests.post(f"{API}/bookings", headers=student["H"], json={
            "cabin_id": cabin["id"], "date": "2027-05-05",
            "time_slot": "10:00 AM - 12:00 PM"
        })
        assert rb.status_code == 200
        bid = rb.json()["id"]

        # Auto-welcome message from owner
        rm = requests.get(f"{API}/bookings/{bid}/messages", headers=student["H"])
        assert rm.status_code == 200
        msgs = rm.json()
        assert len(msgs) >= 1
        assert any(m["sender_role"] == "owner" for m in msgs)

        # Student sends
        rs = requests.post(f"{API}/bookings/{bid}/messages",
                           headers=student["H"], json={"text": "hi from student"})
        assert rs.status_code == 200
        assert rs.json()["sender_role"] == "student"

        # Owner sends
        ro = requests.post(f"{API}/bookings/{bid}/messages",
                           headers=demo_owner_ctx["H"], json={"text": "hi from owner"})
        assert ro.status_code == 200
        assert ro.json()["sender_role"] == "owner"

        # Non-participant → 403 on list & post
        other = _signup("student")
        rx = requests.get(f"{API}/bookings/{bid}/messages", headers=other["H"])
        assert rx.status_code == 403
        rxp = requests.post(f"{API}/bookings/{bid}/messages",
                            headers=other["H"], json={"text": "hi"})
        assert rxp.status_code == 403

        # GET booking as non-participant → 403
        rgx = requests.get(f"{API}/bookings/{bid}", headers=other["H"])
        assert rgx.status_code == 403

        # Owner can fetch booking
        rgo = requests.get(f"{API}/bookings/{bid}", headers=demo_owner_ctx["H"])
        assert rgo.status_code == 200
        b = rgo.json()
        assert b["owner_id"] == demo_owner_ctx["user"]["id"]
        assert "can_review" in b and "has_review" in b and "cabin_type" in b
