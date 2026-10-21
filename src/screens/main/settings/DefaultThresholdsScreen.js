// src/screens/main/settings/DefaultThresholdsScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../../components/icons/CrayfishIcon";
import ClassificationSettings from '../../../components/tank/ClassificationSettings';
import AppCard from "../../../components/ui/AppCard";
import AppHeader from "../../../components/ui/AppHeader";
import AppScreen from "../../../components/ui/AppScreen";
import { COLORS, SHADOW } from "../../../constants/theme";
import { useAppTheme } from "../../../context/ThemeContext";
import { supabase } from '../../../lib/supabase';

import {
  DEFAULT_THRESHOLDS,
  fetchThresholdSettings,
  fetchTankThresholdSettings,
  normalizeThresholds,
} from "../../../utils/thresholdSettings";

const WEB_DASHBOARD_URL =
  "https://www.craythrive.site/login";

function formatNumber(
  value,
  fallback = 0,
  digits = 1
) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return Number(fallback).toFixed(digits);
  }

  return numberValue.toFixed(digits);
}

function buildThresholdCards(thresholds) {
  const safeThresholds =
    normalizeThresholds(thresholds);

  const temperatureMin =
    formatNumber(
      safeThresholds.temperatureMin,
      20,
      1
    );

  const temperatureMax =
    formatNumber(
      safeThresholds.temperatureMax,
      30,
      1
    );

  const phMin = formatNumber(
    safeThresholds.phMin,
    6.5,
    1
  );

  const phMax = formatNumber(
    safeThresholds.phMax,
    8.5,
    1
  );

  const ammoniaMax = formatNumber(
    safeThresholds.ammoniaMax,
    0.25,
    2
  );

  const turbidityClearMin =
    formatNumber(
      safeThresholds.turbidityMax,
      2.5,
      2
    );

  const waterSafeStart =
    formatNumber(
      safeThresholds.waterLevelMin,
      4.5,
      1
    );

  

  return [
    {
      id: "temperature",
      icon: "thermometer-outline",
      title: "Temperature",
      value: `${temperatureMin}°C – ${temperatureMax}°C`,
      helper:
        "Preferred temperature range used for tank status and alerts.",
    },

    {
      id: "ph",
      icon: "water-outline",
      title: "pH",
      value: `${phMin} – ${phMax}`,
      helper:
        "Preferred pH range used to evaluate Normal, Warning, and Critical conditions.",
    },

    {
      id: "ammonia",
      icon: "flask-outline",
      title: "Ammonia",
      value: `≤ ${ammoniaMax} ppm`,
      helper:
        "Maximum preferred result used when an ammonia test is recorded.",
    },

    {
      id: "turbidity",
      icon: "color-filter-outline",
      title: "Water Clarity",
      value: `≥ ${turbidityClearMin} V`,
      helper:
        "Your turbidity sensor uses voltage. Higher voltage represents clearer water.",
    },

    {
      id: "water",
      icon: "speedometer-outline",
      title: "Water Level",
      value: `≥ ${waterSafeStart} cm`,
      helper:
        "Minimum water depth used for monitoring. Lower levels need attention.",
    },
  ];
}

export default function DefaultThresholdsScreen({
  onBack,
}) {
  const theme = useSafeTheme();

  const colors = theme.colors;
  const isDark = theme.isDark;

  const styles = useMemo(
    () => makeStyles(colors, isDark),
    [colors, isDark]
  );

  const [fallbackThresholds, setThresholds] =
    useState(DEFAULT_THRESHOLDS);
  const [tanks, setTanks] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState(null);
  const [thresholdsByTank, setThresholdsByTank] = useState({});
  const thresholds = thresholdsByTank[String(selectedTankId)] || fallbackThresholds;

  const [
    isLoadingThresholds,
    setIsLoadingThresholds,
  ] = useState(false);

  const [
    thresholdSource,
    setThresholdSource,
  ] = useState(
    "Default values are shown until your saved settings are loaded."
  );

  const [usingFallback, setUsingFallback] =
    useState(false);

  const thresholdCards = useMemo(
    () =>
      buildThresholdCards(thresholds),
    [thresholds]
  );

  const loadThresholds = useCallback(async function loadThresholds() {
    try {
      setIsLoadingThresholds(true);
      setUsingFallback(false);

      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user?.id) throw new Error('Sign in to view thresholds.');
      const { data: rows, error } = await supabase.from('tanks').select('id,tank_name').eq('user_id', auth.user.id).order('created_at', { ascending: false });
      if (error) throw error;
      const ownedTanks = rows || [];
      const resolved = await fetchTankThresholdSettings(auth.user.id, ownedTanks.map(tank => tank.id));
      setThresholdsByTank(resolved);
      setTanks(ownedTanks);
      setSelectedTankId(current => ownedTanks.some(tank => tank.id === current) ? current : ownedTanks[0]?.id || null);
      if (!ownedTanks.length) setThresholds(await fetchThresholdSettings(auth.user.id));

      setThresholdSource(
        ownedTanks.length ? "Showing saved thresholds for the selected tank. Tanks without their own settings use account defaults."
          : "No tanks yet. Showing account defaults."
      );
    } catch (_error) {
      console.log("LOAD MOBILE THRESHOLD SETTINGS ERROR:");

      setUsingFallback(true);

      setThresholdSource(
        "Saved settings could not be refreshed. Displayed values may be older; try Refresh before relying on them."
      );
    } finally {
      setIsLoadingThresholds(false);
    }
  }, []);
  useEffect(() => { loadThresholds(); }, [loadThresholds]);

  async function openWebDashboard() {
    try {
      const supported =
        await Linking.canOpenURL(
          WEB_DASHBOARD_URL
        );

      if (!supported) {
        showNotice(
          "Unable to open web dashboard",
          "Please open www.craythrive.site manually."
        );

        return;
      }

      await Linking.openURL(
        WEB_DASHBOARD_URL
      );
    } catch (error) {
      console.log("OPEN WEB DASHBOARD ERROR:");

      showNotice(
        "Unable to open web dashboard",
        error?.message ||
          "Please try again."
      );
    }
  }

  function showNotice(
    title,
    message
  ) {
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined"
      ) {
        window.alert(
          `${title}\n\n${message}`
        );
      }

      return;
    }

    Alert.alert(title, message);
  }

  return (
    <AppScreen onBack={onBack}>
      <View style={styles.root}>
        <AppHeader
          eyebrow="Tank Preferences"
          title="Default Thresholds"
          subtitle="Review the ranges used for tank status, alerts, and recommendations."
          icon="options-outline"
          rightAction="close-outline"
          onRightPress={onBack}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            styles.scroll
          }
        >
          <AppCard
            strong
            style={styles.summaryCard}
          >
            <View
              style={
                styles.summaryIcon
              }
            >
              <CrayfishIcon
                size={31}
                color={colors.accent2}
              />
            </View>

            <View
              style={
                styles.summaryContent
              }
            >
              <Text
                style={
                  styles.summaryTitle
                }
              >
                Tank monitoring settings
              </Text>

              <Text
                style={
                  styles.summaryText
                }
              >
                Select a tank to review safe ranges and configure verified Critical limits and reading ages.
                Safe-range changes remain available through the web dashboard or a confirmed AI suggestion.
              </Text>
            </View>
          </AppCard>

          {tanks.length > 0 ? <View style={{ marginVertical: 12 }}>
            <Text style={{ color: colors.textStrong, fontWeight: '700', marginBottom: 8 }}>Selected tank</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {tanks.map(tank => <TouchableOpacity key={tank.id} onPress={() => setSelectedTankId(tank.id)}
                accessibilityRole="button" accessibilityState={{ selected: selectedTankId === tank.id }}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, marginRight: 8,
                  borderRadius: 14, borderWidth: 1, borderColor: selectedTankId === tank.id ? colors.accent2 : colors.border,
                  backgroundColor: colors.surfaceSoft }}>
                <Text style={{ color: selectedTankId === tank.id ? colors.accent2 : colors.textStrong }}>{tank.tank_name || 'Tank'}</Text>
              </TouchableOpacity>)}
            </ScrollView>
          </View> : null}

          <SyncStatus
            loading={
              isLoadingThresholds
            }
            fallback={usingFallback}
            text={thresholdSource}
            colors={colors}
            styles={styles}
          />

          <View
            style={
              styles.actionRow
            }
          >
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.webButton}
              onPress={
                openWebDashboard
              }
            >
              <View
                style={
                  styles.actionIcon
                }
              >
                <Ionicons
                  name="globe-outline"
                  size={20}
                  color={colors.accent2}
                />
              </View>

              <View
                style={
                  styles.actionContent
                }
              >
                <Text
                  style={
                    styles.actionTitle
                  }
                >
                  Edit on Web
                </Text>

                <Text
                  style={
                    styles.actionSubtitle
                  }
                >
                  Change your saved
                  threshold ranges
                </Text>
              </View>

              <Ionicons
                name="open-outline"
                size={18}
                color={colors.accent2}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.86}
              style={
                styles.refreshButton
              }
              onPress={loadThresholds}
              disabled={
                isLoadingThresholds
              }
            >
              {isLoadingThresholds ? (
                <ActivityIndicator
                  size="small"
                  color={colors.accent2}
                />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={20}
                  color={colors.accent2}
                />
              )}
            </TouchableOpacity>
          </View>

          <View
            style={
              styles.sectionHeader
            }
          >
            <View>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Current Ranges
              </Text>

              <Text
                style={
                  styles.sectionSubtitle
                }
              >
                Values currently used
                by the mobile app
              </Text>
            </View>

            <View
              style={styles.syncedPill}
            >
              <View
                style={[
                  styles.syncedDot,
                  usingFallback &&
                    styles.fallbackDot,
                ]}
              />

              <Text
                style={
                  styles.syncedText
                }
              >
                {usingFallback
                  ? "Refresh needed"
                  : "Synced"}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.thresholdList
            }
          >
            {thresholdCards.map(
              (item) => (
                <ThresholdCard
                  key={item.id}
                  item={item}
                  colors={colors}
                  styles={styles}
                />
              )
            )}
          </View>

          <View
            style={styles.infoNote}
          >
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={colors.muted2}
            />

            <Text
              style={
                styles.infoNoteText
              }
            >
              Thresholds help classify
              readings and generate
              alerts. They do not replace
              regular observation of the
              tank and crayfish.
            </Text>
          </View>
          <ClassificationSettings key={selectedTankId || 'none'} tankId={selectedTankId} thresholds={thresholds} colors={colors}
            disabled={usingFallback || isLoadingThresholds} onSaved={loadThresholds} />
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function SyncStatus({
  loading,
  fallback,
  text,
  colors,
  styles,
}) {
  return (
    <View
      style={[
        styles.syncCard,
        fallback &&
          styles.syncCardFallback,
      ]}
    >
      <View
        style={styles.syncIcon}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.accent2}
          />
        ) : (
          <Ionicons
            name={
              fallback
                ? "cloud-offline-outline"
                : "cloud-done-outline"
            }
            size={19}
            color={
              fallback
                ? colors.warning
                : colors.accent2
            }
          />
        )}
      </View>

      <View
        style={
          styles.syncContent
        }
      >
        <Text
          style={
            styles.syncTitle
          }
        >
          {loading
            ? "Loading thresholds"
            : fallback
            ? "Using default values"
            : "Thresholds are up to date"}
        </Text>

        <Text
          style={
            styles.syncText
          }
        >
          {loading
            ? "Checking your saved settings..."
            : text}
        </Text>
      </View>
    </View>
  );
}

function ThresholdCard({
  item,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.thresholdCard
      }
    >
      <View
        style={
          styles.thresholdIcon
        }
      >
        <Ionicons
          name={item.icon}
          size={20}
          color={colors.accent2}
        />
      </View>

      <View
        style={
          styles.thresholdContent
        }
      >
        <View
          style={
            styles.thresholdTitleRow
          }
        >
          <Text
            style={
              styles.thresholdTitle
            }
          >
            {item.title}
          </Text>

          <Text
            style={
              styles.thresholdValue
            }
          >
            {item.value}
          </Text>
        </View>

        <Text
          style={
            styles.thresholdText
          }
        >
          {item.helper}
        </Text>
      </View>
    </View>
  );
}

function useSafeTheme() {
  try {
    return useAppTheme();
  } catch {
    return {
      colors: COLORS,
      isDark: true,
    };
  }
}

function makeStyles(
  colors,
  isDark
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 22,
    },

    scroll: {
      paddingTop: 3,
      paddingBottom: 140,
    },

    summaryCard: {
      padding: 15,
      borderRadius: 20,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surface,
      borderColor:
        colors.border,
      ...SHADOW.soft,
    },

    summaryIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    summaryContent: {
      flex: 1,
    },

    summaryTitle: {
      color:
        colors.textStrong ||
        colors.white,
      fontSize: 14,
      fontWeight: "700",
    },

    summaryText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "400",
    },

    syncCard: {
      marginTop: 12,
      padding: 12,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    syncCardFallback: {
      backgroundColor:
        colors.warningSoft,
      borderColor:
        "rgba(251,191,36,0.22)",
    },

    syncIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: isDark
        ? "rgba(255,255,255,0.045)"
        : "rgba(8,31,48,0.04)",
    },

    syncContent: {
      flex: 1,
    },

    syncTitle: {
      color:
        colors.textStrong ||
        colors.white,
      fontSize: 12,
      fontWeight: "600",
    },

    syncText: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    actionRow: {
      marginTop: 12,
      flexDirection: "row",
      gap: 9,
    },

    webButton: {
      flex: 1,
      minHeight: 64,
      borderRadius: 17,
      paddingHorizontal: 11,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    refreshButton: {
      width: 64,
      minHeight: 64,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    actionIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor:
        colors.accentSoft,
    },

    actionContent: {
      flex: 1,
      minWidth: 0,
    },

    actionTitle: {
      color:
        colors.textStrong ||
        colors.white,
      fontSize: 12,
      fontWeight: "600",
    },

    actionSubtitle: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    sectionHeader: {
      marginTop: 26,
      marginBottom: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    sectionTitle: {
      color:
        colors.textStrong ||
        colors.white,
      fontSize: 16,
      fontWeight: "700",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    syncedPill: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    syncedDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor:
        colors.success,
    },

    fallbackDot: {
      backgroundColor:
        colors.warning,
    },

    syncedText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
    },

    thresholdList: {
      gap: 9,
    },

    thresholdCard: {
      minHeight: 90,
      padding: 13,
      borderRadius: 17,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    thresholdIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 11,
      backgroundColor:
        colors.accentSoft,
    },

    thresholdContent: {
      flex: 1,
      minWidth: 0,
    },

    thresholdTitleRow: { flexWrap: "wrap",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 10,
    },

    thresholdTitle: {
      flexShrink: 1,
      color:
        colors.textStrong ||
        colors.white,
      fontSize: 12.5,
      fontWeight: "600",
    },

    thresholdValue: { flexShrink: 1,
      color: colors.accent2,
      fontSize: 12.5,
      fontWeight: "700",
      textAlign: "right",
    },

    thresholdText: {
      marginTop: 5,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    infoNote: {
      marginTop: 18,
      paddingHorizontal: 5,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
    },

    infoNoteText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },
  });
}
