import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Role, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Button, Card, screenStyles } from "@/src/lib/ui";

export default function RoleSelect() {
  const { t } = useI18n();
  const { palette } = useTheme();
  const { setRole } = useAuth();
  const s = screenStyles(palette);
  const [role, setLocalRole] = useState<Role>("student");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setBusy(true);
      setError(null);
      const payload: any = { role, full_name: name || undefined, phone: phone || undefined };
      if (role === "trainer") payload.specialization = extra;
      if (role === "student") payload.goals = extra;
      await setRole(payload);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={s.root} testID="role-select-screen">
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t("choose_role")}</Text>
        <Text style={s.subtitle}>Select how you’ll use TrainerTrack.</Text>

        <View style={{ gap: 8, marginBottom: 16 }}>
          {(["admin", "trainer", "student"] as const).map((r) => (
            <Button
              key={r}
              testID={`role-${r}-button`}
              label={t(`role_${r}` as any)}
              variant={role === r ? "primary" : "secondary"}
              onPress={() => setLocalRole(r)}
            />
          ))}
        </View>

        <Card>
          <Text style={s.label}>{t("full_name")}</Text>
          <TextInput
            testID="profile-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            placeholderTextColor={palette.textSecondary}
            style={s.input}
          />
          <Text style={s.label}>{t("phone")}</Text>
          <TextInput
            testID="profile-phone-input"
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 ..."
            placeholderTextColor={palette.textSecondary}
            keyboardType="phone-pad"
            style={s.input}
          />
          {role === "trainer" && (
            <>
              <Text style={s.label}>{t("specialization")}</Text>
              <TextInput
                testID="profile-spec-input"
                value={extra}
                onChangeText={setExtra}
                placeholder="e.g., Strength & Conditioning"
                placeholderTextColor={palette.textSecondary}
                style={s.input}
              />
            </>
          )}
          {role === "student" && (
            <>
              <Text style={s.label}>{t("goals")}</Text>
              <TextInput
                testID="profile-goals-input"
                value={extra}
                onChangeText={setExtra}
                placeholder="e.g., NEET prep, lose 5kg"
                placeholderTextColor={palette.textSecondary}
                style={s.input}
              />
            </>
          )}
        </Card>

        <View style={{ height: 16 }} />
        <Button label={t("continue")} onPress={submit} loading={busy} testID="role-continue-button" />
        {error ? (
          <Text testID="role-error" style={{ color: palette.danger, marginTop: 12, fontWeight: "700" }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
