# Cabinly — Reading Room & Study Cabin Booking App

Cross-platform Expo (React Native) mobile app for booking study cabins.

## Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router (file-based navigation)
- **Backend**: FastAPI + Motor (async MongoDB)
- **Auth**: JWT (python-jose) + bcrypt/passlib. Tokens stored on-device via `expo-secure-store` (wrapped by `@/src/utils/storage`)

## Roles
- **Student**: browse, search, filter cabins, book slots, view/cancel bookings.
- **Owner**: add new cabins, view own cabins, see bookings placed on their cabins.
- Users can freely switch role from the Profile tab — a fresh JWT with the updated role is issued.

## Screens
1. `/login` – email + password login.
2. `/signup` – name, email, password + role selector.
3. `/(tabs)/index` – **Home**:
   - Student: search bar + horizontal city chip row + vertical cabin cards.
   - Owner: "My Cabins" list + Add Cabin FAB.
4. `/(tabs)/bookings` – **Bookings**:
   - Student: digital-pass style cards with cancel action.
   - Owner: read-only list of bookings on their cabins.
5. `/(tabs)/profile` – avatar, role switcher segmented control, logout.
6. `/cabin/[id]` – cabin details with hero image + gradient scrim, amenities, sticky Book Now footer, modal booking sheet (date + time slot).
7. `/cabin/add` – owner-only form to publish a cabin.

## Backend routes (all prefixed with `/api`)
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/role`
- `GET /cabins?q=&city=`, `GET /cabins/cities`, `GET /cabins/my`, `GET /cabins/{id}`, `POST /cabins`
- `POST /bookings`, `GET /bookings/my`, `GET /bookings/owner`, `DELETE /bookings/{id}`

## Seed
On first startup the backend seeds 10 cabins across 6 Indian cities under a demo owner (`demo.owner@cabinly.app` / `Owner@123`).

## Design
Teal iOS-native clean palette (`#0D9488` brand). Generous padding, rounded 12–20 px corners, high-quality Unsplash cabin imagery, gradient scrim on hero, sticky primary CTAs.
