// Cabin Details screen.
// Booking flow: modal picks date + time slot, then navigates to seat picker.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { colors, spacing, radius, typography } from "@/src/theme";

type Section = { name: "AC" | "Non-AC"; rows: number; cols: number; price_per_hour: number };

type Cabin = {
  id: string;
  name: string;
  city: string;
  address: string;
  price_per_hour: number;
  amenities: string[];
  description: string;
  image_url: string;
  rating: number;
  type: "AC" | "Non-AC" | "Both";
  sections: Section[];
  avg_rating: number;
  review_count: number;
  is_featured: boolean;
  total_seats: number;
};

type Review = {
  id: string;
  user_name: string;
  rating: number;
  text: string;
  created_at: string;
};

const TIME_SLOTS = [
  "08:00 AM - 10:00 AM",
  "10:00 AM - 12:00 PM",
  "12:00 PM - 02:00 PM",
  "02:00 PM - 04:00 PM",
  "04:00 PM - 06:00 PM",
  "06:00 PM - 08:00 PM",
];

function nextDays(n: number) {
  const days = [] as Date[];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}
const fmtDay = (d: Date) => d.toISOString().slice(0, 10);
const labelDay = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function CabinDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cabin, setCabin] = useState<Cabin | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const days = useMemo(() => nextDays(14), []);

  useEffect(() => {
    (async () => {
      try {
        const c = await api<Cabin>(`/cabins/${id}`);
        setCabin(c);
        const rs = await api<Review[]>(`/cabins/${id}/reviews`);
        setReviews(rs);
      } catch {
        setCabin(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const openBook = () => {
    setSelectedDate(fmtDay(days[0]));
    setSelectedSlot("");
    setShowBook(true);
  };

  const goToSeatPicker = () => {
    if (!cabin || !selectedDate || !selectedSlot) return;
    setShowBook(false);
    router.push({
      pathname: "/booking/new",
      params: { cabinId: cabin.id, date: selectedDate, slot: selectedSlot },
    });
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!cabin) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Ionicons name="alert-circle" size={40} color={colors.muted} />
        <Text style={styles.emptyTitle}>Cabin not found</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View>
          <Image source={{ uri: cabin.image_url }} style={styles.hero} contentFit="cover" />
          <LinearGradient
            colors={["rgba(31,41,55,0.55)", "rgba(31,41,55,0)"]}
            style={styles.heroScrim}
          />
          <SafeAreaView edges={["top"]} style={styles.heroTop}>
            <Pressable
              testID="cabin-back-button"
              style={styles.circleBtn}
              onPress={() => router.back()}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{cabin.name}</Text>
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={12} color={colors.warning} />
              <Text style={styles.ratingText}>
                {cabin.review_count > 0 ? cabin.avg_rating.toFixed(1) : cabin.rating.toFixed(1)}
              </Text>
              {cabin.review_count > 0 && (
                <Text style={styles.ratingCount}> ({cabin.review_count})</Text>
              )}
            </View>
          </View>
          <View style={styles.chipInline}>
            {cabin.sections.map((s) => (
              <View key={s.name} style={styles.typeInline}>
                <Ionicons
                  name={s.name === "AC" ? "snow" : "leaf"}
                  size={12}
                  color={colors.onSurface}
                />
                <Text style={styles.typeInlineText}>
                  {s.name} · ₹{s.price_per_hour.toFixed(0)}/hr
                </Text>
              </View>
            ))}
            {cabin.is_featured && (
              <View style={styles.featuredInline}>
                <Ionicons name="sparkles" size={12} color={colors.onBrandPrimary} />
                <Text style={styles.featuredInlineText}>Featured</Text>
              </View>
            )}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location" size={16} color={colors.muted} />
            <Text style={styles.metaText}>
              {cabin.city} · {cabin.address}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="grid-outline" size={16} color={colors.muted} />
            <Text style={styles.metaText}>
              {cabin.total_seats} seats · {cabin.sections.length}{" "}
              {cabin.sections.length === 1 ? "section" : "sections"}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Amenities</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.amenityRow}>
            {cabin.amenities.map((a) => (
              <View key={a} style={styles.amenityPill}>
                <Ionicons name="checkmark-circle" size={14} color={colors.brandPrimary} />
                <Text style={styles.amenityText}>{a}</Text>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>About this space</Text>
          <Text style={styles.description}>{cabin.description}</Text>

          <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
          {reviews.length === 0 ? (
            <Text style={styles.emptyReviews} testID="reviews-empty">
              No reviews yet. Be the first to review after your visit!
            </Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {reviews.slice(0, 5).map((r) => (
                <View key={r.id} style={styles.reviewCard} testID={`review-${r.id}`}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewName}>{r.user_name}</Text>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons
                          key={n}
                          name={n <= r.rating ? "star" : "star-outline"}
                          size={12}
                          color={colors.warning}
                        />
                      ))}
                    </View>
                  </View>
                  {r.text ? <Text style={styles.reviewText}>{r.text}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.stickyFooter}>
        <View style={styles.stickyInner}>
          <View>
            <Text style={styles.priceSmall}>From</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={styles.priceBig}>₹{cabin.price_per_hour.toFixed(0)}</Text>
              <Text style={styles.priceUnit}> /hour</Text>
            </View>
          </View>
          <Pressable
            testID="book-now-button"
            style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.85 }]}
            onPress={openBook}
          >
            <Text style={styles.bookBtnText}>Book now</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={showBook} animationType="slide" transparent onRequestClose={() => setShowBook(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={{ maxHeight: "90%" }}
            contentContainerStyle={styles.sheet}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select date & time</Text>
              <Pressable
                testID="close-book-sheet"
                onPress={() => setShowBook(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.sheetSection}>Date</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {days.map((d) => {
                const value = fmtDay(d);
                const active = value === selectedDate;
                return (
                  <Pressable
                    key={value}
                    testID={`date-${value}`}
                    onPress={() => setSelectedDate(value)}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                  >
                    <Text style={[styles.dayText, active && styles.dayTextActive]}>{labelDay(d)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.sheetSection}>Time slot</Text>
            <View style={styles.slotsGrid}>
              {TIME_SLOTS.map((s) => {
                const active = s === selectedSlot;
                return (
                  <Pressable
                    key={s}
                    testID={`slot-${s}`}
                    onPress={() => setSelectedSlot(s)}
                    style={[styles.slotChip, active && styles.slotChipActive]}
                  >
                    <Text style={[styles.slotText, active && styles.slotTextActive]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              testID="choose-seats-button"
              disabled={!selectedDate || !selectedSlot}
              style={[
                styles.bookBtn,
                { alignSelf: "stretch", marginTop: spacing.xl },
                (!selectedDate || !selectedSlot) && { opacity: 0.5 },
              ]}
              onPress={goToSeatPicker}
            >
              <Text style={styles.bookBtnText}>Choose seats</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centerScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  emptyTitle: { fontSize: typography.h3, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  hero: { width: "100%", height: 320, backgroundColor: colors.surfaceTertiary },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  heroTop: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  body: { padding: spacing.xl },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { flex: 1, fontSize: typography.h1, fontWeight: "800", color: colors.onSurface },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  ratingText: { color: colors.onBrandTertiary, fontSize: typography.small, fontWeight: "700" },
  ratingCount: { color: colors.onBrandTertiary, fontSize: typography.tiny },
  chipInline: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  typeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  typeInlineText: { color: colors.onSurface, fontSize: typography.tiny, fontWeight: "700" },
  featuredInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  featuredInlineText: { color: colors.onBrandPrimary, fontSize: typography.tiny, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metaText: { color: colors.onSurfaceSecondary, fontSize: typography.small },
  sectionTitle: {
    marginTop: spacing.xl,
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
  },
  amenityRow: { gap: spacing.sm, marginTop: spacing.sm, paddingRight: spacing.xl },
  amenityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  amenityText: { color: colors.onSurface, fontSize: typography.small, fontWeight: "600" },
  description: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, lineHeight: 22, fontSize: typography.body },
  emptyReviews: { marginTop: spacing.sm, color: colors.muted, fontSize: typography.small, fontStyle: "italic" },
  reviewCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.sm,
  },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewName: { fontSize: typography.small, fontWeight: "700", color: colors.onSurface },
  reviewStars: { flexDirection: "row", gap: 2 },
  reviewText: { marginTop: 4, color: colors.onSurfaceSecondary, fontSize: typography.small, lineHeight: 20 },
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
  priceSmall: { color: colors.muted, fontSize: typography.tiny, textTransform: "uppercase", fontWeight: "700" },
  priceBig: { fontSize: typography.h2, fontWeight: "800", color: colors.onSurface },
  priceUnit: { color: colors.onSurfaceSecondary, fontSize: typography.small },
  bookBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  bookBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: typography.body },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: typography.h3, fontWeight: "700", color: colors.onSurface, marginTop: 4 },
  sheetSection: {
    marginTop: spacing.lg,
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
  },
  dayRow: { gap: spacing.sm, paddingRight: spacing.xl, marginTop: spacing.sm },
  dayChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  dayChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  dayText: { color: colors.onSurfaceSecondary, fontSize: typography.small, fontWeight: "600" },
  dayTextActive: { color: colors.onBrandPrimary },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  slotChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  slotChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  slotText: { color: colors.onSurfaceSecondary, fontSize: typography.tiny, fontWeight: "600" },
  slotTextActive: { color: colors.onBrandPrimary },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
});
