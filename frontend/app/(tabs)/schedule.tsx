import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { http, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Button, Card, SectionHeader, screenStyles } from "@/src/lib/ui";

interface Session {
  session_id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  location?: string;
  trainer_name?: string;
  pin?: string;
}

export default function ScheduleScreen() {
  const { palette } = useTheme();
  const { t } = useI18n();
  const { user, token } = useAuth();
  const s = screenStyles(palette);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(new Date(Date.now() + 3600_000).toISOString());
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const ses = await http<Session[]>("/sessions", { token });
    setSessions(ses);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!title.trim()) {
      setError("Title required");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await http("/sessions", {
        method: "POST",
        token,
        body: {
          title: title.trim(),
          starts_at: startsAt,
          duration_min: parseInt(duration) || 60,
          location,
          capacity: parseInt(capacity) || 30,
        },
      });
      setOpen(false);
      setTitle("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const canCreate = user?.role === "trainer" || user?.role === "admin";

  return (
    <SafeAreaView edges={["top"]} style={s.root} testID="schedule-screen">
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.title}>{t("schedule")}</Text>
        <SectionHeader
          title={t("sessions")}
          right={
            canCreate ? (
              <Button label={t("new_session")} variant="secondary" onPress={() => setOpen(true)} testID="new-session-button" />
            ) : undefined
          }
        />

        {sessions.length === 0 ? (
          <Card>
            <Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text>
          </Card>
        ) : (
          sessions.map((sess) => {
            const isUpcoming = new Date(sess.starts_at).getTime() > Date.now();
            return (
              <View key={sess.session_id} style={{ marginBottom: 12 }}>
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: "900" }}>{sess.title}</Text>
                      <Text style={{ color: palette.textSecondary, marginTop: 4 }}>
                        {new Date(sess.starts_at).toLocaleString()} · {sess.duration_min}min
                      </Text>
                      {sess.location ? (
                        <Text style={{ color: palette.textSecondary, marginTop: 4 }}>{sess.location}</Text>
                      ) : null}
                      {sess.trainer_name ? (
                        <Text style={{ color: palette.textSecondary, marginTop: 4 }}>by {sess.trainer_name}</Text>
                      ) : null}
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderWidth: 1,
                        borderColor: palette.border,
                        backgroundColor: isUpcoming ? palette.success : palette.surfaceElev,
                      }}
                    >
                      <Text style={{ color: isUpcoming ? "#FFF" : palette.textPrimary, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>
                        {(isUpcoming ? t("upcoming") : t("history")).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {sess.pin ? (
                    <Text style={{ marginTop: 12, color: palette.textPrimary, fontWeight: "900", letterSpacing: 3, fontSize: 18 }}>
                      PIN · {sess.pin}
                    </Text>
                  ) : null}
                </Card>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: palette.bg, padding: 16, borderTopWidth: 2, borderColor: palette.border }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.title}>{t("create_session")}</Text>
              <Text style={s.label}>{t("title")}</Text>
              <TextInput
                testID="new-session-title"
                value={title}
                onChangeText={setTitle}
                style={s.input}
                placeholder="e.g. Morning Strength"
                placeholderTextColor={palette.textSecondary}
              />
              <Text style={s.label}>{t("starts_at")}</Text>
              <TextInput
                testID="new-session-starts-at"
                value={startsAt}
                onChangeText={setStartsAt}
                style={s.input}
                placeholder="2026-03-01T08:00:00Z"
                placeholderTextColor={palette.textSecondary}
              />
              <Text style={s.label}>{t("duration")}</Text>
              <TextInput
                testID="new-session-duration"
                value={duration}
                onChangeText={setDuration}
                keyboardType="numeric"
                style={s.input}
              />
              <Text style={s.label}>{t("location")}</Text>
              <TextInput
                testID="new-session-location"
                value={location}
                onChangeText={setLocation}
                style={s.input}
              />
              <Text style={s.label}>{t("capacity")}</Text>
              <TextInput
                testID="new-session-capacity"
                value={capacity}
                onChangeText={setCapacity}
                keyboardType="numeric"
                style={s.input}
              />
              {error ? <Text style={{ color: palette.danger, marginBottom: 8 }}>{error}</Text> : null}
              <Button label={t("submit")} onPress={create} loading={busy} testID="create-session-submit" />
              <View style={{ height: 8 }} />
              <Button label={t("cancel")} variant="secondary" onPress={() => setOpen(false)} testID="create-session-cancel" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
