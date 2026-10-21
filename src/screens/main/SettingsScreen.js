// src/screens/main/SettingsScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";
import SectionHeader from "../../components/ui/SectionHeader";

import {
  RADIUS,
  SHADOW,
} from "../../constants/theme";

import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";

import AboutCrayThriveScreen from "./settings/AboutCrayThriveScreen";
import DefaultThresholdsScreen from "./settings/DefaultThresholdsScreen";
import EditProfileScreen from "./settings/EditProfileScreen";
import SecurityScreen from "./settings/SecurityScreen";
import SellerProfileScreen from "./settings/SellerProfileScreen";
import useSingleFlight from '../../hooks/useSingleFlight';
import ResilientImage from '../../components/ui/ResilientImage';

const WEB_DASHBOARD_URL =
  "https://www.craythrive.site/login";

const DEFAULT_NOTIFICATION_PREFS = {
  tank_alerts: true,
  marketplace_alerts: true,
  feeding_alerts: true,
  pump_alerts: true,
};

export default function SettingsScreen({
  onLogout,
}) {
  const {
    themeMode,
    colors,
    isDark,
    setThemeMode,
  } = useAppTheme();

  const styles = useMemo(
    () =>
      makeStyles(
        colors,
        isDark
      ),
    [colors, isDark]
  );

  const [
    settingsView,
    setSettingsView,
  ] = useState("main");

  const [userId, setUserId] =
    useState("");

  const [
    userEmail,
    setUserEmail,
  ] = useState("");

  const [
    username,
    setUsername,
  ] = useState("");

  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState("");

  const [
    notificationPrefs,
    setNotificationPrefs,
  ] = useState(
    DEFAULT_NOTIFICATION_PREFS
  );

  const [loading, setLoading] =
    useState(true);

  const [
    savingPrefs,
    setSavingPrefs,
  ] = useState(false);

  const [
    loadingLogout,
    setLoadingLogout,
  ] = useState(false);

  const [message, setMessage] =
    useState("");



  

  

  const loadNotificationPreferences = useCallback(async (
    targetUserId
  ) => {
    if (!targetUserId) {
      return;
    }

    try {
      const {
        data,
        error,
      } = await supabase
        .from(
          "notification_preferences"
        )
        .select("*")
        .eq(
          "user_id",
          targetUserId
        )
        .maybeSingle();

      if (error) {
        console.log("LOAD NOTIFICATION PREFS ERROR:");

        return;
      }

      if (!data) {
        await createDefaultNotificationPreferences(
          targetUserId
        );

        setNotificationPrefs(
          DEFAULT_NOTIFICATION_PREFS
        );

        return;
      }

      setNotificationPrefs({
        tank_alerts:
          typeof data.tank_alerts ===
          "boolean"
            ? data.tank_alerts
            : DEFAULT_NOTIFICATION_PREFS.tank_alerts,

        marketplace_alerts:
          typeof data.marketplace_alerts ===
          "boolean"
            ? data.marketplace_alerts
            : DEFAULT_NOTIFICATION_PREFS.marketplace_alerts,

        feeding_alerts:
          typeof data.feeding_alerts ===
          "boolean"
            ? data.feeding_alerts
            : DEFAULT_NOTIFICATION_PREFS.feeding_alerts,

        pump_alerts:
          typeof data.pump_alerts ===
          "boolean"
            ? data.pump_alerts
            : DEFAULT_NOTIFICATION_PREFS.pump_alerts,
      });
    } catch (_error) {
      console.log("LOAD NOTIFICATION PREFS CATCH:");
    }
  }, []);

  

  const updateNotificationPreference = useSingleFlight(async function updateNotificationPreference(
    key,
    value
  ) {
    if (!userId) {
      showNotice(
        "Account unavailable",
        "Please sign in again before changing notification settings."
      );

      return;
    }

    const previousPrefs = {
      ...notificationPrefs,
    };

    const nextPrefs = {
      ...notificationPrefs,
      [key]: value,
    };

    setNotificationPrefs(
      nextPrefs
    );

    setSavingPrefs(true);
    setMessage("");

    try {
      const { error } =
        await supabase
          .from(
            "notification_preferences"
          )
          .upsert(
            {
              user_id:
                userId,

              ...nextPrefs,
            },
            {
              onConflict:
                "user_id",
            }
          );

      if (error) {
        console.log("UPDATE NOTIFICATION PREF ERROR:");

        setNotificationPrefs(
          previousPrefs
        );

        showNotice(
          "Setting not saved",
          getFriendlyPreferenceError(
            error
          )
        );
      }
    } catch (error) {
      console.log("UPDATE NOTIFICATION PREF CATCH:");

      setNotificationPrefs(
        previousPrefs
      );

      showNotice(
        "Setting not saved",
        error?.message ||
          "Unable to save this notification preference."
      );
    } finally {
      setSavingPrefs(false);
    }
  });

  async function openWebDashboard() {
    try {
      const supported =
        await Linking.canOpenURL(
          WEB_DASHBOARD_URL
        );

      if (!supported) {
        showNotice(
          "Unable to open web dashboard",
          "Please open CrayThrive Web from your browser."
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
    text
  ) {
    if (
      Platform.OS === "web"
    ) {
      if (
        typeof window !==
        "undefined"
      ) {
        window.alert(
          `${title}\n\n${text}`
        );
      }

      return;
    }

    Alert.alert(
      title,
      text
    );
  }

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const {
        data,
        error,
      } =
        await supabase.auth.getUser();

      if (error) {
        throw new Error(
          error.message ||
            "Unable to load your account."
        );
      }

      const user = data?.user;

      if (!user?.id) {
        throw new Error(
          "No signed-in account was found. Please sign in again."
        );
      }

      const meta =
        user.user_metadata || {};

      setUserId(user.id);

      setUserEmail(
        user.email || ""
      );

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, full_name, email, avatar_url"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.log("LOAD SETTINGS PROFILE ERROR:");
      }

      const nextUsername =
        profileData?.username ||
        meta.username ||
        profileData?.full_name ||
        meta.full_name ||
        buildUsernameFromEmail(
          user.email
        );

      const nextAvatarUrl =
        profileData?.avatar_url ||
        meta.avatar_url ||
        "";

      setUsername(
        nextUsername ||
          "CrayThrive User"
      );

      setAvatarUrl(
        nextAvatarUrl || ""
      );

      /*
       * Only create the profile if the
       * profile lookup itself succeeded
       * and confirmed that no row exists.
       */
      if (
        !profileError &&
        !profileData
      ) {
        await createProfileIfMissing(
          user.id,
          user.email,
          nextUsername,
          nextAvatarUrl
        );
      }

      await loadNotificationPreferences(
        user.id
      );
    } catch (error) {
      console.log("LOAD SETTINGS ERROR:");

      setMessage(
        error?.message ||
          "Unable to load settings."
      );
    } finally {
      setLoading(false);
    }
  }, [loadNotificationPreferences]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleLogout = useSingleFlight(async function handleLogout() {
    setLoadingLogout(true);

    try {
      await onLogout?.();
    } catch (error) {
      console.log("LOGOUT ERROR:");

      showNotice(
        "Logout failed",
        error?.message ||
          "Unable to log out."
      );
    } finally {
      setLoadingLogout(false);
    }
  });

  function goBackToMain() {
    setSettingsView("main");
  }

  /*
  |--------------------------------------------------------------------------
  | SUB-SCREENS
  |--------------------------------------------------------------------------
  */

  if (
    settingsView ===
    "editProfile"
  ) {
    return (
      <EditProfileScreen
        onBack={goBackToMain}
        onProfileUpdated={
          loadSettings
        }
      />
    );
  }

  if (
    settingsView ===
    "security"
  ) {
    return (
      <SecurityScreen
        onBack={goBackToMain}
      />
    );
  }

  if (
    settingsView ===
    "sellerProfile"
  ) {
    return (
      <SellerProfileScreen
        onBack={goBackToMain}
      />
    );
  }

  if (
    settingsView ===
    "thresholds"
  ) {
    return (
      <DefaultThresholdsScreen
        onBack={goBackToMain}
      />
    );
  }

  if (
    settingsView ===
    "about"
  ) {
    return (
      <AboutCrayThriveScreen
        onBack={goBackToMain}
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | MAIN SETTINGS
  |--------------------------------------------------------------------------
  */

  return (
    <AppScreen>
      <View style={styles.root}>
        <AppHeader
          eyebrow="Account"
          title="Settings"
          subtitle="Manage your profile, preferences, notifications, and account."
          icon="settings-outline"
          rightAction="refresh-outline"
          onRightPress={
            loadSettings
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.scroll
          }
        >
          {loading ? (
            <LoadingSettings
              styles={styles}
              colors={colors}
            />
          ) : (
            <>
              {/* PROFILE */}
              <AppCard
                strong
                style={
                  styles.profileCard
                }
              >
                <View
                  style={
                    styles.avatarWrap
                  }
                >
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
                      size={39}
                      color={
                        colors.accent2
                      }
                    />
                  )}
                </View>

                <View
                  style={
                    styles.profileInfo
                  }
                >
                  <Text
                    style={
                      styles.profileName
                    }
                    numberOfLines={1}
                  >
                    {username ||
                      "CrayThrive User"}
                  </Text>

                  <Text
                    style={
                      styles.profileEmail
                    }
                    numberOfLines={1}
                  >
                    {userEmail ||
                      "Email unavailable"}
                  </Text>

                  <View
                    style={
                      styles.roleRow
                    }
                  >
                    <View
                      style={
                        styles.roleDot
                      }
                    />

                    <Text
                      style={
                        styles.roleText
                      }
                    >
                      User account
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={
                    styles.profileEditButton
                  }
                  onPress={() =>
                    setSettingsView(
                      "editProfile"
                    )
                  }
                >
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={
                      colors.accent2
                    }
                  />
                </TouchableOpacity>
              </AppCard>

              {message ? (
                <View
                  style={
                    styles.messageBox
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={
                      colors.warning
                    }
                  />

                  <Text
                    style={
                      styles.messageText
                    }
                  >
                    {message}
                  </Text>
                </View>
              ) : null}

              {/* APPEARANCE */}
              <SectionHeader
                title="Appearance"
              />

              <AppearanceSelector
                styles={styles}
                colors={colors}
                isDark={isDark}
                themeMode={themeMode}
                setThemeMode={
                  setThemeMode
                }
              />

              {/* ACCOUNT */}
              <SectionHeader
                title="Account"
              />

              <View
                style={styles.cardList}
              >
                <SettingItem
                  styles={styles}
                  colors={colors}
                  icon="person-outline"
                  title="Edit Profile"
                  text="Update your profile information and photo."
                  onPress={() =>
                    setSettingsView(
                      "editProfile"
                    )
                  }
                />

                <SettingItem
                  styles={styles}
                  colors={colors}
                  icon="shield-checkmark-outline"
                  title="Security"
                  text="Update your account password."
                  onPress={() =>
                    setSettingsView(
                      "security"
                    )
                  }
                />

                <SettingItem
                  styles={styles}
                  colors={colors}
                  icon="storefront-outline"
                  title="Seller Profile"
                  text="Manage your marketplace seller information and contact details."
                  onPress={() =>
                    setSettingsView(
                      "sellerProfile"
                    )
                  }
                />
              </View>

              {/* TANK SETTINGS */}
              <SectionHeader
                title="Tank Preferences"
              />

              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() =>
                  setSettingsView(
                    "thresholds"
                  )
                }
              >
                <AppCard
                  strong
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
                      name="options-outline"
                      size={22}
                      color={
                        colors.accent2
                      }
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
                        Default Thresholds
                      </Text>

                      <View
                        style={
                          styles.viewOnlyPill
                        }
                      >
                        <Text
                          style={
                            styles.viewOnlyText
                          }
                        >
                          View
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={
                        styles.thresholdText
                      }
                    >
                      Review the default
                      ranges used for
                      temperature, pH,
                      turbidity, ammonia,
                      and water level.
                    </Text>

                    <View
                      style={
                        styles.webHintRow
                      }
                    >
                      <Ionicons
                        name="desktop-outline"
                        size={13}
                        color={
                          colors.accent2
                        }
                      />

                      <Text
                        style={
                          styles.webHintText
                        }
                      >
                        Threshold changes
                        are currently
                        handled on the web
                        dashboard.
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={
                      colors.muted2
                    }
                  />
                </AppCard>
              </TouchableOpacity>

              {/* NOTIFICATIONS */}
              <SectionHeader
                title="Notifications"
                action={
                  savingPrefs
                    ? "Saving..."
                    : "Preferences"
                }
              />

              <View
                style={styles.cardList}
              >
                <ToggleItem
                  styles={styles}
                  colors={colors}
                  icon="warning-outline"
                  title="Tank Alerts"
                  text="Warnings related to monitored tank conditions and ammonia checks."
                  value={
                    notificationPrefs.tank_alerts
                  }
                  disabled={
                    savingPrefs
                  }
                  onValueChange={(
                    value
                  ) =>
                    updateNotificationPreference(
                      "tank_alerts",
                      value
                    )
                  }
                />

                <ToggleItem
                  styles={styles}
                  colors={colors}
                  icon="storefront-outline"
                  title="Marketplace Alerts"
                  text="Updates related to listings, reservations, and marketplace activity."
                  value={
                    notificationPrefs.marketplace_alerts
                  }
                  disabled={
                    savingPrefs
                  }
                  onValueChange={(
                    value
                  ) =>
                    updateNotificationPreference(
                      "marketplace_alerts",
                      value
                    )
                  }
                />

                <ToggleItem
                  styles={styles}
                  colors={colors}
                  icon="restaurant-outline"
                  title="Feeding Alerts"
                  text="Notifications related to recorded feeding activity."
                  value={
                    notificationPrefs.feeding_alerts
                  }
                  disabled={
                    savingPrefs
                  }
                  onValueChange={(
                    value
                  ) =>
                    updateNotificationPreference(
                      "feeding_alerts",
                      value
                    )
                  }
                />

                <ToggleItem
                  styles={styles}
                  colors={colors}
                  icon="water-outline"
                  title="Water Control Alerts"
                  text="Updates related to drain, refill, pump, and water-control activity."
                  value={
                    notificationPrefs.pump_alerts
                  }
                  disabled={
                    savingPrefs
                  }
                  onValueChange={(
                    value
                  ) =>
                    updateNotificationPreference(
                      "pump_alerts",
                      value
                    )
                  }
                />
              </View>

              {/* WEB */}
              <SectionHeader
                title="Web Dashboard"
              />

              <View
                style={styles.cardList}
              >
                <SettingItem
                  styles={styles}
                  colors={colors}
                  icon="desktop-outline"
                  title="Open CrayThrive Web"
                  text="Open the web dashboard for larger-screen management and configuration."
                  onPress={
                    openWebDashboard
                  }
                  external
                />

                <SettingItem
                  styles={styles}
                  colors={colors}
                  icon="analytics-outline"
                  title="Reports on Web"
                  text="Review deeper reports and historical records from the web dashboard."
                  onPress={
                    openWebDashboard
                  }
                  external
                />
              </View>

              {/* APP */}
              <SectionHeader
                title="App"
              />

              <View
                style={styles.cardList}
              >
                <SettingItem
                  styles={styles}
                  colors={colors}
                  icon="information-circle-outline"
                  title="About CrayThrive"
                  text="View the system overview, features, technology, and project information."
                  onPress={() =>
                    setSettingsView(
                      "about"
                    )
                  }
                />
              </View>

              {/* LOGOUT */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={
                  styles.logoutButton
                }
                onPress={
                  handleLogout
                }
                disabled={
                  loadingLogout
                }
              >
                {loadingLogout ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Ionicons
                    name="log-out-outline"
                    size={19}
                    color="#FFFFFF"
                  />
                )}

                <Text
                  style={
                    styles.logoutText
                  }
                >
                  {loadingLogout
                    ? "Logging out..."
                    : "Log Out"}
                </Text>
              </TouchableOpacity>

              <View
                style={
                  styles.versionFooter
                }
              >
                <CrayfishIcon
                  size={16}
                  color={
                    colors.muted2
                  }
                />

                <Text
                  style={
                    styles.versionText
                  }
                >
                  CrayThrive Mobile •
                  Version 1.0.0
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </AppScreen>
  );
}

/*
|--------------------------------------------------------------------------
| LOADING
|--------------------------------------------------------------------------
*/

function LoadingSettings({
  styles,
  colors,
}) {
  return (
    <View
      style={styles.loadingCard}
    >
      <View
        style={styles.loadingIcon}
      >
        <ActivityIndicator
          color={colors.accent2}
        />
      </View>

      <Text
        style={styles.loadingTitle}
      >
        Loading settings
      </Text>

      <Text
        style={styles.loadingText}
      >
        Getting your account and
        preferences.
      </Text>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| APPEARANCE
|--------------------------------------------------------------------------
*/

function AppearanceSelector({
  styles,
  colors,
  isDark,
  themeMode,
  setThemeMode,
}) {
  return (
    <View
      style={
        styles.appearanceCard
      }
    >
      <View
        style={
          styles.appearanceHeader
        }
      >
        <View
          style={styles.settingIcon}
        >
          <Ionicons
            name={
              isDark
                ? "moon-outline"
                : "sunny-outline"
            }
            size={20}
            color={colors.accent2}
          />
        </View>

        <View
          style={
            styles.settingContent
          }
        >
          <Text
            style={
              styles.settingTitle
            }
          >
            App Appearance
          </Text>

          <Text
            style={
              styles.settingText
            }
          >
            Choose the color mode used
            throughout CrayThrive.
          </Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.modeButton,

            themeMode ===
              "dark" &&
              styles.modeButtonActive,
          ]}
          onPress={() =>
            setThemeMode("dark")
          }
        >
          <Ionicons
            name="moon-outline"
            size={17}
            color={
              themeMode ===
              "dark"
                ? "#062C2B"
                : colors.accent2
            }
          />

          <Text
            style={[
              styles.modeText,

              themeMode ===
                "dark" &&
                styles.modeTextActive,
            ]}
          >
            Dark
          </Text>

          {themeMode ===
          "dark" ? (
            <Ionicons
              name="checkmark-circle"
              size={15}
              color="#062C2B"
            />
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.modeButton,

            themeMode ===
              "light" &&
              styles.modeButtonActive,
          ]}
          onPress={() =>
            setThemeMode("light")
          }
        >
          <Ionicons
            name="sunny-outline"
            size={17}
            color={
              themeMode ===
              "light"
                ? "#062C2B"
                : colors.accent2
            }
          />

          <Text
            style={[
              styles.modeText,

              themeMode ===
                "light" &&
                styles.modeTextActive,
            ]}
          >
            Light
          </Text>

          {themeMode ===
          "light" ? (
            <Ionicons
              name="checkmark-circle"
              size={15}
              color="#062C2B"
            />
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| SETTINGS ITEM
|--------------------------------------------------------------------------
*/

function SettingItem({
  styles,
  colors,
  icon,
  title,
  text,
  onPress,
  external = false,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.settingItem}
      onPress={onPress}
    >
      <View
        style={styles.settingIcon}
      >
        <Ionicons
          name={icon}
          size={20}
          color={colors.accent2}
        />
      </View>

      <View
        style={styles.settingContent}
      >
        <Text
          style={styles.settingTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.settingText}
        >
          {text}
        </Text>
      </View>

      <View
        style={styles.trailingIcon}
      >
        <Ionicons
          name={
            external
              ? "open-outline"
              : "chevron-forward"
          }
          size={17}
          color={colors.muted2}
        />
      </View>
    </TouchableOpacity>
  );
}

/*
|--------------------------------------------------------------------------
| TOGGLE ITEM
|--------------------------------------------------------------------------
*/

function ToggleItem({
  styles,
  colors,
  icon,
  title,
  text,
  value,
  onValueChange,
  disabled = false,
}) {
  function handleToggle() {
    if (disabled) {
      return;
    }

    onValueChange?.(
      !Boolean(value)
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.settingItem,

        disabled &&
          styles.settingItemDisabled,
      ]}
      onPress={handleToggle}
      disabled={disabled}
    >
      <View
        style={styles.settingIcon}
      >
        <Ionicons
          name={icon}
          size={20}
          color={colors.accent2}
        />
      </View>

      <View
        style={styles.settingContent}
      >
        <Text
          style={styles.settingTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.settingText}
        >
          {text}
        </Text>
      </View>

      <Switch
        value={Boolean(value)}
        pointerEvents="none"
        trackColor={{
          false:
            "rgba(120,120,120,0.24)",

          true:
            "rgba(25,183,166,0.55)",
        }}
        thumbColor={
          value
            ? colors.accent2
            : "#E5E7EB"
        }
      />
    </TouchableOpacity>
  );
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getFriendlyPreferenceError(
  error
) {
  const rawMessage =
    String(
      error?.message || ""
    );

  const message =
    rawMessage.toLowerCase();

  if (
    message.includes(
      "notification_preferences"
    )
  ) {
    return "Notification preferences are currently unavailable.";
  }

  if (
    message.includes(
      "row-level security"
    ) ||
    message.includes("policy")
  ) {
    return "Your account is not currently allowed to change this notification preference.";
  }

  return (
    rawMessage ||
    "Unable to save this notification preference."
  );
}

function buildUsernameFromEmail(
  email
) {
  const value =
    String(
      email || ""
    ).trim();

  if (
    !value.includes("@")
  ) {
    return "CrayThrive User";
  }

  return (
    value.split("@")[0] ||
    "CrayThrive User"
  );
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

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
      paddingTop: 2,
      paddingBottom: 140,
    },

    /*
    |--------------------------------------------------------------------------
    | LOADING
    |--------------------------------------------------------------------------
    */

    loadingCard: {
      minHeight: 210,
      borderRadius: 21,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
      padding: 22,
    },

    loadingIcon: {
      width: 62,
      height: 62,
      borderRadius: 20,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    loadingTitle: {
      marginTop: 12,
      color:
        colors.textStrong,
      fontSize: 14,
      fontWeight: "700",
    },

    loadingText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | PROFILE
    |--------------------------------------------------------------------------
    */

    profileCard: {
      padding: 15,
      borderRadius: 21,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surface,
      borderColor:
        colors.border,
      ...SHADOW.soft,
    },

    avatarWrap: {
      width: 68,
      height: 68,
      borderRadius: 22,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginRight: 12,
    },

    avatarImage: {
      width: "100%",
      height: "100%",
    },

    profileInfo: {
      flex: 1,
      minWidth: 0,
    },

    profileName: {
      color:
        colors.textStrong,
      fontSize: 16,
      fontWeight: "700",
    },

    profileEmail: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    roleRow: {
      marginTop: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },

    roleDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor:
        colors.accent2,
    },

    roleText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    profileEditButton: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },

    /*
    |--------------------------------------------------------------------------
    | MESSAGE
    |--------------------------------------------------------------------------
    */

    messageBox: {
      marginTop: 10,
      borderRadius: 14,
      padding: 11,
      backgroundColor:
        colors.warningSoft,
      borderWidth: 1,
      borderColor:
        "rgba(251,191,36,0.22)",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },

    messageText: {
      flex: 1,
      color: colors.warning,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | COMMON
    |--------------------------------------------------------------------------
    */

    cardList: {
      gap: 9,
    },

    settingItem: {
      minHeight: 74,
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
    },

    settingItemDisabled: { minHeight: 44,
      opacity: 0.62,
    },

    settingIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    settingContent: {
      flex: 1,
      minWidth: 0,
    },

    settingTitle: {
      color:
        colors.textStrong,
      fontSize: 12.5,
      fontWeight: "700",
    },

    settingText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    trailingIcon: {
      width: 31,
      height: 31,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
      backgroundColor:
        colors.surfaceSoft,
    },

    /*
    |--------------------------------------------------------------------------
    | APPEARANCE
    |--------------------------------------------------------------------------
    */

    appearanceCard: {
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 12,
    },

    appearanceHeader: {
      flexDirection: "row",
      alignItems: "center",
    },

    modeRow: {
      marginTop: 12,
      flexDirection: "row",
      gap: 8,
    },

    modeButton: {
      flex: 1,
      height: 44,
      borderRadius: 13,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },

    modeButtonActive: { minHeight: 44,
      backgroundColor:
        colors.accent,
      borderColor:
        colors.accent,
    },

    modeText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    modeTextActive: {
      color: "#062C2B",
    },

    /*
    |--------------------------------------------------------------------------
    | THRESHOLDS
    |--------------------------------------------------------------------------
    */

    thresholdCard: {
      padding: 13,
      borderRadius: 19,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surface,
      borderColor:
        colors.border,
      ...SHADOW.soft,
    },

    thresholdIcon: {
      width: 47,
      height: 47,
      borderRadius: 15,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    thresholdContent: {
      flex: 1,
      minWidth: 0,
    },

    thresholdTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },

    thresholdTitle: {
      flex: 1,
      color:
        colors.textStrong,
      fontSize: 12.5,
      fontWeight: "700",
    },

    thresholdText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    viewOnlyPill: {
      minHeight: 22,
      paddingHorizontal: 7,
      borderRadius:
        RADIUS.pill,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    viewOnlyText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    webHintRow: {
      marginTop: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },

    webHintText: {
      flex: 1,
      color: colors.accent2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | LOGOUT
    |--------------------------------------------------------------------------
    */

    logoutButton: {
      marginTop: 22,
      height: 50,
      borderRadius: 15,
      backgroundColor:
        isDark
          ? "rgba(248,113,113,0.88)"
          : "#EF4444",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
    },

    logoutText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "700",
    },

    /*
    |--------------------------------------------------------------------------
    | FOOTER
    |--------------------------------------------------------------------------
    */

    versionFooter: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },

    versionText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },
  });
}

async function createProfileIfMissing(
    targetUserId,
    targetEmail,
    nextUsername,
    nextAvatarUrl
  ) {
    if (!targetUserId) {
      return;
    }

    const cleanUsername =
      String(
        nextUsername || ""
      ).trim() ||
      "CrayThrive User";

    const { error } =
      await supabase
        .from("profiles")
        .upsert(
          {
            id: targetUserId,

            username:
              cleanUsername,

            avatar_url:
              nextAvatarUrl ||
              null,

            email:
              targetEmail ||
              null,

            role: "user",

            profile_complete:
              true,

            first_name:
              cleanUsername,

            middle_name: "",

            last_name:
              cleanUsername,

            full_name:
              cleanUsername,
          },
          {
            onConflict: "id",
          }
        );

    if (error) {
      console.log("CREATE SETTINGS PROFILE ERROR:");
    }
  }


async function createDefaultNotificationPreferences(
    targetUserId
  ) {
    if (!targetUserId) {
      return;
    }

    const { error } =
      await supabase
        .from(
          "notification_preferences"
        )
        .upsert(
          {
            user_id:
              targetUserId,

            ...DEFAULT_NOTIFICATION_PREFS,
          },
          {
            onConflict:
              "user_id",
          }
        );

    if (error) {
      console.log("CREATE DEFAULT NOTIFICATION PREFS ERROR:");
    }
  }
