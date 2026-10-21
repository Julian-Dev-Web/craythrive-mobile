import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";
import { fetchServerTime } from './serverClock';

const DEVICE_TOKEN_KEY = "craythrive.push-device.v1";
export const PUSH_CHANNEL_ID = "craythrive-alerts";
const isExpoGo = () => Constants.executionEnvironment === "storeClient";
let registrationTask = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: true,
  }),
});

export function registerPushTokenForCurrentUser(options = {}) {
  if (registrationTask) return registrationTask;
  const task = registerDevice(options).finally(() => {
    if (registrationTask === task) registrationTask = null;
  });
  registrationTask = task;
  return task;
}

async function registerDevice({ requestPermission = true } = {}) {
  try {
    if (Platform.OS === "web") return { ok: false, reason: "Push notifications use the installed mobile app." };
    if (isExpoGo()) return { ok: false, reason: "Use a CrayThrive APK or development build; Android Expo Go does not support remote push." };
    if (!Device.isDevice) return { ok: false, reason: "Use a real phone to test push notifications." };
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) return { ok: false, reason: "Could not verify your account. Registration will retry when you return to the app." };
    const userId = userData.user.id;
    await setupAndroidNotificationChannel();
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted" && requestPermission && permission.canAskAgain !== false) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (permission.status !== "granted") return { ok: false, reason: "Enable CrayThrive notifications in your phone's app settings." };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: "Missing EAS projectId in app configuration." };
    let timer;
    let tokenResult;
    try {
      tokenResult = await Promise.race([
        Notifications.getExpoPushTokenAsync({ projectId }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Push registration timed out. It will retry when you return to the app.")), 15000); }),
      ]);
    } finally { clearTimeout(timer); }
    const token = tokenResult?.data;
    if (!/^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token || "")) return { ok: false, reason: "The push service did not return a valid device token." };
    const { data: current } = await supabase.auth.getSession();
    if (current?.session?.user?.id !== userId) return { ok: false, reason: "Account changed during registration." };
    const { error } = await supabase.from("push_tokens").upsert({
      user_id: userId, expo_push_token: token, platform: Platform.OS,
      device_name: Device.deviceName || Device.modelName || Device.osName || "Mobile Device",
      app_version: Constants.expoConfig?.version || "1.0.0", is_active: true,
      last_seen_at: await fetchServerTime(),
    }, { onConflict: "expo_push_token" });
    if (error) return { ok: false, reason: "Could not save the device token. Check the push_tokens table and its access policies." };
    // Remember only this device so logout does not disable the other phones.
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, JSON.stringify({ userId, token }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "Push registration failed; it will retry when you return to the app." };
  }
}

export async function deactivateCurrentPushToken() {
  if (Platform.OS === "web" || isExpoGo()) return;
  try {
    // Finish an in-flight save before disabling the token and signing out.
    // Otherwise registration can reactivate the device after logout cleanup.
    await registrationTask;
    const stored = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
    if (!stored) return;
    const device = JSON.parse(stored);
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user?.id || device.userId !== data.session.user.id) return;
    const { error } = await supabase.from("push_tokens").update({ is_active: false })
      .eq("expo_push_token", device.token).eq("user_id", device.userId);
    if (error) { console.warn("Could not deactivate this device's push token before logout."); return; }
    await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch { console.warn("Device push-token cleanup failed."); }
}

export function addPushNotificationListeners({ onReceive, onResponse, onTokenChange } = {}) {
  if (Platform.OS === "web" || isExpoGo()) return () => {};
  let mounted = true;
  const handled = new Set();
  async function respond(response) {
    if (!mounted || !response?.notification) return;
    const request = response.notification.request;
    const id = `${request.identifier}:${response.actionIdentifier || "default"}`;
    if (handled.has(id)) return;
    handled.add(id);
    try {
      const recipient = request.content?.data?.user_id;
      const { data } = await supabase.auth.getSession();
      if (!mounted || !data?.session?.user) return;
      if (recipient && recipient !== data.session.user.id) return;
      await onResponse?.(response);
      await Notifications.clearLastNotificationResponseAsync();
    } catch { console.warn("Could not open the notification destination."); }
  }
  const received = Notifications.addNotificationReceivedListener(notification => { if (mounted) onReceive?.(notification); });
  const responses = Notifications.addNotificationResponseReceivedListener(respond);
  const tokens = Notifications.addPushTokenListener(() => { if (mounted) onTokenChange?.(); });
  // A response listener alone misses taps that launched a terminated process.
  Notifications.getLastNotificationResponseAsync().then(respond).catch(() => {
    console.warn("Could not read the initial notification response.");
  });
  return () => { mounted = false; received.remove(); responses.remove(); tokens.remove(); };
}

async function setupAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "CrayThrive Alerts", importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250], lightColor: "#22D3C5", sound: "default",
  });
}
