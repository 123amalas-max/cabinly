# Cabinly — Reading Room & Study Cabin Booking App

Cross-platform Expo (React Native) mobile app for booking study cabins.

## Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router (file-based navigation)
- **Backend**: FastAPI + Motor (async MongoDB)
- **Auth**: JWT (python-jose) + bcrypt/passlib. Tokens stored on-device via `expo-secure-store` (wrapped by `@/src/utils/storage`)

## Roles
- **Student**: browse, search, filter cabins (city + type), book slots, view/cancel bookings, chat with owner, leave a review after visit.
- **Owner**: add new cabins (with AC/Non-AC), view own cabins + boost them via mock UPI, see bookings placed on their cabins, chat with students.
- Users can freely switch role from the Profile tab — a fresh JWT with the updated role is issued.

## Screens
1. `/login` and `/signup` — email + password auth with role selector on signup.
2. `/(tabs)/index` — **Home**:
   - Student: search bar + horizontal city chip row + AC/Non-AC type chip row + vertical cabin cards (Featured cabins sort first, with badge).
   - Owner: "My Cabins" list + Add Cabin FAB + per-card "Boost" button.
3. `/(tabs)/bookings` — **Bookings**:
   - Student: digital-pass style cards with Chat, Cancel, and (only after past-date visits) "Leave a review" button.
   - Owner: read-only list of bookings on their cabins with Chat button.
4. `/(tabs)/profile` — avatar, role switcher segmented control, logout.
5. `/cabin/[id]` — details with hero image + gradient scrim, type/featured inline chips, amenities, description, reviews section, sticky Book Now footer, modal booking sheet (date + time slot).
6. `/cabin/add` — owner-only form to publish a cabin, including AC/Non-AC segmented control.
7. `/chat/[bookingId]` — per-booking chat between student and owner (polls every 3s).

## Backend routes (all prefixed with `/api`)
Auth: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/role`
Cabins: `GET /cabins?q=&city=&type=`, `GET /cabins/cities`, `GET /cabins/my`, `GET /cabins/{id}`, `POST /cabins`, `POST /cabins/{id}/feature/mock-pay`
Bookings: `POST /bookings`, `GET /bookings/my`, `GET /bookings/owner`, `GET /bookings/{id}`, `DELETE /bookings/{id}`
Reviews: `POST /bookings/{id}/review` (only if booking date has passed and no existing review), `GET /cabins/{id}/reviews`
Chat: `GET /bookings/{id}/messages`, `POST /bookings/{id}/messages` (participants only, sender_role inferred)

## Business logic highlights
- **Cabin type**: `"AC" | "Non-AC"`. Home tab has a type chip filter; Add Cabin form has a segmented control.
- **Featured (mock UPI)**: `POST /cabins/{id}/feature/mock-pay` sets `featured_until = now + N days` (default 7). Cabin list sorts featured first. Frontend Boost modal shows a placeholder QR + UPI ID `cabinly@upi` and calls this endpoint on "I've paid ₹99". **MOCKED** — no real payment gateway.
- **Reviews**: `POST /bookings/{id}/review` returns 400 unless the booking date is strictly in the past; duplicate reviews for the same booking return 400. Cabin responses include computed `avg_rating` + `review_count`.
- **Chat**: on booking creation, backend auto-inserts a welcome message from the owner into the booking's thread.

## Seed
On first startup, backend seeds 10 cabins (mix of AC & Non-AC) across 6 Indian cities under a demo owner (`demo.owner@cabinly.app` / `Owner@123`).

## Design
Teal iOS-native clean palette (`#0D9488` brand). Generous padding, rounded 12–20 px corners, high-quality Unsplash cabin imagery, gradient scrim on hero, sticky primary CTAs, kebab-case `testID`s on all interactive elements.
