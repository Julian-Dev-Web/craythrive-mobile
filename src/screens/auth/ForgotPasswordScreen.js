// src/screens/auth/ForgotPasswordScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import BrandLogo from "../../components/ui/BrandLogo";
import { SHADOW } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { isValidEmail } from '../../utils/emailRules';
import useThemedStyles from '../../hooks/useThemedStyles';
import useSingleFlight from '../../hooks/useSingleFlight';
import useAndroidBack from '../../hooks/useAndroidBack';
import { SafeAreaView } from "react-native-safe-area-context";



export default function ForgotPasswordScreen({
  onBack,
  onLogin,
}) {
  

  const { colors, styles, isDark } = useThemedStyles(makeStyles);

  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  useAndroidBack(onBack, loading);
  const [noticeText, setNoticeText] = useState("");
  const [errorText, setErrorText] = useState("");

  function validateEmail() {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      return "Please enter your email address.";
    }

    if (!isValidEmail(cleanEmail)) {
      return "Please enter a valid email address.";
    }

    return "";
  }

  

  const handleResetPassword = useSingleFlight(async function handleResetPassword() {
    setNoticeText("");
    setErrorText("");

    const validationMessage = validateEmail();

    if (validationMessage) {
      setErrorText(validationMessage);
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:
              "https://www.craythrive.site/reset-password",
          }
        );

      if (error) {
        console.log("RESET PASSWORD ERROR:");

        throw new Error(
          getFriendlyResetError(error)
        );
      }

      setNoticeText(
        "If an account exists for this email, a reset link will be sent. Check your inbox or spam folder."
      );
    } catch (error) {
      console.log("FORGOT PASSWORD HANDLE ERROR:");

      setErrorText(
        error?.message ||
          "Unable to send the reset link."
      );
    } finally {
      setLoading(false);
    }
  });

  function handleEmailChange(value) {
    setEmail(value);

    if (errorText) {
      setErrorText("");
    }

    if (noticeText) {
      setNoticeText("");
    }
  }

  return (
    <SafeAreaView style={{flex: 1}}><KeyboardAvoidingView
      style={styles.root}
      behavior={
        Platform.OS === "ios" ? "padding" : "height"
      }
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.deep}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.header}>
          <WaveHeader />

          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.backButton}
            onPress={onBack}
            disabled={loading}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={colors.textStrong}
            />
          </TouchableOpacity>

          <View style={styles.brandArea}>
            <View style={styles.logoGlow} />

            <View style={styles.logoCircle}>
              <BrandLogo size={72} />
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.intro}>
            <Text style={styles.title}>
              Forgot your password?
            </Text>

            <Text style={styles.subtitle}>
              Enter the email connected to your account
              and we&apos;ll send you a password reset
              link.
            </Text>
          </View>

          {errorText ? (
            <MessageBox
              type="error"
              text={errorText}
            />
          ) : null}

          {noticeText ? (
            <MessageBox
              type="success"
              text={noticeText}
            />
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Email address
              </Text>

              <View
                style={[
                  styles.inputShell,
                  loading && styles.inputDisabled,
                ]}
              >
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={colors.accent2}
                  />
                </View>

                <TextInput
                  value={email}
                  onChangeText={handleEmailChange}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted2}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!loading}
                  returnKeyType="send"
                  onSubmitEditing={handleResetPassword}
                />
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.resetButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator
                  color={colors.deep}
                />
              ) : (
                <>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={colors.deep}
                  />

                  <Text style={styles.resetButtonText}>
                    Send Reset Link
                  </Text>

                  <View style={styles.buttonArrow}>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={colors.deep}
                    />
                  </View>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>
                Remember your password?
              </Text>

              <TouchableOpacity
                activeOpacity={0.82}
                onPress={onLogin}
                disabled={loading}
              >
                <Text style={styles.loginLink}>
                  Sign in
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.infoBox}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={colors.accent2}
              />
            </View>

            <Text style={styles.infoText}>
              For security, the reset link can only be
              used through the email address connected
              to your account.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

function MessageBox({ type, text }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  const success = type === "success";

  return (
    <View
      style={[
        styles.messageBox,
        success
          ? styles.messageSuccess
          : styles.messageError,
      ]}
    >
      <View
        style={[
          styles.messageIcon,
          success
            ? styles.successIcon
            : styles.errorIcon,
        ]}
      >
        <Ionicons
          name={
            success
              ? "checkmark-circle-outline"
              : "alert-circle-outline"
          }
          size={19}
          color={
            success
              ? colors.success
              : colors.danger
          }
        />
      </View>

      <View style={styles.messageContent}>
        <Text
          style={[
            styles.messageTitle,
            {
              color: success
                ? colors.success
                : colors.danger,
            },
          ]}
        >
          {success
            ? "Reset link sent"
            : "Unable to send link"}
        </Text>

        <Text
          style={[
            styles.messageText,
            {
              color: success
                ? colors.success
                : colors.danger,
            },
          ]}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function WaveHeader() {
  const { width } = useWindowDimensions();
  const { colors } = useThemedStyles(makeStyles);

  return (
    <Svg
      width={width}
      height={260}
      style={StyleSheet.absoluteFillObject}
    >
      <Path
        d={`M0 0 H${width} V190 C${
          width * 0.78
        } 242 ${width * 0.43} 174 0 220 Z`}
        fill={colors.authWave}
      />

      <Path
        d={`M0 0 H${width} V154 C${
          width * 0.73
        } 206 ${width * 0.4} 142 0 188 Z`}
        fill={colors.authWave2}
        opacity={0.58}
      />

      <Path
        d={`M-20 105 C70 63 145 140 230 98 C315 56 380 124 ${
          width + 30
        } 82`}
        stroke="#FFFFFF"
        strokeWidth={1}
        opacity={0.09}
        fill="none"
      />
    </Svg>
  );
}

function getFriendlyResetError(error) {
  const message = String(
    error?.message || ""
  ).toLowerCase();

  if (message.includes("rate")) {
    return "Too many reset attempts. Please wait before trying again.";
  }

  if (message.includes("email")) {
    return "Unable to send the reset link. Please check the email address.";
  }

  if (message.includes("network")) {
    return "Network error. Please check your internet connection.";
  }

  return (
    error?.message ||
    "Unable to send the reset link."
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.deep,
  },

  scroll: {
    flexGrow: 1,
    backgroundColor: colors.deep,
    paddingBottom: 34,
  },

  header: {
    height: 245,
    paddingTop:
      Platform.OS === "android" ? 44 : 54,
    paddingHorizontal: 22,
    overflow: "hidden",
  },

  backButton: {
    zIndex: 3,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  brandArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: "center",
    zIndex: 2,
  },

  logoGlow: {
    position: "absolute",
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor:
      "rgba(53,230,200,0.09)",
  },

  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor:
      colors.border,
  },

  content: {
    flex: 1,
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    paddingHorizontal: 23,
    paddingTop: 29,
  },

  intro: {
    marginBottom: 26,
  },

  title: {
    color: colors.textStrong,
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.7,
  },

  subtitle: {
    marginTop: 9,
    maxWidth: 355,
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "400",
  },

  messageBox: {
    marginBottom: 20,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
  },

  messageError: {
    backgroundColor: colors.dangerSoft,
    borderColor: "rgba(248,113,113,0.22)",
  },

  messageSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: "rgba(74,222,128,0.22)",
  },

  messageIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  errorIcon: {
    backgroundColor:
      "rgba(248,113,113,0.10)",
  },

  successIcon: {
    backgroundColor:
      "rgba(74,222,128,0.10)",
  },

  messageContent: {
    flex: 1,
  },

  messageTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },

  messageText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
  },

  form: {
    width: "100%",
  },

  inputGroup: {
    marginBottom: 25,
  },

  inputLabel: {
    marginBottom: 8,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  inputShell: {
    minHeight: 56,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor:
      colors.border,
  },

  inputDisabled: {
    opacity: 0.65,
  },

  inputIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(34,211,197,0.09)",
  },

  input: {
    flex: 1,
    height: 54,
    paddingHorizontal: 12,
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "500",
  },

  resetButton: {
    position: "relative",
    width: "100%",
    height: 56,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent2,
    ...SHADOW.card,
  },

  buttonDisabled: { minHeight: 44,
    opacity: 0.62,
  },

  resetButtonText: {
    color: colors.deep,
    fontSize: 15,
    fontWeight: "700",
  },

  buttonArrow: {
    position: "absolute",
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(5,26,34,0.08)",
  },

  loginRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  loginPrompt: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "400",
  },

  loginLink: {
    color: colors.accent2,
    fontSize: 12.5,
    fontWeight: "700",
  },

  infoBox: {
    marginTop: 38,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor:
      "rgba(255,255,255,0.055)",
    flexDirection: "row",
    alignItems: "flex-start",
  },

  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor:
      "rgba(34,211,197,0.07)",
  },

  infoText: {
    flex: 1,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
});
}
