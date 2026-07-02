# Cabinly — Reading Room & Study Cabin Booking App

Cross-platform Expo (React Native) mobile app for booking study cabins with **BookMyShow-style seat selection**.

## Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router (file-based navigation)
- **Backend**: FastAPI + Motor (async MongoDB)
- **Auth**: JWT (python-jose) + bcrypt/passlib. Tokens stored on-device via `expo-secure-store` (wrapped by `@/src/utils/storage`)

## Roles
- **Student**: browse, search, filter cabins, book specific seats, view/cancel bookings, chat with owner, leave a review after visit.
- **Owner**: add cabins (AC / Non-AC / Both), boost via mock UPI, see bookings on their cabins, chat with students.
- Role switchable from Profile — issues a fresh JWT with the updated role.

## Screens
1. `/login`, `/signup` — email + password.
2. `/(tabs)/index` — **Home**:
   - Student: search bar + city chip row + AC/Non-AC/All type chips + cabin cards (Featured first). Price shows "from ₹X / hour" (min across sections).
   - Owner: My Cabins + Add FAB + per-card Boost button.
3. `/(tabs)/bookings` — digital-pass cards showing booked seats, with Chat, Cancel, and Leave-a-review (past-date only).
4. `/(tabs)/profile` — avatar, role switcher, logout.
5. `/cabin/[id]` — details with hero + gradient scrim, per-section price chips ("AC · ₹120/hr", "Non-AC · ₹84/hr"), total seats meta, amenities, reviews, sticky Book Now.
6. **`/booking/new`** — BookMyShow-style seat picker: legend (Available / Selected / Booked), sections grid with row letters + seat squares, sticky bottom bar with selected count + total price + Confirm.
7. `/cabin/add` — owner form with AC / Non-AC / Both segmented control.
8. `/chat/[bookingId]` — per-booking chat with polling.

## Backend routes (`/api/*`)
- Auth: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/role`
- Cabins: `GET /cabins?q=&city=&type=`, `GET /cabins/cities`, `GET /cabins/my`, `GET /cabins/{id}`, `POST /cabins`, `POST /cabins/{id}/feature/mock-pay`, **`GET /cabins/{id}/availability?date=&time_slot=`**
- Bookings: `POST /bookings` (**requires `seats: List[str]`**), `GET /bookings/my`, `GET /bookings/owner`, `GET /bookings/{id}`, `DELETE /bookings/{id}`
- Reviews: `POST /bookings/{id}/review`, `GET /cabins/{id}/reviews`
- Chat: `GET /bookings/{id}/messages`, `POST /bookings/{id}/messages`

## Seat model
- Every cabin has `sections: [{ name: 'AC'|'Non-AC', rows, cols, price_per_hour }]`.
- Seat id format: `"AC-A1"`, `"Non-AC-B3"`. Row letter A..L, column 1..12.
- `POST /bookings` validates: (1) seat ids exist in cabin's layout, (2) not already booked by any confirmed booking for same (cabin, date, time_slot). Cancelled bookings free their seats.
- Price = **2 hours × Σ(seat's section price_per_hour)**.
- Non-AC section priced at 70 % of the base price by default.

## Seed
10 cabins across 6 Indian cities under a demo owner (`demo.owner@cabinly.app` / `Owner@123`). Mix of AC / Non-AC / Both types.

## Design
Teal iOS-native palette (`#0D9488`). BookMyShow-style seat squares with row labels, class caption per section, and an "Entrance" indicator at the bottom of the seat map.
