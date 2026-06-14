import { useCallback, useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, RefreshControl, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, router } from "expo-router";

import { http, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Badge, Button, Card, SectionHeader, screenStyles } from "@/src/lib/ui";

interface Plan { plan_id: string; name: string; description: string; amount: number; currency: string; interval: string; }
interface Payment { payment_id: string; plan_name: string; amount: number; currency: string; mode: string; paid_at: string; status: string; student_name?: string; }

export default function PaymentsScreen() {
  const { palette } = useTheme();
  const { t } = useI18n();
  const { user, token } = useAuth();
  const s = screenStyles(palette);
  const params = useLocalSearchParams<{ status?: string; txn?: string }>();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerTone, setBannerTone] = useState<"success" | "danger">("success");

  // Trainer-side record-payment modal state
  const [recordOpen, setRecordOpen] = useState(false);
  const [rStudent, setRStudent] = useState<string>("");
  const [rPlan, setRPlan] = useState<string>("");
  const [rAmount, setRAmount] = useState<string>("");
  const [rMode, setRMode] = useState<"cash" | "upi" | "card" | "bank" | "online">("cash");
  const [rRemarks, setRRemarks] = useState<string>("");
  const [rError, setRError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const p = await http<Plan[]>("/payment-plans", { token });
      setPlans(p);
      const h = await http<Payment[]>("/payments/me", { token });
      setHistory(h);
      if (user?.role === "trainer" || user?.role === "admin") {
        const st = await http<any[]>("/users/students", { token });
        setStudents(st);
      }
    } catch {}
  }, [token, user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle Stripe return
  useEffect(() => {
    if (!params.status || !params.txn || !token) return;
    if (params.status === "success") {
      // poll status
      (async () => {
        try {
          await http(`/payments/checkout/${params.txn}`, { token });
          setBanner(t("paid_success"));
          setBannerTone("success");
          await load();
        } catch {}
      })();
    } else if (params.status === "cancelled") {
      setBanner(t("paid_cancelled"));
      setBannerTone("danger");
    }
    // Clean params
    setTimeout(() => router.replace("/(tabs)/payments"), 50);
  }, [params.status, params.txn, token, load, t]);

  const startCheckout = async (plan: Plan) => {
    if (!token) return;
    try {
      const origin = Platform.OS === "web" ? window.location.origin : process.env.EXPO_PUBLIC_BACKEND_URL!;
      const res = await http<{ checkout_url: string }>("/payments/checkout", {
        method: "POST",
        token,
        body: { plan_id: plan.plan_id, origin },
      });
      if (Platform.OS === "web") {
        window.location.href = res.checkout_url;
      } else {
        await WebBrowser.openBrowserAsync(res.checkout_url);
        // Refresh after returning
        setTimeout(load, 800);
      }
    } catch (e: any) {
      setBanner(e?.message || "Failed");
      setBannerTone("danger");
    }
  };

  const submitRecord = async () => {
    if (!rStudent || !rPlan || !rAmount) {
      setRError("Fill all fields");
      return;
    }
    try {
      setBusy(true);
      setRError(null);
      await http("/payments/record", {
        method: "POST",
        token,
        body: {
          student_id: rStudent,
          plan_id: rPlan,
          amount: parseFloat(rAmount),
          mode: rMode,
          remarks: rRemarks,
        },
      });
      setRecordOpen(false);
      setRStudent("");
      setRPlan("");
      setRAmount("");
      setRMode("cash");
      setRRemarks("");
      await load();
      setBanner(t("saved"));
      setBannerTone("success");
    } catch (e: any) {
      setRError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={s.root} testID="payments-screen">
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={s.title}>{t("payments")}</Text>

        {banner ? (
          <View style={{ marginBottom: 12 }}>
            <Card testID="payment-banner">
              <Text style={{ color: bannerTone === "success" ? palette.success : palette.danger, fontWeight: "900" }}>
                {banner}
              </Text>
            </Card>
          </View>
        ) : null}

        <SectionHeader
          title={t("plans")}
          right={
            user?.role === "trainer" || user?.role === "admin" ? (
              <Button label={t("record_payment")} variant="secondary" onPress={() => setRecordOpen(true)} testID="open-record-button" />
            ) : undefined
          }
        />

        {plans.map((p) => (
          <View key={p.plan_id} style={{ marginBottom: 12 }}>
            <Card testID={`plan-${p.plan_id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: "900", fontSize: 16 }}>{p.name}</Text>
                  <Text style={{ color: palette.textSecondary, marginTop: 4 }}>{p.description}</Text>
                  <Text style={{ color: palette.textSecondary, marginTop: 4, fontSize: 12, letterSpacing: 1 }}>
                    {p.interval.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: palette.textPrimary, fontWeight: "900", fontSize: 22 }}>
                  ₹{p.amount}
                </Text>
              </View>
              {user?.role === "student" ? (
                <>
                  <View style={{ height: 12 }} />
                  <Button
                    label={t("pay_online")}
                    onPress={() => startCheckout(p)}
                    testID={`pay-${p.plan_id}`}
                  />
                </>
              ) : null}
            </Card>
          </View>
        ))}

        <View style={{ height: 16 }} />
        <SectionHeader title={t("history")} />
        {history.length === 0 ? (
          <Card>
            <Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text>
          </Card>
        ) : (
          history.map((h) => (
            <View key={h.payment_id} style={{ marginBottom: 8 }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.textPrimary, fontWeight: "800" }}>{h.plan_name}</Text>
                    <Text style={{ color: palette.textSecondary, marginTop: 2 }}>
                      {new Date(h.paid_at).toLocaleString()} · {h.mode.toUpperCase()}
                      {h.student_name ? ` · ${h.student_name}` : ""}
                    </Text>
                  </View>
                  <Text style={{ color: palette.textPrimary, fontWeight: "900" }}>₹{h.amount}</Text>
                </View>
              </Card>
            </View>
          ))
        )}
      </ScrollView>

      {/* Record payment modal */}
      <Modal visible={recordOpen} animationType="slide" transparent onRequestClose={() => setRecordOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: palette.bg, padding: 16, borderTopWidth: 2, borderColor: palette.border, maxHeight: "85%" }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.title}>{t("record_payment")}</Text>

              <Text style={s.label}>{t("select_student")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {students.map((st) => (
                  <TouchableOpacity
                    key={st.user_id}
                    testID={`pick-student-${st.user_id}`}
                    onPress={() => setRStudent(st.user_id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 2,
                      borderColor: palette.border,
                      backgroundColor: rStudent === st.user_id ? palette.primary : palette.surface,
                    }}
                  >
                    <Text style={{ color: rStudent === st.user_id ? "#FFF" : palette.textPrimary, fontWeight: "700" }}>
                      {st.name || st.email}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t("select_plan")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {plans.map((p) => (
                  <TouchableOpacity
                    key={p.plan_id}
                    testID={`pick-plan-${p.plan_id}`}
                    onPress={() => { setRPlan(p.plan_id); setRAmount(String(p.amount)); }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 2,
                      borderColor: palette.border,
                      backgroundColor: rPlan === p.plan_id ? palette.primary : palette.surface,
                    }}
                  >
                    <Text style={{ color: rPlan === p.plan_id ? "#FFF" : palette.textPrimary, fontWeight: "700" }}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t("amount")}</Text>
              <TextInput
                testID="record-amount-input"
                value={rAmount}
                onChangeText={setRAmount}
                keyboardType="numeric"
                style={s.input}
                placeholderTextColor={palette.textSecondary}
              />

              <Text style={s.label}>{t("mode")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {(["cash", "upi", "card", "bank", "online"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`mode-${m}`}
                    onPress={() => setRMode(m)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 2,
                      borderColor: palette.border,
                      backgroundColor: rMode === m ? palette.primary : palette.surface,
                    }}
                  >
                    <Text style={{ color: rMode === m ? "#FFF" : palette.textPrimary, fontWeight: "700" }}>
                      {t(m as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Remarks</Text>
              <TextInput
                testID="record-remarks-input"
                value={rRemarks}
                onChangeText={setRRemarks}
                style={s.input}
                placeholder="Optional"
                placeholderTextColor={palette.textSecondary}
              />

              {rError ? <Text style={{ color: palette.danger, marginBottom: 8 }}>{rError}</Text> : null}

              <Button label={t("submit")} onPress={submitRecord} loading={busy} testID="submit-record-button" />
              <View style={{ height: 8 }} />
              <Button label={t("cancel")} variant="secondary" onPress={() => setRecordOpen(false)} testID="cancel-record-button" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
