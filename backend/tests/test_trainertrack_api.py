"""TrainerTrack backend regression tests covering all flows in the review request."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://session-log-5.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email(role: str) -> str:
    return f"TEST_{role}_{uuid.uuid4().hex[:8]}@trainertrack.dev"


@pytest.fixture(scope="session")
def session_http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_ctx(session_http):
    email = _unique_email("admin")
    r = session_http.post(f"{API}/auth/dev-login", json={"email": email, "name": "TEST Admin", "role": "admin"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}}


@pytest.fixture(scope="session")
def trainer_ctx(session_http):
    email = _unique_email("trainer")
    r = session_http.post(f"{API}/auth/dev-login", json={"email": email, "name": "TEST Trainer", "role": "trainer"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}}


@pytest.fixture(scope="session")
def student_ctx(session_http):
    email = _unique_email("student")
    r = session_http.post(f"{API}/auth/dev-login", json={"email": email, "name": "TEST Student", "role": "student"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}}


# ---------- Health / Root ----------
class TestRoot:
    def test_root_ok(self, session_http):
        r = session_http.get(f"{API}/")
        assert r.status_code == 200
        j = r.json()
        assert j.get("status") == "ok"
        assert j.get("service") == "TrainerTrack"


# ---------- Auth ----------
class TestAuth:
    def test_dev_login_no_role(self, session_http):
        email = _unique_email("noroleuser")
        r = session_http.post(f"{API}/auth/dev-login", json={"email": email, "name": "No Role"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and data["token"]
        assert data["user"]["email"] == email.lower()
        assert data["user"]["role"] is None

    def test_role_set_and_me_reflects(self, session_http):
        email = _unique_email("setrole")
        r = session_http.post(f"{API}/auth/dev-login", json={"email": email, "name": "RoleSet User"})
        assert r.status_code == 200
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # /auth/role to set trainer
        r2 = session_http.post(f"{API}/auth/role", headers=headers, json={"role": "trainer", "full_name": "Set Trainer", "specialization": "Strength"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["role"] == "trainer"

        # /auth/me reflects
        r3 = session_http.get(f"{API}/auth/me", headers=headers)
        assert r3.status_code == 200
        assert r3.json()["role"] == "trainer"
        assert r3.json()["specialization"] == "Strength"

    def test_invalid_token_rejected(self, session_http):
        r = session_http.get(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401


# ---------- Sessions ----------
class TestSessions:
    def test_trainer_creates_session_with_pin(self, session_http, trainer_ctx):
        starts_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        body = {"title": "TEST Morning Drill", "starts_at": starts_at, "duration_min": 45, "location": "Court A", "capacity": 20}
        r = session_http.post(f"{API}/sessions", headers=trainer_ctx["headers"], json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["session_id"].startswith("ses_")
        assert d["pin"] and len(d["pin"]) == 4
        assert d["trainer_id"] == trainer_ctx["user"]["user_id"]
        # store for later
        pytest.SESSION_ID = d["session_id"]
        pytest.SESSION_PIN = d["pin"]

    def test_trainer_lists_sessions_includes_pin(self, session_http, trainer_ctx):
        r = session_http.get(f"{API}/sessions", headers=trainer_ctx["headers"])
        assert r.status_code == 200
        items = r.json()
        assert any(s["session_id"] == pytest.SESSION_ID for s in items)
        s = next(s for s in items if s["session_id"] == pytest.SESSION_ID)
        assert "pin" in s

    def test_student_lists_sessions_hides_pin(self, session_http, student_ctx):
        r = session_http.get(f"{API}/sessions", headers=student_ctx["headers"])
        assert r.status_code == 200
        items = r.json()
        match = [s for s in items if s["session_id"] == pytest.SESSION_ID]
        assert match, "Student should still see session"
        assert "pin" not in match[0]

    def test_student_cannot_create_session(self, session_http, student_ctx):
        starts_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        r = session_http.post(f"{API}/sessions", headers=student_ctx["headers"], json={"title": "X", "starts_at": starts_at})
        assert r.status_code == 403


# ---------- Attendance ----------
class TestAttendance:
    def test_trainer_marks_student(self, session_http, trainer_ctx, student_ctx):
        body = {"session_id": pytest.SESSION_ID, "student_id": student_ctx["user"]["user_id"], "status": "present"}
        r = session_http.post(f"{API}/attendance/mark", headers=trainer_ctx["headers"], json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "present"
        assert d["student_id"] == student_ctx["user"]["user_id"]

        # notification pushed to student
        rn = session_http.get(f"{API}/notifications", headers=student_ctx["headers"])
        assert rn.status_code == 200
        notifs = rn.json()
        assert any(n.get("kind") == "attendance" for n in notifs)

    def test_self_attendance_wrong_pin(self, session_http, student_ctx):
        body = {"session_id": pytest.SESSION_ID, "pin": "0000" if pytest.SESSION_PIN != "0000" else "9999"}
        r = session_http.post(f"{API}/attendance/self", headers=student_ctx["headers"], json=body)
        assert r.status_code == 400

    def test_self_attendance_correct_pin(self, session_http, student_ctx):
        body = {"session_id": pytest.SESSION_ID, "pin": pytest.SESSION_PIN}
        r = session_http.post(f"{API}/attendance/self", headers=student_ctx["headers"], json=body)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "present"


# ---------- Payment Plans + Payments ----------
class TestPayments:
    def test_three_seed_plans(self, session_http, student_ctx):
        r = session_http.get(f"{API}/payment-plans", headers=student_ctx["headers"])
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) >= 3, f"Expected >=3 seed plans, got {len(plans)}"
        names = [p["name"] for p in plans]
        assert any("Monthly" in n for n in names)
        pytest.SEED_PLAN_ID = plans[0]["plan_id"]

    def test_stripe_checkout(self, session_http, student_ctx):
        body = {"plan_id": pytest.SEED_PLAN_ID, "origin": BASE_URL}
        r = session_http.post(f"{API}/payments/checkout", headers=student_ctx["headers"], json=body)
        # Track outcome but don't hard-fail if Stripe key is invalid; report status
        if r.status_code != 200:
            pytest.skip(f"Stripe checkout failed (status {r.status_code}): {r.text[:300]}")
        data = r.json()
        assert data.get("checkout_url", "").startswith("http")
        assert data.get("txn_id", "").startswith("txn_")
        pytest.TXN_ID = data["txn_id"]

    def test_checkout_status(self, session_http, student_ctx):
        if not hasattr(pytest, "TXN_ID"):
            pytest.skip("No checkout txn to verify")
        r = session_http.get(f"{API}/payments/checkout/{pytest.TXN_ID}", headers=student_ctx["headers"])
        assert r.status_code == 200
        assert r.json()["status"] in {"pending", "paid", "failed"}

    def test_trainer_record_manual_payment(self, session_http, trainer_ctx, student_ctx):
        # get a plan
        rp = session_http.get(f"{API}/payment-plans", headers=trainer_ctx["headers"])
        plan_id = rp.json()[0]["plan_id"]
        body = {"student_id": student_ctx["user"]["user_id"], "plan_id": plan_id, "amount": 500.0, "mode": "cash", "remarks": "TEST manual"}
        r = session_http.post(f"{API}/payments/record", headers=trainer_ctx["headers"], json=body)
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 500.0
        assert r.json()["status"] == "paid"

        # student notification
        rn = session_http.get(f"{API}/notifications", headers=student_ctx["headers"])
        assert any(n.get("kind") == "payment" for n in rn.json())


# ---------- Feedback ----------
class TestFeedback:
    def test_student_submits_feedback(self, session_http, student_ctx, trainer_ctx):
        body = {
            "trainer_id": trainer_ctx["user"]["user_id"],
            "rating": 5, "quality": 5, "communication": 4, "punctuality": 5,
            "comment": "TEST great session",
        }
        r = session_http.post(f"{API}/feedback", headers=student_ctx["headers"], json=body)
        assert r.status_code == 200, r.text
        assert r.json()["rating"] == 5

        # trainer gets feedback notif
        rn = session_http.get(f"{API}/notifications", headers=trainer_ctx["headers"])
        assert any(n.get("kind") == "feedback" for n in rn.json())

    def test_invalid_rating_rejected(self, session_http, student_ctx, trainer_ctx):
        body = {
            "trainer_id": trainer_ctx["user"]["user_id"],
            "rating": 9, "quality": 1, "communication": 1, "punctuality": 1,
        }
        r = session_http.post(f"{API}/feedback", headers=student_ctx["headers"], json=body)
        assert r.status_code == 400


# ---------- Dashboards ----------
class TestDashboard:
    def test_admin_dashboard(self, session_http, admin_ctx):
        r = session_http.get(f"{API}/dashboard", headers=admin_ctx["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "admin"
        for k in ("trainers", "students", "sessions", "revenue", "attendance_pct", "avg_rating"):
            assert k in d["kpis"], f"Missing KPI: {k}"

    def test_trainer_dashboard(self, session_http, trainer_ctx):
        r = session_http.get(f"{API}/dashboard", headers=trainer_ctx["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "trainer"
        for k in ("sessions", "revenue", "attendance_pct", "avg_rating"):
            assert k in d["kpis"]
        assert isinstance(d.get("upcoming"), list)

    def test_student_dashboard(self, session_http, student_ctx):
        r = session_http.get(f"{API}/dashboard", headers=student_ctx["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "student"
        for k in ("attended", "sessions", "attendance_pct", "paid_total"):
            assert k in d["kpis"]


# ---------- Notifications listing ----------
class TestNotifications:
    def test_list_for_student(self, session_http, student_ctx):
        r = session_http.get(f"{API}/notifications", headers=student_ctx["headers"])
        assert r.status_code == 200
        items = r.json()
        # We earlier created attendance + payment notifs
        kinds = {n.get("kind") for n in items}
        assert "attendance" in kinds or "payment" in kinds
