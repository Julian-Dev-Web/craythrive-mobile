// app/reset-password.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";

import ResetPasswordScreen from "../src/screens/auth/ResetPasswordScreen";
import AppBackground from "../src/components/ui/AppBackground";
import { COLORS } from "../src/constants/theme";
import { supabase } from "../src/lib/supabase";

function clearRecoveryUrl() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.hash = '';
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* Keep a successfully restored session even if browser history is unavailable. */ }
}

export default function ResetPasswordRoute() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    async function prepareRecoverySession() {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const url = new URL(window.location.href);

          const code = url.searchParams.get("code");

          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              setSessionError('Reset link is invalid or expired. Please request a new link.');
              setReady(true);
              return;
            }

            clearRecoveryUrl();
            setReady(true);
            return;
          }

          const hash = window.location.hash?.replace("#", "");
          const hashParams = new URLSearchParams(hash);

          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              setSessionError('Reset link is invalid or expired. Please request a new link.');
              setReady(true);
              return;
            }

            clearRecoveryUrl();
            setReady(true);
            return;
          }
        }

        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          setSessionError(
            "Reset session is missing or expired. Please request a new reset link."
          );
        }

        setReady(true);
      } catch {
        setSessionError("Unable to prepare reset session. Please request a new link.");
        setReady(true);
      }
    }

    prepareRecoverySession();
  }, []);

  if (!ready) {
    return (
      <AppBackground>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.white} />
          <Text style={styles.text}>Preparing password reset...</Text>
        </View>
      </AppBackground>
    );
  }

  if (sessionError) {
    return (
      <AppBackground>
        <View style={styles.center}>
          <Text style={styles.title}>Reset Link Problem</Text>
          <Text style={styles.text}>{sessionError}</Text>
          <Text style={styles.smallText}>
            Go back to Login and request a new password reset link.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.buttonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </AppBackground>
    );
  }

  return (
    <ResetPasswordScreen
      onSuccess={() => {
        router.replace("/");
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },

  text: {
    marginTop: 12,
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontWeight: "700",
  },

  smallText: {
    marginTop: 10,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  button: {
    marginTop: 22,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },
});
