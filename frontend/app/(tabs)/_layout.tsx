import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useI18n, useTheme } from "@/src/lib/app";

export default function TabsLayout() {
  const { palette } = useTheme();
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textSecondary,
        tabBarStyle: {
          backgroundColor: palette.bg,
          borderTopColor: palette.border,
          borderTopWidth: 2,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("dashboard"),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: t("attendance"),
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: t("payments"),
          tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t("schedule"),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
