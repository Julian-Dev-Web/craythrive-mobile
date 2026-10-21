// src/screens/main/AddTankScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppButton from "../../components/ui/AppButton";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";

import {
  buildTankPayload,
  DEFAULT_TANK_REFERENCE,
  getDefaultTankPopulation,
  TANK_TYPES,
  validateTankForm,
} from "../../utils/tankRules";
import useSingleFlight from '../../hooks/useSingleFlight';

export default function AddTankScreen({
  onBack,
  onCreated,
}) {
  const { colors, styles } = useThemePack();

  const [tankName, setTankName] = useState("");
  const [tankType, setTankType] = useState(
    TANK_TYPES.BREEDER
  );
  const [juvenileCount, setJuvenileCount] =
    useState("15");
  const [notes, setNotes] = useState("");

  const [focusedField, setFocusedField] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [messageType, setMessageType] =
    useState("error");

  const population = useMemo(() => {
    if (tankType === TANK_TYPES.BREEDER) {
      return getDefaultTankPopulation(
        TANK_TYPES.BREEDER
      );
    }

    return {
      maleCount: 0,
      femaleCount: 0,
      juvenileCount:
        Number(juvenileCount) || 0,
      display: `${
        juvenileCount || 0
      } juveniles`,
    };
  }, [tankType, juvenileCount]);

  function showMessage(type, text) {
    setMessageType(type);
    setMessage(text);

    if (Platform.OS !== "web") {
      Alert.alert(
        type === "success"
          ? "Tank created"
          : "Check tank details",
        text
      );
    }
  }

  function handleTankTypeChange(type) {
    if (loading) return;

    setTankType(type);

    if (
      type === TANK_TYPES.BREEDER
    ) {
      setJuvenileCount("0");
    } else {
      setJuvenileCount("15");
    }

    setMessage("");
  }

  const handleCreateTank = useSingleFlight(async function handleCreateTank() {
    setMessage("");

    const validation =
      validateTankForm({
        tankName,
        tankType,
        juvenileCount,
      });

    if (!validation.valid) {
      showMessage(
        "error",
        validation.message
      );

      return;
    }

    setLoading(true);

    try {
      const {
        data: userData,
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !userData?.user?.id
      ) {
        showMessage(
          "error",
          "Unable to identify your account. Please sign in again."
        );

        setLoading(false);
        return;
      }

      const userId =
        userData.user.id;

      const tankPayload =
        buildTankPayload({
          userId,
          tankName,
          tankType,
          juvenileCount,
          notes,
        });

      const finalTankPayload = {
        ...tankPayload,
        has_paired_device: false,
      };

      const {
        data: createdTank,
        error: tankError,
      } = await supabase
        .from("tanks")
        .insert(finalTankPayload)
        .select()
        .single();

      if (tankError) {
        console.log("CREATE TANK ERROR:");

        showMessage(
          "error",
          "Unable to create the tank."
        );

        setLoading(false);
        return;
      }

      showMessage(
        "success",
        "Your tank has been created successfully."
      );

      await new Promise(resolve => setTimeout(resolve, 700));
      setLoading(false);
      onCreated?.(createdTank);
    } catch (_error) {
      console.log("CREATE TANK CATCH ERROR:");

      showMessage(
        "error",
        "Something went wrong while creating the tank."
      );

      setLoading(false);
    }
  });

  return (
    <AppScreen keyboard onBack={onBack} backDisabled={loading}>
      <View style={styles.root}>
        <AppHeader
          eyebrow="Tank Setup"
          title="Add Tank"
          subtitle="Create a tank profile before pairing a monitoring device."
          icon="add-circle-outline"
          rightAction="close-outline"
          onRightPress={loading ? undefined : onBack}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.scroll
          }
        >
          {message ? (
            <MessageBox
              type={messageType}
              message={message}
              colors={colors}
              styles={styles}
            />
          ) : null}

          <View
            style={styles.sectionIntro}
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Tank information
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              Give the tank a name and
              choose the type you are
              setting up.
            </Text>
          </View>

          <AppCard
            strong
            style={styles.card}
          >
            <FormInput
              label="Tank name"
              value={tankName}
              onChangeText={(value) => {
                setTankName(value);

                if (message) {
                  setMessage("");
                }
              }}
              placeholder="Example: Breeder Tank 1"
              icon="water-outline"
              focused={
                focusedField ===
                "tankName"
              }
              onFocus={() =>
                setFocusedField(
                  "tankName"
                )
              }
              onBlur={() =>
                setFocusedField("")
              }
              editable={!loading}
              colors={colors}
              styles={styles}
            />

            <View
              style={
                styles.fieldHeader
              }
            >
              <Text
                style={
                  styles.labelOutside
                }
              >
                Tank type
              </Text>

              <Text
                style={
                  styles.fieldHint
                }
              >
                Choose one
              </Text>
            </View>

            <View style={styles.typeRow}>
              <TypeButton
                title="Breeder"
                subtitle="1 male + 2 females"
                active={
                  tankType ===
                  TANK_TYPES.BREEDER
                }
                disabled={loading}
                onPress={() =>
                  handleTankTypeChange(
                    TANK_TYPES.BREEDER
                  )
                }
                colors={colors}
                styles={styles}
                customIcon={
                  <CrayfishIcon
                    size={25}
                    color={
                      tankType ===
                      TANK_TYPES.BREEDER
                        ? "#062C2B"
                        : colors.accent2
                    }
                  />
                }
              />

              <TypeButton
                title="Juvenile"
                subtitle="15 to 20 crayfish"
                icon="layers-outline"
                active={
                  tankType ===
                  TANK_TYPES.JUVENILE
                }
                disabled={loading}
                onPress={() =>
                  handleTankTypeChange(
                    TANK_TYPES.JUVENILE
                  )
                }
                colors={colors}
                styles={styles}
              />
            </View>

            {tankType ===
            TANK_TYPES.JUVENILE ? (
              <FormInput
                label="Juvenile count"
                value={juvenileCount}
                onChangeText={(value) => {
                  setJuvenileCount(
                    value.replace(
                      /[^0-9]/g,
                      ""
                    )
                  );

                  if (message) {
                    setMessage("");
                  }
                }}
                placeholder="15 to 20"
                icon="people-outline"
                keyboardType="numeric"
                focused={
                  focusedField ===
                  "juvenileCount"
                }
                onFocus={() =>
                  setFocusedField(
                    "juvenileCount"
                  )
                }
                onBlur={() =>
                  setFocusedField("")
                }
                editable={!loading}
                colors={colors}
                styles={styles}
              />
            ) : (
              <View
                style={
                  styles.ruleBox
                }
              >
                <View
                  style={
                    styles.ruleIcon
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={
                      colors.accent2
                    }
                  />
                </View>

                <View
                  style={
                    styles.ruleContent
                  }
                >
                  <Text
                    style={
                      styles.ruleTitle
                    }
                  >
                    Breeder population
                  </Text>

                  <Text
                    style={
                      styles.ruleText
                    }
                  >
                    This tank uses the
                    default setup of 1
                    male and 2 females.
                  </Text>
                </View>
              </View>
            )}

            <TankSummary
              tankType={tankType}
              population={population}
              colors={colors}
              styles={styles}
            />

            <View
              style={
                styles.referenceBox
              }
            >
              <View
                style={
                  styles.referenceHeader
                }
              >
                <View
                  style={
                    styles.referenceIcon
                  }
                >
                  <Ionicons
                    name="resize-outline"
                    size={18}
                    color={
                      colors.accent2
                    }
                  />
                </View>

                <View
                  style={
                    styles.referenceContent
                  }
                >
                  <Text
                    style={
                      styles.referenceTitle
                    }
                  >
                    Tank reference
                  </Text>

                  <Text
                    style={
                      styles.referenceSubtitle
                    }
                  >
                    Default setup
                  </Text>
                </View>
              </View>

              <Text
                style={
                  styles.referenceText
                }
              >
                {
                  DEFAULT_TANK_REFERENCE.label
                }
              </Text>
            </View>

            <FormInput
              label="Notes"
              optional
              value={notes}
              onChangeText={(value) => {
                setNotes(value);

                if (message) {
                  setMessage("");
                }
              }}
              placeholder="Example: near window, newly prepared tank..."
              icon="document-text-outline"
              multiline
              focused={
                focusedField ===
                "notes"
              }
              onFocus={() =>
                setFocusedField("notes")
              }
              onBlur={() =>
                setFocusedField("")
              }
              editable={!loading}
              colors={colors}
              styles={styles}
            />
          </AppCard>

          <View
            style={styles.infoNote}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={17}
              color={colors.accent2}
            />

            <Text
              style={
                styles.infoNoteText
              }
            >
              You can pair a monitoring
              device after the tank has
              been created.
            </Text>
          </View>

          <View
            style={styles.buttonRow}
          >
            <AppButton
              title="Create Tank"
              icon="checkmark-circle-outline"
              loading={loading}
              onPress={
                handleCreateTank
              }
            />

            <AppButton
              title="Cancel"
              variant="ghost"
              onPress={onBack}
              disabled={loading}
              style={
                styles.cancelButton
              }
            />
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function FormInput({
  label,
  optional = false,
  value,
  onChangeText,
  placeholder,
  icon,
  keyboardType,
  autoCapitalize = "sentences",
  focused,
  onFocus,
  onBlur,
  multiline = false,
  editable = true,
  colors,
  styles,
}) {
  return (
    <View style={styles.formGroup}>
      <View
        style={styles.fieldHeader}
      >
        <Text
          style={
            styles.labelOutside
          }
        >
          {label}
        </Text>

        {optional ? (
          <Text
            style={
              styles.fieldHint
            }
          >
            Optional
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.inputBox,
          focused &&
            styles.inputBoxFocused,
          !editable &&
            styles.inputBoxDisabled,
        ]}
      >
        <View
          style={styles.inputIcon}
        >
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
          placeholder={placeholder}
          placeholderTextColor={
            colors.inputPlaceholder
          }
          style={[
            styles.input,
            multiline &&
              styles.inputMultiline,
          ]}
          keyboardType={
            keyboardType
          }
          autoCapitalize={
            autoCapitalize
          }
          autoCorrect={false}
          onFocus={onFocus}
          onBlur={onBlur}
          multiline={multiline}
          editable={editable}
        />
      </View>
    </View>
  );
}

function TypeButton({
  title,
  subtitle,
  icon,
  customIcon,
  active,
  disabled,
  onPress,
  colors,
  styles,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      style={[
        styles.typeButton,
        active &&
          styles.typeButtonActive,
        disabled &&
          styles.typeButtonDisabled,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.typeIcon,
          active &&
            styles.typeIconActive,
        ]}
      >
        {customIcon ? (
          customIcon
        ) : (
          <Ionicons
            name={icon}
            size={22}
            color={
              active
                ? "#062C2B"
                : colors.accent2
            }
          />
        )}
      </View>

      <Text
        style={[
          styles.typeTitle,
          active &&
            styles.typeTitleActive,
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          styles.typeSubtitle,
          active &&
            styles.typeSubtitleActive,
        ]}
      >
        {subtitle}
      </Text>

      {active ? (
        <View
          style={styles.selectedPill}
        >
          <Ionicons
            name="checkmark"
            size={12}
            color={colors.accent2}
          />

          <Text
            style={
              styles.selectedText
            }
          >
            Selected
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function TankSummary({
  tankType,
  population,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.summaryBox}
    >
      <View
        style={styles.summaryHeader}
      >
        <View
          style={styles.summaryIcon}
        >
          <Ionicons
            name="people-outline"
            size={20}
            color={colors.accent2}
          />
        </View>

        <View
          style={styles.summaryTextWrap}
        >
          <Text
            style={
              styles.summaryLabel
            }
          >
            Population
          </Text>

          <Text
            style={
              styles.summaryValue
            }
          >
            {population.display}
          </Text>
        </View>

        <View
          style={styles.typePill}
        >
          <Text
            style={
              styles.typePillText
            }
          >
            {formatTypeLabel(
              tankType
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MessageBox({
  type,
  message,
  colors,
  styles,
}) {
  const success =
    type === "success";

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
            ? styles.successMessageIcon
            : styles.errorMessageIcon,
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

      <View
        style={
          styles.messageContent
        }
      >
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
            ? "Tank created"
            : "Check your details"}
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
          {message}
        </Text>
      </View>
    </View>
  );
}

function formatTypeLabel(value) {
  return String(value || "Tank")
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function useThemePack() {
  const theme = useAppTheme();

  const isDark =
    theme?.isDark ?? true;

  const colors = useMemo(() => {
    return normalizeColors(
      theme?.colors || COLORS,
      isDark
    );
  }, [theme?.colors, isDark]);

  const styles = useMemo(() => {
    return makeStyles(colors);
  }, [colors]);

  return {
    colors,
    isDark,
    styles,
  };
}

function normalizeColors(
  sourceColors,
  isDark
) {
  return {
    ...COLORS,
    ...sourceColors,

    background:
      sourceColors.background ||
      (isDark
        ? COLORS.deep
        : "#F3FFFC"),

    background2:
      sourceColors.background2 ||
      (isDark
        ? COLORS.mid
        : "#E9FAF7"),

    surface:
      sourceColors.surface ||
      (isDark
        ? COLORS.surface
        : "rgba(255,255,255,0.88)"),

    surfaceStrong:
      sourceColors.surfaceStrong ||
      (isDark
        ? COLORS.surfaceStrong
        : "rgba(255,255,255,0.97)"),

    surfaceSoft:
      sourceColors.surfaceSoft ||
      (isDark
        ? COLORS.surfaceSoft
        : "rgba(8,31,48,0.045)"),

    textStrong:
      sourceColors.textStrong ||
      (isDark
        ? COLORS.white
        : "#0F172A"),

    muted:
      sourceColors.muted ||
      (isDark
        ? COLORS.muted
        : "rgba(15,23,42,0.68)"),

    muted2:
      sourceColors.muted2 ||
      (isDark
        ? COLORS.muted2
        : "rgba(15,23,42,0.46)"),

    border:
      sourceColors.border ||
      (isDark
        ? COLORS.border
        : "rgba(15,23,42,0.10)"),

    accent:
      sourceColors.accent ||
      COLORS.accent,

    accent2:
      sourceColors.accent2 ||
      COLORS.accent2,

    accentSoft:
      sourceColors.accentSoft ||
      (isDark
        ? COLORS.accentSoft
        : "rgba(34,211,197,0.14)"),

    accentBorder:
      sourceColors.accentBorder ||
      (isDark
        ? COLORS.accentBorder
        : "rgba(15,118,110,0.18)"),

    danger:
      sourceColors.danger ||
      COLORS.danger,

    warning:
      sourceColors.warning ||
      COLORS.warning,

    success:
      sourceColors.success ||
      COLORS.success,

    dangerSoft:
      sourceColors.dangerSoft ||
      (isDark
        ? COLORS.dangerSoft
        : "rgba(248,113,113,0.13)"),

    warningSoft:
      sourceColors.warningSoft ||
      (isDark
        ? COLORS.warningSoft
        : "rgba(251,191,36,0.16)"),

    successSoft:
      sourceColors.successSoft ||
      (isDark
        ? COLORS.successSoft
        : "rgba(74,222,128,0.16)"),

    inputPlaceholder: isDark
      ? "rgba(255,255,255,0.34)"
      : "rgba(15,23,42,0.36)",
  };
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 22,
    },

    scroll: {
      paddingTop: 4,
      paddingBottom: 130,
    },

    sectionIntro: {
      marginTop: 2,
      marginBottom: 15,
    },

    sectionTitle: {
      color: colors.textStrong,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "700",
    },

    sectionSubtitle: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "400",
    },

    card: {
      padding: 16,
      borderRadius: 22,
      backgroundColor:
        colors.surfaceStrong,
      borderColor: colors.border,
    },

    messageBox: {
      marginTop: 4,
      marginBottom: 18,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "flex-start",
      borderWidth: 1,
    },

    messageError: {
      backgroundColor:
        colors.dangerSoft,
      borderColor:
        "rgba(248,113,113,0.25)",
    },

    messageSuccess: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.25)",
    },

    messageIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    successMessageIcon: {
      backgroundColor:
        "rgba(74,222,128,0.10)",
    },

    errorMessageIcon: {
      backgroundColor:
        "rgba(248,113,113,0.10)",
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

    formGroup: {
      marginBottom: 17,
    },

    fieldHeader: {
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    labelOutside: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    fieldHint: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    inputBox: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
    },

    inputBoxFocused: {
      backgroundColor:
        colors.surface,
      borderColor:
        colors.accentBorder,
    },

    inputBoxDisabled: {
      opacity: 0.62,
    },

    inputIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    input: {
      flex: 1,
      minHeight: 54,
      paddingVertical: 0,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "500",
    },

    inputMultiline: {
      minHeight: 82,
      paddingTop: 10,
      paddingBottom: 10,
      textAlignVertical: "top",
    },

    typeRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 17,
    },

    typeButton: {
      flex: 1,
      minHeight: 138,
      padding: 13,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },

    typeButtonActive: { minHeight: 44,
      backgroundColor:
        colors.accentSoft,
      borderColor:
        colors.accentBorder,
      ...SHADOW.card,
    },

    typeButtonDisabled: { minHeight: 44,
      opacity: 0.62,
    },

    typeIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 9,
      backgroundColor:
        colors.accentSoft,
    },

    typeIconActive: {
      backgroundColor:
        colors.accent,
    },

    typeTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700",
    },

    typeTitleActive: {
      color: colors.accent2,
    },

    typeSubtitle: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },

    typeSubtitleActive: {
      color: colors.muted,
    },

    selectedPill: {
      marginTop: 9,
      minHeight: 23,
      paddingHorizontal: 8,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    selectedText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    ruleBox: {
      marginBottom: 17,
      padding: 13,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    ruleIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor:
        colors.surfaceSoft,
    },

    ruleContent: {
      flex: 1,
    },

    ruleTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700",
    },

    ruleText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "400",
    },

    summaryBox: {
      marginBottom: 14,
      padding: 13,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },

    summaryHeader: {
      flexDirection: "row",
      alignItems: "center",
    },

    summaryIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 11,
      backgroundColor:
        colors.accentSoft,
    },

    summaryTextWrap: {
      flex: 1,
      minWidth: 0,
    },

    summaryLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    summaryValue: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 13,
      fontWeight: "700",
    },

    typePill: {
      minHeight: 28,
      paddingHorizontal: 9,
      borderRadius: RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    typePillText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    referenceBox: {
      marginBottom: 17,
      padding: 13,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },

    referenceHeader: {
      flexDirection: "row",
      alignItems: "center",
    },

    referenceIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor:
        colors.accentSoft,
    },

    referenceContent: {
      flex: 1,
    },

    referenceTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    referenceSubtitle: {
      marginTop: 1,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    referenceText: {
      marginTop: 10,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "400",
    },

    infoNote: {
      marginTop: 14,
      paddingHorizontal: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
    },

    infoNoteText: {
      flex: 1,
      maxWidth: 330,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },

    buttonRow: {
      marginTop: 23,
    },

    cancelButton: {
      marginTop: 11,
    },
  });
}
