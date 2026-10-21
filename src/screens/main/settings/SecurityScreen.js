// src/screens/main/settings/SecurityScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import AppButton from "../../../components/ui/AppButton";
import AppCard from "../../../components/ui/AppCard";
import AppHeader from "../../../components/ui/AppHeader";
import AppScreen from "../../../components/ui/AppScreen";
import { RADIUS, SHADOW } from "../../../constants/theme";
import { supabase } from "../../../lib/supabase";

import {
  getPasswordChecks,
  getPasswordStrength,
  isPasswordStrong,
} from "../../../utils/passwordRules";
import useThemedStyles from '../../../hooks/useThemedStyles';
import useSingleFlight from '../../../hooks/useSingleFlight';

export default function SecurityScreen({ onBack }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [focusedField, setFocusedField] = useState("");

  const [loading, setLoading] = useState(true);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [saving, setSaving] = useState(false);

  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  const passwordChecks = useMemo(() => {
    return getPasswordChecks(newPassword);
  }, [newPassword]);

  const passwordStrength = useMemo(() => {
    return getPasswordStrength(newPassword);
  }, [newPassword]);

  

  const passwordsMatch =
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  const busy =
    otpSending ||
    otpVerifying ||
    saving;

  async function loadUser() {
    setLoading(true);
    setErrorText("");

    try {
      const { data, error } =
        await supabase.auth.getUser();

      if (error) {
        throw new Error(
          error.message ||
            "Unable to load account."
        );
      }

      const user = data?.user;

      if (!user?.id) {
        throw new Error(
          "No logged in user found. Please sign in again."
        );
      }

      setUserId(user.id);
      setEmail(user.email || "");
    } catch (error) {
      console.log("LOAD SECURITY USER ERROR:");

      setErrorText(
        error?.message ||
          "Unable to load security settings."
      );
    } finally {
      setLoading(false);
    }
  }

  function showNotice(title, message, onPress) {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.alert(
          `${title}\n\n${message}`
        );
      }

      onPress?.();
      return;
    }

    Alert.alert(title, message, [
      {
        text: "OK",
        onPress,
      },
    ]);
  }

  function showError(title, message) {
    setErrorText(message || title);

    if (Platform.OS !== "web") {
      Alert.alert(title, message);
    }
  }

  const handleSendOtp = useSingleFlight(async function handleSendOtp() {
    setErrorText("");
    setStatusText("");

    if (!email) {
      showError(
        "OTP failed",
        "Your email account could not be detected. Please sign in again."
      );
      return;
    }

    setOtpSending(true);

    try {
      setStatusText(
        "Sending verification code..."
      );

      const { error } =
        await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
          },
        });

      if (error) {
        throw new Error(
          error.message ||
            "Unable to send verification code."
        );
      }

      setOtpSent(true);
      setOtpVerified(false);
      setOtpCode("");

      showNotice(
        "Code sent",
        "A verification code was sent to your login email."
      );
    } catch (error) {
      console.log("SEND OTP ERROR:");

      showError(
        "OTP failed",
        error?.message ||
          "Unable to send verification code."
      );
    } finally {
      setOtpSending(false);
      setStatusText("");
    }
  });

  const handleVerifyOtp = useSingleFlight(async function handleVerifyOtp() {
    setErrorText("");
    setStatusText("");

    const cleanOtp =
      otpCode.trim();

    if (!email) {
      showError(
        "Verification failed",
        "Your email account could not be detected. Please sign in again."
      );

      return;
    }

    if (!cleanOtp) {
      showError(
        "Verification failed",
        "Please enter the code sent to your email."
      );

      return;
    }

    setOtpVerifying(true);

    try {
      setStatusText(
        "Verifying code..."
      );

      const { data, error } =
        await supabase.auth.verifyOtp({
          email,
          token: cleanOtp,
          type: "email",
        });

      if (error) {
        throw new Error(
          error.message ||
            "Invalid or expired verification code."
        );
      }

      const verifiedUserId =
        data?.user?.id;

      if (
        userId &&
        verifiedUserId &&
        verifiedUserId !== userId
      ) {
        throw new Error(
          "The code belongs to a different account. Please sign in again."
        );
      }

      setOtpVerified(true);
      setErrorText("");
      setStatusText("");

      showNotice(
        "Email verified",
        "You can now create a new password."
      );
    } catch (error) {
      console.log("VERIFY OTP ERROR:");

      setOtpVerified(false);

      showError(
        "Verification failed",
        error?.message ||
          "Invalid or expired verification code."
      );
    } finally {
      setOtpVerifying(false);
      setStatusText("");
    }
  });

  function validatePasswordForm() {
    if (!email) {
      return "Your email account could not be detected. Please sign in again.";
    }

    if (!otpVerified) {
      return "Please verify your email before changing your password.";
    }

    if (!newPassword.trim()) {
      return "Please enter your new password.";
    }

    if (!isPasswordStrong(newPassword)) {
      return "Your new password must contain at least 8 characters, an uppercase letter, a lowercase letter, and a number.";
    }

    if (newPassword !== confirmPassword) {
      return "The passwords do not match.";
    }

    return "";
  }

  const handleChangePassword = useSingleFlight(async function handleChangePassword() {
    setErrorText("");
    setStatusText("");

    const validationMessage =
      validatePasswordForm();

    if (validationMessage) {
      showError(
        "Password update failed",
        validationMessage
      );

      return;
    }

    setSaving(true);

    try {
      setStatusText(
        "Updating password..."
      );

      const { error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (updateError) {
        throw new Error(
          updateError.message ||
            "Unable to update password."
        );
      }

      setOtpCode("");
      setOtpSent(false);
      setOtpVerified(false);

      setNewPassword("");
      setConfirmPassword("");

      setShowNewPassword(false);
      setShowConfirmPassword(false);

      showNotice(
        "Password updated",
        "Your password was changed successfully.",
        onBack
      );
    } catch (error) {
      console.log("CHANGE PASSWORD ERROR:");

      showError(
        "Password update failed",
        error?.message ||
          "Unable to change password."
      );
    } finally {
      setSaving(false);
      setStatusText("");
    }
  });

  if (loading) {
    return (
      <AppScreen keyboard onBack={onBack} backDisabled={busy}>
        <View style={styles.loadingRoot}>
          <View style={styles.loadingIcon}>
            <ActivityIndicator
              color={colors.accent2}
            />
          </View>

          <Text style={styles.loadingTitle}>
            Loading security
          </Text>

          <Text style={styles.loadingText}>
            Getting your account information.
          </Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboard onBack={onBack} backDisabled={busy}>
      <View style={styles.root}>
        <AppHeader
          eyebrow="Account"
          title="Security"
          subtitle="Verify your email before changing your password."
          icon="shield-checkmark-outline"
          rightAction="close-outline"
          onRightPress={
            busy ? undefined : onBack
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <AppCard
            strong
            style={styles.heroCard}
          >
            <View style={styles.heroIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={28}
                color={colors.accent2}
              />
            </View>

            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>
                Change your password
              </Text>

              <Text style={styles.heroText}>
                We&apos;ll first confirm your
                login email, then you can set a
                new password.
              </Text>
            </View>
          </AppCard>

          {errorText ? (
            <ErrorMessage
              message={errorText}
            />
          ) : null}

          {statusText ? (
            <View style={styles.statusBox}>
              <ActivityIndicator
                size="small"
                color={colors.accent2}
              />

              <Text style={styles.statusText}>
                {statusText}
              </Text>
            </View>
          ) : null}

          <StepHeader
            step="1"
            title="Verify your email"
            subtitle="Confirm that you own the account."
            complete={otpVerified}
          />

          <AppCard
            strong
            style={styles.verificationCard}
          >
            <ReadOnlyEmail
              email={
                email || "No email found"
              }
            />

            {!otpVerified ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[
                    styles.sendOtpButton,
                    (otpSending ||
                      otpVerifying) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={handleSendOtp}
                  disabled={busy}
                >
                  {otpSending ? (
                    <ActivityIndicator
                      color={colors.deep}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="send-outline"
                        size={18}
                        color={colors.deep}
                      />

                      <Text
                        style={
                          styles.sendOtpButtonText
                        }
                      >
                        {otpSent
                          ? "Resend Code"
                          : "Send Verification Code"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {otpSent ? (
                  <View
                    style={
                      styles.otpSection
                    }
                  >
                    <Text
                      style={styles.inputLabel}
                    >
                      Verification code
                    </Text>

                    <View
                      style={[
                        styles.formInput,
                        focusedField ===
                          "otp" &&
                          styles.formInputFocused,
                      ]}
                    >
                      <View
                        style={
                          styles.inputIcon
                        }
                      >
                        <Ionicons
                          name="keypad-outline"
                          size={19}
                          color={
                            focusedField ===
                            "otp"
                              ? colors.accent2
                              : colors.muted
                          }
                        />
                      </View>

                      <TextInput
                        value={otpCode}
                        onChangeText={(value) => {
                          setOtpCode(
                            digitsOnly(value)
                          );

                          if (errorText) {
                            setErrorText("");
                          }
                        }}
                        placeholder="Enter the code"
                        placeholderTextColor={
                          colors.muted2
                        }
                        style={
                          styles.otpInput
                        }
                        editable={!busy}
                        keyboardType="number-pad"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onFocus={() =>
                          setFocusedField(
                            "otp"
                          )
                        }
                        onBlur={() =>
                          setFocusedField("")
                        }
                      />
                    </View>

                    <Text
                      style={
                        styles.otpHelper
                      }
                    >
                      Check your inbox and spam
                      folder if the email does not
                      appear immediately.
                    </Text>

                    <TouchableOpacity
                      activeOpacity={0.86}
                      style={[
                        styles.verifyButton,
                        (!otpCode ||
                          otpVerifying) &&
                          styles.buttonDisabled,
                      ]}
                      onPress={
                        handleVerifyOtp
                      }
                      disabled={
                        !otpCode || busy
                      }
                    >
                      {otpVerifying ? (
                        <ActivityIndicator
                          color={colors.deep}
                        />
                      ) : (
                        <>
                          <Text
                            style={
                              styles.verifyButtonText
                            }
                          >
                            Verify Code
                          </Text>

                          <Ionicons
                            name="checkmark-circle-outline"
                            size={18}
                            color={colors.deep}
                          />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.verifiedBox}>
                <View style={styles.verifiedIcon}>
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={colors.success}
                  />
                </View>

                <View style={styles.verifiedContent}>
                  <Text style={styles.verifiedTitle}>
                    Email verified
                  </Text>

                  <Text style={styles.verifiedText}>
                    Password change is now unlocked.
                  </Text>
                </View>
              </View>
            )}
          </AppCard>

          <StepHeader
            step="2"
            title="Create a new password"
            subtitle={
              otpVerified
                ? "Choose a secure password for your account."
                : "Complete email verification first."
            }
            locked={!otpVerified}
          />

          <AppCard
            strong
            style={[
              styles.passwordCard,
              !otpVerified &&
                styles.passwordCardLocked,
            ]}
          >
            {!otpVerified ? (
              <LockedState />
            ) : (
              <>
                <PasswordInput
                  label="New password"
                  value={newPassword}
                  onChangeText={(value) => {
                    setNewPassword(value);

                    if (errorText) {
                      setErrorText("");
                    }
                  }}
                  placeholder="Enter new password"
                  visible={showNewPassword}
                  onToggleVisible={() =>
                    setShowNewPassword(
                      (previous) => !previous
                    )
                  }
                  editable={!saving}
                  focused={
                    focusedField ===
                    "newPassword"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "newPassword"
                    )
                  }
                  onBlur={() =>
                    setFocusedField("")
                  }
                />

                {newPassword.length > 0 ? (
                  <>
                    <PasswordStrength
                      strength={
                        passwordStrength
                      }
                    />

                    <PasswordChecklist
                      checks={
                        passwordChecks
                      }
                    />
                  </>
                ) : (
                  <View
                    style={
                      styles.passwordHint
                    }
                  >
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
                      Use at least 8 characters
                      with uppercase, lowercase,
                      and a number.
                    </Text>
                  </View>
                )}

                <PasswordInput
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);

                    if (errorText) {
                      setErrorText("");
                    }
                  }}
                  placeholder="Enter password again"
                  visible={showConfirmPassword}
                  onToggleVisible={() =>
                    setShowConfirmPassword(
                      (previous) => !previous
                    )
                  }
                  editable={!saving}
                  focused={
                    focusedField ===
                    "confirmPassword"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "confirmPassword"
                    )
                  }
                  onBlur={() =>
                    setFocusedField("")
                  }
                />

                {confirmPassword.length > 0 ? (
                  <View
                    style={[
                      styles.matchBox,
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
                          color:
                            passwordsMatch
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

                <AppButton
                  title={
                    saving
                      ? "Updating..."
                      : "Update Password"
                  }
                  icon="key-outline"
                  onPress={
                    handleChangePassword
                  }
                  loading={saving}
                  disabled={saving}
                  style={styles.updateButton}
                />

                <TouchableOpacity
                  activeOpacity={0.82}
                  style={styles.cancelButton}
                  onPress={onBack}
                  disabled={saving}
                >
                  <Text style={styles.cancelText}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </AppCard>

          <View style={styles.footerNote}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={colors.muted2}
            />

            <Text style={styles.footerNoteText}>
              Never share your verification code
              or password with anyone.
            </Text>
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function StepHeader({
  step,
  title,
  subtitle,
  complete = false,
  locked = false,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.stepHeader}>
      <View
        style={[
          styles.stepNumber,
          complete && styles.stepNumberComplete,
        ]}
      >
        {complete ? (
          <Ionicons
            name="checkmark"
            size={15}
            color={colors.deep}
          />
        ) : locked ? (
          <Ionicons
            name="lock-closed-outline"
            size={13}
            color={colors.muted}
          />
        ) : (
          <Text style={styles.stepNumberText}>
            {step}
          </Text>
        )}
      </View>

      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>
          {title}
        </Text>

        <Text style={styles.stepSubtitle}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function ReadOnlyEmail({ email }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.emailBox}>
      <View style={styles.emailIcon}>
        <Ionicons
          name="mail-outline"
          size={19}
          color={colors.accent2}
        />
      </View>

      <View style={styles.emailContent}>
        <Text style={styles.emailLabel}>
          Login email
        </Text>

        <Text
          style={styles.emailText}
          numberOfLines={1}
        >
          {email}
        </Text>
      </View>

      <Ionicons
        name="lock-closed-outline"
        size={15}
        color={colors.muted2}
      />
    </View>
  );
}

function PasswordInput({
  label,
  value,
  onChangeText,
  placeholder,
  visible,
  onToggleVisible,
  editable = true,
  focused,
  onFocus,
  onBlur,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.formGroup}>
      <Text style={styles.inputLabel}>
        {label}
      </Text>

      <View
        style={[
          styles.formInput,
          focused &&
            styles.formInputFocused,
          !editable &&
            styles.formInputDisabled,
        ]}
      >
        <View style={styles.inputIcon}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
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
          placeholder={placeholder}
          placeholderTextColor={
            colors.muted2
          }
          secureTextEntry={!visible}
          style={styles.formTextInput}
          editable={editable}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          onFocus={onFocus}
          onBlur={onBlur}
        />

        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.eyeButton}
          onPress={onToggleVisible}
          disabled={!editable}
        >
          <Ionicons
            name={
              visible
                ? "eye-off-outline"
                : "eye-outline"
            }
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
      <View style={styles.strengthTop}>
        <Text style={styles.strengthLabel}>
          Password strength
        </Text>

        <Text
          style={[
            styles.strengthValue,
            {
              color: strength.color,
            },
          ]}
        >
          {strength.label}
        </Text>
      </View>

      <View style={styles.strengthBarTrack}>
        <View
          style={[
            styles.strengthBarFill,
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

function PasswordChecklist({ checks }) {
  const { styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.checklistBox}>
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
  passed,
  text,
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
          passed &&
            styles.ruleTextPassed,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function LockedState() {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.lockedBox}>
      <View style={styles.lockedIcon}>
        <Ionicons
          name="lock-closed-outline"
          size={24}
          color={colors.warning}
        />
      </View>

      <Text style={styles.lockedTitle}>
        Password change locked
      </Text>

      <Text style={styles.lockedText}>
        Verify the code sent to your email
        before creating a new password.
      </Text>
    </View>
  );
}

function ErrorMessage({ message }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.errorBox}>
      <View style={styles.errorIcon}>
        <Ionicons
          name="alert-circle-outline"
          size={19}
          color={colors.danger}
        />
      </View>

      <View style={styles.errorContent}>
        <Text style={styles.errorTitle}>
          Unable to continue
        </Text>

        <Text style={styles.errorText}>
          {message}
        </Text>
      </View>
    </View>
  );
}

function digitsOnly(value) {
  return String(value || "").replace(
    /[^0-9]/g,
    ""
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 22,
  },

  scroll: {
    paddingTop: 3,
    paddingBottom: 140,
  },

  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  loadingIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingTitle: {
    marginTop: 13,
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },

  loadingText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "400",
  },

  heroCard: {
    padding: 15,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOW.soft,
  },

  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },

  heroContent: {
    flex: 1,
  },

  heroTitle: {
    color: colors.textStrong,
    fontSize: 14.5,
    fontWeight: "700",
  },

  heroText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
  },

  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.24)",
  },

  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    backgroundColor: "rgba(248,113,113,0.10)",
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },

  errorText: {
    marginTop: 3,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  statusBox: {
    marginTop: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },

  statusText: {
    flex: 1,
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "500",
  },

  stepHeader: {
    marginTop: 25,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },

  stepNumberComplete: {
    backgroundColor: colors.accent2,
  },

  stepNumberText: {
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "700",
  },

  stepContent: {
    flex: 1,
  },

  stepTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "700",
  },

  stepSubtitle: {
    marginTop: 2,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  verificationCard: {
    padding: 15,
    borderRadius: 19,
  },

  emailBox: {
    minHeight: 60,
    paddingHorizontal: 11,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  emailIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: colors.accentSoft,
  },

  emailContent: {
    flex: 1,
    minWidth: 0,
  },

  emailLabel: {
    color: colors.muted2,
    fontSize: 12,
    fontWeight: "500",
  },

  emailText: {
    marginTop: 2,
    color: colors.textStrong,
    fontSize: 12.5,
    fontWeight: "600",
  },

  sendOtpButton: {
    minHeight: 52,
    marginTop: 13,
    borderRadius: 16,
    backgroundColor: colors.accent2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    ...SHADOW.card,
  },

  sendOtpButtonText: {
    color: colors.deep,
    fontSize: 13,
    fontWeight: "700",
  },

  buttonDisabled: { minHeight: 44,
    opacity: 0.55,
  },

  otpSection: {
    marginTop: 17,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  formGroup: {
    marginBottom: 16,
  },

  inputLabel: {
    marginBottom: 8,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  formInput: {
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  formInputFocused: {
    backgroundColor: "rgba(34,211,197,0.04)",
    borderColor: colors.accentBorder,
  },

  formInputDisabled: {
    opacity: 0.65,
  },

  inputIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: colors.accentSoft,
  },

  formTextInput: {
    flex: 1,
    height: 54,
    paddingVertical: 0,
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "500",
  },

  otpInput: {
    flex: 1,
    height: 54,
    paddingVertical: 0,
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 2,
  },

  otpHelper: {
    marginTop: 7,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  verifyButton: {
    minHeight: 50,
    marginTop: 13,
    borderRadius: 15,
    backgroundColor: colors.accent2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  verifyButtonText: {
    color: colors.deep,
    fontSize: 13,
    fontWeight: "700",
  },

  verifiedBox: {
    marginTop: 13,
    padding: 12,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.22)",
  },

  verifiedIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    backgroundColor: "rgba(74,222,128,0.09)",
  },

  verifiedContent: {
    flex: 1,
  },

  verifiedTitle: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },

  verifiedText: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  passwordCard: {
    padding: 15,
    borderRadius: 19,
  },

  passwordCardLocked: {
    backgroundColor: colors.surfaceSoft,
  },

  lockedBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 21,
    paddingHorizontal: 14,
  },

  lockedIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.18)",
  },

  lockedTitle: {
    marginTop: 12,
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },

  lockedText: {
    marginTop: 5,
    maxWidth: 290,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    textAlign: "center",
  },

  strengthBox: {
    marginTop: -4,
    marginBottom: 10,
    padding: 11,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  strengthTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

  strengthBarTrack: {
    marginTop: 9,
    height: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: colors.surfaceSoft,
    overflow: "hidden",
  },

  strengthBarFill: {
    height: "100%",
    borderRadius: RADIUS.pill,
  },

  checklistBox: {
    marginBottom: 17,
    padding: 11,
    borderRadius: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 9,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  ruleRow: {
    width: "50%",
    paddingRight: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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

  passwordHint: {
    marginTop: -3,
    marginBottom: 17,
    paddingHorizontal: 2,
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

  eyeButton: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  matchBox: {
    marginTop: -4,
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
    backgroundColor: "rgba(74,222,128,0.05)",
    borderColor: "rgba(74,222,128,0.17)",
  },

  matchError: {
    backgroundColor: "rgba(248,113,113,0.05)",
    borderColor: "rgba(248,113,113,0.17)",
  },

  matchText: {
    fontSize: 12,
    fontWeight: "600",
  },

  updateButton: {
    marginTop: 2,
  },

  cancelButton: {
    minHeight: 44,
    marginTop: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  footerNote: {
    marginTop: 18,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  footerNoteText: {
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    textAlign: "center",
  },
});
}
