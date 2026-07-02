// Home tab.
// - Student view: search bar + city chips + cabin list.
// - Owner view: "My Cabins" list + Add Cabin FAB.
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
};

export default function HomeTab() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (isOwner) {
        const my = await api<Cabin[]>("/cabins/my");
        setCabins(my);
      } else {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (selectedCity && selectedCity !== "All") params.set("city", selectedCity);
        const list = await api<Cabin[]>(`/cabins?${params.toString()}`);
        setCabins(list);
        if (cities.length === 0) {
          const cs = await api<string[]>("/cabins/cities");
          setCities(cs);
        }
      }
    } catch (e) {
      // silent for now; empty state will show
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOwner, query, selectedCity, cities.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
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
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : cabins.length === 0 ? (
        <View style={styles.center} testID="home-empty">
          <Ionicons name="file-tray-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>
            {isOwner ? "No cabins yet" : "No cabins found"}
          </Text>
          <Text style={styles.emptyText}>
            {isOwner
              ? "Tap + to publish your first cabin."
              : "Try a different city or clear filters."}
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
              <Image
                source={{ uri: item.image_url }}
                style={styles.cardImage}
                contentFit="cover"
                transition={200}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
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
                <View style={styles.priceRow}>
                  <Text style={styles.price}>₹{item.price_per_hour.toFixed(0)}</Text>
                  <Text style={styles.priceUnit}> / hour</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
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
  searchInput: {
    flex: 1,
    fontSize: typography.body,
    color: colors.onSurface,
    paddingVertical: 4,
  },
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
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.md },
  price: { fontSize: typography.h3, fontWeight: "700", color: colors.brandPrimary },
  priceUnit: { fontSize: typography.small, color: colors.onSurfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: typography.h3, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  emptyText: { textAlign: "center", color: colors.onSurfaceSecondary, marginTop: spacing.xs },
});
