import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { http, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Card, KpiTile, SectionHeader, screenStyles } from "@/src/lib/ui";

export default function Dashboard() {
  const { palette } = useTheme();
  const { t } = useI18n();
  const { user, token } = useAuth();
  const s = screenStyles(palette);
  const [data, setData] = useState<any>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await http("/dashboard", { token });
      setData(d);
      const n = await http<any[]>("/notifications", { token });
      setNotifCount(n.filter((x) => !x.read).length);
    } catch {}
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const role = user?.role;
  const kpis = data?.kpis || {};
  const upcoming: any[] = data?.upcoming || [];

  return (
    <SafeAreaView edges={["top"]} style={s.root} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2 }}>
              {t(`role_${role || "student"}` as any).toUpperCase()}
            </Text>
            <Text style={s.title} numberOfLines={1}>
              {user?.name || "—"}
            </Text>
          </View>
          <TouchableOpacity
            testID="notifications-button"
            onPress={() => router.push("/notifications")}
            style={{ borderWidth: 2, borderColor: palette.border, padding: 10, backgroundColor: palette.surface }}
          >
            <View>
              <Ionicons name="notifications-outline" color={palette.textPrimary} size={20} />
              {notifCount > 0 ? (
                <View
                  testID="notifications-badge"
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -8,
                    backgroundColor: palette.danger,
                    borderWidth: 1,
                    borderColor: palette.border,
                    paddingHorizontal: 4,
                    minWidth: 16,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>{notifCount}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 16 }} />

        {/* KPI row */}
        {role === "admin" && (
          <>
            <View style={s.row}>
              <KpiTile label={t("trainers")} value={kpis.trainers ?? 0} testID="kpi-trainers" />
              <KpiTile label={t("students")} value={kpis.students ?? 0} testID="kpi-students" />
            </View>
            <View style={{ height: 12 }} />
            <View style={s.row}>
              <KpiTile label={t("revenue")} value={`₹${kpis.revenue ?? 0}`} testID="kpi-revenue" />
              <KpiTile label={t("avg_rating")} value={`${kpis.avg_rating ?? 0}`} testID="kpi-rating" />
            </View>
            <View style={{ height: 12 }} />
            <View style={s.row}>
              <KpiTile label={t("sessions")} value={kpis.sessions ?? 0} testID="kpi-sessions" />
              <KpiTile label={t("attendance_pct")} value={`${kpis.attendance_pct ?? 0}%`} testID="kpi-attendance" />
            </View>
          </>
        )}

        {role === "trainer" && (
          <>
            <View style={s.row}>
              <KpiTile label={t("sessions")} value={kpis.sessions ?? 0} testID="kpi-sessions" />
              <KpiTile label={t("revenue")} value={`₹${kpis.revenue ?? 0}`} testID="kpi-revenue" />
            </View>
            <View style={{ height: 12 }} />
            <View style={s.row}>
              <KpiTile label={t("attendance_pct")} value={`${kpis.attendance_pct ?? 0}%`} testID="kpi-attendance" />
              <KpiTile label={t("avg_rating")} value={`${kpis.avg_rating ?? 0}`} testID="kpi-rating" />
            </View>
          </>
        )}

        {role === "student" && (
          <>
            <View style={s.row}>
              <KpiTile label={t("attendance_pct")} value={`${kpis.attendance_pct ?? 0}%`} testID="kpi-attendance" />
              <KpiTile label={t("today_streak")} value={kpis.attended ?? 0} testID="kpi-attended" />
            </View>
            <View style={{ height: 12 }} />
            <View style={s.row}>
              <KpiTile label={t("paid")} value={`₹${kpis.paid_total ?? 0}`} testID="kpi-paid" />
              <KpiTile label={t("sessions")} value={kpis.sessions ?? 0} testID="kpi-sessions" />
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
        <SectionHeader title={t("upcoming")} />
        {upcoming.length === 0 ? (
          <Card>
            <Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text>
          </Card>
        ) : (
          upcoming.map((s2, i) => (
            <View key={s2.session_id || i} style={{ marginBottom: 12 }}>
              <Card>
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: "900" }}>{s2.title}</Text>
                <Text style={{ color: palette.textSecondary, marginTop: 4 }}>
                  {new Date(s2.starts_at).toLocaleString()} · {s2.duration_min}min
                </Text>
                {s2.location ? (
                  <Text style={{ color: palette.textSecondary, marginTop: 4 }}>{s2.location}</Text>
                ) : null}
                {s2.pin ? (
                  <Text style={{ marginTop: 8, color: palette.textPrimary, fontWeight: "900", letterSpacing: 2 }}>
                    PIN · {s2.pin}
                  </Text>
                ) : null}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
