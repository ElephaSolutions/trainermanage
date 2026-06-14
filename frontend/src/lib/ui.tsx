import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle, TextStyle, ActivityIndicator } from "react-native";
import { useTheme } from "@/src/lib/app";

interface BtnProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<BtnProps> = ({
  label,
  onPress,
  variant = "primary",
  testID,
  disabled,
  loading,
  style,
}) => {
  const { palette } = useTheme();
  const bg =
    variant === "primary"
      ? palette.primary
      : variant === "danger"
      ? palette.danger
      : variant === "ghost"
      ? "transparent"
      : palette.surfaceElev;
  const fg = variant === "ghost" ? palette.textPrimary : variant === "secondary" ? palette.textPrimary : "#FFFFFF";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderRadius: 0,
          borderWidth: 2,
          borderColor: palette.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
};

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle; testID?: string }> = ({
  children,
  style,
  testID,
}) => {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: palette.surface,
          padding: 16,
          borderWidth: 2,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const KpiTile: React.FC<{ label: string; value: string | number; testID?: string }> = ({
  label,
  value,
  testID,
}) => {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: palette.surface,
        padding: 16,
        borderWidth: 2,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 2 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: palette.textPrimary, fontSize: 28, fontWeight: "900", marginTop: 8 }}>{value}</Text>
    </View>
  );
};

export const Badge: React.FC<{ label: string; tone: "present" | "absent" | "late" | "info" }> = ({ label, tone }) => {
  const { palette } = useTheme();
  const bg =
    tone === "present"
      ? palette.success
      : tone === "absent"
      ? palette.danger
      : tone === "late"
      ? palette.warning
      : palette.surfaceElev;
  const fg = tone === "late" ? "#09090B" : "#FFFFFF";
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: fg, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
};

export const Divider: React.FC = () => {
  const { palette } = useTheme();
  return <View style={{ height: 2, backgroundColor: palette.border, marginVertical: 16 }} />;
};

export const SectionHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <Text style={{ color: palette.textPrimary, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 }}>{title}</Text>
      {right}
    </View>
  );
};

export const screenStyles = (palette: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    container: { padding: 16, paddingBottom: 96 },
    title: { color: palette.textPrimary, fontSize: 32, fontWeight: "900", letterSpacing: -1, marginBottom: 4 },
    subtitle: { color: palette.textSecondary, fontSize: 14, marginBottom: 16 },
    row: { flexDirection: "row", gap: 12 },
    input: {
      backgroundColor: palette.bg,
      borderWidth: 2,
      borderColor: palette.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 14,
      color: palette.textPrimary,
      marginBottom: 12,
    } as TextStyle,
    label: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
      marginBottom: 6,
      marginTop: 8,
    },
  });
