// src/screens/auth/LoginScreen.js

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



export default function LoginScreen({
  onBack,
  onRegister,
  onForgotPassword,
  onSuccess,
}) {
  

  const { colors, styles, isDark } = useThemedStyles(makeStyles);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  useAndroidBack(onBack, loading);
  const [errorText, setErrorText] = useState("");

  function validateForm() {
    if (!email.trim()) {
      return "Please enter your email.";
    }

    if (!isValidEmail(email)) {
      return "Please enter a valid email address.";
    }

    if (!password.trim()) {
      return "Please enter your password.";
    }

    return "";
  }

  const handleLogin = useSingleFlight(async function handleLogin() {
    setErrorText("");

    const validationMessage = validateForm();

    if (validationMessage) {
      setErrorText(validationMessage);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new Error(getFriendlyLoginError(error));
      }

      if (!data?.user?.id) {
        throw new Error("Sign in failed. Please try again.");
      }

      onSuccess?.();
    } catch (error) {
      console.log("LOGIN ERROR:");
      setErrorText(error?.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  });

  function handleForgotPassword() {
    if (onForgotPassword) {
      onForgotPassword();
      return;
    }

    setErrorText(
      "Password reset is currently unavailable. Please try again later."
    );
  }

  return (
    <SafeAreaView style={{flex: 1}}><KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.deep} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.header}>
          <WaveHeader />

          <View style={styles.topBar}>
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

            <View style={styles.topBarRight} />
          </View>

          <View style={styles.brandArea}>
            <View style={styles.logoGlow} />

            <View style={styles.logoCircle}>
              <BrandLogo size={72} />
            </View>

            <Text style={styles.headerEyebrow}>CRAYTHRIVE</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.intro}>
            <Text style={styles.title}>Welcome back</Text>

            <Text style={styles.subtitle}>
              Sign in to view your tanks, readings, alerts, and reports.
            </Text>
          </View>

          {errorText ? (
            <View style={styles.messageBox}>
              <View style={styles.messageIcon}>
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color={colors.danger}
                />
              </View>

              <Text style={styles.errorText}>
                {errorText}
              </Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <AuthInput
              label="Email address"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              editable={!loading}
              autoComplete="email"
            />

            <AuthInput
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              editable={!loading}
              autoComplete="current-password"
              rightIcon={
                showPassword ? "eye-off-outline" : "eye-outline"
              }
              onRightPress={() =>
                setShowPassword((previous) => !previous)
              }
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.forgotButton}
              onPress={handleForgotPassword}
              disabled={loading}
            >
              <Text style={styles.forgotText}>
                Forgot password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.signInButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.deep} />
              ) : (
                <>
                  <Text style={styles.signInButtonText}>
                    Sign In
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

            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>
                Don&apos;t have an account?
              </Text>

              <TouchableOpacity
                activeOpacity={0.82}
                onPress={onRegister}
                disabled={loading}
              >
                <Text style={styles.registerLink}>
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footerNote}>
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color={colors.muted2}
            />

            <Text style={styles.footerNoteText}>
              Your account is secured through Supabase Authentication.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

function AuthInput({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  editable = true,
  rightIcon,
  onRightPress,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>
        {label}
      </Text>

      <View
        style={[
          styles.inputShell,
          !editable && styles.inputDisabled,
        ]}
      >
        <View style={styles.inputIcon}>
          <Ionicons
            name={icon}
            size={19}
            color={colors.accent2}
          />
        </View>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted2}
          style={styles.input}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          autoComplete={autoComplete}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />

        {rightIcon ? (
          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.eyeButton}
            onPress={onRightPress}
            disabled={!editable}
          >
            <Ionicons
              name={rightIcon}
              size={19}
              color={colors.muted}
            />
          </TouchableOpacity>
        ) : null}
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
        d={`M0 0 H${width} V190 C${width * 0.78} 242 ${
          width * 0.43
        } 174 0 220 Z`}
        fill={colors.authWave}
      />

      <Path
        d={`M0 0 H${width} V154 C${width * 0.73} 206 ${
          width * 0.4
        } 142 0 188 Z`}
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

function getFriendlyLoginError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "The email or password you entered is incorrect.";
  }

  if (message.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }

  if (message.includes("network")) {
    return "Network error. Please check your internet connection.";
  }

  return error?.message || "Unable to sign in.";
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
    paddingBottom: 30,
  },

  header: {
    height: 245,
    paddingTop: Platform.OS === "android" ? 44 : 54,
    paddingHorizontal: 22,
    overflow: "hidden",
  },

  topBar: {
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  topBarRight: {
    width: 42,
    height: 42,
  },

  backButton: {
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
    backgroundColor: "rgba(53,230,200,0.09)",
  },

  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  headerEyebrow: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
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
    marginBottom: 25,
  },

  title: {
    color: colors.textStrong,
    fontSize: 30,
    lineHeight: 39,
    fontWeight: "800",
    letterSpacing: -0.7,
  },

  subtitle: {
    marginTop: 8,
    maxWidth: 350,
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "400",
  },

  messageBox: {
    marginBottom: 20,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.22)",
  },

  messageIcon: {
    marginTop: 1,
    marginRight: 9,
  },

  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },

  form: {
    width: "100%",
  },

  inputGroup: {
    marginBottom: 17,
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
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: "rgba(34,211,197,0.09)",
  },

  input: {
    flex: 1,
    height: 54,
    paddingHorizontal: 12,
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "500",
  },

  eyeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  forgotButton: { minHeight: 44,
    alignSelf: "flex-end",
    marginTop: -3,
    marginBottom: 26,
    paddingVertical: 3,
  },

  forgotText: {
    color: colors.accent2,
    fontSize: 12.5,
    fontWeight: "600",
  },

  signInButton: {
    position: "relative",
    width: "100%",
    height: 56,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent2,
    ...SHADOW.card,
  },

  buttonDisabled: { minHeight: 44,
    opacity: 0.62,
  },

  signInButtonText: {
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
    backgroundColor: "rgba(5,26,34,0.08)",
  },

  registerRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  registerPrompt: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "400",
  },

  registerLink: {
    color: colors.accent2,
    fontSize: 12.5,
    fontWeight: "700",
  },

  footerNote: {
    marginTop: 36,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.055)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  footerNoteText: {
    maxWidth: 285,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    textAlign: "center",
  },
});
}
