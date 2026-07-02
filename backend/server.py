"""
Cabinly Backend – Reading Room & Study Cabin Booking App.
FastAPI + MongoDB + JWT auth (email/password with bcrypt).
Features: cabins with AC / Non-AC sections + per-seat availability
(BookMyShow-style), bookings, reviews, per-booking chat threads,
mock UPI featured boost.
All routes are prefixed with /api.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import uuid
import logging

# ---------------------------------------------------------------------------
# Env & DB
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# ---------------------------------------------------------------------------
# Security config
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "cabinly-dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Cabinly API")
api = APIRouter(prefix="/api")

Role = Literal["student", "owner"]
CabinType = Literal["AC", "Non-AC", "Both"]
SectionName = Literal["AC", "Non-AC"]

# Default seat grid sizes for auto-generated sections.
DEFAULT_AC_ROWS, DEFAULT_AC_COLS = 4, 6           # 24 seats
DEFAULT_NON_AC_ROWS, DEFAULT_NON_AC_COLS = 3, 6   # 18 seats
NON_AC_PRICE_RATIO = 0.7                          # Non-AC = 70% of base

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    role: Role = "student"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RoleUpdateIn(BaseModel):
    role: Role


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Role


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SectionSpec(BaseModel):
    name: SectionName
    rows: int = Field(ge=1, le=12)
    cols: int = Field(ge=1, le=12)
    price_per_hour: float = Field(ge=0)


class CabinIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=80)
    address: str = Field(min_length=1, max_length=200)
    price_per_hour: float = Field(ge=0)
    amenities: List[str] = Field(default_factory=list)
    description: str = Field(default="", max_length=1000)
    image_url: str = Field(default="")
    type: CabinType = "AC"
    sections: Optional[List[SectionSpec]] = None

    @model_validator(mode="after")
    def _fill_sections(self) -> "CabinIn":
        if self.sections and len(self.sections) > 0:
            return self
        # Derive from type + price_per_hour
        secs: List[SectionSpec] = []
        if self.type in ("AC", "Both"):
            secs.append(SectionSpec(
                name="AC",
                rows=DEFAULT_AC_ROWS,
                cols=DEFAULT_AC_COLS,
                price_per_hour=float(self.price_per_hour),
            ))
        if self.type in ("Non-AC", "Both"):
            secs.append(SectionSpec(
                name="Non-AC",
                rows=DEFAULT_NON_AC_ROWS,
                cols=DEFAULT_NON_AC_COLS,
                price_per_hour=round(float(self.price_per_hour) * NON_AC_PRICE_RATIO, 2),
            ))
        self.sections = secs
        return self


class CabinOut(BaseModel):
    id: str
    owner_id: str
    name: str
    city: str
    address: str
    price_per_hour: float  # min across sections, for display
    amenities: List[str]
    description: str
    image_url: str
    type: CabinType
    sections: List[SectionSpec]
    rating: float = 4.7
    avg_rating: float = 0.0
    review_count: int = 0
    featured_until: Optional[datetime] = None
    is_featured: bool = False
    total_seats: int = 0
    created_at: datetime


class BookingIn(BaseModel):
    cabin_id: str
    date: str  # YYYY-MM-DD
    time_slot: str  # e.g. "10:00 AM - 12:00 PM"
    seats: List[str] = Field(min_length=1, max_length=20)


class BookingOut(BaseModel):
    id: str
    cabin_id: str
    cabin_name: str
    cabin_city: str
    cabin_image: str
    cabin_type: CabinType
    user_id: str
    user_name: str
    owner_id: str
    date: str
    time_slot: str
    seats: List[str]
    price: float
    status: str
    can_review: bool
    has_review: bool
    created_at: datetime


class AvailabilityOut(BaseModel):
    cabin_id: str
    date: str
    time_slot: str
    booked_seats: List[str]


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=600)


class ReviewOut(BaseModel):
    id: str
    booking_id: str
    cabin_id: str
    user_id: str
    user_name: str
    rating: int
    text: str
    created_at: datetime


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=800)


class MessageOut(BaseModel):
    id: str
    booking_id: str
    sender_id: str
    sender_name: str
    sender_role: Role
    text: str
    created_at: datetime


class FeatureMockPayIn(BaseModel):
    upi_id: Optional[str] = None
    days: int = Field(default=7, ge=1, le=30)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(sub: str, role: str) -> str:
    payload = {
        "sub": sub,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise cred_exc
    except JWTError:
        raise cred_exc
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise cred_exc
    return user


def user_to_out(u: dict) -> UserOut:
    return UserOut(id=u["id"], name=u["name"], email=u["email"], role=u["role"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cabin_is_featured(c: dict) -> bool:
    fu = c.get("featured_until")
    if not fu:
        return False
    if isinstance(fu, str):
        try:
            fu = datetime.fromisoformat(fu.replace("Z", "+00:00"))
        except Exception:
            return False
    if fu.tzinfo is None:
        fu = fu.replace(tzinfo=timezone.utc)
    return fu > _now()


async def _cabin_stats(cabin_id: str) -> tuple[float, int]:
    pipeline = [
        {"$match": {"cabin_id": cabin_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
    ]
    docs = await db.reviews.aggregate(pipeline).to_list(1)
    if not docs:
        return (0.0, 0)
    return (round(float(docs[0]["avg"] or 0), 2), int(docs[0]["count"]))


def _default_sections_for(cabin_type: str, base_price: float) -> List[dict]:
    secs: List[dict] = []
    if cabin_type in ("AC", "Both"):
        secs.append({"name": "AC", "rows": DEFAULT_AC_ROWS, "cols": DEFAULT_AC_COLS, "price_per_hour": float(base_price)})
    if cabin_type in ("Non-AC", "Both"):
        secs.append({
            "name": "Non-AC",
            "rows": DEFAULT_NON_AC_ROWS,
            "cols": DEFAULT_NON_AC_COLS,
            "price_per_hour": round(float(base_price) * NON_AC_PRICE_RATIO, 2),
        })
    if not secs:
        # ultimate fallback
        secs.append({"name": "AC", "rows": DEFAULT_AC_ROWS, "cols": DEFAULT_AC_COLS, "price_per_hour": float(base_price)})
    return secs


def _cabin_total_seats(sections: List[dict]) -> int:
    return sum(int(s["rows"]) * int(s["cols"]) for s in (sections or []))


def _cabin_min_price(sections: List[dict], fallback: float = 0.0) -> float:
    if not sections:
        return float(fallback)
    return float(min(s["price_per_hour"] for s in sections))


def _cabin_seat_ids(sections: List[dict]) -> set[str]:
    """Return the set of all valid seat ids for a cabin, e.g. {'AC-A1', ...}."""
    ids: set[str] = set()
    for s in sections or []:
        for r in range(int(s["rows"])):
            row_letter = chr(ord("A") + r)
            for c in range(1, int(s["cols"]) + 1):
                ids.add(f"{s['name']}-{row_letter}{c}")
    return ids


def _seat_section_name(seat_id: str) -> Optional[str]:
    # "AC-A1" -> "AC" ; "Non-AC-B3" -> "Non-AC"
    if seat_id.startswith("Non-AC-"):
        return "Non-AC"
    if seat_id.startswith("AC-"):
        return "AC"
    return None


def _price_for_seats(sections: List[dict], seats: List[str], hours: float = 2.0) -> float:
    price_map = {s["name"]: float(s["price_per_hour"]) for s in (sections or [])}
    total = 0.0
    for seat in seats:
        sn = _seat_section_name(seat)
        if sn and sn in price_map:
            total += price_map[sn] * hours
    return round(total, 2)


async def _booked_seats(cabin_id: str, date: str, time_slot: str) -> List[str]:
    docs = await db.bookings.find(
        {"cabin_id": cabin_id, "date": date, "time_slot": time_slot, "status": "confirmed"},
        {"_id": 0, "seats": 1},
    ).to_list(1000)
    booked: list[str] = []
    for d in docs:
        booked.extend(d.get("seats", []) or [])
    return booked


async def enrich_cabin(c: dict) -> CabinOut:
    avg, count = await _cabin_stats(c["id"])
    sections = c.get("sections") or _default_sections_for(c.get("type", "AC"), c.get("price_per_hour", 0.0))
    total_seats = _cabin_total_seats(sections)
    min_price = _cabin_min_price(sections, c.get("price_per_hour", 0.0))
    return CabinOut(
        id=c["id"],
        owner_id=c["owner_id"],
        name=c["name"],
        city=c["city"],
        address=c["address"],
        price_per_hour=min_price,
        amenities=c.get("amenities", []),
        description=c.get("description", ""),
        image_url=c.get("image_url", ""),
        type=c.get("type", "AC"),
        sections=[SectionSpec(**s) for s in sections],
        rating=c.get("rating", 4.7),
        avg_rating=avg,
        review_count=count,
        featured_until=c.get("featured_until"),
        is_featured=_cabin_is_featured(c),
        total_seats=total_seats,
        created_at=c.get("created_at", _now()),
    )


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/signup", response_model=TokenOut)
async def signup(body: SignupIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "email": body.email.lower(),
        "hashed_password": hash_password(body.password),
        "role": body.role,
        "created_at": _now(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], user["role"])
    return TokenOut(access_token=token, user=user_to_out(user))


@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(user["id"], user["role"])
    return TokenOut(access_token=token, user=user_to_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(current=Depends(get_current_user)):
    return user_to_out(current)


@api.patch("/auth/role", response_model=TokenOut)
async def switch_role(body: RoleUpdateIn, current=Depends(get_current_user)):
    await db.users.update_one({"id": current["id"]}, {"$set": {"role": body.role}})
    current["role"] = body.role
    token = create_access_token(current["id"], body.role)
    return TokenOut(access_token=token, user=user_to_out(current))


# ---------------------------------------------------------------------------
# Cabin routes
# ---------------------------------------------------------------------------
@api.get("/cabins", response_model=List[CabinOut])
async def list_cabins(
    q: Optional[str] = None,
    city: Optional[str] = None,
    type: Optional[str] = None,
):
    query: dict = {}
    if city and city.lower() != "all":
        query["city"] = {"$regex": f"^{city}$", "$options": "i"}
    if type and type.lower() != "all":
        # "AC" filter → cabins that have AC section (type = AC or Both).
        # Same for Non-AC.
        if type.lower() == "ac":
            query["type"] = {"$in": ["AC", "Both"]}
        elif type.lower() == "non-ac":
            query["type"] = {"$in": ["Non-AC", "Both"]}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.cabins.find(query, {"_id": 0}).to_list(500)
    now = _now()

    def sort_key(c: dict):
        featured = _cabin_is_featured(c)
        created = c.get("created_at") or now
        return (0 if featured else 1, -(created.timestamp() if hasattr(created, "timestamp") else 0))

    docs.sort(key=sort_key)
    return [await enrich_cabin(d) for d in docs]


@api.get("/cabins/cities", response_model=List[str])
async def list_cities():
    cities = await db.cabins.distinct("city")
    return sorted(cities)


@api.get("/cabins/my", response_model=List[CabinOut])
async def my_cabins(current=Depends(get_current_user)):
    docs = await db.cabins.find({"owner_id": current["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await enrich_cabin(d) for d in docs]


@api.get("/cabins/{cabin_id}", response_model=CabinOut)
async def get_cabin(cabin_id: str):
    doc = await db.cabins.find_one({"id": cabin_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Cabin not found")
    return await enrich_cabin(doc)


@api.get("/cabins/{cabin_id}/availability", response_model=AvailabilityOut)
async def cabin_availability(cabin_id: str, date: str, time_slot: str):
    doc = await db.cabins.find_one({"id": cabin_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Cabin not found")
    booked = await _booked_seats(cabin_id, date, time_slot)
    return AvailabilityOut(
        cabin_id=cabin_id,
        date=date,
        time_slot=time_slot,
        booked_seats=sorted(set(booked)),
    )


@api.post("/cabins", response_model=CabinOut)
async def create_cabin(body: CabinIn, current=Depends(get_current_user)):
    if current["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can add cabins")
    sections = [s.model_dump() for s in (body.sections or [])]
    cabin = {
        "id": str(uuid.uuid4()),
        "owner_id": current["id"],
        "rating": 4.7,
        "featured_until": None,
        "created_at": _now(),
        "name": body.name,
        "city": body.city,
        "address": body.address,
        "price_per_hour": body.price_per_hour,
        "amenities": body.amenities,
        "description": body.description,
        "image_url": body.image_url,
        "type": body.type,
        "sections": sections,
    }
    await db.cabins.insert_one(cabin)
    cabin.pop("_id", None)
    return await enrich_cabin(cabin)


@api.post("/cabins/{cabin_id}/feature/mock-pay", response_model=CabinOut)
async def feature_mock_pay(cabin_id: str, body: FeatureMockPayIn, current=Depends(get_current_user)):
    """Mock UPI payment: mark cabin as featured for N days. Owner-only."""
    cabin = await db.cabins.find_one({"id": cabin_id}, {"_id": 0})
    if not cabin:
        raise HTTPException(status_code=404, detail="Cabin not found")
    if cabin["owner_id"] != current["id"]:
        raise HTTPException(status_code=403, detail="Only the cabin owner can boost it")
    until = _now() + timedelta(days=body.days)
    await db.cabins.update_one({"id": cabin_id}, {"$set": {"featured_until": until}})
    cabin["featured_until"] = until
    await db.payments.insert_one({
        "id": str(uuid.uuid4()),
        "cabin_id": cabin_id,
        "owner_id": current["id"],
        "amount": 99,
        "currency": "INR",
        "method": "upi_mock",
        "upi_id": (body.upi_id or "cabinly@upi"),
        "days": body.days,
        "created_at": _now(),
    })
    return await enrich_cabin(cabin)


# ---------------------------------------------------------------------------
# Booking helpers & routes
# ---------------------------------------------------------------------------
async def build_booking_out(b: dict) -> BookingOut:
    cabin = await db.cabins.find_one({"id": b["cabin_id"]}, {"_id": 0}) or {}
    user = await db.users.find_one({"id": b["user_id"]}, {"_id": 0}) or {}
    booking_date = b["date"]
    is_past = False
    try:
        d = datetime.strptime(booking_date, "%Y-%m-%d").date()
        is_past = d < _now().date()
    except Exception:
        is_past = False
    existing_review = await db.reviews.find_one({"booking_id": b["id"]}, {"_id": 0})
    return BookingOut(
        id=b["id"],
        cabin_id=b["cabin_id"],
        cabin_name=cabin.get("name", "Unknown cabin"),
        cabin_city=cabin.get("city", ""),
        cabin_image=cabin.get("image_url", ""),
        cabin_type=cabin.get("type", "AC"),
        user_id=b["user_id"],
        user_name=user.get("name", ""),
        owner_id=cabin.get("owner_id", ""),
        date=b["date"],
        time_slot=b["time_slot"],
        seats=b.get("seats", []) or [],
        price=b.get("price", 0.0),
        status=b.get("status", "confirmed"),
        can_review=(is_past and b.get("status") == "confirmed" and existing_review is None),
        has_review=existing_review is not None,
        created_at=b["created_at"],
    )


@api.post("/bookings", response_model=BookingOut)
async def create_booking(body: BookingIn, current=Depends(get_current_user)):
    cabin = await db.cabins.find_one({"id": body.cabin_id}, {"_id": 0})
    if not cabin:
        raise HTTPException(status_code=404, detail="Cabin not found")
    sections = cabin.get("sections") or _default_sections_for(cabin.get("type", "AC"), cabin.get("price_per_hour", 0.0))
    valid_seats = _cabin_seat_ids(sections)

    seats_dedup = sorted(set(body.seats))
    invalid = [s for s in seats_dedup if s not in valid_seats]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid seats for this cabin: {invalid}")

    already_booked = set(await _booked_seats(body.cabin_id, body.date, body.time_slot))
    conflicts = [s for s in seats_dedup if s in already_booked]
    if conflicts:
        raise HTTPException(status_code=409, detail=f"These seats are already booked: {conflicts}")

    price = _price_for_seats(sections, seats_dedup, hours=2.0)
    booking = {
        "id": str(uuid.uuid4()),
        "cabin_id": body.cabin_id,
        "user_id": current["id"],
        "date": body.date,
        "time_slot": body.time_slot,
        "seats": seats_dedup,
        "price": price,
        "status": "confirmed",
        "created_at": _now(),
    }
    await db.bookings.insert_one(booking)
    # Owner welcome message on the chat thread
    owner_id = cabin.get("owner_id")
    if owner_id:
        seat_list = ", ".join(seats_dedup)
        await db.messages.insert_one({
            "id": str(uuid.uuid4()),
            "booking_id": booking["id"],
            "sender_id": owner_id,
            "sender_role": "owner",
            "text": f"Hi! Your booking at {cabin.get('name')} on {booking['date']} ({booking['time_slot']}) for seat(s) {seat_list} is confirmed. Let me know if you need anything!",
            "created_at": _now(),
        })
    return await build_booking_out(booking)


@api.get("/bookings/my", response_model=List[BookingOut])
async def my_bookings(current=Depends(get_current_user)):
    docs = await db.bookings.find({"user_id": current["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await build_booking_out(d) for d in docs]


@api.get("/bookings/owner", response_model=List[BookingOut])
async def owner_bookings(current=Depends(get_current_user)):
    my_cabin_ids = await db.cabins.distinct("id", {"owner_id": current["id"]})
    docs = await db.bookings.find({"cabin_id": {"$in": my_cabin_ids}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await build_booking_out(d) for d in docs]


@api.get("/bookings/{booking_id}", response_model=BookingOut)
async def get_booking(booking_id: str, current=Depends(get_current_user)):
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Booking not found")
    cabin = await db.cabins.find_one({"id": doc["cabin_id"]}, {"_id": 0}) or {}
    if doc["user_id"] != current["id"] and cabin.get("owner_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    return await build_booking_out(doc)


@api.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str, current=Depends(get_current_user)):
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc or doc["user_id"] != current["id"]:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Review routes
# ---------------------------------------------------------------------------
@api.post("/bookings/{booking_id}/review", response_model=ReviewOut)
async def create_review(booking_id: str, body: ReviewIn, current=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or b["user_id"] != current["id"]:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("status") != "confirmed":
        raise HTTPException(status_code=400, detail="Only confirmed bookings can be reviewed")
    try:
        booking_date = datetime.strptime(b["date"], "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid booking date")
    if booking_date >= _now().date():
        raise HTTPException(status_code=400, detail="You can review only after the booking date has passed")
    existing = await db.reviews.find_one({"booking_id": booking_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Review already submitted for this booking")
    review = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "cabin_id": b["cabin_id"],
        "user_id": current["id"],
        "user_name": current["name"],
        "rating": body.rating,
        "text": body.text.strip(),
        "created_at": _now(),
    }
    await db.reviews.insert_one(review)
    review.pop("_id", None)
    return ReviewOut(**review)


@api.get("/cabins/{cabin_id}/reviews", response_model=List[ReviewOut])
async def list_reviews(cabin_id: str):
    docs = await db.reviews.find({"cabin_id": cabin_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [ReviewOut(**d) for d in docs]


# ---------------------------------------------------------------------------
# Chat routes (per-booking threads)
# ---------------------------------------------------------------------------
async def _ensure_thread_participant(booking_id: str, current: dict) -> tuple[dict, dict]:
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    cabin = await db.cabins.find_one({"id": b["cabin_id"]}, {"_id": 0}) or {}
    if b["user_id"] != current["id"] and cabin.get("owner_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    return b, cabin


@api.get("/bookings/{booking_id}/messages", response_model=List[MessageOut])
async def list_messages(booking_id: str, current=Depends(get_current_user)):
    await _ensure_thread_participant(booking_id, current)
    docs = await db.messages.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    out: list[MessageOut] = []
    for d in docs:
        sender = await db.users.find_one({"id": d["sender_id"]}, {"_id": 0}) or {}
        out.append(MessageOut(
            id=d["id"],
            booking_id=d["booking_id"],
            sender_id=d["sender_id"],
            sender_name=sender.get("name", "Unknown"),
            sender_role=d.get("sender_role", "student"),
            text=d["text"],
            created_at=d["created_at"],
        ))
    return out


@api.post("/bookings/{booking_id}/messages", response_model=MessageOut)
async def send_message(booking_id: str, body: MessageIn, current=Depends(get_current_user)):
    _b, cabin = await _ensure_thread_participant(booking_id, current)
    sender_role: Role = "owner" if cabin.get("owner_id") == current["id"] else "student"
    msg = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "sender_id": current["id"],
        "sender_role": sender_role,
        "text": body.text.strip(),
        "created_at": _now(),
    }
    await db.messages.insert_one(msg)
    return MessageOut(
        id=msg["id"],
        booking_id=booking_id,
        sender_id=current["id"],
        sender_name=current["name"],
        sender_role=sender_role,
        text=msg["text"],
        created_at=msg["created_at"],
    )


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
SEED_CABINS = [
    {
        "name": "Silent Study Loft",
        "city": "Bengaluru",
        "address": "MG Road, Bengaluru",
        "price_per_hour": 120.0,
        "type": "Both",
        "amenities": ["Wi-Fi", "AC", "Coffee", "Power Outlets"],
        "description": "A quiet loft with individual cabins, warm lighting and unlimited coffee. Perfect for deep focus.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
    {
        "name": "The Reading Nook",
        "city": "Bengaluru",
        "address": "Indiranagar 100ft Rd, Bengaluru",
        "price_per_hour": 90.0,
        "type": "Non-AC",
        "amenities": ["Wi-Fi", "Books", "Silent Zone"],
        "description": "Cozy reading nooks inside a library-cafe. Bring your books, we bring the calm.",
        "image_url": "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
    },
    {
        "name": "Focus Cabin – Koramangala",
        "city": "Bengaluru",
        "address": "80ft Road, Koramangala",
        "price_per_hour": 150.0,
        "type": "AC",
        "amenities": ["Wi-Fi", "AC", "Whiteboard", "Printer"],
        "description": "Private cabins for solo focus sessions with whiteboards and printers on demand.",
        "image_url": "https://images.unsplash.com/photo-1653463174308-518cff322388",
    },
    {
        "name": "Aurora Study Hall",
        "city": "Mumbai",
        "address": "Bandra West, Mumbai",
        "price_per_hour": 180.0,
        "type": "Both",
        "amenities": ["Wi-Fi", "AC", "Coffee", "24x7"],
        "description": "Round the clock quiet study hall with lockers, coffee and city view seating.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
    {
        "name": "The Ink & Paper Room",
        "city": "Mumbai",
        "address": "Powai, Mumbai",
        "price_per_hour": 130.0,
        "type": "Non-AC",
        "amenities": ["Wi-Fi", "Silent Zone", "Snacks"],
        "description": "Warm wood interiors, silent zone rules and unlimited chai. Made for long study sessions.",
        "image_url": "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
    },
    {
        "name": "Delhi Study Cabin",
        "city": "Delhi",
        "address": "Connaught Place, New Delhi",
        "price_per_hour": 140.0,
        "type": "Both",
        "amenities": ["Wi-Fi", "AC", "Locker", "Coffee"],
        "description": "Central location with fast Wi-Fi and lockers for your bags and books.",
        "image_url": "https://images.unsplash.com/photo-1653463174308-518cff322388",
    },
    {
        "name": "Quiet Corner Hauz Khas",
        "city": "Delhi",
        "address": "Hauz Khas Village, New Delhi",
        "price_per_hour": 100.0,
        "type": "Non-AC",
        "amenities": ["Wi-Fi", "Silent Zone", "Books"],
        "description": "A hidden corner in Hauz Khas, walls of books and no phone calls allowed.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
    {
        "name": "Hyderabad Focus Hub",
        "city": "Hyderabad",
        "address": "Gachibowli, Hyderabad",
        "price_per_hour": 110.0,
        "type": "AC",
        "amenities": ["Wi-Fi", "AC", "Coffee", "Meeting Room"],
        "description": "Modern coworking-style cabins with optional meeting rooms.",
        "image_url": "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
    },
    {
        "name": "Pune Book Lounge",
        "city": "Pune",
        "address": "Koregaon Park, Pune",
        "price_per_hour": 95.0,
        "type": "Non-AC",
        "amenities": ["Wi-Fi", "Books", "Snacks"],
        "description": "Charming book lounge with reading chairs and endless snacks.",
        "image_url": "https://images.unsplash.com/photo-1653463174308-518cff322388",
    },
    {
        "name": "Chennai Study Bay",
        "city": "Chennai",
        "address": "T. Nagar, Chennai",
        "price_per_hour": 105.0,
        "type": "Both",
        "amenities": ["Wi-Fi", "AC", "Silent Zone"],
        "description": "Bright, airy study bays with individual desks and adjustable chairs.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
]


@app.on_event("startup")
async def startup_seed():
    if await db.cabins.count_documents({}) == 0:
        demo_owner = await db.users.find_one({"email": "demo.owner@cabinly.app"})
        if not demo_owner:
            demo_owner = {
                "id": str(uuid.uuid4()),
                "name": "Cabinly Demo Owner",
                "email": "demo.owner@cabinly.app",
                "hashed_password": hash_password("Owner@123"),
                "role": "owner",
                "created_at": _now(),
            }
            await db.users.insert_one(demo_owner)
        for c in SEED_CABINS:
            doc = {
                "id": str(uuid.uuid4()),
                "owner_id": demo_owner["id"],
                "rating": 4.7,
                "featured_until": None,
                "created_at": _now(),
                "sections": _default_sections_for(c["type"], c["price_per_hour"]),
                **c,
            }
            await db.cabins.insert_one(doc)
        logger.info("Seeded %d cabins.", len(SEED_CABINS))
    else:
        # Backfill legacy cabin docs: correct type by name for seeds, then
        # ensure every cabin has a sensible sections layout.
        seed_type_by_name = {c["name"]: c["type"] for c in SEED_CABINS}
        for name, correct_type in seed_type_by_name.items():
            await db.cabins.update_many({"name": name}, {"$set": {"type": correct_type}})
        async for doc in db.cabins.find({}, {"_id": 0}):
            if not doc.get("sections"):
                sections = _default_sections_for(doc.get("type", "AC"), doc.get("price_per_hour", 0.0))
                await db.cabins.update_one({"id": doc["id"]}, {"$set": {"sections": sections}})
        # Backfill missing seats field on bookings so old bookings don't crash schema
        await db.bookings.update_many({"seats": {"$exists": False}}, {"$set": {"seats": []}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
