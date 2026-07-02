// Profile tab — role switcher + logout.
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth, Role } from "@/src/auth-context";
import { colors, spacing, radius, typography } from "@/src/theme";

const AVATAR_URL = "https://images.unsplash.com/photo-1740252117013-4fb21771e7ca";

export default function ProfileTab() {
  const { user, signOut, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  if (!user) return null;

  const changeRole = async (r: Role) => {
    if (r === user.role) return;
    setSwitching(true);
    try {
      await switchRole(r);
    } catch (e) {
      // silent
    } finally {
      setSwitching(false);
    }
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <Image source={{ uri: AVATAR_URL }} style={styles.avatar} contentFit="cover" />
        </View>
        <Text style={styles.name} testID="profile-name">
          {user.name}
        </Text>
        <Text style={styles.email} testID="profile-email">
          {user.email}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>I am using Cabinly as a</Text>
        <View style={styles.roleRow}>
          <Pressable
            testID="role-switch-student"
            onPress={() => changeRole("student")}
            style={[styles.roleChip, user.role === "student" && styles.roleChipActive]}
            disabled={switching}
          >
            <Ionicons
              name="school"
              size={20}
              color={user.role === "student" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
            />
            <Text
              style={[styles.roleText, user.role === "student" && styles.roleTextActive]}
            >
              Student
            </Text>
          </Pressable>
          <Pressable
            testID="role-switch-owner"
            onPress={() => changeRole("owner")}
            style={[styles.roleChip, user.role === "owner" && styles.roleChipActive]}
            disabled={switching}
          >
            <Ionicons
              name="business"
              size={20}
              color={user.role === "owner" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
            />
            <Text style={[styles.roleText, user.role === "owner" && styles.roleTextActive]}>
              Cabin Owner
            </Text>
          </Pressable>
        </View>
        {switching && (
          <View style={{ marginTop: spacing.md }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        )}
        <Text style={styles.helper}>
          Switch between roles anytime. Owners can add cabins; Students can book.
        </Text>
      </View>

      <View style={styles.listCard}>
        <Row icon="help-circle-outline" label="Help & Support" testID="row-support" />
        <View style={styles.rowDivider} />
        <Row icon="document-text-outline" label="Terms & Privacy" testID="row-terms" />
        <View style={styles.rowDivider} />
        <Pressable
          testID="logout-button"
          style={styles.row}
          onPress={doSignOut}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={[styles.rowLabel, { color: colors.error }]}>Log out</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ icon, label, testID }: { icon: any; label: string; testID: string }) {
  return (
    <Pressable style={styles.row} testID={testID}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color={colors.onSurfaceSecondary} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { alignItems: "center", paddingTop: spacing.xl, paddingHorizontal: spacing.xl },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.brandTertiary,
  },
  avatar: { width: "100%", height: "100%" },
  name: { marginTop: spacing.md, fontSize: typography.h2, fontWeight: "700", color: colors.onSurface },
  email: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: typography.small },
  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: typography.small, fontWeight: "700", color: colors.onSurfaceSecondary, marginBottom: spacing.md },
  roleRow: { flexDirection: "row", gap: spacing.md },
  roleChip: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  roleText: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  roleTextActive: { color: colors.onBrandPrimary },
  helper: { fontSize: typography.tiny, color: colors.muted, marginTop: spacing.md },
  listCard: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowLabel: { color: colors.onSurface, fontSize: typography.body, fontWeight: "600" },
  rowDivider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg },
});
