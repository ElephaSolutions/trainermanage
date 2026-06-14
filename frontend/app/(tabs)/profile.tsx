import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { http, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Button, Card, SectionHeader, screenStyles } from "@/src/lib/ui";

export default function ProfileScreen() {
  const { palette } = useTheme();
  const { t, lang, setLang } = useI18n();
  const { scheme, mode, setMode } = useTheme();
  const { user, signOut, updateProfile, token } = useAuth();
  const s = screenStyles(palette);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [extra, setExtra] = useState(user?.role === "trainer" ? (user?.specialization || "") : (user?.goals || ""));
  const [saved, setSaved] = useState(false);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [pickTrainer, setPickTrainer] = useState<string>("");
  const [rating, setRating] = useState(5);
  const [quality, setQuality] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [comment, setComment] = useState("");
  const [fbBusy, setFbBusy] = useState(false);

  const save = async () => {
    const payload: any = { name, phone };
    if (user?.role === "trainer") payload.specialization = extra;
    if (user?.role === "student") payload.goals = extra;
    await updateProfile(payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const loadFeedback = useCallback(async () => {
    if (!token) return;
    const tr = await http<any[]>("/users/trainers", { token });
    setTrainers(tr);
    const fb = await http<any[]>("/feedback", { token });
    setFeedbacks(fb);
    if (tr.length && !pickTrainer) setPickTrainer(tr[0].user_id);
  }, [token, pickTrainer]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const submitFeedback = async () => {
    if (!pickTrainer) return;
    try {
      setFbBusy(true);
      await http("/feedback", {
        method: "POST",
        token,
        body: {
          trainer_id: pickTrainer,
          rating,
          quality,
          communication,
          punctuality,
          comment,
        },
      });
      setFeedbackOpen(false);
      setComment("");
      await loadFeedback();
    } finally {
      setFbBusy(false);
    }
  };

  const Stars: React.FC<{ value: number; onChange: (n: number) => void; testID: string }> = ({ value, onChange, testID }) => (
    <View style={{ flexDirection: "row", gap: 6 }} testID={testID}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          testID={`${testID}-${n}`}
          onPress={() => onChange(n)}
          style={{
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: palette.border,
            backgroundColor: n <= value ? palette.warning : palette.surface,
          }}
        >
          <Text style={{ fontWeight: "900", color: n <= value ? "#09090B" : palette.textPrimary }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={s.root} testID="profile-screen">
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t("profile")}</Text>
        <Text style={s.subtitle}>{user?.email}</Text>

        <Card>
          <Text style={s.label}>{t("full_name")}</Text>
          <TextInput testID="edit-name-input" value={name} onChangeText={setName} style={s.input} placeholderTextColor={palette.textSecondary} />
          <Text style={s.label}>{t("phone")}</Text>
          <TextInput testID="edit-phone-input" value={phone} onChangeText={setPhone} style={s.input} placeholderTextColor={palette.textSecondary} />
          {user?.role !== "admin" && (
            <>
              <Text style={s.label}>{user?.role === "trainer" ? t("specialization") : t("goals")}</Text>
              <TextInput testID="edit-extra-input" value={extra} onChangeText={setExtra} style={s.input} placeholderTextColor={palette.textSecondary} />
            </>
          )}
          <Button label={t("submit")} onPress={save} testID="save-profile-button" />
          {saved ? <Text testID="profile-saved" style={{ color: palette.success, marginTop: 8, fontWeight: "700" }}>{t("saved")}</Text> : null}
        </Card>

        <View style={{ height: 16 }} />
        <SectionHeader title={t("language")} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="English" variant={lang === "en" ? "primary" : "secondary"} onPress={() => setLang("en")} testID="lang-en-button" style={{ flex: 1 }} />
          <Button label="தமிழ்" variant={lang === "ta" ? "primary" : "secondary"} onPress={() => setLang("ta")} testID="lang-ta-button" style={{ flex: 1 }} />
        </View>

        <View style={{ height: 16 }} />
        <SectionHeader title={t("theme")} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label={t("light")} variant={mode === "light" ? "primary" : "secondary"} onPress={() => setMode("light")} testID="theme-light-button" style={{ flex: 1 }} />
          <Button label={t("dark")} variant={mode === "dark" ? "primary" : "secondary"} onPress={() => setMode("dark")} testID="theme-dark-button" style={{ flex: 1 }} />
          <Button label="Auto" variant={mode === "auto" ? "primary" : "secondary"} onPress={() => setMode("auto")} testID="theme-auto-button" style={{ flex: 1 }} />
        </View>

        <View style={{ height: 16 }} />
        <SectionHeader
          title={t("feedback")}
          right={user?.role === "student" ? (
            <Button label={t("open_feedback")} variant="secondary" onPress={() => setFeedbackOpen(true)} testID="open-feedback-button" />
          ) : undefined}
        />
        {feedbacks.length === 0 ? (
          <Card><Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text></Card>
        ) : (
          feedbacks.map((f) => (
            <View key={f.feedback_id} style={{ marginBottom: 8 }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: "800" }}>
                    {user?.role === "trainer" ? f.student_name : f.trainer_name}
                  </Text>
                  <Text style={{ color: palette.warning, fontWeight: "900" }}>{"★".repeat(f.rating)}</Text>
                </View>
                {f.comment ? <Text style={{ color: palette.textSecondary, marginTop: 4 }}>{f.comment}</Text> : null}
                <Text style={{ color: palette.textSecondary, marginTop: 4, fontSize: 11, letterSpacing: 1 }}>
                  Q{f.quality} · C{f.communication} · P{f.punctuality}
                </Text>
              </Card>
            </View>
          ))
        )}

        <View style={{ height: 24 }} />
        <Button label={t("logout")} variant="danger" onPress={async () => { await signOut(); router.replace("/login"); }} testID="logout-button" />
      </ScrollView>

      <Modal visible={feedbackOpen} animationType="slide" transparent onRequestClose={() => setFeedbackOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: palette.bg, padding: 16, borderTopWidth: 2, borderColor: palette.border, maxHeight: "92%" }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.title}>{t("submit_feedback")}</Text>
              <Text style={s.label}>{t("select_trainer")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {trainers.map((tr) => (
                  <TouchableOpacity
                    key={tr.user_id}
                    testID={`pick-trainer-${tr.user_id}`}
                    onPress={() => setPickTrainer(tr.user_id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 2,
                      borderColor: palette.border,
                      backgroundColor: pickTrainer === tr.user_id ? palette.primary : palette.surface,
                    }}
                  >
                    <Text style={{ color: pickTrainer === tr.user_id ? "#FFF" : palette.textPrimary, fontWeight: "700" }}>
                      {tr.name || tr.email}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t("rating")}</Text>
              <Stars value={rating} onChange={setRating} testID="stars-rating" />
              <Text style={s.label}>{t("quality")}</Text>
              <Stars value={quality} onChange={setQuality} testID="stars-quality" />
              <Text style={s.label}>{t("communication")}</Text>
              <Stars value={communication} onChange={setCommunication} testID="stars-communication" />
              <Text style={s.label}>{t("punctuality")}</Text>
              <Stars value={punctuality} onChange={setPunctuality} testID="stars-punctuality" />

              <Text style={s.label}>{t("comment")}</Text>
              <TextInput
                testID="feedback-comment-input"
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={3}
                style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholderTextColor={palette.textSecondary}
              />

              <Button label={t("submit_feedback")} onPress={submitFeedback} loading={fbBusy} testID="submit-feedback-button" />
              <View style={{ height: 8 }} />
              <Button label={t("cancel")} variant="secondary" onPress={() => setFeedbackOpen(false)} testID="cancel-feedback-button" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
