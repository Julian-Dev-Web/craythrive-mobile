// src/screens/auth/ResetPasswordScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "../../components/ui/AppBackground";
import BrandLogo from "../../components/ui/BrandLogo";
import { SHADOW } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import {
  getPasswordChecks,
  getPasswordStrength,
  isPasswordStrong,
} from "../../utils/passwordRules";
import useThemedStyles from '../../hooks/useThemedStyles';
import useSingleFlight from '../../hooks/useSingleFlight';

export default function ResetPasswordScreen({
  onSuccess,
}) {
  const { colors, styles, isDark } = useThemedStyles(makeStyles);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);
  const [showConfirm, setShowConfirm] =
    useState(false);

  const [focusedField, setFocusedField] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState("error");

  const checks = getPasswordChecks(password);
  const strength = getPasswordStrength(password);

  const passwordStrong =
    isPasswordStrong(password);

  const passwordsMatch =
    confirm.length > 0 &&
    password === confirm;

  function showMessage(type, text) {
    setMessageType(type);
    setMessage(text);

    if (Platform.OS !== "web") {
      Alert.alert(
        type === "success"
          ? "Password updated"
          : "Unable to continue",
        text
      );
    }
  }

  function getFriendlyError(errorMessage) {
    const msg = String(
      errorMessage || ""
    ).toLowerCase();

    if (msg.includes("same password")) {
      return "Your new password must be different from your old password.";
    }

    if (msg.includes("session")) {
      return "Your password reset session is missing or expired. Please request a new reset link.";
    }

    if (msg.includes("jwt")) {
      return "Your reset link has expired. Please request a new reset link.";
    }

    if (msg.includes("422")) {
      return "The reset session is invalid or expired. Please request a new reset link.";
    }

    return (
      errorMessage ||
      "Unable to update your password. Please try again."
    );
  }

  const handleUpdatePassword = useSingleFlight(async function handleUpdatePassword() {
    setMessage("");

    if (!passwordStrong) {
      showMessage(
        "error",
        "Please complete all password requirements."
      );

      return;
    }

    if (password !== confirm) {
      showMessage(
        "error",
        "The passwords do not match."
      );

      return;
    }

    setLoading(true);

    try {
      

      const { data: sessionData } =
        await supabase.auth.getSession();

      

      if (!sessionData?.session) {
        showMessage(
          "error",
          "Your reset session is missing. Please request a new password reset link."
        );

        setLoading(false);
        return;
      }

      const {  error } =
        await supabase.auth.updateUser({
          password,
        });

      

      console.log("UPDATE PASSWORD ERROR:");

      if (error) {
        showMessage(
          "error",
          getFriendlyError(error.message)
        );

        setLoading(false);
        return;
      }

      showMessage(
        "success",
        "Your password has been updated. You can now sign in using your new password."
      );

      await new Promise(resolve => setTimeout(resolve, 900));
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      setLoading(false);
      onSuccess?.();
    } catch (error) {
      console.log("UPDATE PASSWORD CATCH ERROR:");

      showMessage(
        "error",
        error?.message ||
          "Something went wrong while updating your password."
      );

      setLoading(false);
    }
  });

  return (
    <AppBackground>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.deep}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : "height"
          }
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.logoGlow} />

              <View style={styles.logoWrap}>
                <BrandLogo size={78} />
              </View>

              <Text style={styles.title}>
                Create a new password
              </Text>

              <Text style={styles.subtitle}>
                Choose a secure password for your
                CrayThrive account.
              </Text>
            </View>

            {message ? (
              <MessageBox
                type={messageType}
                text={message}
              />
            ) : null}

            <View style={styles.formCard}>
              <AuthInput
                label="New password"
                icon="lock-closed-outline"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);

                  if (message) {
                    setMessage("");
                  }
                }}
                secureTextEntry={!showPassword}
                focused={
                  focusedField === "password"
                }
                onFocus={() =>
                  setFocusedField("password")
                }
                onBlur={() =>
                  setFocusedField("")
                }
                rightIcon={
                  showPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                onRightPress={() =>
                  setShowPassword(
                    (previous) => !previous
                  )
                }
              />

              {password.length > 0 ? (
                <>
                  <PasswordStrength
                    strength={strength}
                  />

                  <PasswordRules
                    checks={checks}
                  />
                </>
              ) : (
                <View style={styles.passwordHint}>
                  <Ionicons
                    name="information-circle-outline"
                    size={17}
                    color={colors.muted2}
                  />

                  <Text
                    style={
                      styles.passwordHintText
                    }
                  >
                    Use at least 8 characters with an
                    uppercase letter, lowercase letter,
                    and number.
                  </Text>
                </View>
              )}

              <AuthInput
                label="Confirm new password"
                icon="lock-closed-outline"
                value={confirm}
                onChangeText={(value) => {
                  setConfirm(value);

                  if (message) {
                    setMessage("");
                  }
                }}
                secureTextEntry={!showConfirm}
                focused={
                  focusedField === "confirm"
                }
                onFocus={() =>
                  setFocusedField("confirm")
                }
                onBlur={() =>
                  setFocusedField("")
                }
                rightIcon={
                  showConfirm
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                onRightPress={() =>
                  setShowConfirm(
                    (previous) => !previous
                  )
                }
              />

              {confirm.length > 0 ? (
                <View
                  style={[
                    styles.matchRow,
                    passwordsMatch
                      ? styles.matchSuccess
                      : styles.matchError,
                  ]}
                >
                  <Ionicons
                    name={
                      passwordsMatch
                        ? "checkmark-circle-outline"
                        : "close-circle-outline"
                    }
                    size={17}
                    color={
                      passwordsMatch
                        ? colors.success
                        : colors.danger
                    }
                  />

                  <Text
                    style={[
                      styles.matchText,
                      {
                        color: passwordsMatch
                          ? colors.success
                          : colors.danger,
                      },
                    ]}
                  >
                    {passwordsMatch
                      ? "Passwords match"
                      : "Passwords do not match"}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.88}
                style={[
                  styles.updateButton,
                  loading &&
                    styles.updateButtonDisabled,
                ]}
                onPress={handleUpdatePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator
                    color={colors.deep}
                  />
                ) : (
                  <>
                    <Text
                      style={
                        styles.updateButtonText
                      }
                    >
                      Update Password
                    </Text>

                    <View
                      style={styles.buttonIcon}
                    >
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.deep}
                      />
                    </View>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.securityNote}>
              <Ionicons
                name="shield-checkmark-outline"
                size={15}
                color={colors.muted2}
              />

              <Text
                style={styles.securityNoteText}
              >
                After updating your password, you&apos;ll
                be signed out and returned to Sign In.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppBackground>
  );
}

function AuthInput({
  label,
  icon,
  value,
  onChangeText,
  secureTextEntry,
  rightIcon,
  onRightPress,
  focused,
  onFocus,
  onBlur,
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
          focused && styles.inputShellFocused,
        ]}
      >
        <View style={styles.inputIcon}>
          <Ionicons
            name={icon}
            size={19}
            color={
              focused
                ? colors.accent2
                : colors.muted
            }
          />
        </View>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={label}
          placeholderTextColor={colors.muted2}
          style={styles.input}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          onFocus={onFocus}
          onBlur={onBlur}
        />

        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.eyeButton}
          onPress={onRightPress}
        >
          <Ionicons
            name={rightIcon}
            size={19}
            color={colors.muted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PasswordStrength({ strength }) {
  const { styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.strengthBox}>
      <View style={styles.strengthHeader}>
        <Text style={styles.strengthLabel}>
          Password strength
        </Text>

        <Text
          style={[
            styles.strengthValue,
            { color: strength.color },
          ]}
        >
          {strength.label}
        </Text>
      </View>

      <View style={styles.strengthTrack}>
        <View
          style={[
            styles.strengthFill,
            {
              width: strength.percent,
              backgroundColor:
                strength.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function PasswordRules({ checks }) {
  const { styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.rulesBox}>
      <PasswordRule
        passed={checks.hasMinLength}
        text="8+ characters"
      />

      <PasswordRule
        passed={checks.hasUppercase}
        text="Uppercase letter"
      />

      <PasswordRule
        passed={checks.hasLowercase}
        text="Lowercase letter"
      />

      <PasswordRule
        passed={checks.hasNumber}
        text="Number"
      />
    </View>
  );
}

function PasswordRule({
  text,
  passed,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.ruleRow}>
      <Ionicons
        name={
          passed
            ? "checkmark-circle"
            : "ellipse-outline"
        }
        size={16}
        color={
          passed
            ? colors.success
            : colors.muted2
        }
      />

      <Text
        style={[
          styles.ruleText,
          passed && styles.ruleTextPassed,
        ]}
      >
        {text}
      </Text>
    </View>
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
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  safe: {
    flex: 1,
  },

  keyboard: {
    flex: 1,
  },

  scroll: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 34,
  },

  header: {
    alignItems: "center",
    marginBottom: 28,
  },

  logoGlow: {
    position: "absolute",
    top: -8,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor:
      "rgba(34,211,197,0.07)",
  },

  logoWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor:
      "rgba(34,211,197,0.14)",
  },

  title: {
    marginTop: 23,
    color: colors.textStrong,
    fontSize: 28,
    lineHeight: 37,
    fontWeight: "800",
    letterSpacing: -0.6,
    textAlign: "center",
  },

  subtitle: {
    marginTop: 8,
    maxWidth: 330,
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
  },

  messageBox: {
    marginBottom: 18,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
  },

  messageError: {
    backgroundColor: colors.dangerSoft,
    borderColor:
      "rgba(248,113,113,0.22)",
  },

  messageSuccess: {
    backgroundColor:
      colors.successSoft,
    borderColor:
      "rgba(74,222,128,0.22)",
  },

  messageText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },

  formCard: {
    padding: 17,
    borderRadius: 22,
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor:
      colors.border,
    ...SHADOW.soft,
  },

  inputGroup: {
    marginBottom: 17,
  },

  inputLabel: {
    marginBottom: 8,
    color:
      colors.muted,
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

  inputShellFocused: {
    backgroundColor:
      "rgba(34,211,197,0.045)",
    borderColor:
      "rgba(34,211,197,0.45)",
  },

  inputIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(34,211,197,0.08)",
  },

  input: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
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

  passwordHint: {
    marginTop: -4,
    marginBottom: 18,
    paddingHorizontal: 3,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },

  passwordHintText: {
    flex: 1,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  strengthBox: {
    marginTop: -4,
    marginBottom: 10,
    padding: 11,
    borderRadius: 14,
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor:
      colors.border,
  },

  strengthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  strengthLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },

  strengthValue: {
    fontSize: 12,
    fontWeight: "700",
  },

  strengthTrack: {
    marginTop: 9,
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor:
      colors.surfaceSoft,
  },

  strengthFill: {
    height: "100%",
    borderRadius: 999,
  },

  rulesBox: {
    marginBottom: 18,
    padding: 11,
    borderRadius: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 9,
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor:
      colors.border,
  },

  ruleRow: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 5,
  },

  ruleText: {
    flex: 1,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },

  ruleTextPassed: {
    color: colors.success,
  },

  matchRow: {
    marginTop: -5,
    marginBottom: 17,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
  },

  matchSuccess: {
    backgroundColor:
      "rgba(74,222,128,0.05)",
    borderColor:
      "rgba(74,222,128,0.16)",
  },

  matchError: {
    backgroundColor:
      "rgba(248,113,113,0.05)",
    borderColor:
      "rgba(248,113,113,0.16)",
  },

  matchText: {
    fontSize: 12,
    fontWeight: "600",
  },

  updateButton: {
    position: "relative",
    height: 56,
    marginTop: 4,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent2,
    ...SHADOW.card,
  },

  updateButtonDisabled: { minHeight: 44,
    opacity: 0.62,
  },

  updateButtonText: {
    color: colors.deep,
    fontSize: 15,
    fontWeight: "700",
  },

  buttonIcon: {
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

  securityNote: {
    marginTop: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  securityNoteText: {
    maxWidth: 300,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    textAlign: "center",
  },
});
}
