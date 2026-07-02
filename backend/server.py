"""
Cabinly Backend – Reading Room & Study Cabin Booking App.
FastAPI + MongoDB + JWT auth (email/password with bcrypt).
All routes are prefixed with /api.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr, Field
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

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Cabinly API")
api = APIRouter(prefix="/api")

Role = Literal["student", "owner"]

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


class CabinIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=80)
    address: str = Field(min_length=1, max_length=200)
    price_per_hour: float = Field(ge=0)
    amenities: List[str] = Field(default_factory=list)
    description: str = Field(default="", max_length=1000)
    image_url: str = Field(default="")


class CabinOut(CabinIn):
    id: str
    owner_id: str
    rating: float = 4.7
    created_at: datetime


class BookingIn(BaseModel):
    cabin_id: str
    date: str  # YYYY-MM-DD
    time_slot: str  # e.g. "10:00 AM - 12:00 PM"


class BookingOut(BaseModel):
    id: str
    cabin_id: str
    cabin_name: str
    cabin_city: str
    cabin_image: str
    user_id: str
    user_name: str
    date: str
    time_slot: str
    price: float
    status: str
    created_at: datetime


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


def cabin_to_out(c: dict) -> CabinOut:
    return CabinOut(**c)


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
        "created_at": datetime.now(timezone.utc),
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
async def list_cabins(q: Optional[str] = None, city: Optional[str] = None):
    query: dict = {}
    if city and city.lower() != "all":
        query["city"] = {"$regex": f"^{city}$", "$options": "i"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.cabins.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [cabin_to_out(d) for d in docs]


@api.get("/cabins/cities", response_model=List[str])
async def list_cities():
    cities = await db.cabins.distinct("city")
    return sorted(cities)


@api.get("/cabins/my", response_model=List[CabinOut])
async def my_cabins(current=Depends(get_current_user)):
    docs = await db.cabins.find({"owner_id": current["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [cabin_to_out(d) for d in docs]


@api.get("/cabins/{cabin_id}", response_model=CabinOut)
async def get_cabin(cabin_id: str):
    doc = await db.cabins.find_one({"id": cabin_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Cabin not found")
    return cabin_to_out(doc)


@api.post("/cabins", response_model=CabinOut)
async def create_cabin(body: CabinIn, current=Depends(get_current_user)):
    if current["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can add cabins")
    cabin = {
        "id": str(uuid.uuid4()),
        "owner_id": current["id"],
        "rating": 4.7,
        "created_at": datetime.now(timezone.utc),
        **body.model_dump(),
    }
    await db.cabins.insert_one(cabin)
    cabin.pop("_id", None)
    return cabin_to_out(cabin)


# ---------------------------------------------------------------------------
# Booking routes
# ---------------------------------------------------------------------------
async def build_booking_out(b: dict) -> BookingOut:
    cabin = await db.cabins.find_one({"id": b["cabin_id"]}, {"_id": 0})
    user = await db.users.find_one({"id": b["user_id"]}, {"_id": 0})
    return BookingOut(
        id=b["id"],
        cabin_id=b["cabin_id"],
        cabin_name=(cabin or {}).get("name", "Unknown cabin"),
        cabin_city=(cabin or {}).get("city", ""),
        cabin_image=(cabin or {}).get("image_url", ""),
        user_id=b["user_id"],
        user_name=(user or {}).get("name", ""),
        date=b["date"],
        time_slot=b["time_slot"],
        price=b.get("price", 0.0),
        status=b.get("status", "confirmed"),
        created_at=b["created_at"],
    )


@api.post("/bookings", response_model=BookingOut)
async def create_booking(body: BookingIn, current=Depends(get_current_user)):
    cabin = await db.cabins.find_one({"id": body.cabin_id}, {"_id": 0})
    if not cabin:
        raise HTTPException(status_code=404, detail="Cabin not found")
    booking = {
        "id": str(uuid.uuid4()),
        "cabin_id": body.cabin_id,
        "user_id": current["id"],
        "date": body.date,
        "time_slot": body.time_slot,
        "price": float(cabin.get("price_per_hour", 0)) * 2,  # 2-hour slot
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc),
    }
    await db.bookings.insert_one(booking)
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


@api.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str, current=Depends(get_current_user)):
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc or doc["user_id"] != current["id"]:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
SEED_CABINS = [
    {
        "name": "Silent Study Loft",
        "city": "Bengaluru",
        "address": "MG Road, Bengaluru",
        "price_per_hour": 120.0,
        "amenities": ["Wi-Fi", "AC", "Coffee", "Power Outlets"],
        "description": "A quiet loft with individual cabins, warm lighting and unlimited coffee. Perfect for deep focus.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
    {
        "name": "The Reading Nook",
        "city": "Bengaluru",
        "address": "Indiranagar 100ft Rd, Bengaluru",
        "price_per_hour": 90.0,
        "amenities": ["Wi-Fi", "Books", "Silent Zone"],
        "description": "Cozy reading nooks inside a library-cafe. Bring your books, we bring the calm.",
        "image_url": "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
    },
    {
        "name": "Focus Cabin – Koramangala",
        "city": "Bengaluru",
        "address": "80ft Road, Koramangala",
        "price_per_hour": 150.0,
        "amenities": ["Wi-Fi", "AC", "Whiteboard", "Printer"],
        "description": "Private cabins for solo focus sessions with whiteboards and printers on demand.",
        "image_url": "https://images.unsplash.com/photo-1653463174308-518cff322388",
    },
    {
        "name": "Aurora Study Hall",
        "city": "Mumbai",
        "address": "Bandra West, Mumbai",
        "price_per_hour": 180.0,
        "amenities": ["Wi-Fi", "AC", "Coffee", "24x7"],
        "description": "Round the clock quiet study hall with lockers, coffee and city view seating.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
    {
        "name": "The Ink & Paper Room",
        "city": "Mumbai",
        "address": "Powai, Mumbai",
        "price_per_hour": 130.0,
        "amenities": ["Wi-Fi", "Silent Zone", "Snacks"],
        "description": "Warm wood interiors, silent zone rules and unlimited chai. Made for long study sessions.",
        "image_url": "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
    },
    {
        "name": "Delhi Study Cabin",
        "city": "Delhi",
        "address": "Connaught Place, New Delhi",
        "price_per_hour": 140.0,
        "amenities": ["Wi-Fi", "AC", "Locker", "Coffee"],
        "description": "Central location with fast Wi-Fi and lockers for your bags and books.",
        "image_url": "https://images.unsplash.com/photo-1653463174308-518cff322388",
    },
    {
        "name": "Quiet Corner Hauz Khas",
        "city": "Delhi",
        "address": "Hauz Khas Village, New Delhi",
        "price_per_hour": 100.0,
        "amenities": ["Wi-Fi", "Silent Zone", "Books"],
        "description": "A hidden corner in Hauz Khas, walls of books and no phone calls allowed.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
    {
        "name": "Hyderabad Focus Hub",
        "city": "Hyderabad",
        "address": "Gachibowli, Hyderabad",
        "price_per_hour": 110.0,
        "amenities": ["Wi-Fi", "AC", "Coffee", "Meeting Room"],
        "description": "Modern coworking-style cabins with optional meeting rooms.",
        "image_url": "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
    },
    {
        "name": "Pune Book Lounge",
        "city": "Pune",
        "address": "Koregaon Park, Pune",
        "price_per_hour": 95.0,
        "amenities": ["Wi-Fi", "Books", "Snacks"],
        "description": "Charming book lounge with reading chairs and endless snacks.",
        "image_url": "https://images.unsplash.com/photo-1653463174308-518cff322388",
    },
    {
        "name": "Chennai Study Bay",
        "city": "Chennai",
        "address": "T. Nagar, Chennai",
        "price_per_hour": 105.0,
        "amenities": ["Wi-Fi", "AC", "Silent Zone"],
        "description": "Bright, airy study bays with individual desks and adjustable chairs.",
        "image_url": "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
    },
]


@app.on_event("startup")
async def startup_seed():
    # Seed cabins if empty
    if await db.cabins.count_documents({}) == 0:
        # Create a demo owner for the seeded cabins
        demo_owner = await db.users.find_one({"email": "demo.owner@cabinly.app"})
        if not demo_owner:
            demo_owner = {
                "id": str(uuid.uuid4()),
                "name": "Cabinly Demo Owner",
                "email": "demo.owner@cabinly.app",
                "hashed_password": hash_password("Owner@123"),
                "role": "owner",
                "created_at": datetime.now(timezone.utc),
            }
            await db.users.insert_one(demo_owner)
        for c in SEED_CABINS:
            doc = {
                "id": str(uuid.uuid4()),
                "owner_id": demo_owner["id"],
                "rating": 4.7,
                "created_at": datetime.now(timezone.utc),
                **c,
            }
            await db.cabins.insert_one(doc)
        logger.info("Seeded %d cabins.", len(SEED_CABINS))


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

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
