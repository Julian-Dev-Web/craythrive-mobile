// app/index.tsx

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ThemeProvider, useAppTheme } from "../src/context/ThemeContext";
import { supabase } from "../src/lib/supabase";
import useAuthSession from "../src/hooks/useAuthSession";
import useSingleFlight from "../src/hooks/useSingleFlight";

import {
  addPushNotificationListeners,
  deactivateCurrentPushToken,
  registerPushTokenForCurrentUser,
} from "../src/utils/pushNotifications";

import LandingScreen from "../src/screens/LandingScreen";
import SplashScreen from "../src/screens/SplashScreen";
import ForgotPasswordScreen from "../src/screens/auth/ForgotPasswordScreen";
import LoginScreen from "../src/screens/auth/LoginScreen";
import RegisterScreen from "../src/screens/auth/RegisterScreen";

import AddTankScreen from "../src/screens/main/AddTankScreen";
import AmmoniaReaderScreen from "../src/screens/main/AmmoniaReaderScreen";
import DashboardScreen from "../src/screens/main/DashboardScreen";
import DeviceWifiSetupScreen from "../src/screens/main/DeviceWifiSetupScreen";
import TankDetailsScreen from "../src/screens/main/TankDetailsScreen";

import AddMarketplaceListingScreen from "../src/screens/main/AddMarketplaceListingScreen";
import MarketplaceChatScreen from "../src/screens/main/MarketplaceChatScreen";
import MarketplaceScreen from "../src/screens/main/MarketplaceScreen";

import AiGuideScreen from "../src/screens/main/AiGuideScreen";
import ReportsScreen from "../src/screens/main/ReportsScreen";
import SettingsScreen from "../src/screens/main/SettingsScreen";

import BottomNav from "../src/components/ui/BottomNav";
import AppScreen from "../src/components/ui/AppScreen";

type AuthScreen =
  | "splash"
  | "landing"
  | "login"
  | "register"
  | "forgot"
  | "main";

type TabKey = "home" | "market" | "aiGuide" | "reports" | "settings";

type TankFlow = "list" | "add" | "details" | "ammonia" | "wifiSetup";

type MarketFlow = "list" | "add" | "chat";

export default function Index() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { colors } = useAppTheme() as any;
  const [screen, setScreen] = useState<AuthScreen>("splash");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [introDone, setIntroDone] = useState(false);
  const { session, authReady, restoreError, retryRestore } = useAuthSession();
  const finishIntro = useCallback(() => setIntroDone(true), []);

  useEffect(() => {
    if (!introDone || !authReady) return;
    setScreen(current => {
      if (session) return "main";
      if (current === "splash") return "landing";
      if (!session && current === "main") return "landing";
      return current;
    });
  }, [introDone, authReady, session]);

  const handleLogout = useSingleFlight(async function handleLogout() {
    try {
      await deactivateCurrentPushToken();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setActiveTab("home");
      setScreen("landing");
    } catch {
      Alert.alert("Logout failed", "Please check your connection and try again.");
    }
  });

  function goToMain() {
    setActiveTab("home");
  }

  if (!introDone || !authReady || screen === "splash") {
    if (!introDone) return <SplashScreen onFinish={finishIntro} />;
    return (
      <AppScreen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          {restoreError ? <>
            <Text style={{ color: colors.textStrong, textAlign: "center", fontSize: 15 }}>{restoreError}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={retryRestore} style={{ minHeight: 48, justifyContent: "center", padding: 12 }}>
              <Text style={{ color: colors.accent2, fontWeight: "700" }}>Try again</Text>
            </TouchableOpacity>
          </> : <ActivityIndicator color={colors.accent2} />}
        </View>
      </AppScreen>
    );
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onBack={() => setScreen("landing")}
        onRegister={() => setScreen("register")}
        onForgotPassword={() => setScreen("forgot")}
        onSuccess={goToMain}
      />
    );
  }

  if (screen === "forgot") {
    return (
      <ForgotPasswordScreen
        onBack={() => setScreen("login")}
        onLogin={() => setScreen("login")}
      />
    );
  }

  if (screen === "register") {
    return (
      <RegisterScreen
        onBack={() => setScreen("landing")}
        onLogin={() => setScreen("login")}
        onSuccess={goToMain}
      />
    );
  }

  if (screen === "main" && session) {
    return (
      <MainShell
        key={session?.user.id}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <LandingScreen
      onLogin={() => setScreen("login")}
      onRegister={() => setScreen("register")}
    />
  );
}

function MainShell({
  activeTab,
  setActiveTab,
  onLogout,
}: {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  onLogout: () => void;
}) {
  const { colors } = useAppTheme() as any;

  const [tankFlow, setTankFlow] = useState<TankFlow>("list");
  const [marketFlow, setMarketFlow] = useState<MarketFlow>("list");

  const [selectedTank, setSelectedTank] = useState<any>(null);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [chatDetails, setChatDetails] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      console.log("Push notifications skipped on web.");
      return;
    }

    let mounted = true;
    let registering = false;
    let lastAttempt = 0;

    async function setupPushNotifications(requestPermission = false) {
      if (!mounted || registering || Date.now() - lastAttempt < 30000) return;
      registering = true;
      lastAttempt = Date.now();
      await registerPushTokenForCurrentUser({ requestPermission });
      registering = false;

      if (!mounted) return;

      console.log("PUSH REGISTRATION:");
    }

    setupPushNotifications(true);
    const appStateSubscription = AppState.addEventListener("change", state => {
      if (state === "active") setupPushNotifications();
    });

    const cleanup = addPushNotificationListeners({
      onTokenChange: () => { lastAttempt = 0; setupPushNotifications(); },
      onReceive: () => {
        console.log("PUSH RECEIVED WHILE APP IS OPEN");
      },

      onResponse: (response: any) => {
        const data = response?.notification?.request?.content?.data || {};

        if (data?.screen === "marketplace") {
          setActiveTab("market");
          setMarketFlow("list");
          setTankFlow("list");
          setSelectedTank(null);
          setSelectedDevice(null);
          setChatDetails(null);
        }

        if (data?.screen === "reports") {
          setActiveTab("reports");
          setTankFlow("list");
          setMarketFlow("list");
          setSelectedTank(null);
          setSelectedDevice(null);
          setChatDetails(null);
        }

        if (data?.screen === "dashboard" || data?.screen === "alerts") {
          setActiveTab("home");
          setTankFlow("list");
          setMarketFlow("list");
          setSelectedTank(null);
          setSelectedDevice(null);
          setChatDetails(null);
        }
      },
    });

    return () => {
      mounted = false;
      appStateSubscription.remove();
      cleanup?.();
    };
  }, [setActiveTab]);

  function handleChangeTab(tab: TabKey) {
    setActiveTab(tab);

    if (tab !== "home") {
      setTankFlow("list");
      setSelectedTank(null);
      setSelectedDevice(null);
    }

    if (tab !== "market") {
      setMarketFlow("list");
      setChatDetails(null);
    }
  }

  function goBackToTankList() {
    setTankFlow("list");
    setSelectedTank(null);
    setSelectedDevice(null);
  }

  function goBackToTankDetails() {
    setTankFlow("details");
    setSelectedDevice(null);
  }

  function goBackToMarketplace() {
    setMarketFlow("list");
    setChatDetails(null);
  }

  function openMarketplaceChat(nextChatDetails: any) {
    setChatDetails(nextChatDetails);
    setMarketFlow("chat");
  }

  const shouldShowBottomNav = tankFlow === "list" && marketFlow === "list";

  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <View style={styles.mainContent}>
        {activeTab === "home" && tankFlow === "list" && (
          <DashboardScreen
            onLogout={onLogout}
            onAddTank={() => setTankFlow("add")}
            onOpenTank={(tank: any) => {
              setSelectedTank(tank);
              setSelectedDevice(null);
              setTankFlow("details");
            }}
          />
        )}

        {activeTab === "home" && tankFlow === "add" && (
          <AddTankScreen
            onBack={goBackToTankList}
            onCreated={goBackToTankList}
          />
        )}

        {activeTab === "home" && tankFlow === "details" && (
          <TankDetailsScreen
            tank={selectedTank}
            onBack={goBackToTankList}
            onOpenAmmoniaReader={(tank: any) => {
              setSelectedTank(tank);
              setSelectedDevice(null);
              setTankFlow("ammonia");
            }}
            onOpenDeviceWifiSetup={(device: any) => {
              setSelectedDevice(device);
              setTankFlow("wifiSetup");
            }}
          />
        )}

        {activeTab === "home" && tankFlow === "ammonia" && (
          <AmmoniaReaderScreen
            tank={selectedTank}
            onBack={goBackToTankDetails}
          />
        )}

        {activeTab === "home" && tankFlow === "wifiSetup" && (
          <DeviceWifiSetupScreen
            tank={selectedTank}
            device={selectedDevice}
            onBack={goBackToTankDetails}
          />
        )}

        {activeTab === "market" && (
          <View style={{ flex: 1, display: marketFlow === "list" ? "flex" : "none" }}>
            <MarketplaceScreen
              isVisible={marketFlow === "list"}
              onAddListing={() => setMarketFlow("add")}
              onOpenChat={openMarketplaceChat}
            />
          </View>
        )}

        {activeTab === "market" && marketFlow === "add" && (
          <AddMarketplaceListingScreen
            onBack={goBackToMarketplace}
            onCreated={goBackToMarketplace}
          />
        )}

        {activeTab === "market" && marketFlow === "chat" && (
          <MarketplaceChatScreen
            chatDetails={chatDetails}
            onBack={goBackToMarketplace}
          />
        )}

        {activeTab === "aiGuide" && <AiGuideScreen />}

        {activeTab === "reports" && <ReportsScreen />}

        {activeTab === "settings" && <SettingsScreen onLogout={onLogout} />}
      </View>

      {shouldShowBottomNav && (
        <BottomNav activeTab={activeTab} onChangeTab={handleChangeTab} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },

  mainContent: {
    flex: 1,
  },
});
