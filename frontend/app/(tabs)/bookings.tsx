// Bookings tab.
// - Student: "My Bookings" with cancel + digital pass card.
// - Owner: "Bookings on my cabins" (read-only).
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius, typography } from "@/src/theme";

type Booking = {
  id: string;
  cabin_id: string;
  cabin_name: string;
  cabin_city: string;
  cabin_image: string;
  user_name: string;
  date: string;
  time_slot: string;
  price: number;
  status: string;
};

export default function BookingsTab() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const path = isOwner ? "/bookings/owner" : "/bookings/my";
      const list = await api<Booking[]>(path);
      setBookings(list);
    } catch (e) {
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onCancel = async (id: string) => {
    try {
      await api(`/bookings/${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isOwner ? "Bookings on my cabins" : "My Bookings"}</Text>
        <Text style={styles.subtitle}>
          {isOwner ? "Reservations made by students." : "Your digital passes and upcoming visits."}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center} testID="bookings-empty">
          <Ionicons name="calendar-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyText}>
            {isOwner ? "No one has booked your cabins yet." : "Find a cabin from the Home tab to get started."}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="bookings-list"
          data={bookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
          renderItem={({ item }) => (
            <View style={styles.pass} testID={`booking-card-${item.id}`}>
              <Image source={{ uri: item.cabin_image }} style={styles.passImage} contentFit="cover" />
              <View style={styles.passBody}>
                <Text style={styles.passTitle}>{item.cabin_name}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="location" size={14} color={colors.muted} />
                  <Text style={styles.metaText}>{item.cabin_city}</Text>
                </View>
                {isOwner && (
                  <View style={styles.metaRow}>
                    <Ionicons name="person" size={14} color={colors.muted} />
                    <Text style={styles.metaText}>{item.user_name}</Text>
                  </View>
                )}
                <View style={styles.divider} />
                <View style={styles.detailsRow}>
                  <View style={styles.detailCell}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{item.date}</Text>
                  </View>
                  <View style={styles.detailCell}>
                    <Text style={styles.detailLabel}>Time</Text>
                    <Text style={styles.detailValue}>{item.time_slot}</Text>
                  </View>
                  <View style={styles.detailCell}>
                    <Text style={styles.detailLabel}>Price</Text>
                    <Text style={styles.detailValue}>₹{item.price.toFixed(0)}</Text>
                  </View>
                </View>
                <View style={styles.footerRow}>
                  <View
                    style={[
                      styles.statusPill,
                      item.status === "cancelled" ? styles.statusCancelled : styles.statusConfirmed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        item.status === "cancelled" ? styles.statusTextCancelled : styles.statusTextConfirmed,
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                  {!isOwner && item.status !== "cancelled" && (
                    <Pressable
                      testID={`cancel-booking-${item.id}`}
                      style={styles.cancelBtn}
                      onPress={() => onCancel(item.id)}
                    >
                      <Text style={styles.cancelText}>Cancel booking</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: typography.h2, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: typography.small },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: typography.h3, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  emptyText: { textAlign: "center", color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  pass: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  passImage: { width: "100%", height: 120, backgroundColor: colors.surfaceTertiary },
  passBody: { padding: spacing.lg },
  passTitle: { fontSize: typography.h3, fontWeight: "700", color: colors.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metaText: { color: colors.onSurfaceSecondary, fontSize: typography.small },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  detailsRow: { flexDirection: "row", justifyContent: "space-between" },
  detailCell: { flex: 1 },
  detailLabel: { fontSize: typography.tiny, color: colors.muted, textTransform: "uppercase", fontWeight: "700" },
  detailValue: { fontSize: typography.body, color: colors.onSurface, fontWeight: "600", marginTop: 2 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  statusConfirmed: { backgroundColor: colors.brandTertiary },
  statusCancelled: { backgroundColor: colors.surfaceTertiary },
  statusText: { fontSize: typography.tiny, fontWeight: "700" },
  statusTextConfirmed: { color: colors.onBrandTertiary },
  statusTextCancelled: { color: colors.muted },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.error, fontSize: typography.small, fontWeight: "700" },
});
