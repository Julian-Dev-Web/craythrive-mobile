import { formatPhilippineDateTime, formatPhilippineAlertMessage } from '../../utils/philippineTime';
// src/components/ui/NotificationBell.js

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import AppCard from "./AppCard";
import CrayfishIcon from "../icons/CrayfishIcon";
import { RADIUS, SHADOW } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { formatPumpAlert } from '../../utils/pumpActionWording';
import useThemedStyles from '../../hooks/useThemedStyles';
import useSingleFlight from '../../hooks/useSingleFlight';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NotificationBell({ size = 50 }) {
  const readLocks = useRef(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  const insets = useSafeAreaInsets();

  const { colors, styles } = useThemedStyles(makeStyles);

  const channelRef = useRef(null);
  const pollingRef = useRef(null);

  const [userId, setUserId] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [message, setMessage] = useState("");

  const unreadCount = useMemo(() => {
    return alerts.filter((item) => item.is_read === false).length;
  }, [alerts]);

const loadAlerts = useSingleFlight(useCallback(async function(targetUserId, showLoader = false) {
  if (!targetUserId) return;
  if (showLoader) setLoading(true);
  setMessage("");
  try {
    const {
      data,
      error
    } = await supabase.from("alerts").select("*").eq("user_id", targetUserId).order("created_at", {
      ascending: false
    }).limit(40);
    if (error) {
      console.log("LOAD ALERTS ERROR:");
      setMessage("Unable to load alerts. Check your connection and try again.");
      setLoading(false);
      return;
    }
    setAlerts(data || []);
  } catch (_error) {
    console.log("LOAD ALERTS CATCH:");
    setMessage("Unable to load alerts. Check your connection and try again.");
  }
  setLoading(false);
}, []));
useEffect(() => {
  function startRealtime(currentUserId) {
    stopRealtime();
    const uniqueChannelName = "alerts-feed-" + currentUserId + "-" + Date.now();
    const channel = supabase.channel(uniqueChannelName);
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "alerts",
      filter: "user_id=eq." + currentUserId
    }, function () {
      loadAlerts(currentUserId, false);
    });
    channel.subscribe(function (status) {
      console.log("ALERTS REALTIME STATUS:");
    });
    channelRef.current = channel;
  }
  function stopRealtime() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }
  function startPolling(currentUserId) {
    stopPolling();
    pollingRef.current = setInterval(function () {
      loadAlerts(currentUserId, false);
    }, 20000);
  }
  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }
  let mounted = true;
  async function setupAlerts() {
    const {
      data,
      error
    } = await supabase.auth.getUser();
    if (error || !data?.user?.id) {
      if (mounted) {
        setUserId(null);
        setAlerts([]);
      }
      return;
    }
    const currentUserId = data.user.id;
    if (!mounted) return;
    setUserId(currentUserId);
    await loadAlerts(currentUserId, true);
      if (!mounted) return;
    startRealtime(currentUserId);
    startPolling(currentUserId);
  }
  setupAlerts().catch(error => {
    console.log("LOAD ALERT ACCOUNT ERROR:");
    if (mounted) { setMessage('Unable to load alerts. Please try again.'); setLoading(false); }
  });
  return function cleanup() {
    mounted = false;
    stopRealtime();
    stopPolling();
  };
}, [loadAlerts]);

  const markOneAsRead = async function markOneAsRead(alertId) {
    if (!alertId || !userId || readLocks.current.has(alertId)) return;
    readLocks.current.add(alertId);
    try {
      const {error} = await supabase.from('alerts').update({is_read: true}).eq('id', alertId).eq('user_id', userId);
      if (error) throw error;
      setAlerts(previous => previous.map(item => item.id === alertId ? {...item, is_read: true} : item));
    } catch (_error) {
      console.log("MARK ALERT READ ERROR:");
      setMessage('Unable to mark this alert as read. Please try again.');
    } finally { readLocks.current.delete(alertId); }
  };

  const markAllAsRead = useSingleFlight(async function markAllAsRead() {
    if (!userId || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const {error} = await supabase.from('alerts').update({is_read: true}).eq('user_id', userId).eq('is_read', false);
      if (error) throw error;
      setAlerts(previous => previous.map(item => ({...item, is_read: true})));
    } catch (_error) {
      console.log("MARK ALL ALERTS READ ERROR:");
      setMessage('Unable to mark alerts as read. Please try again.');
    } finally {setMarkingAll(false);}
  });

  function openAlerts() {
    setModalVisible(true);
    loadAlerts(userId, false);
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.86}
        style={[
          styles.bellButton,
          {
            width: Math.max(44, size),
            height: Math.max(44, size),
            borderRadius: Math.round(size * 0.34),
          },
        ]}
        onPress={openAlerts}
      >
        <Ionicons
          name={unreadCount > 0 ? "notifications" : "notifications-outline"}
          size={Math.round(size * 0.48)}
          color={colors.accent2}
        />

        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setModalVisible(false)}
          />

          <View style={[styles.panel, {paddingBottom: Math.max(24, insets.bottom + 16)}]}>
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Ionicons
                    name="notifications-outline"
                    size={24}
                    color={colors.accent2}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Alerts</Text>
                  <Text style={styles.subtitle}>
                    Tank warnings and system updates
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={colors.textStrong} />
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <Text style={styles.counterText}>
                {unreadCount > 0
                  ? unreadCount + " unread alert" + (unreadCount > 1 ? "s" : "")
                  : "All caught up"}
              </Text>

              {unreadCount > 0 ? (
                <TouchableOpacity disabled={markingAll} accessibilityRole="button" accessibilityLabel="Mark all alerts as read"
                  activeOpacity={0.82}
                  style={styles.markAllButton}
                  onPress={markAllAsRead}
                >
                  <Ionicons
                    name="checkmark-done-outline"
                    size={15}
                    color={colors.accent2}
                  />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={colors.accent2} />
                <Text style={styles.centerText}>Loading alerts...</Text>
              </View>
            ) : message ? (
              <View style={styles.centerBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={34}
                  color={colors.warning}
                />
                <Text style={styles.centerText}>{message}</Text>
              <TouchableOpacity style={styles.markAllButton} onPress={() => loadAlerts(userId, true)}><Text style={styles.markAllText}>Try Again</Text></TouchableOpacity>
              </View>
            ) : alerts.length === 0 ? (
              <EmptyAlerts />
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.alertList}
              >
                {alerts.map((item) => (
                  <AlertItem
                    key={item.id}
                    item={item}
                    onPress={() => markOneAsRead(item.id)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function AlertItem({ item, onPress }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const wording = formatPumpAlert(item);

  const severity = item.severity || "info";
  const unread = item.is_read === false;

  const iconName = getSeverityIcon(severity);
  const iconColor = getSeverityColor(severity, colors);
  const iconStyle = getSeverityStyle(severity, styles);

  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress}>
      <AppCard
        strong={unread}
        noShadow
        style={[styles.alertCard, unread && styles.alertCardUnread]}
      >
        <View style={[styles.alertIcon, iconStyle]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>

        <View style={styles.alertContent}>
          <View style={styles.alertTitleRow}>
            <Text style={styles.alertTitle} >
              {wording.title || "Tank Alert"}
            </Text>

            {unread ? <View style={styles.unreadDot} /> : null}
          </View>

          <Text style={styles.alertMessage} >
            {formatPhilippineAlertMessage(wording.message) || "No alert message."}
          </Text>

          <View style={styles.alertFooter}>
            <Text style={styles.alertType}>{formatType(item.type)}</Text>
            <Text style={styles.alertTime}>
              {formatDateTime(item.created_at)}
            </Text>
          </View>
        </View>
      </AppCard>
    </TouchableOpacity>
  );
}

function EmptyAlerts() {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIcon}>
        <CrayfishIcon size={42} color={colors.accent2} />
      </View>

      <Text style={styles.emptyTitle}>No alerts yet</Text>
      <Text style={styles.emptyText}>
        Tank warnings, ammonia updates, and important reminders will appear here.
      </Text>
    </View>
  );
}

function getSeverityIcon(severity) {
  if (severity === "critical" || severity === "danger") {
    return "warning-outline";
  }

  if (severity === "warning") {
    return "alert-circle-outline";
  }

  if (severity === "success") {
    return "checkmark-circle-outline";
  }

  return "information-circle-outline";
}

function getSeverityColor(severity, colors) {
  if (severity === "critical" || severity === "danger") {
    return colors.danger;
  }

  if (severity === "warning") {
    return colors.warning;
  }

  if (severity === "success") {
    return colors.success;
  }

  return colors.accent2;
}

function getSeverityStyle(severity, styles) {
  if (severity === "critical" || severity === "danger") {
    return styles.alertIconDanger;
  }

  if (severity === "warning") {
    return styles.alertIconWarning;
  }

  if (severity === "success") {
    return styles.alertIconSuccess;
  }

  return styles.alertIconInfo;
}

function formatType(type) {
  if (!type) return "System";

  return String(type)
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (char) {
      return char.toUpperCase();
    });
}

function formatDateTime(value) {
  return formatPhilippineDateTime(value, { year: undefined }, 'Recently');
}

function makeStyles(colors) {
  return StyleSheet.create({
  bellButton: { minHeight: 44,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.deep,
    alignItems: "center",
    justifyContent: "center",
  },

  badgeText: {
    color: colors.textStrong,
    fontSize: 12,
    fontWeight: "900",
  },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },

  backdrop: { minHeight: 44,
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
  },

  panel: {
    maxHeight: "82%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.deep,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    ...SHADOW.soft,
  },

  handle: {
    width: 48,
    height: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: colors.surfaceSoft,
    alignSelf: "center",
    marginBottom: 15,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    color: colors.textStrong,
    fontSize: 21,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },

  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  actionRow: {
    marginTop: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  counterText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },

  markAllButton: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  markAllText: {
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "900",
  },

  alertList: {
    gap: 10,
    paddingBottom: 12,
  },

  alertCard: {
    padding: 12,
    flexDirection: "row",
    gap: 11,
    backgroundColor: colors.surfaceSoft,
  },

  alertCardUnread: {
    backgroundColor: "rgba(34,211,197,0.11)",
  },

  alertIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  alertIconInfo: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },

  alertIconWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: "rgba(251,191,36,0.28)",
  },

  alertIconDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: "rgba(248,113,113,0.28)",
  },

  alertIconSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: "rgba(74,222,128,0.28)",
  },

  alertContent: {
    flex: 1,
  },

  alertTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  alertTitle: {
    flex: 1,
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: "900",
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },

  alertMessage: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },

  alertFooter: { flexWrap: "wrap",
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  alertType: {
    flex: 1,
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  alertTime: {
    color: colors.muted2,
    fontSize: 12,
    fontWeight: "800",
  },

  centerBox: {
    minHeight: 220,
    borderRadius: 24,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  centerText: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center",
  },

  emptyBox: {
    minHeight: 240,
    borderRadius: 24,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  emptyIcon: {
    width: 74,
    height: 74,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    marginTop: 13,
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "900",
  },

  emptyText: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
}
