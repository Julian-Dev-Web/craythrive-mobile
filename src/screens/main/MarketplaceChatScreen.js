import { formatPhilippineDate, formatPhilippineTime, manilaDateKey, shiftManilaDate, compareTimestamps } from '../../utils/philippineTime';
import { fetchServerTime, getServerNow } from '../../utils/serverClock';
// src/screens/main/MarketplaceChatScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppScreen from "../../components/ui/AppScreen";
import {
  COLORS,
  RADIUS,
  SHADOW,
} from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import ResilientImage from '../../components/ui/ResilientImage';

export default function MarketplaceChatScreen({
  chatDetails,
  onBack,
}) {
  const threadActionLock = useRef(false);

  const { colors, styles } =
    useThemePack();

  const scrollRef = useRef(null);
  const sendLock = useRef(false);
  const messageRequest = useRef(0);

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState(
    chatDetails?.currentUserId || ""
  );

  const [thread, setThread] =
    useState(null);

  const [messages, setMessages] =
    useState([]);

  const [
    otherProfile,
    setOtherProfile,
  ] = useState(null);

  const [
    messageText,
    setMessageText,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState("");

  const listing =
    chatDetails?.listing || null;

  const order =
    chatDetails?.order || null;

  const otherUserId = useMemo(() => {
    return getOtherUserId({
      chatDetails,
      thread,
      currentUserId,
    });
  }, [
    chatDetails,
    thread,
    currentUserId,
  ]);

  const title = useMemo(() => {
    if (otherProfile?.username) {
      return otherProfile.username;
    }

    if (otherProfile?.full_name) {
      return otherProfile.full_name;
    }

    if (otherProfile?.email) {
      return buildUsernameFromEmail(
        otherProfile.email
      );
    }

    if (
      chatDetails?.targetRole ===
      "seller"
    ) {
      return "Seller";
    }

    if (
      chatDetails?.targetRole ===
      "buyer"
    ) {
      return "Buyer";
    }

    return "Marketplace Chat";
  }, [
    otherProfile,
    chatDetails?.targetRole,
  ]);

  const subtitle = useMemo(() => {
    if (listing?.title) {
      return listing.title;
    }

    if (order?.listing?.title) {
      return order.listing.title;
    }

    return "Private marketplace conversation";
  }, [listing, order]);

  const isClosed =
    thread?.status === "closed";

  const groupedItems = useMemo(() => {
    return buildMessageTimeline(
      messages
    );
  }, [messages]);



  

  

  

  const loadThread = useCallback(async (
    threadId
  ) => {
    if (!threadId) return;

    const {
      data,
      error,
    } = await supabase
      .from(
        "marketplace_chat_threads"
      )
      .select("*")
      .eq("id", threadId)
      .maybeSingle();

    if (error) {
      console.log("LOAD CHAT THREAD ERROR:");

      return;
    }

    setThread(data || null);
  }, []);

  const loadMessages = useCallback(async (
    threadId,
    showLoader = false,
    viewerUserId
  ) => {
    if (!threadId) return;
    const requestId = ++messageRequest.current;

    if (showLoader) {
      setLoading(true);
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "marketplace_chat_messages"
      )
      .select("*")
      .eq(
        "thread_id",
        threadId
      )
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.log("LOAD CHAT MESSAGES ERROR:");

      if (showLoader) {
        setLoading(false);
      }

      return;
    }

    if (requestId !== messageRequest.current) return;
    setMessages(data || []);

    await markReceivedMessagesAsRead(
      threadId,
      viewerUserId
    );

    if (showLoader) {
      setLoading(false);
    }
  }, []);

  const loadOtherProfile = useCallback(async (
    userId
  ) => {
    if (!userId) return;

    const {
      data,
      error,
    } = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, email, avatar_url"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.log("LOAD OTHER PROFILE ERROR:");

      return;
    }

    setOtherProfile(
      data || null
    );
  }, []);

  

  const initializeChat = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: userData,
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !userData?.user?.id
      ) {
        showNotice(
          "Chat unavailable",
          "Please sign in again to use marketplace chat."
        );

        setLoading(false);
        return;
      }

      const userId =
        userData.user.id;

      setCurrentUserId(userId);

      const ids = resolveChatIds({
        chatDetails,
        currentUserId: userId,
      });

      if (
        !ids.buyerId ||
        !ids.sellerId
      ) {
        showNotice(
          "Chat unavailable",
          "Buyer or seller information is missing for this conversation."
        );

        setLoading(false);
        return;
      }

      if (
        ids.buyerId ===
        ids.sellerId
      ) {
        showNotice(
          "Chat unavailable",
          "You cannot start a marketplace chat with your own account."
        );

        setLoading(false);
        return;
      }

      if (![ids.buyerId, ids.sellerId].includes(userId)) {
        showNotice("Chat unavailable", "You are not a participant in this conversation.");
        return;
      }
      const { data: threadId, error: rpcError } = chatDetails?.thread?.id
        ? { data: chatDetails.thread.id, error: null }
        : await supabase.rpc(
        "get_or_create_marketplace_chat_thread",
        {
          p_listing_id:
            ids.listingId,

          p_order_id:
            ids.orderId,

          p_buyer_id:
            ids.buyerId,

          p_seller_id:
            ids.sellerId,
        }
      );

      if (
        rpcError ||
        !threadId
      ) {
        console.log("GET OR CREATE CHAT THREAD ERROR:");

        showNotice(
          "Chat failed",
          rpcError?.message ||
            "Unable to open this conversation."
        );

        setLoading(false);
        return;
      }

      await Promise.all([
        loadThread(threadId),

        loadOtherProfile(
          ids.otherUserId
        ),
      ]);

      /*
       * Pass the authenticated user ID directly.
       * Do not depend on React state having updated yet.
       */
      await loadMessages(
        threadId,
        true,
        userId
      );
    } catch (error) {
      console.log("INITIALIZE CHAT CATCH:");

      showNotice(
        "Chat failed",
        error?.message ||
          "Unable to open chat."
      );
    } finally {
      setLoading(false);
    }
  }, [chatDetails, loadThread, loadOtherProfile, loadMessages]);

  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack?.();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    if (!thread?.id) {
      return;
    }

    loadMessages(
      thread.id,
      false,
      currentUserId
    );

    const channel = supabase
      .channel(
        `marketplace-chat-${thread.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "marketplace_chat_messages",
          filter:
            `thread_id=eq.${thread.id}`,
        },
        () => {
          loadMessages(
            thread.id,
            false,
            currentUserId
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table:
            "marketplace_chat_threads",
          filter:
            `id=eq.${thread.id}`,
        },
        () => {
          loadThread(thread.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [thread?.id, currentUserId, loadMessages, loadThread]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  async function handleSendMessage() {
    const cleanMessage =
      messageText.trim();

    if (cleanMessage.length > 800) {
      showNotice('Message too long', 'Please keep messages within 800 characters.');
      return;
    }

    if (
      !cleanMessage ||
      sending || sendLock.current ||
      !thread?.id ||
      !currentUserId
    ) {
      return;
    }

    if (isClosed) {
      showNotice(
        "Chat is closed",
        "Reopen this chat before sending a message."
      );

      return;
    }

    if (!otherUserId) {
      showNotice(
        "Message not sent",
        "The receiver account could not be found."
      );

      return;
    }

    sendLock.current = true;
    setSending(true);

    try {
      const { error } =
        await supabase
          .from(
            "marketplace_chat_messages"
          )
          .insert({
            thread_id:
              thread.id,

            sender_id:
              currentUserId,

            receiver_id:
              otherUserId,

            message_text:
              cleanMessage,
          });

      if (error) {
        console.log("SEND CHAT MESSAGE ERROR:");

        showNotice(
          "Message not sent",
          getFriendlyMessageError(
            error
          )
        );

        return;
      }

      setMessageText("");

      await loadMessages(
        thread.id,
        false,
        currentUserId
      );
    } catch (error) {
      console.log("SEND CHAT MESSAGE CATCH:");

      showNotice(
        "Message not sent",
        error?.message ||
          "Failed to send message."
      );
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  async function handleCloseChat() {
    if (threadActionLock.current) return;

    if (
      !thread?.id ||
      actionLoading
    ) {
      return;
    }

    threadActionLock.current = true;
    setActionLoading("close");

    try {
      const { error } =
        await supabase.rpc(
          "close_marketplace_chat_thread",
          {
            p_thread_id:
              thread.id,

            p_reason:
              "Closed from mobile app",
          }
        );

      if (error) {
        console.log("CLOSE CHAT ERROR:");

        showNotice(
          "Close failed",
          error.message ||
            "Unable to close chat."
        );

        return;
      }

      await loadThread(
        thread.id
      );
    } catch (error) {
      console.log("CLOSE CHAT CATCH:");

      showNotice(
        "Close failed",
        error?.message ||
          "Unable to close chat."
      );
    } finally {
      threadActionLock.current = false;
      setActionLoading("");
    }
  }

  async function handleReopenChat() {
    if (threadActionLock.current) return;

    if (
      !thread?.id ||
      actionLoading
    ) {
      return;
    }

    threadActionLock.current = true;
    setActionLoading(
      "reopen"
    );

    try {
      const { error } =
        await supabase.rpc(
          "reopen_marketplace_chat_thread",
          {
            p_thread_id:
              thread.id,
          }
        );

      if (error) {
        console.log("REOPEN CHAT ERROR:");

        showNotice(
          "Reopen failed",
          error.message ||
            "Unable to reopen chat."
        );

        return;
      }

      await loadThread(
        thread.id
      );
    } catch (error) {
      console.log("REOPEN CHAT CATCH:");

      showNotice(
        "Reopen failed",
        error?.message ||
          "Unable to reopen chat."
      );
    } finally {
      threadActionLock.current = false;
      setActionLoading("");
    }
  }

  async function handleDeleteChat() {
    if (
      !thread?.id ||
      actionLoading
    ) {
      return;
    }

    const runDelete =
      async () => {
      if (threadActionLock.current) return;
      threadActionLock.current = true;

        setActionLoading(
          "delete"
        );

        try {
          const { error } =
            await supabase.rpc(
              "hide_marketplace_chat_thread",
              {
                p_thread_id:
                  thread.id,
              }
            );

          if (error) {
            console.log("DELETE/HIDE CHAT ERROR:");

            showNotice(
              "Delete failed",
              error.message ||
                "Unable to delete chat."
            );

            return;
          }

          onBack?.();
        } catch (error) {
          console.log("DELETE/HIDE CHAT CATCH:");

          showNotice(
            "Delete failed",
            error?.message ||
              "Unable to delete chat."
          );
        } finally {
        threadActionLock.current = false;
          setActionLoading("");
        }
      };

    if (Platform.OS === "web") {
      const confirmed =
        typeof window !==
        "undefined"
          ? window.confirm(
              "Delete this chat from your inbox?"
            )
          : true;

      if (confirmed) {
        runDelete();
      }

      return;
    }

    Alert.alert(
      "Delete chat",
      "This hides the chat from your side only. The other user will keep their conversation history.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress:
            runDelete,
        },
      ]
    );
  }

  function scrollToBottom() {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd?.(
        {
          animated: true,
        }
      );
    }, 100);
  }

  

  return (
    <AppScreen>
      <KeyboardAvoidingView
        style={
          styles.keyboardRoot
        }
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
      >
        <View style={styles.root}>
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={
                styles.headerButton
              }
              onPress={onBack}
              disabled={
                Boolean(
                  actionLoading
                )
              }
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={
                  colors.textStrong
                }
              />
            </TouchableOpacity>

            <ProfileAvatar
              avatarUrl={
                otherProfile?.avatar_url
              }
              colors={colors}
              styles={styles}
            />

            <View
              style={
                styles.headerText
              }
            >
              <Text
                style={styles.eyebrow}
              >
                Marketplace Chat
              </Text>

              <Text
                style={styles.title}
                numberOfLines={1}
              >
                {title}
              </Text>

              <Text
                style={styles.subtitle}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>

            {thread ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.headerButton,

                  isClosed &&
                    styles.headerButtonWarning,
                ]}
                onPress={
                  isClosed
                    ? handleReopenChat
                    : handleCloseChat
                }
                disabled={
                  actionLoading ===
                    "close" ||
                  actionLoading ===
                    "reopen"
                }
              >
                {actionLoading ===
                  "close" ||
                actionLoading ===
                  "reopen" ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      colors.accent2
                    }
                  />
                ) : (
                  <Ionicons
                    name={
                      isClosed
                        ? "lock-open-outline"
                        : "lock-closed-outline"
                    }
                    size={19}
                    color={
                      isClosed
                        ? colors.warning
                        : colors.accent2
                    }
                  />
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          {/* LISTING CONTEXT */}
          <View
            style={
              styles.contextCard
            }
          >
            <View
              style={
                styles.contextIcon
              }
            >
              <Ionicons
                name="storefront-outline"
                size={19}
                color={
                  colors.accent2
                }
              />
            </View>

            <View
              style={
                styles.contextContent
              }
            >
              <Text
                style={
                  styles.contextLabel
                }
              >
                Conversation about
              </Text>

              <Text
                style={
                  styles.contextTitle
                }
                numberOfLines={1}
              >
                {getListingTitle(
                  listing,
                  order
                )}
              </Text>

              <View
                style={
                  styles.contextMeta
                }
              >
                {getListingPrice(
                  listing,
                  order
                ) ? (
                  <Text
                    style={
                      styles.contextPrice
                    }
                  >
                    ₱
                    {formatMoney(
                      getListingPrice(
                        listing,
                        order
                      )
                    )}
                  </Text>
                ) : null}

                <View
                  style={
                    styles.privacyMeta
                  }
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={11}
                    color={
                      colors.muted2
                    }
                  />

                  <Text
                    style={
                      styles.privacyMetaText
                    }
                  >
                    Private
                  </Text>
                </View>
              </View>
            </View>

            {thread ? (
              <TouchableOpacity
                activeOpacity={0.82}
                style={
                  styles.deleteButton
                }
                onPress={
                  handleDeleteChat
                }
                disabled={
                  actionLoading ===
                  "delete"
                }
              >
                {actionLoading ===
                "delete" ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      colors.danger
                    }
                  />
                ) : (
                  <Ionicons
                    name="trash-outline"
                    size={17}
                    color={
                      colors.danger
                    }
                  />
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          {/* CLOSED STATUS */}
          {isClosed ? (
            <View
              style={
                styles.closedNotice
              }
            >
              <View
                style={
                  styles.closedNoticeIcon
                }
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={17}
                  color={
                    colors.warning
                  }
                />
              </View>

              <View
                style={
                  styles.closedNoticeContent
                }
              >
                <Text
                  style={
                    styles.closedNoticeTitle
                  }
                >
                  Conversation closed
                </Text>

                <Text
                  style={
                    styles.closedNoticeText
                  }
                >
                  Previous messages are
                  still visible. Reopen
                  the chat to continue
                  messaging.
                </Text>
              </View>
            </View>
          ) : null}

          {/* MESSAGES */}
          {loading ? (
            <View
              style={
                styles.loadingBox
              }
            >
              <View
                style={
                  styles.loadingIcon
                }
              >
                <ActivityIndicator
                  color={
                    colors.accent2
                  }
                />
              </View>

              <Text
                style={
                  styles.loadingTitle
                }
              >
                Opening chat
              </Text>

              <Text
                style={
                  styles.loadingText
                }
              >
                Loading your conversation.
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={
                styles.messageList
              }
              onContentSizeChange={() =>
                scrollToBottom()
              }
            >
              {messages.length ===
              0 ? (
                <EmptyChat
                  targetRole={
                    chatDetails?.targetRole
                  }
                  colors={colors}
                  styles={styles}
                />
              ) : (
                groupedItems.map(
                  (item) => {
                    if (
                      item.type ===
                      "date"
                    ) {
                      return (
                        <DateSeparator
                          key={
                            item.key
                          }
                          label={
                            item.label
                          }
                          styles={
                            styles
                          }
                        />
                      );
                    }

                    const message =
                      item.message;

                    const isMine =
                      message.sender_id ===
                      currentUserId;

                    return (
                      <MessageBubble
                        key={
                          message.id
                        }
                        message={
                          message
                        }
                        isMine={
                          isMine
                        }
                        colors={
                          colors
                        }
                        styles={
                          styles
                        }
                      />
                    );
                  }
                )
              )}
            </ScrollView>
          )}

          {/* COMPOSER */}
          <View
            style={
              styles.composerArea
            }
          >
            {isClosed ? (
              <View
                style={
                  styles.closedComposer
                }
              >
                <View
                  style={
                    styles.closedComposerText
                  }
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={16}
                    color={
                      colors.warning
                    }
                  />

                  <Text
                    style={
                      styles.closedText
                    }
                  >
                    Chat is closed
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={
                    styles.reopenButton
                  }
                  onPress={
                    handleReopenChat
                  }
                  disabled={
                    actionLoading ===
                    "reopen"
                  }
                >
                  {actionLoading ===
                  "reopen" ? (
                    <ActivityIndicator
                      size="small"
                      color={
                        colors.deep
                      }
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="lock-open-outline"
                        size={15}
                        color={
                          colors.deep
                        }
                      />

                      <Text
                        style={
                          styles.reopenButtonText
                        }
                      >
                        Reopen
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={
                  styles.composerWrap
                }
              >
                <View
                  style={[
                    styles.inputWrap,

                    messageText.length >
                      0 &&
                      styles.inputWrapActive,
                  ]}
                >
                  <TextInput
                    value={
                      messageText
                    }
                    onChangeText={
                      setMessageText
                    }
                    placeholder="Message..."
                    placeholderTextColor={
                      colors.inputPlaceholder
                    }
                    style={
                      styles.input
                    }
                    multiline
                    maxLength={800}
                    autoCorrect
                    textAlignVertical="center"
                  />
                </View>

                <TouchableOpacity
                  activeOpacity={0.84}
                  style={[
                    styles.sendButton,

                    (!messageText.trim() ||
                      sending) &&
                      styles.sendButtonDisabled,
                  ]}
                  onPress={
                    handleSendMessage
                  }
                  disabled={loading || !thread?.id || !messageText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator
                      size="small"
                      color="#062C2B"
                    />
                  ) : (
                    <Ionicons
                      name="arrow-up"
                      size={21}
                      color="#062C2B"
                    />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

function ProfileAvatar({
  avatarUrl,
  colors,
  styles,
}) {
  return (
    <View style={styles.avatar}>
      {avatarUrl ? (
        <ResilientImage
          source={{
            uri: avatarUrl,
          }}
          style={
            styles.avatarImage
          }
        />
      ) : (
        <CrayfishIcon
          size={27}
          color={colors.accent2}
        />
      )}
    </View>
  );
}

function EmptyChat({
  targetRole,
  colors,
  styles,
}) {
  const target =
    targetRole === "buyer"
      ? "buyer"
      : targetRole === "seller"
      ? "seller"
      : "other user";

  return (
    <View style={styles.emptyState}>
      <View
        style={styles.emptyIcon}
      >
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={31}
          color={colors.accent2}
        />
      </View>

      <Text
        style={styles.emptyTitle}
      >
        Start the conversation
      </Text>

      <Text
        style={styles.emptyText}
      >
        Send a message to the {target}
        about this marketplace listing.
      </Text>

      <View
        style={styles.emptyPrivacy}
      >
        <Ionicons
          name="lock-closed-outline"
          size={13}
          color={colors.muted2}
        />

        <Text
          style={
            styles.emptyPrivacyText
          }
        >
          Only the buyer and seller can
          view messages in this chat.
        </Text>
      </View>
    </View>
  );
}

function DateSeparator({
  label,
  styles,
}) {
  return (
    <View
      style={
        styles.dateSeparator
      }
    >
      <View
        style={styles.dateLine}
      />

      <Text
        style={styles.dateText}
      >
        {label}
      </Text>

      <View
        style={styles.dateLine}
      />
    </View>
  );
}

function MessageBubble({
  message,
  isMine,
  colors,
  styles,
}) {
  return (
    <View
      style={[
        styles.bubbleRow,

        isMine &&
          styles.bubbleRowMine,
      ]}
    >
      <View
        style={[
          styles.bubble,

          isMine
            ? styles.bubbleMine
            : styles.bubbleOther,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,

            isMine &&
              styles.bubbleTextMine,
          ]}
        >
          {message.message_text}
        </Text>

        <View
          style={
            styles.bubbleMetaRow
          }
        >
          <Text
            style={[
              styles.bubbleTime,

              isMine &&
                styles.bubbleTimeMine,
            ]}
          >
            {formatMessageTime(
              message.created_at
            )}
          </Text>

          {isMine ? (
            <View
              style={
                styles.readState
              }
            >
              <Ionicons
                name={
                  message.is_read
                    ? "checkmark-done"
                    : "checkmark"
                }
                size={13}
                color="#062C2B"
              />

              <Text
                style={
                  styles.readStateText
                }
              >
                {message.is_read
                  ? "Seen"
                  : "Sent"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function resolveChatIds({ chatDetails, currentUserId }) {
  const listing = chatDetails?.listing || chatDetails?.order?.listing;
  const order = chatDetails?.order;
  const thread = chatDetails?.thread;
  const targetRole = chatDetails?.targetRole;
  const listingId = thread?.listing_id || listing?.id || order?.listing_id || null;
  const orderId = thread?.order_id || order?.id || null;
  const buyerId = thread?.buyer_id || order?.buyer_id ||
    (targetRole === "seller" ? currentUserId : chatDetails?.otherUserId);
  const sellerId = thread?.seller_id || order?.seller_id || listing?.seller_id ||
    (targetRole === "seller" ? chatDetails?.otherUserId : currentUserId);
  const otherUserId = buyerId === currentUserId ? sellerId : buyerId;
  return { listingId, orderId, buyerId, sellerId, otherUserId };
}

function getOtherUserId({
  chatDetails,
  thread,
  currentUserId,
}) {
  if (
    chatDetails?.otherUserId
  ) {
    return chatDetails.otherUserId;
  }

  if (
    !thread ||
    !currentUserId
  ) {
    return "";
  }

  if (
    thread.buyer_id ===
    currentUserId
  ) {
    return thread.seller_id;
  }

  if (
    thread.seller_id ===
    currentUserId
  ) {
    return thread.buyer_id;
  }

  return "";
}

function getFriendlyMessageError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  const lower =
    message.toLowerCase();

  if (
    lower.includes("closed")
  ) {
    return "This chat is closed. Reopen it before sending a message.";
  }

  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes("policy")
  ) {
    return "This message was blocked by marketplace chat privacy rules.";
  }

  return (
    message ||
    "Failed to send message."
  );
}

function buildMessageTimeline(
  messages
) {
  const items = [];

  let previousDateKey = "";

  [...messages].sort((a, b) => compareTimestamps(a.created_at, b.created_at)).forEach(
    (message) => {
      const dateKey =
        getDateKey(
          message.created_at
        );

      if (
        dateKey &&
        dateKey !==
          previousDateKey
      ) {
        items.push({
          type: "date",
          key:
            `date-${dateKey}`,
          label:
            formatMessageDate(
              message.created_at
            ),
        });

        previousDateKey =
          dateKey;
      }

      items.push({
        type: "message",
        key:
          `message-${message.id}`,
        message,
      });
    }
  );

  return items;
}

function getDateKey(value) {
  return manilaDateKey(value);
}

function formatMessageDate(
  value
) {
  const key = manilaDateKey(value);
 if (!key) return '';
 const today = manilaDateKey(getServerNow());
 if (today && key === today) return 'Today';
 if (today && key === shiftManilaDate(today, -1)) return 'Yesterday';
 return formatPhilippineDate(value, { year: today && key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' }, '');
}



function formatMessageTime(
  value
) {
  return formatPhilippineTime(value);
}

function getListingTitle(
  listing,
  order
) {
  return (
    listing?.title ||
    order?.listing?.title || "Marketplace Product"
  );
}

function getListingPrice(
  listing,
  order
) {
  return (
    listing?.price ??
    order?.listing?.price ??
    null
  );
}

function formatMoney(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return String(
      value || ""
    );
  }

  return number.toLocaleString(
    "en-PH",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  );
}

function buildUsernameFromEmail(
  email
) {
  const value =
    String(email || "").trim();

  if (
    !value.includes("@")
  ) {
    return "";
  }

  return (
    value.split("@")[0] ||
    ""
  );
}

function useThemePack() {
  const theme = useAppTheme();

  const isDark =
    theme?.isDark ?? true;

  const colors = useMemo(() => {
    return normalizeColors(
      theme?.colors ||
        COLORS,
      isDark
    );
  }, [
    theme?.colors,
    isDark,
  ]);

  const styles = useMemo(
    () => makeStyles(colors),
    [colors]
  );

  return {
    colors,
    isDark,
    styles,
  };
}

function normalizeColors(
  sourceColors,
  isDark
) {
  return {
    ...COLORS,
    ...sourceColors,

    background:
      sourceColors.background ||
      (isDark
        ? COLORS.deep
        : "#F3FFFC"),

    background2:
      sourceColors.background2 ||
      (isDark
        ? COLORS.mid
        : "#E9FAF7"),

    surface:
      sourceColors.surface ||
      (isDark
        ? COLORS.surface
        : "rgba(255,255,255,0.88)"),

    surfaceStrong:
      sourceColors.surfaceStrong ||
      (isDark
        ? COLORS.surfaceStrong
        : "rgba(255,255,255,0.97)"),

    surfaceSoft:
      sourceColors.surfaceSoft ||
      (isDark
        ? COLORS.surfaceSoft
        : "rgba(8,31,48,0.045)"),

    textStrong:
      sourceColors.textStrong ||
      (isDark
        ? COLORS.white
        : "#0F172A"),

    muted:
      sourceColors.muted ||
      (isDark
        ? COLORS.muted
        : "rgba(15,23,42,0.68)"),

    muted2:
      sourceColors.muted2 ||
      (isDark
        ? COLORS.muted2
        : "rgba(15,23,42,0.46)"),

    border:
      sourceColors.border ||
      (isDark
        ? COLORS.border
        : "rgba(15,23,42,0.10)"),

    accent:
      sourceColors.accent ||
      COLORS.accent,

    accent2:
      sourceColors.accent2 ||
      COLORS.accent2,

    accentSoft:
      sourceColors.accentSoft ||
      (isDark
        ? COLORS.accentSoft
        : "rgba(34,211,197,0.14)"),

    accentBorder:
      sourceColors.accentBorder ||
      (isDark
        ? COLORS.accentBorder
        : "rgba(15,118,110,0.18)"),

    danger:
      sourceColors.danger ||
      COLORS.danger,

    warning:
      sourceColors.warning ||
      COLORS.warning,

    success:
      sourceColors.success ||
      COLORS.success,

    dangerSoft:
      sourceColors.dangerSoft ||
      (isDark
        ? COLORS.dangerSoft
        : "rgba(248,113,113,0.13)"),

    warningSoft:
      sourceColors.warningSoft ||
      (isDark
        ? COLORS.warningSoft
        : "rgba(251,191,36,0.16)"),

    successSoft:
      sourceColors.successSoft ||
      (isDark
        ? COLORS.successSoft
        : "rgba(74,222,128,0.16)"),

    inputPlaceholder:
      isDark
        ? "rgba(255,255,255,0.34)"
        : "rgba(15,23,42,0.36)",

    deep:
      sourceColors.deep ||
      COLORS.deep,
  };
}

function makeStyles(colors) {
  return StyleSheet.create({
    keyboardRoot: {
      flex: 1
    },
    root: {
      flex: 1,
      paddingHorizontal: 16
    },
    /*
    |--------------------------------------------------------------------------
    | HEADER
    |--------------------------------------------------------------------------
    */

    header: {
      paddingTop: 7,
      paddingBottom: 11,
      flexDirection: "row",
      alignItems: "center"
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 44,
      paddingVertical: 8
    },
    headerButtonWarning: { minHeight: 44,
      backgroundColor: colors.warningSoft,
      borderColor: "rgba(251,191,36,0.22)"
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 15,
      overflow: "hidden",
      marginLeft: 9,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      alignItems: "center",
      justifyContent: "center"
    },
    avatarImage: {
      width: "100%",
      height: "100%"
    },
    headerText: {
      flex: 1,
      minWidth: 0,
      marginHorizontal: 10
    },
    eyebrow: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.7
    },
    title: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "700"
    },
    subtitle: {
      marginTop: 1,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400"
    },
    /*
    |--------------------------------------------------------------------------
    | LISTING CONTEXT
    |--------------------------------------------------------------------------
    */

    contextCard: {
      minHeight: 67,
      paddingHorizontal: 11,
      borderRadius: 17,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 9
    },
    contextIcon: {
      width: 39,
      height: 39,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor: colors.accentSoft
    },
    contextContent: {
      flex: 1,
      minWidth: 0
    },
    contextLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500"
    },
    contextTitle: {
      marginTop: 1,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600"
    },
    contextMeta: {
      marginTop: 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    contextPrice: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    privacyMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3
    },
    privacyMetaText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500"
    },
    deleteButton: {
      width: 44,
      height: 44,
      borderRadius: 11,
      marginLeft: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: "rgba(248,113,113,0.20)",
      minHeight: 44,
      paddingVertical: 8
    },
    /*
    |--------------------------------------------------------------------------
    | CLOSED NOTICE
    |--------------------------------------------------------------------------
    */

    closedNotice: {
      marginBottom: 8,
      padding: 10,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.22)"
    },
    closedNoticeIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor: "rgba(251,191,36,0.08)"
    },
    closedNoticeContent: {
      flex: 1
    },
    closedNoticeTitle: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "700"
    },
    closedNoticeText: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400"
    },
    /*
    |--------------------------------------------------------------------------
    | LOADING
    |--------------------------------------------------------------------------
    */

    loadingBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    loadingIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft
    },
    loadingTitle: {
      marginTop: 11,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    loadingText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400"
    },
    /*
    |--------------------------------------------------------------------------
    | MESSAGE LIST
    |--------------------------------------------------------------------------
    */

    messageList: {
      flexGrow: 1,
      paddingTop: 6,
      paddingBottom: 16
    },
    emptyState: {
      flex: 1,
      minHeight: 330,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28
    },
    emptyIcon: {
      width: 66,
      height: 66,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    emptyTitle: {
      marginTop: 12,
      color: colors.textStrong,
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center"
    },
    emptyText: {
      marginTop: 5,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
      textAlign: "center"
    },
    emptyPrivacy: {
      marginTop: 12,
      paddingHorizontal: 10,
      minHeight: 30,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surfaceSoft
    },
    emptyPrivacyText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400"
    },
    /*
    |--------------------------------------------------------------------------
    | DATE
    |--------------------------------------------------------------------------
    */

    dateSeparator: {
      marginVertical: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    dateLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border
    },
    dateText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500"
    },
    /*
    |--------------------------------------------------------------------------
    | BUBBLES
    |--------------------------------------------------------------------------
    */

    bubbleRow: {
      width: "100%",
      flexDirection: "row",
      justifyContent: "flex-start",
      marginBottom: 7
    },
    bubbleRowMine: {
      justifyContent: "flex-end"
    },
    bubble: {
      maxWidth: "79%",
      minWidth: 76,
      paddingHorizontal: 12,
      paddingTop: 9,
      paddingBottom: 7,
      borderRadius: 17,
      borderWidth: 1
    },
    bubbleMine: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      borderBottomRightRadius: 6
    },
    bubbleOther: {
      backgroundColor: colors.surfaceStrong,
      borderColor: colors.border,
      borderBottomLeftRadius: 6
    },
    bubbleText: {
      color: colors.textStrong,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "400"
    },
    bubbleTextMine: {
      color: "#062C2B"
    },
    bubbleMetaRow: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6
    },
    bubbleTime: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400"
    },
    bubbleTimeMine: {
      color: "#062C2B"
    },
    readState: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2
    },
    readStateText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "500"
    },
    /*
    |--------------------------------------------------------------------------
    | COMPOSER
    |--------------------------------------------------------------------------
    */

    composerArea: {
      paddingTop: 8,
      paddingBottom: Platform.OS === "ios" ? 17 : 12,
      borderTopWidth: 1,
      borderTopColor: colors.border
    },
    composerWrap: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8
    },
    inputWrap: {
      flex: 1,
      minHeight: 48,
      maxHeight: 118,
      borderRadius: 16,
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 13,
      paddingVertical: 8,
      justifyContent: "center"
    },
    inputWrapActive: {
      borderColor: colors.accentBorder
    },
    input: {
      color: colors.textStrong,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "400",
      padding: 0,
      maxHeight: 94
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      ...SHADOW.card,
      minHeight: 44,
      paddingVertical: 8
    },
    sendButtonDisabled: { minHeight: 44,
      opacity: 0.38
    },
    /*
    |--------------------------------------------------------------------------
    | CLOSED COMPOSER
    |--------------------------------------------------------------------------
    */

    closedComposer: {
      minHeight: 50,
      borderRadius: 16,
      paddingLeft: 12,
      paddingRight: 6,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.22)"
    },
    closedComposerText: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 7
    },
    closedText: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "600"
    },
    reopenButton: {
      minHeight: 44,
      paddingHorizontal: 11,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      backgroundColor: colors.warning,
      paddingVertical: 8
    },
    reopenButtonText: {
      color: colors.deep,
      fontSize: 12,
      fontWeight: "700"
    }
  });
}

function showNotice(
    titleText,
    bodyText
  ) {
    if (Platform.OS === "web") {
      if (
        typeof window !==
        "undefined"
      ) {
        window.alert(
          `${titleText}\n\n${bodyText}`
        );
      }

      return;
    }

    Alert.alert(
      titleText,
      bodyText
    );
  }


async function markReceivedMessagesAsRead(
    threadId,
    viewerUserId
  ) {
    if (
      !threadId ||
      !viewerUserId
    ) {
      return;
    }

    const readAt = await fetchServerTime().catch(() => null);
    if (!readAt) { console.log('Could not verify server time for chat read receipt.'); return; }
    const { error } =
      await supabase
        .from(
          "marketplace_chat_messages"
        )
        .update({
          is_read: true,
          read_at: readAt,
        })
        .eq(
          "thread_id",
          threadId
        )
        .eq(
          "receiver_id",
          viewerUserId
        )
        .eq(
          "is_read",
          false
        );

    if (error) {
      console.log("MARK CHAT READ ERROR:");
    }
  }
