import { useState } from "react";
import { Image, ImageBackground, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Button, Card } from "@/src/lib/ui";

const BG = "https://images.pexels.com/photos/13451904/pexels-photo-13451904.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const { t } = useI18n();
  const { palette } = useTheme();
  const { signInWithGoogle, signInDev } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");

  const doGoogle = async () => {
    try {
      setBusy(true);
      setError(null);
      await signInWithGoogle();
      router.replace("/role-select");
    } catch (e: any) {
      setError(e?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const doDev = async () => {
    if (!devEmail.trim()) {
      setError("Email required");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await signInDev(devEmail.trim(), devName.trim() || devEmail.split("@")[0]);
      router.replace("/role-select");
    } catch (e: any) {
      setError(e?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }} testID="login-screen">
      <ImageBackground source={{ uri: BG }} style={styles.hero} resizeMode="cover">
        <View style={styles.heroOverlay} />
        <SafeAreaView edges={["top"]} style={{ paddingHorizontal: 24, paddingTop: 24, gap: 8 }}>
          <Text style={styles.brand}>{t("app_name").toUpperCase()}</Text>
          <Text style={styles.heroTitle}>{t("welcome")}</Text>
          <Text style={styles.heroSub}>{t("welcome_sub")}</Text>
        </SafeAreaView>
      </ImageBackground>

      <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Button label={t("sign_in")} onPress={doGoogle} loading={busy} testID="google-sign-in-button" />
          <Card>
            <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }}>
              {t("dev_sign_in").toUpperCase()}
            </Text>
            <TextInput
              testID="dev-email-input"
              placeholder="email@example.com"
              placeholderTextColor={palette.textSecondary}
              value={devEmail}
              onChangeText={setDevEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary, backgroundColor: palette.bg }]}
            />
            <TextInput
              testID="dev-name-input"
              placeholder="Display name (optional)"
              placeholderTextColor={palette.textSecondary}
              value={devName}
              onChangeText={setDevName}
              style={[styles.input, { borderColor: palette.border, color: palette.textPrimary, backgroundColor: palette.bg }]}
            />
            <Button label={t("continue")} variant="secondary" onPress={doDev} loading={busy} testID="dev-login-button" />
          </Card>
          {error ? (
            <Text testID="login-error" style={{ color: palette.danger, fontWeight: "700" }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 320, justifyContent: "flex-end" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  brand: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 4 },
  heroTitle: { color: "#FFFFFF", fontSize: 40, fontWeight: "900", letterSpacing: -1.5, marginTop: 12 },
  heroSub: { color: "#E4E4E7", fontSize: 14, marginTop: 6, marginBottom: 8 },
  input: { borderWidth: 2, padding: 12, marginTop: 10, fontSize: 14 },
});
