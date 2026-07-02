// Bookings tab.
// - Student: "My Bookings" with cancel + digital pass + review + chat.
// - Owner: "Bookings on my cabins" with chat.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius, typography } from "@/src/theme";

type Booking = {
  id: string;
  cabin_id: string;
  cabin_name: string;
  cabin_city: string;
  cabin_image: string;
  cabin_type: "AC" | "Non-AC";
  user_name: string;
  date: string;
  time_slot: string;
  price: number;
  status: string;
  can_review: boolean;
  has_review: boolean;
};

export default function BookingsTab() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Review modal state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const path = isOwner ? "/bookings/owner" : "/bookings/my";
      const list = await api<Booking[]>(path);
      setBookings(list);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOwner]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onCancel = async (id: string) => {
    try {
      await api(`/bookings/${id}`, { method: "DELETE" });
      fetchData();
    } catch { /* silent */ }
  };

  const openReview = (id: string) => {
    setReviewingId(id);
    setReviewRating(5);
    setReviewText("");
    setReviewError(null);
  };

  const submitReview = async () => {
    if (!reviewingId) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      await api(`/bookings/${reviewingId}/review`, {
        method: "POST",
        body: { rating: reviewRating, text: reviewText.trim() },
      });
      setReviewingId(null);
      await fetchData();
    } catch (e: any) {
      setReviewError(e.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isOwner ? "Bookings on my cabins" : "My Bookings"}</Text>
        <Text style={styles.subtitle}>
          {isOwner ? "Reservations made by students." : "Your digital passes, chats and reviews."}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
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
                <View style={styles.passTitleRow}>
                  <Text style={styles.passTitle}>{item.cabin_name}</Text>
                  <View style={styles.typeBadge}>
                    <Ionicons name={item.cabin_type === "AC" ? "snow" : "leaf"} size={12} color={colors.onSurface} />
                    <Text style={styles.typeBadgeText}>{item.cabin_type}</Text>
                  </View>
                </View>
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
                  {item.has_review && (
                    <View style={styles.reviewedPill}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                      <Text style={styles.reviewedText}>Reviewed</Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    testID={`chat-booking-${item.id}`}
                    style={styles.secondaryBtn}
                    onPress={() => router.push(`/chat/${item.id}`)}
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.brandPrimary} />
                    <Text style={styles.secondaryBtnText}>Chat</Text>
                  </Pressable>

                  {!isOwner && item.can_review && (
                    <Pressable
                      testID={`review-booking-${item.id}`}
                      style={styles.secondaryBtn}
                      onPress={() => openReview(item.id)}
                    >
                      <Ionicons name="star" size={16} color={colors.warning} />
                      <Text style={styles.secondaryBtnText}>Leave a review</Text>
                    </Pressable>
                  )}

                  {!isOwner && item.status !== "cancelled" && (
                    <Pressable
                      testID={`cancel-booking-${item.id}`}
                      style={styles.dangerBtn}
                      onPress={() => onCancel(item.id)}
                    >
                      <Text style={styles.dangerText}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Review modal */}
      <Modal
        visible={!!reviewingId}
        animationType="slide"
        transparent
        onRequestClose={() => setReviewingId(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Rate your visit</Text>
              <Pressable testID="close-review-sheet" onPress={() => setReviewingId(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.sheetHint}>How was your experience? Your rating helps other students.</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  testID={`star-${n}`}
                  onPress={() => setReviewRating(n)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={n <= reviewRating ? "star" : "star-outline"}
                    size={40}
                    color={n <= reviewRating ? colors.warning : colors.borderStrong}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="review-text-input"
              style={styles.reviewInput}
              placeholder="Share a few words about your visit (optional)"
              placeholderTextColor={colors.muted}
              multiline
              value={reviewText}
              onChangeText={setReviewText}
            />
            {reviewError && (
              <Text style={styles.error} testID="review-error">{reviewError}</Text>
            )}
            <Pressable
              testID="submit-review-button"
              style={[styles.primaryBtn, submittingReview && { opacity: 0.6 }]}
              onPress={submitReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Submit review</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  passTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  passTitle: { flex: 1, fontSize: typography.h3, fontWeight: "700", color: colors.onSurface },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
  },
  typeBadgeText: { color: colors.onSurface, fontSize: typography.tiny, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metaText: { color: colors.onSurfaceSecondary, fontSize: typography.small },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  detailsRow: { flexDirection: "row", justifyContent: "space-between" },
  detailCell: { flex: 1 },
  detailLabel: { fontSize: typography.tiny, color: colors.muted, textTransform: "uppercase", fontWeight: "700" },
  detailValue: { fontSize: typography.body, color: colors.onSurface, fontWeight: "600", marginTop: 2 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  statusConfirmed: { backgroundColor: colors.brandTertiary },
  statusCancelled: { backgroundColor: colors.surfaceTertiary },
  statusText: { fontSize: typography.tiny, fontWeight: "700" },
  statusTextConfirmed: { color: colors.onBrandTertiary },
  statusTextCancelled: { color: colors.muted },
  reviewedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  reviewedText: { color: colors.success, fontSize: typography.tiny, fontWeight: "700" },
  actionRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: typography.small, fontWeight: "700" },
  dangerBtn: {
    marginLeft: "auto",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dangerText: { color: colors.error, fontSize: typography.small, fontWeight: "700" },
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
  sheetHint: { color: colors.onSurfaceSecondary, fontSize: typography.small, marginTop: spacing.xs },
  starRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.body,
    minHeight: 90,
    textAlignVertical: "top",
    color: colors.onSurface,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: typography.body },
  error: { color: colors.error, fontSize: typography.small, marginTop: spacing.sm },
});
