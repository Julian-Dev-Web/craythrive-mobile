import { formatPhilippineDateTime, parseTimestamp } from '../../utils/philippineTime';
import { fetchServerTime, getServerNow } from '../../utils/serverClock';
import { fetchTankThresholdSettings } from '../../utils/thresholdSettings';
import SensorReadingCard, { MonitoringBadge } from '../../components/tank/SensorReadingCard';
import { evaluateMonitoring, combineMonitoringReadings, fetchPairedTankIds, fetchLatestMonitoringRows , mergeMonitoringTank, monitoringRequestVersion } from '../../utils/sensorMonitoring';
// src/screens/main/DashboardScreen.js

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppButton from "../../components/ui/AppButton";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";
import SectionHeader from "../../components/ui/SectionHeader";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import useSingleFlight from '../../hooks/useSingleFlight';
import useMonitoringSync from '../../hooks/useMonitoringSync';

export default function DashboardScreen({
  onLogout,
  onAddTank,
  onOpenTank,
}) {
  const { colors, styles } = useThemePack();

  const [tanks, setTanks] = useState([]);
  const [profileName, setProfileName] = useState("CrayThrive User");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const loadGuard=useRef({active:true,generation:0,retry:true});
  const monitoringSync = useMonitoringSync(tanks.map(tank => tank.id), snapshot => {
    setTanks(current => current.map(tank => {
      const id=String(tank.id), sensor=snapshot.sensors.find(row=>String(row.tank_id)===id) || null,
        scan=snapshot.scans.find(row=>String(row.tank_id)===id) || null;
      if(String(tank.user_id)!==String(snapshot.userId)) return tank;
      return mergeMonitoringTank(tank,{...tank,latest_sensor:sensor,latest_ammonia:scan,
        latest_reading:combineMonitoringReadings(sensor,scan),monitoring_thresholds:snapshot.thresholds[id],
        has_paired_device:snapshot.paired.has(id),monitoring_version:snapshot.version});
    }));
  }, () => {loadGuard.current.generation++;setTanks([]);});
  

  const loadDashboard = useSingleFlight(useCallback(async function({
  showLoading = true
} = {}) {
  if (!loadGuard.current.active) return;
  const monitoringVersion = monitoringRequestVersion();
  const loadGeneration=loadGuard.current.generation;
  const applicable = () => loadGuard.current.active && loadGeneration === loadGuard.current.generation;
  loadGuard.current.retry = true;
  if (showLoading) {
    setLoading(true);
  }
  setMessage("");
  try {
    const {
      data: userData,
      error: userError
    } = await supabase.auth.getUser();
    if (!applicable()) return;
    if (userError || !userData?.user?.id) {
      setMessage("Unable to refresh your account. Check your connection and try again.");
      return;
    }
    const userId = userData.user.id;
      await fetchServerTime().catch(() => null);
    const {
      data: profileData,
      error: profileError
    } = await supabase.from("profiles").select("username, full_name, email").eq("id", userId).maybeSingle();
    if (!applicable()) return;
    if (profileError) {
      console.log("LOAD PROFILE ERROR:");
    }
    const nextProfileName = profileData?.username || profileData?.full_name || buildUsernameFromEmail(profileData?.email || userData.user.email);
    setProfileName(nextProfileName || "CrayThrive User");
    const {
      data: tankData,
      error: tankError
    } = await supabase.from("tanks").select("*").eq("user_id", userId).order("created_at", {
      ascending: false
    });
    if (!applicable()) return;
    if (tankError) {
      console.log("LOAD TANKS ERROR:");
      setMessage("Unable to load your tanks.");
      return;
    }
    const tankList = tankData || [];
    const tankIds = tankList.map(tank => tank.id);
    const thresholdsByTank = await fetchTankThresholdSettings(userId, tankIds);
    const latestReadingByTank = {};
    const latestAmmoniaByTank = {};
    const pairedIds = await fetchPairedTankIds(userId, tankIds);
 const latestRows = await fetchLatestMonitoringRows(userId, tankIds, {version:monitoringVersion});
 latestRows.sensors.forEach(row => { latestReadingByTank[row.tank_id] = row; });
 latestRows.scans.forEach(row => { latestAmmoniaByTank[row.tank_id] = row; });
    
    
    const mappedTanks = tankList.map(tank => {
      const latestReading = combineMonitoringReadings(latestReadingByTank[tank.id], latestAmmoniaByTank[tank.id]);
      return {
        ...tank,
        monitoring_version: monitoringVersion,
        monitoring_thresholds: thresholdsByTank[String(tank.id)],
        owner_name: nextProfileName,
        latest_sensor: latestReadingByTank[tank.id] || null,
        latest_ammonia: latestAmmoniaByTank[tank.id] || null,
        latest_reading: latestReading,
        has_paired_device: pairedIds.has(String(tank.id))
      };
    });
    if(!loadGuard.current.active || loadGeneration!==loadGuard.current.generation)return;
    loadGuard.current.retry = false;
    setTanks(current=>mappedTanks.map(tank => mergeMonitoringTank(current.find(item => String(item.id)===String(tank.id)),tank)));
  } catch (_error) {
    console.log("LOAD DASHBOARD CATCH ERROR:");
    if (applicable()) setMessage("Unable to refresh your tanks. Check your connection and try again.");
  } finally {
    if (applicable()) {
      setLoading(false);
      setRefreshing(false);
    }
  }
}, []));
  useEffect(()=>{const guard=loadGuard.current;guard.active=true;void loadDashboard();return()=>{guard.active=false;guard.generation++;};},[loadDashboard]);
  useEffect(() => {
    let active = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', next => {
      const resumed = next === 'active' && !active;
      active = next === 'active';
      if (resumed) void loadDashboard({ showLoading: false });
    });
    // Also retries an initial offline load with no tanks/subscriptions yet.
    const timer = setInterval(() => {
      if (active && loadGuard.current.retry) void loadDashboard({ showLoading: false });
    }, 60000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [loadDashboard]);

  async function handleRefresh() {
    setRefreshing(true);

    await loadDashboard({
      showLoading: false,
    });
  }

  return (
    <AppScreen>
      <View style={styles.root}>
        {monitoringSync.error ? <Text accessibilityRole="alert" style={{color:colors.muted,fontSize:12,lineHeight:18}}>{monitoringSync.error}</Text> : null}
        <AppHeader
          eyebrow="CrayThrive"
          title="My Tanks"
          subtitle="Choose a tank to view readings, alerts, controls, and ammonia records."
          icon="water-outline"
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            styles.scroll
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent2}
              colors={[colors.accent2]}
            />
          }
        >
          <View style={styles.welcomeRow}>
            <View style={styles.welcomeTextWrap}>
              <Text style={styles.welcomeLabel}>
                Welcome back
              </Text>

              <Text
                style={styles.welcomeName}
                numberOfLines={1}
              >
                {profileName}
              </Text>
            </View>

            <View style={styles.tankCountBox}>
              <Text style={styles.tankCountValue}>
                {tanks.length}
              </Text>

              <Text style={styles.tankCountLabel}>
                {tanks.length === 1
                  ? "Tank"
                  : "Tanks"}
              </Text>
            </View>
          </View>

          <SectionHeader
            title="Your tanks"
            action={
              loading
                ? "Loading..."
                : `${tanks.length} total`
            }
          />

          {loading ? (
            <LoadingState
              colors={colors}
              styles={styles}
            />
          ) : message ? (
            <ErrorState
              message={message}
              colors={colors}
              styles={styles}
              onRetry={() =>
                loadDashboard()
              }
            />
          ) : tanks.length === 0 ? (
            <EmptyTankState
              colors={colors}
              styles={styles}
              onAddTank={onAddTank}
            />
          ) : (
            <View style={styles.tankList}>
              {tanks.map((tank) => (
                <TankCard
                  key={tank.id}
                  tank={tank}
                  thresholds={tank.monitoring_thresholds}
                  colors={colors}
                  styles={styles}
                  onPress={() =>
                    onOpenTank?.(tank)
                  }
                />
              ))}
            </View>
          )}
        </ScrollView>

        {!loading ? (
          <TouchableOpacity
            activeOpacity={0.86}
            style={
              styles.floatingAddButton
            }
            onPress={onAddTank}
          >
            <Ionicons
              name="add"
              size={28}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </AppScreen>
  );
}

function TankCard({ tank, thresholds, colors, styles, onPress }) {
  const reading = tank.latest_reading;

  const overallStatus =
    getOverallTankStatus(
      reading,
      tank.has_paired_device, thresholds
    );

  const deviceState =
    getDeviceDisplayState(
      tank.has_paired_device,
      reading
    );

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
    >
      <AppCard
        strong
        style={styles.tankCard}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.stagePill}>
            <Ionicons
              name="fish-outline"
              size={13}
              color={colors.accent2}
            />

            <Text
              style={styles.stagePillText}
            >
              {formatStage(
                tank.tank_type
              )}
            </Text>
          </View>

          <StatusBadge
            label={overallStatus.label}
            tone={overallStatus.tone}
            styles={styles}
           colors={colors} />
        </View>

        <Text
          style={styles.tankName}
          numberOfLines={2}
        >
          {tank.tank_name ||
            "Unnamed Tank"}
        </Text>

        <Text
          style={styles.tankDescription}
        >
          {getTankSummary(
            reading,
            tank.has_paired_device, thresholds
          )}
        </Text>

        <View style={styles.infoSection}>
          <InfoRow
            icon={
              deviceState.icon
            }
            label="Device"
            value={deviceState.label}
            tone={deviceState.tone}
            colors={colors}
            styles={styles}
          />

          <View
            style={
              styles.infoDivider
            }
          />

          <InfoRow
            icon="time-outline"
            label="Last water reading"
            value={
              reading?.created_at
                ? formatRelativeTime(
                    reading.created_at
                  )
                : "No readings yet"
            }
            colors={colors}
            styles={styles}
          />
        </View>

        {
          <LatestReadingSummary
            reading={reading}
            thresholds={thresholds}
            colors={colors}
            styles={styles}
           paired={tank.has_paired_device} />
        }

        <View style={styles.detailsButton}>
          <Text
            style={
              styles.detailsButtonText
            }
          >
            View Tank
          </Text>

          <View
            style={
              styles.detailsArrow
            }
          >
            <Ionicons
              name="arrow-forward"
              size={17}
              color="#001B1F"
            />
          </View>
        </View>
      </AppCard>
    </TouchableOpacity>
  );
}

function LatestReadingSummary({ paired, reading, thresholds, colors, styles }) {
 const result = evaluateMonitoring(reading, thresholds, { paired });
 return <View style={styles.latestReadingBox}><Text style={styles.latestReadingTitle}>Latest snapshot</Text>
 <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Overall sensor condition: {result.sensorCondition}</Text>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
 {['temperature', 'ph', 'turbidity', 'water', 'ammonia'].map(key => <SensorReadingCard key={key} compact metric={result.metrics[key]} colors={colors} />)}
 </View></View>;
}

function InfoRow({
  icon,
  label,
  value,
  tone,
  colors,
  styles,
}) {
  const valueStyle =
    tone &&
    styles[
      `${tone}InfoValue`
    ];

  return (
    <View style={styles.infoRow}>
      <View
        style={
          styles.infoRowIcon
        }
      >
        <Ionicons
          name={icon}
          size={17}
          color={colors.accent2}
        />
      </View>

      <View
        style={
          styles.infoRowContent
        }
      >
        <Text
          style={
            styles.infoRowLabel
          }
        >
          {label}
        </Text>

        <Text
          style={[
            styles.infoRowValue,
            valueStyle,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function StatusBadge({ label, tone, type, colors }) { return <MonitoringBadge result={{ label, tone: tone || type }} colors={colors} />; }

function LoadingState({
  colors,
  styles,
}) {
  return (
    <View style={styles.centerBox}>
      <ActivityIndicator
        color={colors.accent2}
      />

      <Text
        style={styles.centerTitle}
      >
        Loading tanks
      </Text>

      <Text
        style={styles.centerText}
      >
        Getting your latest tank
        information.
      </Text>
    </View>
  );
}

function ErrorState({
  message,
  colors,
  styles,
  onRetry,
}) {
  return (
    <View style={styles.centerBox}>
      <View
        style={
          styles.stateIcon
        }
      >
        <Ionicons
          name="alert-circle-outline"
          size={28}
          color={colors.warning}
        />
      </View>

      <Text
        style={styles.centerTitle}
      >
        Couldn&apos;t load tanks
      </Text>

      <Text
        style={styles.centerText}
      >{message}</Text>

      <AppButton
        title="Try Again"
        icon="refresh-outline"
        onPress={onRetry}
        style={styles.retryButton}
      />
    </View>
  );
}

function EmptyTankState({
  colors,
  styles,
  onAddTank,
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <CrayfishIcon
          size={38}
          color={colors.accent2}
        />
      </View>

      <Text
        style={styles.emptyTitle}
      >
        Add your first tank
      </Text>

      <Text
        style={styles.emptySubtitle}
      >
        Create a breeder or juvenile
        tank, then pair a device when
        you&apos;re ready to start
        monitoring.
      </Text>

      <AppButton
        title="Add Tank"
        icon="add-circle-outline"
        onPress={onAddTank}
        style={styles.emptyButton}
      />
    </View>
  );
}


function getTankSummary(reading, hasPairedDevice, thresholds) { return evaluateMonitoring(reading, thresholds, { paired: hasPairedDevice }).message; }

function getDeviceDisplayState(
  hasPairedDevice,
  reading
) {
  if (!hasPairedDevice) {
    return {
      label: "Unpaired",
      tone: "warning",
      icon: "link-outline",
    };
  }

  if (!reading) {
    return {
      label: "Paired · Waiting for data",
      tone: "neutral",
      icon: "hardware-chip-outline",
    };
  }

  return {
    label: "Paired",
    tone: "success",
    icon: "hardware-chip-outline",
  };
}

function getOverallTankStatus(reading, hasPairedDevice, thresholds) { return evaluateMonitoring(reading, thresholds, { paired: hasPairedDevice }); }







function formatStage(value) {
  const text = String(
    value || "Tank"
  ).trim();

  if (!text) return "Tank";

  return text
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function formatRelativeTime(value) {
  if (!value) return 'No readings yet';
 const date = parseTimestamp(value), now = getServerNow();
 if (!date) return 'Timestamp unavailable';
 if (!now || now < date) return formatPhilippineDateTime(value);
 const minutes = Math.floor((now - date) / 60000);
 if (minutes < 1) return 'Just now';
 if (minutes < 60) return minutes + ' min ago';
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return hours + ' hr' + (hours === 1 ? '' : 's') + ' ago';
 const days = Math.floor(hours / 24);
 return days <= 7 ? days + ' day' + (days === 1 ? '' : 's') + ' ago' : formatPhilippineDateTime(value);
}

function buildUsernameFromEmail(
  email
) {
  const value = String(
    email || ""
  ).trim();

  if (!value.includes("@")) {
    return "CrayThrive User";
  }

  return (
    value.split("@")[0] ||
    "CrayThrive User"
  );
}

function useThemePack() {
  const theme = useAppTheme();

  const isDark =
    theme?.isDark ?? true;

  const colors =
    useMemo(() => {
      return normalizeColors(
        theme?.colors || COLORS,
        isDark
      );
    }, [
      theme?.colors,
      isDark,
    ]);

  const styles =
    useMemo(() => {
      return makeStyles(colors);
    }, [colors]);

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
  };
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 22,
    },

    scroll: {
      paddingTop: 4,
      paddingBottom: 150,
    },

    welcomeRow: {
      marginTop: 6,
      marginBottom: 26,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
    },

    welcomeTextWrap: {
      flex: 1,
    },

    welcomeLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "500",
    },

    welcomeName: {
      marginTop: 3,
      color: colors.textStrong,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "700",
      letterSpacing: -0.25,
    },

    tankCountBox: {
      minWidth: 66,
      minHeight: 54,
      paddingHorizontal: 12,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    tankCountValue: {
      color: colors.accent2,
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "800",
    },

    tankCountLabel: {
      marginTop: 1,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "500",
    },

    tankList: {
      gap: 14,
    },

    tankCard: {
      padding: 17,
      borderRadius: 22,
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.border,
      ...SHADOW.card,
    },

    cardTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 12,
    },

    stagePill: {
      minHeight: 28,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    stagePillText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    statusBadge: {
      minHeight: 29,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
    },

    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },

    statusBadgeText: {
      fontSize: 12,
      fontWeight: "700",
    },

    dangerBadge: {
      backgroundColor:
        colors.dangerSoft,
      borderColor:
        "rgba(248,113,113,0.25)",
    },

    warningBadge: {
      backgroundColor:
        colors.warningSoft,
      borderColor:
        "rgba(251,191,36,0.25)",
    },

    successBadge: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.25)",
    },

    neutralBadge: {
      backgroundColor:
        colors.surfaceSoft,
      borderColor:
        colors.border,
    },

    dangerDot: {
      backgroundColor:
        colors.danger,
    },

    warningDot: {
      backgroundColor:
        colors.warning,
    },

    successDot: {
      backgroundColor:
        colors.success,
    },

    neutralDot: {
      backgroundColor:
        colors.muted2,
    },

    dangerBadgeText: {
      color: colors.danger,
    },

    warningBadgeText: {
      color: colors.warning,
    },

    successBadgeText: {
      color: colors.success,
    },

    neutralBadgeText: {
      color: colors.muted,
    },

    tankName: {
      marginTop: 15,
      color: colors.textStrong,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: "750",
      letterSpacing: -0.4,
    },

    tankDescription: {
      marginTop: 6,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },

    infoSection: {
      marginTop: 17,
      borderRadius: 16,
      paddingHorizontal: 12,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },

    infoRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
    },

    infoRowIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor:
        colors.accentSoft,
    },

    infoRowContent: {
      flex: 1,
    },

    infoRowLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    infoRowValue: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    successInfoValue: {
      color: colors.success,
    },

    warningInfoValue: {
      color: colors.warning,
    },

    neutralInfoValue: {
      color: colors.muted,
    },

    infoDivider: {
      height: 1,
      marginLeft: 44,
      backgroundColor:
        colors.border,
    },

    latestReadingBox: {
      marginTop: 14,
      padding: 12,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    latestReadingHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginBottom: 11,
    },

    latestReadingTitle: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
    },

    snapshotRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    snapshotItem: {
      flex: 1,
      alignItems: "center",
    },

    snapshotValue: {
      color: colors.textStrong,
      fontSize: 13.5,
      fontWeight: "700",
    },

    snapshotLabel: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    snapshotDivider: {
      width: 1,
      height: 28,
      backgroundColor:
        colors.border,
    },

    detailsButton: {
      position: "relative",
      marginTop: 15,
      height: 50,
      borderRadius: 16,
      backgroundColor:
        colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },

    detailsButtonText: {
      color: "#001B1F",
      fontSize: 13.5,
      fontWeight: "700",
    },

    detailsArrow: {
      position: "absolute",
      right: 8,
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        "rgba(0,27,31,0.08)",
    },

    floatingAddButton: {
      position: "absolute",
      right: 22,
      bottom: 102,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor:
        colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      ...SHADOW.soft,
    },

    centerBox: {
      marginTop: 22,
      borderRadius: 20,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
      alignItems: "center",
    },

    stateIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.warningSoft,
    },

    centerTitle: {
      marginTop: 12,
      color: colors.textStrong,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },

    centerText: {
      marginTop: 7,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
      textAlign: "center",
    },

    retryButton: {
      marginTop: 18,
      width: "100%",
    },

    emptyState: {
      marginTop: 22,
      borderRadius: 22,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: "center",
    },

    emptyIcon: {
      width: 70,
      height: 70,
      borderRadius: 22,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    emptyTitle: {
      marginTop: 15,
      color: colors.textStrong,
      fontSize: 18,
      fontWeight: "700",
    },

    emptySubtitle: {
      marginTop: 7,
      maxWidth: 300,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
      textAlign: "center",
    },

    emptyButton: {
      marginTop: 19,
      width: "100%",
    },
  });
}
