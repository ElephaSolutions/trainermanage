import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { http, useAuth, useI18n, useTheme } from "@/src/lib/app";
import { Button, Card, SectionHeader, screenStyles } from "@/src/lib/ui";

export default function Notifications() {
  const { palette } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const s = screenStyles(palette);
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const n = await http<any[]>("/notifications", { token });
    setItems(n);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const readAll = async () => {
    await http("/notifications/read-all", { method: "POST", token });
    await load();
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={s.root} testID="notifications-screen">
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} testID="back-button" style={{ padding: 8 }}>
            <Ionicons name="arrow-back" color={palette.textPrimary} size={22} />
          </TouchableOpacity>
          <Button label="Read all" variant="secondary" onPress={readAll} testID="read-all-button" />
        </View>
        <Text style={s.title}>{t("notifications")}</Text>

        {items.length === 0 ? (
          <Card>
            <Text style={{ color: palette.textSecondary }}>{t("no_data")}</Text>
          </Card>
        ) : (
          items.map((n) => (
            <View key={n.notif_id} style={{ marginBottom: 8 }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.textPrimary, fontWeight: "900" }}>{n.title}</Text>
                  {!n.read ? (
                    <View style={{ width: 8, height: 8, backgroundColor: palette.primary }} />
                  ) : null}
                </View>
                <Text style={{ color: palette.textSecondary, marginTop: 4 }}>{n.body}</Text>
                <Text style={{ color: palette.textSecondary, marginTop: 4, fontSize: 11 }}>
                  {new Date(n.created_at).toLocaleString()}
                </Text>
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
