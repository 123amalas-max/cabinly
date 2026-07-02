// Seat picker screen — BookMyShow-style.
// Shows all seats grouped by section (AC / Non-AC), with row labels and
// visual state: available (teal outline), selected (teal filled), booked (grey filled).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { colors, spacing, radius, typography } from "@/src/theme";

type Section = { name: "AC" | "Non-AC"; rows: number; cols: number; price_per_hour: number };

type Cabin = {
  id: string;
  name: string;
  sections: Section[];
};

type Availability = {
  booked_seats: string[];
};

const rowLetter = (i: number) => String.fromCharCode("A".charCodeAt(0) + i);
const seatId = (section: string, row: number, col: number) =>
  `${section}-${rowLetter(row)}${col}`;

export default function NewBookingSeatPicker() {
  const { cabinId, date, slot } = useLocalSearchParams<{
    cabinId: string;
    date: string;
    slot: string;
  }>();

  const [cabin, setCabin] = useState<Cabin | null>(null);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!cabinId || !date || !slot) return;
    try {
      const c = await api<Cabin>(`/cabins/${cabinId}`);
      setCabin(c);
      const a = await api<Availability>(
        `/cabins/${cabinId}/availability?date=${encodeURIComponent(date)}&time_slot=${encodeURIComponent(slot)}`,
      );
      setBooked(new Set(a.booked_seats));
    } catch (e: any) {
      setError(e.message || "Failed to load seats");
    } finally {
      setLoading(false);
    }
  }, [cabinId, date, slot]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    if (booked.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const total = useMemo(() => {
    if (!cabin) return 0;
    const prices: Record<string, number> = {};
    for (const s of cabin.sections) prices[s.name] = s.price_per_hour;
    let sum = 0;
    for (const id of selected) {
      const section = id.startsWith("Non-AC-") ? "Non-AC" : "AC";
      sum += (prices[section] || 0) * 2; // 2-hour slot
    }
    return sum;
  }, [selected, cabin]);

  const confirm = async () => {
    if (selected.size === 0 || !cabinId || !date || !slot) return;
    setConfirming(true);
    setError(null);
    try {
      await api("/bookings", {
        method: "POST",
        body: {
          cabin_id: cabinId,
          date,
          time_slot: slot,
          seats: Array.from(selected),
        },
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Failed to book");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.successTitle}>Booking confirmed!</Text>
          <Text style={styles.successSub}>
            {cabin?.name} · {date} · {slot}
          </Text>
          <Text style={styles.successSub}>
            Seats: {Array.from(selected).join(", ")} · Total ₹{total.toFixed(0)}
          </Text>
          <Pressable
            testID="seat-success-view-bookings"
            style={[styles.confirmBtn, { alignSelf: "stretch", marginTop: spacing.xl }]}
            onPress={() => router.replace("/(tabs)/bookings")}
          >
            <Text style={styles.confirmBtnText}>View my bookings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          testID="seat-back-button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{cabin?.name}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {date} · {slot}
          </Text>
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSeat, styles.seatAvailable]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSeat, styles.seatSelected]} />
          <Text style={styles.legendText}>Selected</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSeat, styles.seatBooked]} />
          <Text style={styles.legendText}>Booked</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {cabin?.sections.map((section) => (
          <View key={section.name} style={styles.sectionBlock} testID={`section-${section.name}`}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons
                  name={section.name === "AC" ? "snow" : "leaf"}
                  size={16}
                  color={colors.brandPrimary}
                />
                <Text style={styles.sectionTitle}>{section.name} Section</Text>
              </View>
              <Text style={styles.sectionPrice}>
                ₹{section.price_per_hour.toFixed(0)}/hr
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.seatGridWrap}
            >
              <View>
                {Array.from({ length: section.rows }).map((_, r) => (
                  <View key={r} style={styles.seatRow}>
                    <Text style={styles.rowLabel}>{rowLetter(r)}-</Text>
                    {Array.from({ length: section.cols }).map((__, c) => {
                      const id = seatId(section.name, r, c + 1);
                      const isBooked = booked.has(id);
                      const isSelected = selected.has(id);
                      return (
                        <Pressable
                          key={id}
                          testID={`seat-${id}`}
                          onPress={() => toggle(id)}
                          disabled={isBooked}
                          style={[
                            styles.seat,
                            isBooked
                              ? styles.seatBooked
                              : isSelected
                              ? styles.seatSelected
                              : styles.seatAvailable,
                          ]}
                        >
                          <Text
                            style={[
                              styles.seatText,
                              isBooked
                                ? styles.seatTextBooked
                                : isSelected
                                ? styles.seatTextSelected
                                : styles.seatTextAvailable,
                            ]}
                          >
                            {c + 1}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.classCaption}>
              <Text style={styles.classCaptionText}>
                {section.name === "AC" ? "AC Class" : "Non-AC Class"} :{" "}
                <Text style={styles.classCaptionPrice}>₹{section.price_per_hour.toFixed(0)}</Text>
              </Text>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
        <View style={styles.screenIndicator}>
          <View style={styles.screenBar} />
          <Text style={styles.screenLabel}>Entrance</Text>
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.stickyFooter}>
        <View style={styles.stickyInner}>
          <View>
            <Text style={styles.footerSmall}>
              {selected.size} {selected.size === 1 ? "seat" : "seats"} · 2 hours
            </Text>
            <Text style={styles.footerBig}>₹{total.toFixed(0)}</Text>
          </View>
          <Pressable
            testID="confirm-seats-button"
            disabled={selected.size === 0 || confirming}
            style={[styles.confirmBtn, (selected.size === 0 || confirming) && { opacity: 0.5 }]}
            onPress={confirm}
          >
            {confirming ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.confirmBtnText}>
                Confirm {selected.size > 0 ? `(${selected.size})` : ""}
              </Text>
            )}
          </Pressable>
        </View>
        {error ? (
          <Text style={styles.error} testID="seat-error">{error}</Text>
        ) : null}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const SEAT_SIZE = 32;
const SEAT_GAP = 6;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centerScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: { width: 32, height: 32, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: typography.body, fontWeight: "700", color: colors.onSurface },
  headerSubtitle: { fontSize: typography.tiny, color: colors.onSurfaceSecondary, marginTop: 1 },
  legendRow: {
    flexDirection: "row",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSeat: { width: 20, height: 20, borderRadius: 4 },
  legendText: { fontSize: typography.tiny, color: colors.onSurfaceSecondary, fontWeight: "600" },
  scrollBody: { paddingVertical: spacing.lg, paddingBottom: 120 },
  sectionBlock: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: typography.body, fontWeight: "700", color: colors.onSurface },
  sectionPrice: { fontSize: typography.small, fontWeight: "700", color: colors.brandPrimary },
  seatGridWrap: { paddingHorizontal: spacing.xl },
  seatRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SEAT_GAP,
  },
  rowLabel: {
    width: 28,
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    textAlign: "right",
    marginRight: spacing.sm,
  },
  seat: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: 6,
    marginRight: SEAT_GAP,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  seatAvailable: {
    backgroundColor: colors.surface,
    borderColor: colors.brandPrimary,
  },
  seatSelected: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  seatBooked: {
    backgroundColor: colors.borderStrong,
    borderColor: colors.borderStrong,
  },
  seatText: { fontSize: 10, fontWeight: "700" },
  seatTextAvailable: { color: colors.brandPrimary },
  seatTextSelected: { color: colors.onBrandPrimary },
  seatTextBooked: { color: colors.muted },
  classCaption: {
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: "center",
  },
  classCaptionText: { fontSize: typography.small, fontWeight: "700", color: colors.onSurface },
  classCaptionPrice: { color: colors.brandPrimary },
  screenIndicator: { alignItems: "center", marginTop: spacing.md },
  screenBar: {
    width: 260,
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.brandTertiary,
  },
  screenLabel: {
    marginTop: 4,
    fontSize: typography.tiny,
    color: colors.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stickyInner: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerSmall: { color: colors.muted, fontSize: typography.tiny, textTransform: "uppercase", fontWeight: "700" },
  footerBig: { fontSize: typography.h2, fontWeight: "800", color: colors.onSurface },
  confirmBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 160,
  },
  confirmBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: typography.body },
  error: {
    color: colors.error,
    fontSize: typography.small,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    marginTop: spacing.lg,
    fontSize: typography.h2,
    fontWeight: "800",
    color: colors.onSurface,
  },
  successSub: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
});
