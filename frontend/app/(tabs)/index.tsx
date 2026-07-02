// Home tab.
// - Student view: search bar + city chips + type chips + cabin list (featured first).
// - Owner view: "My Cabins" list + Add Cabin FAB + Boost (mock UPI) modal.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius, typography } from "@/src/theme";

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
  avg_rating: number;
  review_count: number;
  is_featured: boolean;
  total_seats: number;
  sections: { name: string; rows: number; cols: number; price_per_hour: number }[];
};

const CABIN_TYPES: Array<"All" | "AC" | "Non-AC"> = ["All", "AC", "Non-AC"];

export default function HomeTab() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<"All" | "AC" | "Non-AC">("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Boost / mock UPI modal (owner)
  const [boostCabin, setBoostCabin] = useState<Cabin | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (isOwner) {
        const my = await api<Cabin[]>("/cabins/my");
        setCabins(my);
      } else {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (selectedCity && selectedCity !== "All") params.set("city", selectedCity);
        if (selectedType && selectedType !== "All") params.set("type", selectedType);
        const list = await api<Cabin[]>(`/cabins?${params.toString()}`);
        setCabins(list);
        if (cities.length === 0) {
          const cs = await api<string[]>("/cabins/cities");
          setCities(cs);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOwner, query, selectedCity, selectedType, cities.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const openBoost = (c: Cabin) => {
    setBoostCabin(c);
    setPaid(false);
  };

  const confirmBoostPaid = async () => {
    if (!boostCabin) return;
    setPaying(true);
    try {
      await api(`/cabins/${boostCabin.id}/feature/mock-pay`, {
        method: "POST",
        body: { upi_id: "cabinly@upi", days: 7 },
      });
      setPaid(true);
      await fetchData();
    } catch {
      // silent
    } finally {
      setPaying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Hello, {user?.name.split(" ")[0]} 👋</Text>
          <Text style={styles.title}>
            {isOwner ? "My Cabins" : "Find a study cabin"}
          </Text>
        </View>
        {isOwner ? (
          <Pressable
            testID="add-cabin-fab"
            style={styles.fab}
            onPress={() => router.push("/cabin/add")}
          >
            <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          </Pressable>
        ) : null}
      </View>

      {!isOwner && (
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="home-search-input"
              style={styles.searchInput}
              placeholder="Search by name, city or amenity"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={fetchData}
            />
          </View>

          <View style={styles.chipRowWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {["All", ...cities].map((c) => {
                const active = c === selectedCity;
                return (
                  <Pressable
                    key={c}
                    testID={`city-chip-${c.toLowerCase()}`}
                    onPress={() => setSelectedCity(c)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.typeRow}>
            {CABIN_TYPES.map((t) => {
              const active = t === selectedType;
              return (
                <Pressable
                  key={t}
                  testID={`type-chip-${t.toLowerCase()}`}
                  onPress={() => setSelectedType(t)}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                >
                  {t !== "All" && (
                    <Ionicons
                      name={t === "AC" ? "snow" : "leaf"}
                      size={14}
                      color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary}
                    />
                  )}
                  <Text style={[styles.typeText, active && styles.typeTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : cabins.length === 0 ? (
        <View style={styles.center} testID="home-empty">
          <Ionicons name="file-tray-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>{isOwner ? "No cabins yet" : "No cabins found"}</Text>
          <Text style={styles.emptyText}>
            {isOwner ? "Tap + to publish your first cabin." : "Try a different city, type or clear filters."}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="cabin-list"
          data={cabins}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`cabin-card-${item.id}`}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/cabin/${item.id}`)}
            >
              <View>
                <Image source={{ uri: item.image_url }} style={styles.cardImage} contentFit="cover" transition={200} />
                {item.is_featured && (
                  <View style={styles.featuredBadge} testID={`featured-badge-${item.id}`}>
                    <Ionicons name="sparkles" size={12} color={colors.onBrandPrimary} />
                    <Text style={styles.featuredText}>Featured</Text>
                  </View>
                )}
                <View style={styles.typeBadge}>
                  <Ionicons
                    name={item.type === "AC" ? "snow" : item.type === "Non-AC" ? "leaf" : "swap-horizontal"}
                    size={12}
                    color={colors.onSurface}
                  />
                  <Text style={styles.typeBadgeText}>{item.type}</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.ratingText}>
                      {item.review_count > 0 ? item.avg_rating.toFixed(1) : item.rating.toFixed(1)}
                    </Text>
                    {item.review_count > 0 && (
                      <Text style={styles.ratingCount}>({item.review_count})</Text>
                    )}
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <Ionicons name="location" size={14} color={colors.muted} />
                  <Text style={styles.cardMetaText}>{item.city}</Text>
                </View>
                <View style={styles.amenityRow}>
                  {item.amenities.slice(0, 3).map((a) => (
                    <View key={a} style={styles.amenityPill}>
                      <Text style={styles.amenityText}>{a}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.footerRow}>
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text style={styles.priceFrom}>from </Text>
                    <Text style={styles.price}>₹{item.price_per_hour.toFixed(0)}</Text>
                    <Text style={styles.priceUnit}> / hour</Text>
                  </View>
                  {isOwner && (
                    <Pressable
                      testID={`boost-cabin-${item.id}`}
                      onPress={(e) => { e.stopPropagation?.(); openBoost(item); }}
                      style={[styles.boostBtn, item.is_featured && styles.boostBtnActive]}
                    >
                      <Ionicons
                        name="sparkles"
                        size={14}
                        color={item.is_featured ? colors.onBrandPrimary : colors.brandPrimary}
                      />
                      <Text style={[styles.boostText, item.is_featured && styles.boostTextActive]}>
                        {item.is_featured ? "Boosted" : "Boost"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Mock UPI Boost modal */}
      <Modal
        visible={!!boostCabin}
        animationType="slide"
        transparent
        onRequestClose={() => setBoostCabin(null)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={{ maxHeight: "90%" }}
            contentContainerStyle={styles.sheet}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Boost your cabin</Text>
              <Pressable testID="close-boost-sheet" onPress={() => setBoostCabin(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {!paid ? (
              <>
                <Text style={styles.boostSub}>
                  {`Pay ₹99 to feature "${boostCabin?.name}" at the top of student search for 7 days.`}
                </Text>
                <View style={styles.qrCard}>
                  <View style={styles.qrPlaceholder}>
                    <Ionicons name="qr-code" size={100} color={colors.onSurface} />
                  </View>
                  <Text style={styles.upiLabel}>UPI ID</Text>
                  <Text style={styles.upiValue} testID="boost-upi-id">cabinly@upi</Text>
                  <Text style={styles.upiHelp}>
                    Scan the QR or pay to the UPI ID above from any UPI app, then tap the button below.
                  </Text>
                </View>
                <Pressable
                  testID="confirm-paid-button"
                  style={[styles.payBtn, paying && { opacity: 0.6 }]}
                  disabled={paying}
                  onPress={confirmBoostPaid}
                >
                  {paying ? (
                    <ActivityIndicator color={colors.onBrandPrimary} />
                  ) : (
                    <Text style={styles.payBtnText}>{`I've paid ₹99`}</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
                <View style={styles.successCircle}>
                  <Ionicons name="checkmark" size={40} color={colors.onBrandPrimary} />
                </View>
                <Text style={styles.sheetTitle}>Cabin boosted!</Text>
                <Text style={styles.boostSub}>
                  {boostCabin?.name} is now featured for 7 days.
                </Text>
                <Pressable
                  testID="boost-success-close"
                  style={[styles.payBtn, { alignSelf: "stretch", marginTop: spacing.lg }]}
                  onPress={() => setBoostCabin(null)}
                >
                  <Text style={styles.payBtnText}>Done</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { color: colors.onSurfaceSecondary, fontSize: typography.small },
  title: { color: colors.onSurface, fontSize: typography.h2, fontWeight: "700", marginTop: 2 },
  fab: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    marginHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: { flex: 1, fontSize: typography.body, color: colors.onSurface, paddingVertical: 4 },
  chipRowWrap: { height: 56, justifyContent: "center", marginTop: spacing.sm },
  chipRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: typography.small, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  typeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeText: { color: colors.onSurfaceSecondary, fontSize: typography.tiny, fontWeight: "700" },
  typeTextActive: { color: colors.onBrandPrimary },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 180, backgroundColor: colors.surfaceTertiary },
  featuredBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  featuredText: { color: colors.onBrandPrimary, fontSize: typography.tiny, fontWeight: "700" },
  typeBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  typeBadgeText: { color: colors.onSurface, fontSize: typography.tiny, fontWeight: "700" },
  cardBody: { padding: spacing.lg },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { flex: 1, fontSize: typography.h3, fontWeight: "700", color: colors.onSurface },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ratingText: { color: colors.onBrandTertiary, fontSize: typography.tiny, fontWeight: "700" },
  ratingCount: { color: colors.onBrandTertiary, fontSize: typography.tiny },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardMetaText: { color: colors.onSurfaceSecondary, fontSize: typography.small },
  amenityRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  amenityPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  amenityText: { color: colors.onSurfaceTertiary, fontSize: typography.tiny, fontWeight: "600" },
  footerRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  price: { fontSize: typography.h3, fontWeight: "700", color: colors.brandPrimary },
  priceFrom: { fontSize: typography.tiny, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
  priceUnit: { fontSize: typography.small, color: colors.onSurfaceSecondary },
  boostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  boostBtnActive: { backgroundColor: colors.brandPrimary },
  boostText: { color: colors.brandPrimary, fontWeight: "700", fontSize: typography.tiny },
  boostTextActive: { color: colors.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: typography.h3, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  emptyText: { textAlign: "center", color: colors.onSurfaceSecondary, marginTop: spacing.xs },
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
  boostSub: { marginTop: spacing.sm, color: colors.onSurfaceSecondary, fontSize: typography.small, lineHeight: 20 },
  qrCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  upiLabel: {
    marginTop: spacing.md,
    fontSize: typography.tiny,
    textTransform: "uppercase",
    fontWeight: "700",
    color: colors.muted,
  },
  upiValue: { fontSize: typography.h3, fontWeight: "700", color: colors.brandPrimary, marginTop: 2 },
  upiHelp: {
    marginTop: spacing.sm,
    fontSize: typography.tiny,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  payBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  payBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: typography.body },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
});
