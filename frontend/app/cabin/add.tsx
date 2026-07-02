// Add Cabin form — owner only.
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "@/src/api";
import { colors, spacing, radius, typography } from "@/src/theme";

const AMENITY_OPTIONS = [
  "Wi-Fi",
  "AC",
  "Coffee",
  "Silent Zone",
  "Books",
  "Locker",
  "Printer",
  "Whiteboard",
  "24x7",
  "Meeting Room",
  "Snacks",
  "Power Outlets",
];

const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1777734584066-ee6ed16a0b0e",
  "https://images.unsplash.com/photo-1720139290958-d8676702c3ed",
  "https://images.unsplash.com/photo-1653463174308-518cff322388",
];

export default function AddCabin() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(DEFAULT_IMAGES[0]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [type, setType] = useState<"AC" | "Non-AC">("AC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAmenity = (a: string) => {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const submit = async () => {
    setError(null);
    if (!name || !city || !address || !price) {
      setError("Please fill in name, city, address and price.");
      return;
    }
    const pv = parseFloat(price);
    if (isNaN(pv) || pv < 0) {
      setError("Enter a valid price.");
      return;
    }
    setBusy(true);
    try {
      await api("/cabins", {
        method: "POST",
        body: {
          name,
          city,
          address,
          price_per_hour: pv,
          amenities,
          description,
          image_url: image,
          type,
        },
      });
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Failed to create cabin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          testID="add-cabin-back"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Add a new cabin</Text>
        <View style={{ width: 32 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Cabin name">
            <TextInput
              testID="add-cabin-name"
              style={styles.input}
              placeholder="e.g. Silent Study Loft"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />
          </Field>
          <Field label="City">
            <TextInput
              testID="add-cabin-city"
              style={styles.input}
              placeholder="e.g. Bengaluru"
              placeholderTextColor={colors.muted}
              value={city}
              onChangeText={setCity}
            />
          </Field>
          <Field label="Address">
            <TextInput
              testID="add-cabin-address"
              style={styles.input}
              placeholder="Street, area"
              placeholderTextColor={colors.muted}
              value={address}
              onChangeText={setAddress}
            />
          </Field>
          <Field label="Price per hour (₹)">
            <TextInput
              testID="add-cabin-price"
              style={styles.input}
              placeholder="e.g. 120"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />
          </Field>

          <Field label="Cabin type">
            <View style={styles.typeRow}>
              {(["AC", "Non-AC"] as const).map((t) => {
                const active = t === type;
                return (
                  <Pressable
                    key={t}
                    testID={`add-cabin-type-${t}`}
                    onPress={() => setType(t)}
                    style={[styles.typeOpt, active && styles.typeOptActive]}
                  >
                    <Ionicons
                      name={t === "AC" ? "snow" : "leaf"}
                      size={18}
                      color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary}
                    />
                    <Text style={[styles.typeOptText, active && styles.typeOptTextActive]}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Cover image">
            <View style={styles.imageRow}>
              {DEFAULT_IMAGES.map((url) => (
                <Pressable
                  key={url}
                  testID={`add-cabin-image-${url.slice(-10)}`}
                  onPress={() => setImage(url)}
                  style={[styles.imageOpt, image === url && styles.imageOptActive]}
                >
                  <Text style={styles.imageOptLabel}>
                    {image === url ? "Selected" : "Choose"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Amenities">
            <View style={styles.amenityWrap}>
              {AMENITY_OPTIONS.map((a) => {
                const active = amenities.includes(a);
                return (
                  <Pressable
                    key={a}
                    testID={`amenity-${a}`}
                    onPress={() => toggleAmenity(a)}
                    style={[styles.amenityChip, active && styles.amenityChipActive]}
                  >
                    <Text
                      style={[
                        styles.amenityChipText,
                        active && styles.amenityChipTextActive,
                      ]}
                    >
                      {a}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Description">
            <TextInput
              testID="add-cabin-description"
              style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
              placeholder="Tell students what makes your cabin special…"
              placeholderTextColor={colors.muted}
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </Field>

          {error && (
            <Text style={styles.error} testID="add-cabin-error">
              {error}
            </Text>
          )}
        </ScrollView>

        <View style={styles.stickyFooter}>
          <Pressable
            testID="publish-cabin-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>Publish cabin</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: { width: 32, height: 32, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: typography.body, fontWeight: "700", color: colors.onSurface },
  scroll: { padding: spacing.xl, paddingBottom: 120 },
  label: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
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
  imageRow: { flexDirection: "row", gap: spacing.sm },
  typeRow: { flexDirection: "row", gap: spacing.md },
  typeOpt: {
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
  typeOptActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeOptText: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  typeOptTextActive: { color: colors.onBrandPrimary },
  imageOpt: {
    flex: 1,
    height: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  imageOptActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary,
    borderWidth: 2,
  },
  imageOptLabel: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: typography.small },
  amenityWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  amenityChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  amenityChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  amenityChipText: { color: colors.onSurfaceSecondary, fontSize: typography.small, fontWeight: "600" },
  amenityChipTextActive: { color: colors.onBrandPrimary },
  error: { color: colors.error, marginTop: spacing.md, fontSize: typography.small },
  stickyFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: typography.body },
});
