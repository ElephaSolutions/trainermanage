"""TrainerTrack backend — FastAPI + Motor + Stripe + Emergent Google Auth."""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal

import httpx
from dotenv import load_dotenv
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import FastAPI, APIRouter, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
stripe_api_key = os.environ.get("STRIPE_API_KEY", "")
stripe_client = StripeCheckout(api_key=stripe_api_key) if stripe_api_key else None

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI(title="TrainerTrack API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("trainertrack")


# ---------- helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def serialize(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


async def get_user_by_token(token: str) -> Optional[dict]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            return None
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    return user


async def auth_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user = await get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid or expired session")
    return user


async def require_role(user: dict, *roles: str):
    if user.get("role") not in roles:
        raise HTTPException(403, f"Requires role: {' or '.join(roles)}")


async def push_notification(user_id: str, title: str, body: str, kind: str = "info"):
    await db.notifications.insert_one(
        {
            "notif_id": new_id("ntf"),
            "user_id": user_id,
            "title": title,
            "body": body,
            "kind": kind,
            "read": False,
            "created_at": now_utc(),
        }
    )


# ---------- startup ----------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.sessions.create_index("trainer_id")
    await db.attendance.create_index([("session_id", 1), ("student_id", 1)], unique=True)
    await db.payments.create_index("student_id")
    await db.payment_plans.create_index("trainer_id")
    await db.feedback.create_index("trainer_id")
    await db.notifications.create_index("user_id")

    # Seed default global payment plans if empty
    if await db.payment_plans.count_documents({}) == 0:
        seed_plans = [
            {
                "plan_id": new_id("pln"),
                "name": "Monthly Membership",
                "description": "Unlimited sessions for 1 month",
                "amount": 2500.0,
                "currency": "INR",
                "interval": "monthly",
                "trainer_id": None,
                "created_at": now_utc(),
            },
            {
                "plan_id": new_id("pln"),
                "name": "Per-Session Pack",
                "description": "Single session pass",
                "amount": 300.0,
                "currency": "INR",
                "interval": "per_session",
                "trainer_id": None,
                "created_at": now_utc(),
            },
            {
                "plan_id": new_id("pln"),
                "name": "Quarterly Term",
                "description": "3-month term access",
                "amount": 6500.0,
                "currency": "INR",
                "interval": "term",
                "trainer_id": None,
                "created_at": now_utc(),
            },
        ]
        await db.payment_plans.insert_many(seed_plans)

    log.info("TrainerTrack startup complete.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------- Models ----------
Role = Literal["admin", "trainer", "student"]


class GoogleSessionIn(BaseModel):
    session_token: str


class RoleSetIn(BaseModel):
    role: Role
    full_name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None  # trainer
    goals: Optional[str] = None  # student


class SessionCreateIn(BaseModel):
    title: str
    starts_at: str  # ISO
    duration_min: int = 60
    location: Optional[str] = ""
    capacity: int = 30


class AttendanceMarkIn(BaseModel):
    session_id: str
    student_id: str
    status: Literal["present", "absent", "late"]


class SelfAttendanceIn(BaseModel):
    session_id: str
    pin: str


class PaymentPlanIn(BaseModel):
    name: str
    description: Optional[str] = ""
    amount: float
    currency: str = "INR"
    interval: Literal["monthly", "per_session", "term"]


class CheckoutIn(BaseModel):
    plan_id: str
    origin: str  # e.g. https://app.example.com


class RecordPaymentIn(BaseModel):
    student_id: str
    plan_id: str
    amount: float
    mode: Literal["cash", "upi", "card", "bank", "online"] = "cash"
    remarks: Optional[str] = ""


class FeedbackIn(BaseModel):
    trainer_id: str
    session_id: Optional[str] = None
    rating: int  # 1-5
    quality: int  # 1-5
    communication: int  # 1-5
    punctuality: int  # 1-5
    comment: Optional[str] = ""


# ---------- Auth ----------
@api.get("/")
async def root():
    return {"service": "TrainerTrack", "status": "ok"}


@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn):
    """Exchange Emergent session_token for an app session. Verifies with Emergent.
    On first call, creates a user record. Role can be set via /auth/role.
    """
    if not body.session_token:
        raise HTTPException(400, "session_token required")
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_token},
            )
            if r.status_code != 200:
                raise HTTPException(401, "Invalid Emergent session token")
            data = r.json()
    except httpx.RequestError as e:
        raise HTTPException(502, f"Auth provider unreachable: {e}")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "Email missing from provider")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name") or existing.get("name"), "picture": data.get("picture")}},
        )
    else:
        user_id = new_id("usr")
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": data.get("name") or email,
                "picture": data.get("picture"),
                "role": None,
                "phone": None,
                "specialization": None,
                "goals": None,
                "created_at": now_utc(),
            }
        )

    session_token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=7),
        }
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"token": session_token, "user": serialize(user)}


@api.post("/auth/dev-login")
async def dev_login(body: dict):
    """Dev-only login fallback for testing without real Google.
    Body: {email, name, role?}
    Creates/returns a session immediately. Safe because tied to a test endpoint.
    """
    email = (body.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "email required")
    name = body.get("name") or email.split("@")[0]
    role = body.get("role")  # optional

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        if role and not existing.get("role"):
            await db.users.update_one({"user_id": user_id}, {"$set": {"role": role}})
    else:
        user_id = new_id("usr")
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": None,
                "role": role,
                "phone": None,
                "specialization": None,
                "goals": None,
                "created_at": now_utc(),
            }
        )

    session_token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=7),
        }
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"token": session_token, "user": serialize(user)}


@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    return serialize(user)


@api.post("/auth/role")
async def set_role(body: RoleSetIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    update = {"role": body.role}
    if body.full_name:
        update["name"] = body.full_name
    if body.phone is not None:
        update["phone"] = body.phone
    if body.specialization is not None:
        update["specialization"] = body.specialization
    if body.goals is not None:
        update["goals"] = body.goals
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return serialize(user)


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Profiles ----------
@api.get("/users/trainers")
async def list_trainers(authorization: Optional[str] = Header(None)):
    await auth_user(authorization)
    docs = await db.users.find({"role": "trainer"}, {"_id": 0}).to_list(500)
    return [serialize(d) for d in docs]


@api.get("/users/students")
async def list_students(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "admin", "trainer")
    docs = await db.users.find({"role": "student"}, {"_id": 0}).to_list(500)
    return [serialize(d) for d in docs]


@api.put("/users/me")
async def update_profile(body: dict, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    allowed = {k: v for k, v in body.items() if k in {"name", "phone", "specialization", "goals", "language", "theme"}}
    if allowed:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": allowed})
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return serialize(user)


# ---------- Sessions ----------
@api.post("/sessions")
async def create_session(body: SessionCreateIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "trainer", "admin")
    pin = f"{secrets.randbelow(10000):04d}"
    doc = {
        "session_id": new_id("ses"),
        "trainer_id": user["user_id"],
        "trainer_name": user.get("name", ""),
        "title": body.title,
        "starts_at": datetime.fromisoformat(body.starts_at.replace("Z", "+00:00")),
        "duration_min": body.duration_min,
        "location": body.location or "",
        "capacity": body.capacity,
        "pin": pin,
        "created_at": now_utc(),
    }
    await db.sessions.insert_one(doc)
    return serialize(doc)


@api.get("/sessions")
async def list_sessions(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    q = {}
    if user["role"] == "trainer":
        q = {"trainer_id": user["user_id"]}
    docs = await db.sessions.find(q, {"_id": 0}).sort("starts_at", -1).to_list(500)
    out = []
    for d in docs:
        if user["role"] == "student":
            d = {k: v for k, v in d.items() if k != "pin"}
        out.append(serialize(d))
    return out


@api.get("/sessions/{session_id}")
async def get_session(session_id: str, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    d = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Session not found")
    if user["role"] == "student":
        d.pop("pin", None)
    return serialize(d)


# ---------- Attendance ----------
@api.post("/attendance/mark")
async def mark_attendance(body: AttendanceMarkIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "trainer", "admin")
    ses = await db.sessions.find_one({"session_id": body.session_id}, {"_id": 0})
    if not ses:
        raise HTTPException(404, "Session not found")
    stu = await db.users.find_one({"user_id": body.student_id, "role": "student"}, {"_id": 0})
    if not stu:
        raise HTTPException(404, "Student not found")
    doc = {
        "attendance_id": new_id("att"),
        "session_id": body.session_id,
        "student_id": body.student_id,
        "student_name": stu.get("name"),
        "trainer_id": ses["trainer_id"],
        "status": body.status,
        "marked_by": user["user_id"],
        "marked_at": now_utc(),
    }
    await db.attendance.update_one(
        {"session_id": body.session_id, "student_id": body.student_id},
        {"$set": doc},
        upsert=True,
    )
    await push_notification(
        body.student_id,
        "Attendance marked",
        f"You were marked {body.status} for '{ses['title']}'.",
        "attendance",
    )
    return doc | {"marked_at": doc["marked_at"].isoformat()}


@api.post("/attendance/self")
async def self_attendance(body: SelfAttendanceIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "student")
    ses = await db.sessions.find_one({"session_id": body.session_id}, {"_id": 0})
    if not ses:
        raise HTTPException(404, "Session not found")
    if ses.get("pin") != body.pin:
        raise HTTPException(400, "Invalid PIN")
    doc = {
        "attendance_id": new_id("att"),
        "session_id": body.session_id,
        "student_id": user["user_id"],
        "student_name": user.get("name"),
        "trainer_id": ses["trainer_id"],
        "status": "present",
        "marked_by": user["user_id"],
        "marked_at": now_utc(),
    }
    await db.attendance.update_one(
        {"session_id": body.session_id, "student_id": user["user_id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "status": "present"}


@api.get("/attendance/session/{session_id}")
async def attendance_for_session(session_id: str, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "trainer", "admin")
    docs = await db.attendance.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    return [serialize(d) for d in docs]


@api.get("/attendance/me")
async def my_attendance(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    docs = await db.attendance.find({"student_id": user["user_id"]}, {"_id": 0}).sort("marked_at", -1).to_list(500)
    total = len(docs)
    present = sum(1 for d in docs if d["status"] == "present")
    return {
        "records": [serialize(d) for d in docs],
        "summary": {
            "total": total,
            "present": present,
            "percentage": round((present / total) * 100, 1) if total else 0,
        },
    }


# ---------- Payment Plans & Payments ----------
@api.post("/payment-plans")
async def create_plan(body: PaymentPlanIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "trainer", "admin")
    doc = {
        "plan_id": new_id("pln"),
        "trainer_id": user["user_id"] if user["role"] == "trainer" else None,
        "name": body.name,
        "description": body.description or "",
        "amount": body.amount,
        "currency": body.currency,
        "interval": body.interval,
        "created_at": now_utc(),
    }
    await db.payment_plans.insert_one(doc)
    return serialize(doc)


@api.get("/payment-plans")
async def list_plans(authorization: Optional[str] = Header(None)):
    await auth_user(authorization)
    docs = await db.payment_plans.find({}, {"_id": 0}).to_list(500)
    return [serialize(d) for d in docs]


@api.post("/payments/record")
async def record_payment(body: RecordPaymentIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "trainer", "admin")
    plan = await db.payment_plans.find_one({"plan_id": body.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    doc = {
        "payment_id": new_id("pay"),
        "student_id": body.student_id,
        "trainer_id": user["user_id"] if user["role"] == "trainer" else None,
        "plan_id": body.plan_id,
        "plan_name": plan["name"],
        "amount": body.amount,
        "currency": plan["currency"],
        "mode": body.mode,
        "remarks": body.remarks or "",
        "status": "paid",
        "paid_at": now_utc(),
    }
    await db.payments.insert_one(doc)
    await push_notification(
        body.student_id,
        "Payment recorded",
        f"₹{body.amount} for {plan['name']} ({body.mode}).",
        "payment",
    )
    return serialize(doc)


@api.get("/payments/me")
async def my_payments(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    if user["role"] == "student":
        q = {"student_id": user["user_id"]}
    elif user["role"] == "trainer":
        q = {"trainer_id": user["user_id"]}
    else:
        q = {}
    docs = await db.payments.find(q, {"_id": 0}).sort("paid_at", -1).to_list(500)
    return [serialize(d) for d in docs]


# ---------- Stripe Checkout ----------
@api.post("/payments/checkout")
async def stripe_checkout(body: CheckoutIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "student")
    plan = await db.payment_plans.find_one({"plan_id": body.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    if not stripe_client:
        raise HTTPException(500, "Stripe not configured")

    txn_id = new_id("txn")
    success_url = f"{body.origin}/payments?status=success&txn={txn_id}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{body.origin}/payments?status=cancelled&txn={txn_id}"

    try:
        req = CheckoutSessionRequest(
            amount=float(plan["amount"]),
            currency=plan["currency"].lower(),
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "txn_id": txn_id,
                "plan_id": plan["plan_id"],
                "student_id": user["user_id"],
                "plan_name": plan["name"],
            },
        )
        session = await stripe_client.create_checkout_session(req)
    except Exception as e:
        log.exception("Stripe error")
        raise HTTPException(500, f"Stripe error: {e}")

    await db.payment_transactions.insert_one(
        {
            "txn_id": txn_id,
            "stripe_session_id": session.session_id,
            "student_id": user["user_id"],
            "plan_id": plan["plan_id"],
            "plan_name": plan["name"],
            "amount": plan["amount"],
            "currency": plan["currency"],
            "status": "pending",
            "created_at": now_utc(),
        }
    )
    return {"checkout_url": session.url, "txn_id": txn_id, "session_id": session.session_id}


@api.get("/payments/checkout/{txn_id}")
async def checkout_status(txn_id: str, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    txn = await db.payment_transactions.find_one({"txn_id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if user["role"] == "student" and txn["student_id"] != user["user_id"]:
        raise HTTPException(403, "Not yours")
    # Refresh from Stripe
    try:
        if not stripe_client:
            raise RuntimeError("Stripe not configured")
        s = await stripe_client.get_checkout_status(txn["stripe_session_id"])
        ps = s.payment_status
        sess_status = getattr(s, "status", None)
        if ps == "paid":
            new_status = "paid"
        elif sess_status == "expired":
            new_status = "failed"
        else:
            new_status = "pending"
        if new_status != txn["status"]:
            await db.payment_transactions.update_one(
                {"txn_id": txn_id}, {"$set": {"status": new_status, "updated_at": now_utc()}}
            )
            if new_status == "paid":
                # also create a payment record (idempotent by txn_id remarks)
                existing = await db.payments.find_one({"remarks": f"stripe:{txn_id}"})
                if not existing:
                    await db.payments.insert_one(
                        {
                            "payment_id": new_id("pay"),
                            "student_id": txn["student_id"],
                            "trainer_id": None,
                            "plan_id": txn["plan_id"],
                            "plan_name": txn["plan_name"],
                            "amount": txn["amount"],
                            "currency": txn["currency"],
                            "mode": "online",
                            "remarks": f"stripe:{txn_id}",
                            "status": "paid",
                            "paid_at": now_utc(),
                        }
                    )
                    await push_notification(
                        txn["student_id"],
                        "Payment successful",
                        f"₹{txn['amount']} paid via Stripe for {txn['plan_name']}.",
                        "payment",
                    )
            txn["status"] = new_status
    except Exception as e:
        log.warning("Stripe retrieve failed: %s", e)
    return serialize(txn)


# ---------- Feedback ----------
@api.post("/feedback")
async def submit_feedback(body: FeedbackIn, authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await require_role(user, "student")
    for v in (body.rating, body.quality, body.communication, body.punctuality):
        if not (1 <= v <= 5):
            raise HTTPException(400, "Ratings must be 1-5")
    trainer = await db.users.find_one({"user_id": body.trainer_id, "role": "trainer"}, {"_id": 0})
    if not trainer:
        raise HTTPException(404, "Trainer not found")
    doc = {
        "feedback_id": new_id("fbk"),
        "trainer_id": body.trainer_id,
        "trainer_name": trainer.get("name"),
        "session_id": body.session_id,
        "student_id": user["user_id"],
        "student_name": user.get("name"),
        "rating": body.rating,
        "quality": body.quality,
        "communication": body.communication,
        "punctuality": body.punctuality,
        "comment": body.comment or "",
        "created_at": now_utc(),
    }
    await db.feedback.insert_one(doc)
    await push_notification(
        body.trainer_id,
        "New feedback received",
        f"{user.get('name')} rated you {body.rating}/5.",
        "feedback",
    )
    return serialize(doc)


@api.get("/feedback")
async def list_feedback(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    if user["role"] == "trainer":
        q = {"trainer_id": user["user_id"]}
    elif user["role"] == "student":
        q = {"student_id": user["user_id"]}
    else:
        q = {}
    docs = await db.feedback.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize(d) for d in docs]


# ---------- Notifications ----------
@api.get("/notifications")
async def list_notifications(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    docs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [serialize(d) for d in docs]


@api.post("/notifications/read-all")
async def read_all(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Dashboards ----------
@api.get("/dashboard")
async def dashboard(authorization: Optional[str] = Header(None)):
    user = await auth_user(authorization)
    role = user["role"]

    if role == "admin":
        total_trainers = await db.users.count_documents({"role": "trainer"})
        total_students = await db.users.count_documents({"role": "student"})
        total_sessions = await db.sessions.count_documents({})
        revenue_cur = db.payments.aggregate([{"$group": {"_id": None, "sum": {"$sum": "$amount"}}}])
        revenue = 0.0
        async for row in revenue_cur:
            revenue = float(row.get("sum") or 0)
        att_total = await db.attendance.count_documents({})
        att_present = await db.attendance.count_documents({"status": "present"})
        avg_rating_cur = db.feedback.aggregate([{"$group": {"_id": None, "avg": {"$avg": "$rating"}}}])
        avg_rating = 0.0
        async for row in avg_rating_cur:
            avg_rating = float(row.get("avg") or 0)
        return {
            "role": role,
            "kpis": {
                "trainers": total_trainers,
                "students": total_students,
                "sessions": total_sessions,
                "revenue": round(revenue, 2),
                "attendance_pct": round((att_present / att_total) * 100, 1) if att_total else 0,
                "avg_rating": round(avg_rating, 2),
            },
        }

    if role == "trainer":
        my_sessions = await db.sessions.count_documents({"trainer_id": user["user_id"]})
        my_payments_cur = db.payments.aggregate(
            [{"$match": {"trainer_id": user["user_id"]}}, {"$group": {"_id": None, "sum": {"$sum": "$amount"}}}]
        )
        my_revenue = 0.0
        async for row in my_payments_cur:
            my_revenue = float(row.get("sum") or 0)
        att_total = await db.attendance.count_documents({"trainer_id": user["user_id"]})
        att_present = await db.attendance.count_documents({"trainer_id": user["user_id"], "status": "present"})
        fb_cur = db.feedback.aggregate(
            [{"$match": {"trainer_id": user["user_id"]}}, {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}]
        )
        avg_rating = 0.0
        async for row in fb_cur:
            avg_rating = float(row.get("avg") or 0)
        upcoming = await db.sessions.find(
            {"trainer_id": user["user_id"], "starts_at": {"$gte": now_utc()}}, {"_id": 0}
        ).sort("starts_at", 1).limit(3).to_list(3)
        return {
            "role": role,
            "kpis": {
                "sessions": my_sessions,
                "revenue": round(my_revenue, 2),
                "attendance_pct": round((att_present / att_total) * 100, 1) if att_total else 0,
                "avg_rating": round(avg_rating, 2),
            },
            "upcoming": [serialize(s) for s in upcoming],
        }

    # student
    att_docs = await db.attendance.find({"student_id": user["user_id"]}, {"_id": 0}).to_list(500)
    att_total = len(att_docs)
    att_present = sum(1 for d in att_docs if d["status"] == "present")
    paid_cur = db.payments.aggregate(
        [{"$match": {"student_id": user["user_id"]}}, {"$group": {"_id": None, "sum": {"$sum": "$amount"}}}]
    )
    paid_total = 0.0
    async for row in paid_cur:
        paid_total = float(row.get("sum") or 0)
    upcoming = await db.sessions.find({"starts_at": {"$gte": now_utc()}}, {"_id": 0}).sort("starts_at", 1).limit(3).to_list(3)
    upcoming = [{k: v for k, v in s.items() if k != "pin"} for s in upcoming]
    return {
        "role": role,
        "kpis": {
            "attended": att_present,
            "sessions": att_total,
            "attendance_pct": round((att_present / att_total) * 100, 1) if att_total else 0,
            "paid_total": round(paid_total, 2),
        },
        "upcoming": [serialize(s) for s in upcoming],
    }


# ---------- mount ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
