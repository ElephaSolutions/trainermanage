// Theme + i18n + Auth contexts plus shared API helpers.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { storage } from "@/src/utils/storage";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

// ---------- types ----------
export type Role = "admin" | "trainer" | "student";
export interface User {
  user_id: string;
  email: string;
  name?: string;
  picture?: string | null;
  role: Role | null;
  phone?: string | null;
  specialization?: string | null;
  goals?: string | null;
  language?: "en" | "ta";
  theme?: "light" | "dark" | "auto";
}

// ---------- HTTP ----------
export async function http<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

// ---------- Auth ----------
interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDev: (email: string, name: string, role?: Role) => Promise<void>;
  setRole: (payload: any) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (payload: any) => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

const TOKEN_KEY = "tt_token";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const tk = await storage.secureGet(TOKEN_KEY, "");
    if (!tk) {
      setUser(null);
      setToken(null);
      return;
    }
    try {
      const u = await http<User>("/auth/me", { token: tk });
      setUser(u);
      setToken(tk);
    } catch {
      await storage.secureRemove(TOKEN_KEY);
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl = Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) return;
    const url = result.url;
    // session_id is provided in hash fragment
    const hash = url.split("#")[1] || "";
    const query = url.split("?")[1]?.split("#")[0] || "";
    const params = new URLSearchParams(hash || query);
    const sid = params.get("session_id");
    if (!sid) throw new Error("Missing session_id from auth provider");
    // Exchange via emergent for session data
    const sd = await (await fetch(
      "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
      { headers: { "X-Session-ID": sid } },
    )).json();
    if (!sd?.session_token) throw new Error("Failed to fetch session data");
    const out = await http<{ token: string; user: User }>("/auth/google/session", {
      method: "POST",
      body: { session_token: sd.session_token },
    });
    await storage.secureSet(TOKEN_KEY, out.token);
    setToken(out.token);
    setUser(out.user);
  }, []);

  const signInDev = useCallback(async (email: string, name: string, role?: Role) => {
    const out = await http<{ token: string; user: User }>("/auth/dev-login", {
      method: "POST",
      body: { email, name, role },
    });
    await storage.secureSet(TOKEN_KEY, out.token);
    setToken(out.token);
    setUser(out.user);
  }, []);

  const setRole = useCallback(
    async (payload: any) => {
      if (!token) return;
      const u = await http<User>("/auth/role", { method: "POST", body: payload, token });
      setUser(u);
    },
    [token],
  );

  const updateProfile = useCallback(
    async (payload: any) => {
      if (!token) return;
      const u = await http<User>("/users/me", { method: "PUT", body: payload, token });
      setUser(u);
    },
    [token],
  );

  const signOut = useCallback(async () => {
    if (token) {
      try {
        await http("/auth/logout", { method: "POST", token });
      } catch {}
    }
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, signInWithGoogle, signInDev, setRole, refresh, signOut, updateProfile }),
    [user, token, loading, signInWithGoogle, signInDev, setRole, refresh, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

// ---------- Theme ----------
export interface Palette {
  bg: string;
  surface: string;
  surfaceElev: string;
  primary: string;
  primaryFg: string;
  danger: string;
  warning: string;
  success: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
}

const LIGHT: Palette = {
  bg: "#FFFFFF",
  surface: "#F4F4F5",
  surfaceElev: "#E4E4E7",
  primary: "#0055FF",
  primaryFg: "#FFFFFF",
  danger: "#FF2E00",
  warning: "#FFC000",
  success: "#00C366",
  border: "#09090B",
  textPrimary: "#09090B",
  textSecondary: "#52525B",
};

const DARK: Palette = {
  bg: "#09090B",
  surface: "#18181B",
  surfaceElev: "#27272A",
  primary: "#3377FF",
  primaryFg: "#FFFFFF",
  danger: "#FF4D26",
  warning: "#FFD133",
  success: "#00E075",
  border: "#52525B",
  textPrimary: "#FAFAFA",
  textSecondary: "#A1A1AA",
};

interface ThemeCtx {
  scheme: "light" | "dark";
  palette: Palette;
  toggle: () => void;
  setMode: (m: "light" | "dark" | "auto") => void;
  mode: "light" | "dark" | "auto";
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sys = useColorScheme();
  const [mode, setModeState] = useState<"light" | "dark" | "auto">("dark");

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem("tt_theme", "dark");
      if (stored === "light" || stored === "dark" || stored === "auto") setModeState(stored);
    })();
  }, []);

  const scheme: "light" | "dark" =
    mode === "auto" ? ((sys === "light" ? "light" : "dark") as "light" | "dark") : mode;

  const setMode = (m: "light" | "dark" | "auto") => {
    setModeState(m);
    storage.setItem("tt_theme", m);
  };

  const value: ThemeCtx = {
    scheme,
    palette: scheme === "dark" ? DARK : LIGHT,
    toggle: () => setMode(scheme === "dark" ? "light" : "dark"),
    setMode,
    mode,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}

// ---------- i18n ----------
const STRINGS = {
  en: {
    app_name: "TrainerTrack",
    sign_in: "Sign in with Google",
    dev_sign_in: "Quick Demo Login",
    role_admin: "Admin",
    role_trainer: "Trainer",
    role_student: "Student",
    choose_role: "Choose your role",
    full_name: "Full name",
    phone: "Phone",
    specialization: "Specialization",
    goals: "Goals",
    continue: "Continue",
    dashboard: "Dashboard",
    attendance: "Attendance",
    payments: "Payments",
    schedule: "Schedule",
    profile: "Profile",
    notifications: "Notifications",
    upcoming: "Upcoming",
    revenue: "Revenue",
    trainers: "Trainers",
    students: "Students",
    sessions: "Sessions",
    avg_rating: "Avg Rating",
    attendance_pct: "Attendance %",
    paid: "Paid",
    mark_present: "Present",
    mark_absent: "Absent",
    mark_late: "Late",
    self_attendance: "Self Check-in via PIN",
    enter_pin: "Enter session PIN",
    submit: "Submit",
    cancel: "Cancel",
    create_session: "Create session",
    title: "Title",
    starts_at: "Starts at (ISO)",
    duration: "Duration (min)",
    location: "Location",
    capacity: "Capacity",
    plans: "Plans",
    pay_online: "Pay online (Stripe)",
    history: "History",
    feedback: "Feedback",
    rating: "Rating",
    quality: "Quality",
    communication: "Communication",
    punctuality: "Punctuality",
    comment: "Comment (optional)",
    submit_feedback: "Submit feedback",
    language: "Language",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    logout: "Logout",
    no_data: "Nothing yet.",
    loading: "Loading...",
    saved: "Saved",
    paid_success: "Payment successful",
    paid_cancelled: "Payment cancelled",
    welcome: "Track. Train. Triumph.",
    welcome_sub: "One app for gyms, coaching centers, schools, and sports — across roles.",
    pin: "PIN",
    students_count: "Students",
    today_streak: "Streak",
    new_session: "New",
    name: "Name",
    amount: "Amount",
    interval: "Interval",
    monthly: "Monthly",
    per_session: "Per session",
    term: "Term",
    record_payment: "Record payment",
    mode: "Mode",
    cash: "Cash",
    upi: "UPI",
    card: "Card",
    bank: "Bank",
    online: "Online",
    select_student: "Select student",
    select_plan: "Select plan",
    select_trainer: "Select trainer",
    open_feedback: "Give feedback",
    mark_attendance: "Mark Attendance",
    pin_label: "Session PIN",
  },
  ta: {
    app_name: "டிரெய்னர்டிராக்",
    sign_in: "கூகுளில் உள்நுழைக",
    dev_sign_in: "டெமோ உள்நுழைவு",
    role_admin: "நிர்வாகி",
    role_trainer: "பயிற்றுவிப்பாளர்",
    role_student: "மாணவர்",
    choose_role: "உங்கள் பாத்திரத்தைத் தேர்வுசெய்க",
    full_name: "முழு பெயர்",
    phone: "தொலைபேசி",
    specialization: "சிறப்புத்துறை",
    goals: "இலக்குகள்",
    continue: "தொடரவும்",
    dashboard: "டாஷ்போர்டு",
    attendance: "வருகை",
    payments: "கட்டணம்",
    schedule: "அட்டவணை",
    profile: "சுயவிவரம்",
    notifications: "அறிவிப்புகள்",
    upcoming: "வரவிருக்கும்",
    revenue: "வருவாய்",
    trainers: "பயிற்றுவிப்பாளர்கள்",
    students: "மாணவர்கள்",
    sessions: "அமர்வுகள்",
    avg_rating: "சராசரி மதிப்பீடு",
    attendance_pct: "வருகை %",
    paid: "செலுத்தப்பட்டது",
    mark_present: "வந்தார்",
    mark_absent: "வரவில்லை",
    mark_late: "தாமதம்",
    self_attendance: "PIN மூலம் சுய வருகை",
    enter_pin: "அமர்வு PIN ஐ உள்ளிடவும்",
    submit: "சமர்ப்பி",
    cancel: "ரத்துசெய்",
    create_session: "அமர்வை உருவாக்கு",
    title: "தலைப்பு",
    starts_at: "தொடக்கம் (ISO)",
    duration: "கால அளவு (நிமி)",
    location: "இடம்",
    capacity: "திறன்",
    plans: "திட்டங்கள்",
    pay_online: "ஆன்லைனில் செலுத்து (Stripe)",
    history: "வரலாறு",
    feedback: "கருத்து",
    rating: "மதிப்பீடு",
    quality: "தரம்",
    communication: "தொடர்பு",
    punctuality: "நேர்மை",
    comment: "கருத்து (விரும்பினால்)",
    submit_feedback: "கருத்தை அனுப்பு",
    language: "மொழி",
    theme: "தீம்",
    dark: "இருண்ட",
    light: "வெளிச்சம்",
    logout: "வெளியேறு",
    no_data: "இன்னும் தரவில்லை.",
    loading: "ஏற்றுகிறது...",
    saved: "சேமிக்கப்பட்டது",
    paid_success: "கட்டணம் வெற்றிகரம்",
    paid_cancelled: "கட்டணம் ரத்து",
    welcome: "கண்காணி. பயிற்சி. வெற்றி.",
    welcome_sub: "ஜிம், கோச்சிங், பள்ளி, விளையாட்டு — அனைத்திற்கும் ஒரு பயன்பாடு.",
    pin: "PIN",
    students_count: "மாணவர்கள்",
    today_streak: "தொடர்",
    new_session: "புதிய",
    name: "பெயர்",
    amount: "தொகை",
    interval: "காலம்",
    monthly: "மாத",
    per_session: "ஒரு அமர்வு",
    term: "காலகட்டம்",
    record_payment: "கட்டணம் பதிவு",
    mode: "முறை",
    cash: "ரொக்கம்",
    upi: "UPI",
    card: "கார்டு",
    bank: "வங்கி",
    online: "ஆன்லைன்",
    select_student: "மாணவரைத் தேர்வு",
    select_plan: "திட்டத்தைத் தேர்வு",
    select_trainer: "பயிற்றுவிப்பாளர் தேர்வு",
    open_feedback: "கருத்து வழங்கு",
    mark_attendance: "வருகை பதிவு",
    pin_label: "அமர்வு PIN",
  },
} as const;

type Lang = keyof typeof STRINGS;
interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof typeof STRINGS["en"]) => string;
}

const I18nContext = createContext<I18nCtx | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem("tt_lang", "en");
      if (stored === "en" || stored === "ta") setLangState(stored);
    })();
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    storage.setItem("tt_lang", l);
  };

  const t = (key: keyof typeof STRINGS["en"]) => STRINGS[lang][key] || STRINGS.en[key] || (key as string);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside I18nProvider");
  return ctx;
}
