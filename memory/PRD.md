# TrainerTrack — PRD

## Vision
A general-purpose trainer/student tracking platform that works for gyms, coaching centers (NEET/JEE), schools, colleges, badminton courts, and sports facilities.

## Roles
- **Admin** — owns centers, oversees all trainers/students, revenue, attendance, feedback.
- **Trainer** — schedules sessions, marks attendance, collects payments, views feedback.
- **Student** — self-attendance via PIN, pays plans online, submits feedback, views own history.

## Core Features (v1)
1. **Auth** — Emergent-managed Google sign-in (session token), role chosen on first login.
2. **Sessions** — create/list classes with title, datetime, capacity, PIN.
3. **Attendance** — trainer can mark P/A/L, students self-mark via session PIN.
4. **Payment Plans** — monthly / per-session / term, with Stripe Checkout for online payment.
5. **Feedback** — 5-star rating with categorized scores (quality, communication, punctuality) + comment.
6. **Dashboards** — role-aware KPIs (attendance %, revenue, feedback avg, upcoming sessions).
7. **Notifications** — in-app inbox triggered on attendance, payment, feedback events.
8. **Profile** — language switch (English / Tamil), dark mode toggle, logout.

## Integrations
- Emergent Google Auth
- Stripe Checkout (test mode key `sk_test_emergent`)

## Tech Stack
- Frontend: Expo Router + React Native + StyleSheet
- Backend: FastAPI + Motor (MongoDB)
- Storage: MongoDB collections — users, user_sessions, sessions, attendance, payment_plans, payments, feedback, notifications, payment_transactions

## Out of Scope (v1)
- Push notifications, PDF receipts, QR code generation (PIN used instead), multi-center toggling per session.
