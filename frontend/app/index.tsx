import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth, useTheme } from "@/src/lib/app";

export default function Index() {
  const { user, loading } = useAuth();
  const { palette } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!user.role) return <Redirect href="/role-select" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
