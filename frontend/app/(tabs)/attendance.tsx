import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { http, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Badge, Button, Card, SectionHeader, screenStyles } from "@/src/lib/ui";

interface Session { session_id: string; title: string; starts_at: string; pin?: string; trainer_id: string; trainer_name?: string; }
interface Student { user_id: string; name?: string; email: string; }
interface AttendanceRec { student_id: string; status: string; student_name?: string; }

export default function AttendanceScreen() {
  const { palette } = useTheme();
  const { t } = useI18n();
  const { user, token } = useAuth();
  const s = screenStyles(palette);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Trainer-side state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});

  // Student-side state
  const [pinSession, setPinSession] = useState<Session | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinOk, setPinOk] = useState<string | null>(null);

  // My attendance
  const [myAtt, setMyAtt] = useState<any>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const ses = await http<Session[]>("/sessions", { token });
      setSessions(ses);
      if (user?.role === "trainer" || user?.role === "admin") {
        const st = await http<Student[]>("/users/students", { token });
        setStudents(st);
      }
      if (user?.role === "student") {
        const att = await http("/attendance/me", { token });
        setMyAtt(att);
      }
    } catch {}
  }, [token, user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const openMark = async (sess: Session) => {
    setActiveSession(sess);
    setMarks({});
    try {
      const recs = await http<AttendanceRec[]>(`/attendance/session/${sess.session_id}`, { token });
      const m: Record<string, string> = {};
      recs.forEach((r) => (m[r.student_id] = r.status));
      setMarks(m);
    } catch {}
  };

  const mark = async (student_id: string, status: "present" | "absent" | "late") => {
    if (!activeSession) return;
    setMarks((p) => ({ ...p, [student_id]: status }));
    try {
      await http("/attendance/mark", {
        method: "POST",
        token,
        body: { session_id: activeSession.session_id, student_id, status },
      });
    } catch {}
  };

  const submitPin = async () => {
    if (!pinSession) return;
    setPinError(null);
    setPinOk(null);
    try {
      await http("/attendance/self", {
        method: "POST",
        token,
        body: { session_id: pinSession.session_id, pin },
      });
      setPinOk(t("saved"));
      setTimeout(() => {
        setPinSession(null);
        setPin("");
        setPinOk(null);
        load();
      }, 800);
    } catch (e: any) {
      setPinError(e?.message || "Invalid PIN");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={s.root} testID="attendance-screen">
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={s.title}>{t("attendance")}</Text>

        {user?.role === "student" && myAtt && (
          <Card style={{ marginBottom: 16 }} testID="my-attendance-summary">
            <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2 }}>
              {t("attendance_pct").toUpperCase()}
            </Text>
            <Text style={{ color: palette.textPrimary, fontSize: 36, fontWeight: "900" }}>
              {myAtt.summary.percentage}%
            </Text>
            <Text style={{ color: palette.textSecondary, marginTop: 4 }}>
              {myAtt.summary.present}/{myAtt.summary.total} {t("sessions").toLowerCase()}
            </Text>
          </Card>
        )}

        <SectionHeader title={t("sessions")} />
        {sessions.length === 0 ? (
          <Card>
            <Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text>
          </Card>
        ) : (
          sessions.map((sess) => (
            <View key={sess.session_id} style={{ marginBottom: 12 }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: "900" }}>{sess.title}</Text>
                    <Text style={{ color: palette.textSecondary, marginTop: 4 }}>
                      {new Date(sess.starts_at).toLocaleString()}
                    </Text>
                    {sess.trainer_name ? (
                      <Text style={{ color: palette.textSecondary, marginTop: 2 }}>by {sess.trainer_name}</Text>
                    ) : null}
                  </View>
                  {(user?.role === "trainer" || user?.role === "admin") && sess.pin ? (
                    <Text style={{ color: palette.textPrimary, fontWeight: "900", letterSpacing: 2 }}>
                      PIN · {sess.pin}
                    </Text>
                  ) : null}
                </View>
                <View style={{ height: 12 }} />
                {user?.role === "student" ? (
                  <Button
                    label={t("self_attendance")}
                    variant="secondary"
                    testID={`self-attend-${sess.session_id}`}
                    onPress={() => { setPinSession(sess); setPin(""); setPinError(null); setPinOk(null); }}
                  />
                ) : (
                  <Button
                    label={t("mark_attendance")}
                    testID={`mark-attend-${sess.session_id}`}
                    onPress={() => openMark(sess)}
                  />
                )}
              </Card>
            </View>
          ))
        )}

        {user?.role === "student" && myAtt?.records?.length ? (
          <>
            <View style={{ height: 16 }} />
            <SectionHeader title={t("history")} />
            {myAtt.records.map((r: any) => (
              <View key={r.attendance_id} style={{ marginBottom: 8 }}>
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: palette.textPrimary, fontWeight: "700" }}>
                      {new Date(r.marked_at).toLocaleDateString()}
                    </Text>
                    <Badge label={r.status} tone={r.status as any} />
                  </View>
                </Card>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Mark attendance modal */}
      <Modal visible={!!activeSession} animationType="slide" transparent onRequestClose={() => setActiveSession(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View
            style={{ backgroundColor: palette.bg, padding: 16, borderTopWidth: 2, borderColor: palette.border, maxHeight: "85%" }}
          >
            <Text style={s.title}>{activeSession?.title}</Text>
            <Text style={s.subtitle}>{t("students")}</Text>
            <ScrollView style={{ maxHeight: 480 }}>
              {students.map((st) => {
                const cur = marks[st.user_id];
                return (
                  <View
                    key={st.user_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderColor: palette.border,
                    }}
                  >
                    <Text style={{ flex: 1, color: palette.textPrimary, fontWeight: "700" }}>{st.name || st.email}</Text>
                    {(["present", "absent", "late"] as const).map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        testID={`mark-${st.user_id}-${opt}`}
                        onPress={() => mark(st.user_id, opt)}
                        style={{
                          marginLeft: 6,
                          borderWidth: 2,
                          borderColor: palette.border,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          backgroundColor:
                            cur === opt
                              ? opt === "present"
                                ? palette.success
                                : opt === "absent"
                                ? palette.danger
                                : palette.warning
                              : palette.surface,
                        }}
                      >
                        <Text
                          style={{
                            color: cur === opt ? (opt === "late" ? "#000" : "#FFF") : palette.textPrimary,
                            fontWeight: "900",
                            fontSize: 11,
                            letterSpacing: 1,
                          }}
                        >
                          {opt[0].toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
              {students.length === 0 && <Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text>}
            </ScrollView>
            <View style={{ height: 12 }} />
            <Button label={t("cancel")} variant="secondary" onPress={() => setActiveSession(null)} testID="close-mark-modal" />
          </View>
        </View>
      </Modal>

      {/* PIN modal */}
      <Modal visible={!!pinSession} animationType="slide" transparent onRequestClose={() => setPinSession(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: palette.bg, padding: 16, borderTopWidth: 2, borderColor: palette.border }}>
            <Text style={s.title}>{t("self_attendance")}</Text>
            <Text style={s.subtitle}>{pinSession?.title}</Text>
            <Text style={s.label}>{t("enter_pin")}</Text>
            <TextInput
              testID="pin-input"
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={6}
              style={[s.input, { fontSize: 24, letterSpacing: 8, textAlign: "center" }]}
              placeholder="0000"
              placeholderTextColor={palette.textSecondary}
            />
            {pinError ? (
              <Text testID="pin-error" style={{ color: palette.danger, marginBottom: 8, fontWeight: "700" }}>
                {pinError}
              </Text>
            ) : null}
            {pinOk ? (
              <Text testID="pin-ok" style={{ color: palette.success, marginBottom: 8, fontWeight: "700" }}>
                {pinOk}
              </Text>
            ) : null}
            <Button label={t("submit")} onPress={submitPin} testID="submit-pin-button" />
            <View style={{ height: 8 }} />
            <Button label={t("cancel")} variant="secondary" onPress={() => setPinSession(null)} testID="cancel-pin-button" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
