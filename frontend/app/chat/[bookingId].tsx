// Chat screen for a booking thread (student <-> owner).
// Polls new messages every 3 seconds while focused.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius, typography } from "@/src/theme";

type Message = {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "student" | "owner";
  text: string;
  created_at: string;
};

type Booking = {
  id: string;
  cabin_name: string;
  cabin_city: string;
  cabin_type: string;
  date: string;
  time_slot: string;
  user_name: string;
  owner_id: string;
  user_id: string;
};

export default function ChatScreen() {
  const { user } = useAuth();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const fetchMessages = useCallback(async () => {
    if (!bookingId) return;
    try {
      const msgs = await api<Message[]>(`/bookings/${bookingId}/messages`);
      setMessages(msgs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    (async () => {
      if (!bookingId) return;
      try {
        const b = await api<Booking>(`/bookings/${bookingId}`);
        setBooking(b);
      } catch { /* silent */ }
    })();
  }, [bookingId]);

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 3000);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0 && listRef.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !bookingId) return;
    setSending(true);
    setText("");
    try {
      const msg = await api<Message>(`/bookings/${bookingId}/messages`, {
        method: "POST",
        body: { text: t },
      });
      setMessages((prev) => [...prev, msg]);
    } catch {
      setText(t); // restore
    } finally {
      setSending(false);
    }
  };

  const other = booking
    ? user?.id === booking.owner_id
      ? booking.user_name
      : "Cabin owner"
    : "Chat";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          testID="chat-back-button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{other}</Text>
          {booking && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {booking.cabin_name} · {booking.date} · {booking.time_slot}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            testID="chat-messages-list"
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View
                  testID={`chat-message-${item.id}`}
                  style={[
                    styles.bubbleWrap,
                    mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs,
                  ]}
                >
                  {!mine && (
                    <Text style={styles.sender}>
                      {item.sender_name} · {item.sender_role}
                    </Text>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        mine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={() => (
              <View style={styles.center}>
                <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.muted} />
                <Text style={styles.emptyText}>Say hello 👋</Text>
              </View>
            )}
          />
        )}

        <View style={styles.composerWrap}>
          <TextInput
            testID="chat-input"
            style={styles.composer}
            placeholder="Type a message"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable
            testID="chat-send-button"
            onPress={send}
            disabled={!text.trim() || sending}
            style={[
              styles.sendBtn,
              (!text.trim() || sending) && { opacity: 0.5 },
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
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
  listContent: { padding: spacing.lg, paddingBottom: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, minHeight: 240 },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: typography.small },
  bubbleWrap: { marginBottom: spacing.sm, maxWidth: "80%" },
  bubbleWrapMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleWrapTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },
  sender: {
    fontSize: typography.tiny,
    color: colors.muted,
    marginBottom: 2,
    marginLeft: spacing.sm,
    textTransform: "capitalize",
  },
  bubble: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
  },
  bubbleMine: { backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surfaceTertiary, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: typography.body, lineHeight: 20 },
  bubbleTextMine: { color: colors.onBrandPrimary },
  bubbleTextTheirs: { color: colors.onSurface },
  composerWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  composer: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxHeight: 120,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
    fontSize: typography.body,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
