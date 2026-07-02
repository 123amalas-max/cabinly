// Sign up screen.
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth, Role } from "@/src/auth-context";
import { colors, spacing, radius, typography } from "@/src/theme";

export default function Signup() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!name || !email || !password) {
      setError("Please fill all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(name.trim(), email.trim(), password, role);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            testID="back-to-login-button"
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join Cabinly to find your focus space.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              testID="signup-name-input"
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signup-email-input"
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="signup-password-input"
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Text style={styles.label}>I am a…</Text>
            <View style={styles.roleRow}>
              <Pressable
                testID="signup-role-student"
                onPress={() => setRole("student")}
                style={[styles.roleChip, role === "student" && styles.roleChipActive]}
              >
                <Ionicons
                  name="school"
                  size={18}
                  color={role === "student" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
                />
                <Text
                  style={[styles.roleText, role === "student" && styles.roleTextActive]}
                >
                  Student
                </Text>
              </Pressable>
              <Pressable
                testID="signup-role-owner"
                onPress={() => setRole("owner")}
                style={[styles.roleChip, role === "owner" && styles.roleChipActive]}
              >
                <Ionicons
                  name="business"
                  size={18}
                  color={role === "owner" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
                />
                <Text style={[styles.roleText, role === "owner" && styles.roleTextActive]}>
                  Cabin Owner
                </Text>
              </Pressable>
            </View>

            {error ? (
              <Text style={styles.error} testID="signup-error">
                {error}
              </Text>
            ) : null}

            <Pressable
              testID="signup-submit-button"
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  backBtn: { marginTop: spacing.md, width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  header: { marginTop: spacing.sm },
  title: { fontSize: typography.h1, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: typography.body, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  form: { marginTop: spacing.lg },
  label: {
    fontSize: typography.small,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: typography.body,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  roleRow: { flexDirection: "row", gap: spacing.md },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  roleChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  roleText: { color: colors.onSurfaceSecondary, fontWeight: "600" },
  roleTextActive: { color: colors.onBrandPrimary },
  primaryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: typography.body, fontWeight: "700" },
  error: { marginTop: spacing.md, color: colors.error, fontSize: typography.small },
});
