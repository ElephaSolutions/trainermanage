# TrainerTrack

A general-purpose **trainer & student tracking platform** built with Expo (React Native) + FastAPI + MongoDB. Works across gyms, coaching centers (NEET/JEE), schools, colleges, badminton courts, and other sports facilities.

> Roles: **Admin · Trainer · Student** — each with a tailored dashboard.

---

## Features

| Area | What's included |
|---|---|
| **Auth** | Emergent-managed Google OAuth + dev-login fallback. Session tokens stored in `expo-secure-store`. Role selection on first login. |
| **Attendance** | Trainers mark Present / Absent / Late per student. Students self-check-in via a 4-digit session PIN. History + attendance %. |
| **Payments** | 3 seed plans (Monthly / Per-session / Quarterly Term) + custom plans. **Stripe Checkout** for online pay. Manual record for cash/UPI/card/bank. Auto-receipt in history. |
| **Feedback** | 1-5 star rating + categorized scores (quality, communication, punctuality) + comment. |
| **Schedule** | Session create/list, upcoming vs past badges, PIN visible to trainer/admin. |
| **Dashboards** | Role-aware KPI tiles (revenue, attendance %, avg rating, students, sessions) + upcoming sessions. |
| **Notifications** | In-app inbox auto-populated on attendance / payment / feedback events. |
| **Profile & i18n** | English ↔ Tamil toggle, Dark / Light / Auto theme, profile editor, logout. |

---

## Tech Stack

- **Frontend:** Expo SDK 54, React Native 0.81, Expo Router (file-based routing), StyleSheet, `@expo/vector-icons`, `expo-secure-store`, `expo-web-browser`.
- **Backend:** FastAPI, Motor (async MongoDB driver), `emergentintegrations` (Stripe), `httpx`.
- **DB:** MongoDB.
- **Design:** Swiss / Brutalist style — hard 2px borders, no rounded corners, dense typographic KPIs.

---

## Repo Layout

```
.
├── backend/
│   ├── server.py            # All API routes (auth, sessions, attendance, payments, feedback, dashboard)
│   ├── requirements.txt
│   └── .env                 # MONGO_URL, DB_NAME, STRIPE_API_KEY (NOT committed)
├── frontend/
│   ├── app/                 # Expo Router screens
│   │   ├── _layout.tsx
│   │   ├── index.tsx        # Auth gate
│   │   ├── login.tsx
│   │   ├── role-select.tsx
│   │   ├── notifications.tsx
│   │   └── (tabs)/
│   │       ├── _layout.tsx
│   │       ├── dashboard.tsx
│   │       ├── attendance.tsx
│   │       ├── payments.tsx
│   │       ├── schedule.tsx
│   │       └── profile.tsx
│   ├── src/lib/
│   │   ├── app.tsx          # AuthProvider, ThemeProvider, I18nProvider, http helper
│   │   └── ui.tsx           # Button, Card, KpiTile, Badge, SectionHeader
│   ├── package.json
│   ├── app.json
│   └── .env                 # EXPO_PUBLIC_BACKEND_URL (NOT committed)
├── memory/
│   ├── PRD.md
│   └── test_credentials.md
└── README.md                # this file
```

---

## Prerequisites

- **Node.js** ≥ 18 and **Yarn** 1.22+
- **Python** ≥ 3.10
- **MongoDB** ≥ 6.0 (local install or MongoDB Atlas)
- (Optional) **Expo Go** app on your phone — App Store / Play Store

---

## Local Setup

### 1. Clone the repo
```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Start MongoDB

**Option A — local MongoDB (macOS):**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
# → mongodb://localhost:27017
```

**Option A — local MongoDB (Ubuntu / Debian):**
```bash
sudo apt-get install -y mongodb
sudo systemctl start mongodb
```

**Option B — MongoDB Atlas (cloud, free tier):**
- Create a free cluster at <https://www.mongodb.com/cloud/atlas>
- Allowlist your IP and grab the connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/`)

### 3. Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trainertrack
STRIPE_API_KEY=sk_test_YOUR_OWN_KEY
```

> ⚠️ **Stripe note**: the value `sk_test_emergent` only works inside the Emergent network (it routes through `integrations.emergentagent.com`). For local dev, grab a real test key at <https://dashboard.stripe.com/test/apikeys>. If you're using your own key, you may also want to swap `emergentintegrations.payments.stripe.checkout.StripeCheckout` for the official `stripe` Python SDK — see the comments in `server.py`.

Run the backend:
```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

Sanity check:
```bash
curl http://localhost:8001/api/
# → {"service":"TrainerTrack","status":"ok"}
```

### 4. Frontend (Expo)

In a new terminal:
```bash
cd frontend
yarn install
```

Find your LAN IP:
- **macOS / Linux:** `ifconfig | grep "inet "` → look for `192.168.x.x`
- **Windows:** `ipconfig` → IPv4 Address

Create `frontend/.env`:
```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.x.x:8001
```

> ⚠️ Do **not** use `localhost` if you're running Expo Go on a physical device — it can't reach your laptop. Use the LAN IP. For the iOS simulator on the same Mac, `localhost` works.

Start Expo:
```bash
yarn start
```

Then choose one:
- Press **`i`** → iOS Simulator
- Press **`a`** → Android Emulator
- Press **`w`** → Web browser
- Scan the QR with the **Expo Go** app on your phone

---

## Demo Login (no Google required)

The Login screen has a **Quick Demo Login** section. Use any of these to test:

| Role | Email | What you can do |
|---|---|---|
| Admin | `admin@trainertrack.dev` | Full dashboard — see all trainers/students, revenue, attendance, feedback. |
| Trainer | `trainer@trainertrack.dev` | Create sessions, mark attendance, record payments, view feedback. |
| Student | `student@trainertrack.dev` | Self-check-in via PIN, pay plans, give feedback, view history. |

Enter the email, optionally a name, hit **Continue** → pick the role → land on the dashboard.

For real Google login, tap **Sign in with Google**.

### Stripe test card
- Card: `4242 4242 4242 4242`
- Expiry: any future date (e.g. `12/30`)
- CVC: any 3 digits (e.g. `123`)

---

## Useful API Endpoints

All routes are prefixed with `/api`.

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Health check |
| POST | `/auth/dev-login` | `{email, name, role?}` → `{token, user}` |
| POST | `/auth/google/session` | Exchange Emergent session token |
| GET | `/auth/me` | Current user (Bearer token) |
| POST | `/auth/role` | Set role for first-time user |
| POST | `/sessions` | Create session (trainer/admin) |
| GET | `/sessions` | List sessions |
| POST | `/attendance/mark` | Trainer marks present/absent/late |
| POST | `/attendance/self` | Student self-check-in via PIN |
| GET | `/attendance/me` | Student attendance history + % |
| GET | `/payment-plans` | List plans |
| POST | `/payments/checkout` | Create Stripe Checkout session (student) |
| GET | `/payments/checkout/{txn_id}` | Refresh payment status |
| POST | `/payments/record` | Record manual payment (trainer/admin) |
| GET | `/payments/me` | Payment history |
| POST | `/feedback` | Student submits feedback |
| GET | `/feedback` | List feedback (role-scoped) |
| GET | `/dashboard` | Role-aware KPIs |
| GET | `/notifications` | In-app inbox |

All authenticated routes need `Authorization: Bearer <token>` header.

---

## Common Issues

| Issue | Fix |
|---|---|
| `"Cannot connect to backend"` from Expo Go | `EXPO_PUBLIC_BACKEND_URL` must be your **LAN IP**, not `localhost`. Backend must bind to `0.0.0.0`. |
| `MongoServerError: ECONNREFUSED` | MongoDB not running. `brew services list` or `sudo systemctl status mongodb`. |
| `Invalid API Key provided: sk_test_****gent` | Replace `sk_test_emergent` with your own Stripe test key (see Step 3). |
| `Port 8001 already in use` | Pick another port: `--port 8002` and update `EXPO_PUBLIC_BACKEND_URL`. |
| Expo Go shows blank screen | Phone and computer must be on the **same Wi-Fi**. Disable VPN. Open port 8001 in your firewall. |
| Tamil characters look like boxes | Update Expo Go to the latest version. |

---

## Tests

Backend pytest suite (21 tests covering auth, attendance, payments, feedback, dashboard):
```bash
cd backend
source venv/bin/activate
pip install pytest pytest-asyncio
pytest tests/ -q
```

---

## Roadmap

- [ ] **PDF receipts** + **CSV export** for attendance and payments
- [ ] Real **Stripe webhook** route (replace status polling)
- [ ] **QR code** self-check-in (currently PIN only)
- [ ] **Multi-center / multi-location** scoping for admins
- [ ] Real **calendar grid** on the Schedule tab
- [ ] Push notifications (Firebase Cloud Messaging)

---

## License

MIT — feel free to fork, customize, and ship.

---

## Credits

Built with [Emergent](https://emergent.sh) — full-stack mobile app builder.
