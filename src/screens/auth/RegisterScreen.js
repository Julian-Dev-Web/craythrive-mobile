// src/screens/auth/RegisterScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Modal,
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
import { RADIUS, SHADOW } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { isValidEmail } from '../../utils/emailRules';
import {
  getPasswordChecks,
  getPasswordStrength,
  isPasswordStrong,
} from "../../utils/passwordRules";
import useThemedStyles from '../../hooks/useThemedStyles';
import useSingleFlight from '../../hooks/useSingleFlight';
import useAndroidBack from '../../hooks/useAndroidBack';
import { SafeAreaView } from "react-native-safe-area-context";



export default function RegisterScreen({
  onBack,
  onLogin,
  onSuccess,
}) {
  

  const { colors, styles, isDark } = useThemedStyles(makeStyles);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [hasScrolledTerms, setHasScrolledTerms] =
    useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] =
    useState(false);

  const [loading, setLoading] = useState(false);
  useAndroidBack(onBack, loading);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const passwordChecks = useMemo(() => {
    return getPasswordChecks(password);
  }, [password]);

  const passwordStrength = useMemo(() => {
    return getPasswordStrength(password);
  }, [password]);

  function validateForm() {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim();

    if (!cleanFirstName) {
      return "Please enter your first name.";
    }

    if (!cleanLastName) {
      return "Please enter your last name.";
    }

    if (!cleanEmail) {
      return "Please enter your email.";
    }

    if (!isValidEmail(cleanEmail)) {
      return "Please enter a valid email address.";
    }

    if (!password.trim()) {
      return "Please enter your password.";
    }

    if (!isPasswordStrong(password)) {
      return "Your password needs at least 8 characters, an uppercase letter, a lowercase letter, and a number.";
    }

    if (password !== confirmPassword) {
      return "Your passwords do not match.";
    }

    if (!isAgreed) {
      return "Please read and agree to the Terms & Conditions and Privacy Policy.";
    }

    return "";
  }

  const handleRegister = useSingleFlight(async function handleRegister() {
    setErrorText("");
    setSuccessText("");

    const validationMessage = validateForm();

    if (validationMessage) {
      setErrorText(validationMessage);
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanFirstName = firstName.trim();
      const cleanMiddleName = middleName.trim();
      const cleanLastName = lastName.trim();

      const cleanFullName = buildFullName(
        cleanFirstName,
        cleanMiddleName,
        cleanLastName
      );

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            first_name: cleanFirstName,
            middle_name: cleanMiddleName || null,
            last_name: cleanLastName,
            full_name: cleanFullName,
            username: null,
          },
          emailRedirectTo:
            "https://craythrive.site/verified.html",
        },
      });

      if (error) {
        throw new Error(getFriendlyRegisterError(error));
      }

      setFirstName("");
      setMiddleName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setHasScrolledTerms(false);
      setIsAgreed(false);

      if (!data?.session) {
        setSuccessText(
          "If this email can be registered, a verification link will be sent. Check your inbox, or sign in if you already have an account."
        );

        setTimeout(() => {
          onLogin?.();
        }, 4500);

        setLoading(false);
        return;
      }

      onSuccess?.();
    } catch (error) {
      console.log("REGISTER ERROR:");

      setErrorText(
        error?.message || "Unable to create your account."
      );
    } finally {
      setLoading(false);
    }
  });

  function handleTermsScroll(event) {
    const {
      layoutMeasurement,
      contentOffset,
      contentSize,
    } = event.nativeEvent;

    const isNearBottom =
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - 28;

    if (isNearBottom) {
      setHasScrolledTerms(true);
      setIsAgreed(true);
    }
  }

  function openTermsModal() {
    setShowTermsModal(true);
  }

  function closeTermsModal() {
    if (!hasScrolledTerms) return;

    setIsAgreed(true);
    setShowTermsModal(false);
  }

  return (
    <SafeAreaView style={{flex: 1}}><KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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

            <Text style={styles.headerEyebrow}>
              CRAYTHRIVE
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.intro}>
            <Text style={styles.title}>
              Create your account
            </Text>

            <Text style={styles.subtitle}>
              Set up your profile to start managing your
              crayfish tanks.
            </Text>
          </View>

          {errorText ? (
            <MessageBox
              type="error"
              text={errorText}
            />
          ) : null}

          {successText ? (
            <MessageBox
              type="success"
              text={successText}
            />
          ) : null}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="person-outline"
                size={18}
                color={colors.accent2}
              />
            </View>

            <View style={styles.sectionContent}>
              <Text style={styles.sectionTitle}>
                Personal details
              </Text>

              <Text style={styles.sectionSubtitle}>
                Tell us who owns this account.
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <AuthInput
              label="First name"
              icon="person-outline"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter first name"
              editable={!loading}
              autoCapitalize="words"
              autoComplete="given-name"
            />

            <AuthInput
              label="Middle name"
              optional
              icon="person-outline"
              value={middleName}
              onChangeText={setMiddleName}
              placeholder="Enter middle name"
              editable={!loading}
              autoCapitalize="words"
              autoComplete="additional-name"
            />

            <AuthInput
              label="Last name"
              icon="person-outline"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter last name"
              editable={!loading}
              autoCapitalize="words"
              autoComplete="family-name"
            />
          </View>

          <View style={styles.sectionDivider} />

          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={colors.accent2}
              />
            </View>

            <View style={styles.sectionContent}>
              <Text style={styles.sectionTitle}>
                Account details
              </Text>

              <Text style={styles.sectionSubtitle}>
                Use an email you can access for verification.
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <AuthInput
              label="Email address"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              editable={!loading}
              autoCapitalize="none"
              autoComplete="email"
            />

            <AuthInput
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              secureTextEntry={!showPassword}
              editable={!loading}
              autoCapitalize="none"
              autoComplete="new-password"
              rightIcon={
                showPassword
                  ? "eye-off-outline"
                  : "eye-outline"
              }
              onRightPress={() =>
                setShowPassword((previous) => !previous)
              }
            />

            {password.length > 0 ? (
              <>
                <PasswordStrength
                  strength={passwordStrength}
                />

                <PasswordChecklist
                  checks={passwordChecks}
                />
              </>
            ) : (
              <View style={styles.passwordHint}>
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color={colors.muted2}
                />

                <Text style={styles.passwordHintText}>
                  Use 8+ characters with uppercase,
                  lowercase, and a number.
                </Text>
              </View>
            )}

            <AuthInput
              label="Confirm password"
              icon="lock-closed-outline"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Enter your password again"
              secureTextEntry={!showConfirmPassword}
              editable={!loading}
              autoCapitalize="none"
              autoComplete="new-password"
              rightIcon={
                showConfirmPassword
                  ? "eye-off-outline"
                  : "eye-outline"
              }
              onRightPress={() =>
                setShowConfirmPassword(
                  (previous) => !previous
                )
              }
            />

            <TouchableOpacity
              style={[
                styles.termsCard,
                isAgreed && styles.termsCardAgreed,
              ]}
              onPress={openTermsModal}
              activeOpacity={0.82}
              disabled={loading}
            >
              <View
                style={[
                  styles.checkbox,
                  isAgreed && styles.checkboxChecked,
                ]}
              >
                {isAgreed ? (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={colors.deep}
                  />
                ) : null}
              </View>

              <View style={styles.termsContent}>
                <Text style={styles.termsText}>
                  I agree to the{" "}
                  <Text style={styles.termsLink}>
                    Terms & Conditions
                  </Text>{" "}
                  and{" "}
                  <Text style={styles.termsLink}>
                    Privacy Policy
                  </Text>
                  .
                </Text>

                <Text style={styles.termsHint}>
                  Tap to open and review.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.muted2}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.registerButton,
                (loading || !isAgreed) &&
                  styles.registerButtonDisabled,
              ]}
              onPress={handleRegister}
              disabled={loading || !isAgreed}
            >
              {loading ? (
                <ActivityIndicator color={colors.deep} />
              ) : (
                <>
                  <Text style={styles.registerButtonText}>
                    Create Account
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
                Already have an account?
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
        </View>
      </ScrollView>

      <Modal
        visible={showTermsModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() =>
          setShowTermsModal(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>
                  Terms & Privacy
                </Text>

                <Text style={styles.modalInstruction}>
                  Read to the bottom before continuing.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.modalCloseIcon}
                onPress={() =>
                  setShowTermsModal(false)
                }
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={colors.textStrong}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={
                styles.modalScrollContent
              }
              onScroll={handleTermsScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator
            >
              <Text style={styles.modalSectionTitle}>
                Terms & Conditions
              </Text>

              <Text style={styles.modalBodyText}>
                Welcome to CrayThrive. By creating an
                account and using this application, you
                agree to use the system responsibly for
                crayfish tank monitoring, marketplace
                features, reports, and device management.
                {"\n\n"}

                1. Account Information. You agree to
                provide accurate name and email information
                during registration. Your email will be
                used for login, account verification,
                password recovery, and important security
                notifications.
                {"\n\n"}

                2. Tank Monitoring. CrayThrive helps
                display readings such as temperature, pH,
                turbidity, water level, and ammonia test
                results. Readings depend on connected
                hardware, calibration, connectivity, and
                user-performed ammonia tests. The
                application is a support tool and should
                not replace regular physical inspection of
                your tanks and crayfish.
                {"\n\n"}

                3. Device Responsibility. You are
                responsible for safely installing,
                powering, and maintaining your ESP32
                devices, Arduino, sensors, pumps, feeder,
                and related hardware. Loose wiring, power
                issues, calibration errors, and poor
                connectivity may affect system operation.
                {"\n\n"}

                4. Ammonia Testing. Ammonia testing may
                use a smartphone camera to estimate a test
                strip result or allow the result to be
                entered manually. Camera-based results are
                estimates and are not laboratory-grade
                chemical analysis.
                {"\n\n"}

                5. Automated Actions. Any feeder, pump, or
                actuator automation must be used carefully.
                Users should still verify that the tank,
                pumps, feeder, water supply, and crayfish
                conditions are safe.
                {"\n\n"}

                6. Marketplace Use. If you use the
                marketplace, you are expected to post
                accurate crayfish listings and communicate
                respectfully with buyers or sellers.
                CrayThrive does not guarantee the quality,
                health, delivery, or payment outcome of
                marketplace transactions.
                {"\n\n"}

                7. Acceptable Use. You agree not to misuse
                the application, tamper with data,
                impersonate others, upload misleading
                listings, or attempt to access tanks,
                devices, conversations, or information
                that do not belong to you.
                {"\n\n"}

                8. Feature Changes. CrayThrive features
                may be updated, improved, removed, or
                changed during system development and
                maintenance.
              </Text>

              <View style={styles.modalDivider} />

              <Text style={styles.modalSectionTitle}>
                Privacy Policy
              </Text>

              <Text style={styles.modalBodyText}>
                CrayThrive respects your privacy. This
                section explains what information may be
                collected and how it is used.
                {"\n\n"}

                1. Personal Data. We collect basic account
                details such as your first name, optional
                middle name, last name, email address, and
                profile information you choose to update.
                {"\n\n"}

                2. Tank and Device Data. The application
                may store tank details, sensor readings,
                device identifiers, ammonia test-strip
                results, actuator command records, alerts,
                and reports associated with your account
                and tanks.
                {"\n\n"}

                3. Ammonia Images. When smartphone-camera
                ammonia scanning is used, the application
                may process an image captured by the user
                as part of estimating the test-strip
                result. Handling and storage will depend on
                the implemented scanner workflow.
                {"\n\n"}

                4. Marketplace Data. Marketplace
                information and supported communication
                records may be stored so the relevant
                users can access their listing and
                transaction-related information.
                {"\n\n"}

                5. Use of Data. Your information is used
                to provide tank monitoring, alerts,
                reports, device functions, marketplace
                features, ammonia testing, and account
                security.
                {"\n\n"}

                6. Data Sharing. CrayThrive does not sell
                your personal data. Information is used
                for application functionality, system
                testing, and operation of the CrayThrive
                project.
                {"\n\n"}

                7. Security. Your password is handled by
                Supabase Authentication. Keep your login
                credentials private and update your
                password if you suspect unauthorized
                access.
                {"\n\n"}

                8. User Control. You may update supported
                profile information inside the
                application. Other account or data
                management options may depend on currently
                available system features.
              </Text>

              <View style={styles.endBox}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={21}
                  color={colors.success}
                />

                <Text style={styles.endBoxText}>
                  You reached the end. You can now agree
                  and continue.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.modalAgreeButton,
                !hasScrolledTerms &&
                  styles.modalAgreeButtonDisabled,
              ]}
              disabled={!hasScrolledTerms}
              onPress={closeTermsModal}
            >
              <Text
                style={[
                  styles.modalAgreeText,
                  !hasScrolledTerms &&
                    styles.modalAgreeTextDisabled,
                ]}
              >
                {hasScrolledTerms
                  ? "Agree & Continue"
                  : "Scroll to Continue"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

function AuthInput({
  label,
  optional = false,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  editable = true,
  rightIcon,
  onRightPress,
  autoCapitalize = "none",
  autoComplete,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputLabelRow}>
        <Text style={styles.inputLabel}>
          {label}
        </Text>

        {optional ? (
          <Text style={styles.optionalLabel}>
            Optional
          </Text>
        ) : null}
      </View>

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
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={editable}
          autoComplete={autoComplete}
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

function MessageBox({ type, text }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  const success = type === "success";

  return (
    <View
      style={[
        styles.messageBox,
        success && styles.successBox,
      ]}
    >
      <View style={styles.messageIcon}>
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

      <Text
        style={[
          styles.messageText,
          success && styles.successText,
        ]}
      >
        {text}
      </Text>
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
              backgroundColor: strength.color,
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

function PasswordRule({ passed, text }) {
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
          passed ? colors.success : colors.muted2
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

function buildFullName(
  firstName,
  middleName,
  lastName
) {
  return [firstName, middleName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getFriendlyRegisterError(error) {
  const message = String(
    error?.message || ""
  ).toLowerCase();

  if (
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("user already registered")
  ) {
    return "This email is already registered. Please sign in instead.";
  }

  if (message.includes("password")) {
    return error?.message || "Password is not accepted.";
  }

  if (message.includes("network")) {
    return "Network error. Please check your internet connection.";
  }

  return error?.message || "Unable to create your account.";
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
    paddingBottom: 36,
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
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    paddingHorizontal: 23,
    paddingTop: 29,
  },

  intro: {
    marginBottom: 24,
  },

  title: {
    color: colors.textStrong,
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.65,
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

  successBox: {
    backgroundColor: colors.successSoft,
    borderColor: "rgba(74,222,128,0.22)",
  },

  messageIcon: {
    marginTop: 1,
    marginRight: 9,
  },

  messageText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },

  successText: {
    color: colors.success,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    backgroundColor: "rgba(34,211,197,0.09)",
  },

  sectionContent: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "700",
  },

  sectionSubtitle: {
    marginTop: 2,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  sectionDivider: {
    height: 1,
    marginTop: 8,
    marginBottom: 23,
    backgroundColor: colors.surfaceSoft,
  },

  form: {
    width: "100%",
  },

  inputGroup: {
    marginBottom: 17,
  },

  inputLabelRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  inputLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  optionalLabel: {
    color: colors.muted2,
    fontSize: 12,
    fontWeight: "500",
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

  passwordHint: {
    marginTop: -5,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 2,
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
    marginTop: -5,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  strengthHeader: {
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

  strengthTrack: {
    marginTop: 9,
    height: 5,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceSoft,
  },

  strengthFill: {
    height: "100%",
    borderRadius: RADIUS.pill,
  },

  checklistBox: {
    marginBottom: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
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
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 7,
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

  termsCard: {
    minHeight: 76,
    marginTop: 2,
    marginBottom: 24,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  termsCardAgreed: { minHeight: 44,
    backgroundColor: "rgba(74,222,128,0.055)",
    borderColor: "rgba(74,222,128,0.18)",
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    borderWidth: 1.5,
    borderColor: colors.muted2,
  },

  checkboxChecked: {
    borderColor: colors.accent2,
    backgroundColor: colors.accent2,
  },

  termsContent: {
    flex: 1,
    paddingRight: 8,
  },

  termsText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
  },

  termsLink: {
    color: colors.accent2,
    fontWeight: "600",
  },

  termsHint: {
    marginTop: 3,
    color: colors.muted2,
    fontSize: 12,
    fontWeight: "400",
  },

  registerButton: {
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

  registerButtonDisabled: { minHeight: 44,
    opacity: 0.4,
  },

  registerButtonText: {
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

  modalOverlay: {
    flex: 1,
    paddingHorizontal: 15,
    paddingTop: 56,
    paddingBottom: 18,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },

  modalContent: {
    width: "100%",
    maxHeight: "91%",
    paddingHorizontal: 17,
    paddingTop: 10,
    paddingBottom: 17,
    borderRadius: 26,
    backgroundColor: colors.background2,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 15,
    backgroundColor: colors.surfaceSoft,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },

  modalHeaderText: {
    flex: 1,
    paddingRight: 12,
  },

  modalTitle: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.25,
  },

  modalInstruction: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  modalCloseIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalScroll: {
    marginBottom: 15,
    borderRadius: 17,
    backgroundColor: colors.surfaceSoft,
  },

  modalScrollContent: {
    padding: 15,
  },

  modalSectionTitle: {
    marginBottom: 9,
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },

  modalBodyText: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 20,
    fontWeight: "400",
  },

  modalDivider: {
    height: 1,
    marginVertical: 20,
    backgroundColor: colors.surfaceSoft,
  },

  endBox: {
    marginTop: 20,
    padding: 13,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.20)",
  },

  endBoxText: {
    flex: 1,
    color: colors.success,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },

  modalAgreeButton: {
    minHeight: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent2,
  },

  modalAgreeButtonDisabled: { minHeight: 44,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalAgreeText: {
    color: colors.deep,
    fontSize: 14,
    fontWeight: "700",
  },

  modalAgreeTextDisabled: {
    color: colors.muted2,
  },
});
}
