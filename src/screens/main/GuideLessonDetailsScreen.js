// src/screens/main/GuideLessonDetailsScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";
import { COLORS, SHADOW } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";

export const GUIDE_LESSONS = [
  {
    key: "crayfish_basics",
    title: "Crayfish Farming Basics",
    icon: "crayfish",
    summary:
      "Learn the essentials of tank setup, shelter, stocking, and everyday care.",
    sections: [
      {
        title: "Main Idea",
        body:
          "Crayfish need clean water, enough space, hiding places, and stable tank conditions. Good daily observation is just as important as checking sensor readings.",
      },
      {
        title: "Tank Setup",
        bullets: [
          "Provide enough floor space for the crayfish in the tank.",
          "Add PVC pipes, shelters, stones, or other safe hiding places.",
          "Keep the tank covered because crayfish can climb and escape.",
          "Avoid overcrowding because it may increase stress and fighting.",
        ],
      },
      {
        title: "Daily Care",
        bullets: [
          "Observe the crayfish and check whether they are moving and feeding normally.",
          "Check the water for unusual odor, discoloration, or visible waste.",
          "Remove excess or uneaten feed before it affects water quality.",
          "Review the latest water-level and water-quality readings in CrayThrive.",
        ],
      },
      {
        title: "How CrayThrive Helps",
        body:
          "CrayThrive supports daily tank care by organizing readings, alerts, ammonia checks, records, and recommendations. The app supports the user's decisions but does not replace regular tank observation.",
      },
    ],
  },

  {
    key: "water_quality",
    title: "Water Quality Guide",
    icon: "water-outline",
    summary:
      "Understand temperature, pH, turbidity, ammonia, and water-level conditions.",
    sections: [
      {
        title: "Why Water Quality Matters",
        body:
          "Water conditions can affect feeding, activity, molting, and overall crayfish health. Sudden or prolonged changes should be reviewed together with the condition of the animals.",
      },
      {
        title: "CrayThrive Monitoring Ranges",
        bullets: [
          "pH: the system checks whether the reading is within the configured safe range.",
          "Temperature: the system classifies readings based on the configured threshold settings.",
          "Turbidity: sensor voltage is used to classify the water as clear, dirty, or critically dirty.",
          "Water level: the system checks the level against the safe range configured for the tank.",
          "Ammonia: test-strip results are recorded separately through the ammonia reader.",
        ],
      },
      {
        title: "When a Reading Needs Attention",
        bullets: [
          "Review high ammonia together with feeding, waste buildup, and other water readings.",
          "Dirty water may require checking leftover feed, waste, and filtration.",
          "Low water level may require careful refilling after checking the tank and water source.",
          "Unsafe pH should be corrected gradually rather than through sudden large changes.",
        ],
      },
      {
        title: "How CrayThrive Helps",
        body:
          "The application combines the latest saved tank readings with threshold-based status labels and alerts so the user can identify conditions that may need attention.",
      },
    ],
  },

  {
    key: "feeding_guide",
    title: "Feeding Guide",
    icon: "restaurant-outline",
    summary:
      "Understand feeding schedules, overfeeding, and when feeding should be paused.",
    sections: [
      {
        title: "Main Idea",
        body:
          "Feeding should consider both the feeding schedule and current tank conditions. Excess feed can increase waste and contribute to poor water quality.",
      },
      {
        title: "Good Feeding Practice",
        bullets: [
          "Feed only the appropriate amount for the crayfish population.",
          "Observe whether the crayfish are actually consuming the feed.",
          "Remove excessive leftover feed when necessary.",
          "Avoid feeding when the system identifies unsafe ammonia or poor water conditions.",
        ],
      },
      {
        title: "Possible Signs of Overfeeding",
        bullets: [
          "Visible leftover feed at the bottom of the tank.",
          "Increasing water cloudiness or waste buildup.",
          "Unusual odor from the water.",
          "Reduced feeding response from the crayfish.",
        ],
      },
      {
        title: "How CrayThrive Helps",
        body:
          "Scheduled and manual feeding can use the latest available tank conditions as safety checks. A feed action may be skipped when the system detects conditions that do not meet the feeding rules.",
      },
    ],
  },

  {
    key: "common_problems",
    title: "Common Problems",
    icon: "warning-outline",
    summary:
      "Review common tank issues such as poor water quality, low water level, and reduced appetite.",
    sections: [
      {
        title: "Common Issues",
        bullets: [
          "Cloudy or dirty water may be related to waste, leftover feed, or poor filtration.",
          "Ammonia can increase when waste and organic material accumulate.",
          "Low water level may reduce the usable tank area and indicate evaporation, leaks, or water loss.",
          "Reduced appetite may occur during stress, poor water conditions, or molting.",
        ],
      },
      {
        title: "What to Check",
        bullets: [
          "Observe water clarity, odor, and visible waste.",
          "Check whether feed is being left uneaten.",
          "Observe crayfish behavior, activity, and hiding patterns.",
          "Review the latest CrayThrive readings, alerts, and ammonia records.",
        ],
      },
      {
        title: "Basic Response",
        bullets: [
          "Avoid making several major tank changes at the same time.",
          "Pause or reduce feeding when the water condition is unsafe.",
          "Perform water-management actions based on the actual condition of the tank.",
          "Continue monitoring after an action to see whether conditions improve.",
        ],
      },
      {
        title: "How CrayThrive Helps",
        body:
          "Tank readings and alerts help narrow down which conditions may need attention. The user can then combine those records with direct observation of the tank.",
      },
    ],
  },

  {
    key: "emergency_actions",
    title: "Emergency Actions",
    icon: "medkit-outline",
    summary:
      "Know what to review first when a tank reaches a warning or critical condition.",
    sections: [
      {
        title: "Conditions That Need Attention",
        bullets: [
          "Critical ammonia result.",
          "pH outside the configured safe range.",
          "Critically dirty water.",
          "Critical high or low water level.",
          "Unusual, weak, or distressed crayfish behavior.",
        ],
      },
      {
        title: "Recommended First Checks",
        bullets: [
          "Review all available tank readings instead of relying on one value alone.",
          "Pause feeding when ammonia or water quality is unsafe.",
          "Check the water source before refilling or changing water.",
          "Inspect pumps, filtration, and aeration if available.",
          "Observe the crayfish after any corrective action.",
        ],
      },
      {
        title: "Avoid These Actions",
        bullets: [
          "Avoid sudden full water replacement unless it is truly necessary.",
          "Do not add treatments or chemicals without knowing their proper use and dosage.",
          "Do not continue feeding when the system identifies unsafe feeding conditions.",
          "Do not assume a sensor value alone explains every change in crayfish behavior.",
        ],
      },
      {
        title: "How CrayThrive Helps",
        body:
          "CrayThrive alerts the user when monitored conditions require attention and provides rule-based recommendations that can support the next tank check or action.",
      },
    ],
  },

  {
    key: "ammonia_strip",
    title: "Ammonia Strip Checks",
    icon: "camera-outline",
    summary:
      "Use an ammonia test strip with your phone camera or record the result manually.",
    sections: [
      {
        title: "Main Idea",
        body:
          "CrayThrive uses a manually prepared ammonia test strip. After the strip reacts, the user can scan the reaction pad using the phone camera or select the matching result manually.",
      },
      {
        title: "Before Scanning",
        bullets: [
          "Dip and prepare the LIANKAI ammonia strip according to its product instructions.",
          "Wait for the reaction time indicated by the manufacturer.",
          "Place the strip on a clean surface.",
          "Use neutral and even lighting.",
          "Avoid strong shadows, glare, or colored light.",
        ],
      },
      {
        title: "Phone Camera Scan",
        bullets: [
          "Open the ammonia reader for the correct tank.",
          "Choose Phone Camera.",
          "Place the reacted pad inside the on-screen guide.",
          "Keep the phone steady while capturing the image.",
          "Review the photo before starting the color analysis.",
          "Retake the photo if the pad is blurry, dark, overexposed, or covered by glare.",
        ],
      },
      {
        title: "Manual Input",
        bullets: [
          "Compare the reacted test pad with the LIANKAI reference chart.",
          "Choose the closest supported ammonia value in CrayThrive.",
          "Review the displayed status and recommendation.",
          "Save the result to the currently selected tank.",
        ],
      },
      {
        title: "Current Result Scale",
        bullets: [
          "0 ppm — Safe.",
          "0.5 ppm — Safe, but continue monitoring.",
          "1 ppm — Warning.",
          "3 ppm — Warning and requires attention.",
          "5 ppm — Critical.",
          "10 ppm — Critical and requires urgent review.",
        ],
      },
      {
        title: "Important Reminder",
        body:
          "The phone-camera result is an estimated field reading based on color comparison. If the scanned result looks uncertain, compare the strip directly with the manufacturer's reference chart or repeat the test under better lighting.",
      },
      {
        title: "How CrayThrive Helps",
        body:
          "The mobile app captures the test-strip image, performs the color comparison, shows the estimated ammonia result and recommendation, and saves the result to the selected tank. ",
      },
    ],
  },
];

export default function GuideLessonDetailsScreen({
  lessonKey,
  onBack,
}) {
  const { colors, styles } = useThemePack();

  const lesson =
    GUIDE_LESSONS.find(
      (item) =>
        item.key === lessonKey
    ) || GUIDE_LESSONS[0];

  return (
    <AppScreen onBack={onBack}>
      <View style={styles.root}>
        <AppHeader
          eyebrow="Beginner Guide"
          title={lesson.title}
          subtitle="Simple reference material for everyday crayfish tank care."
          icon="book-outline"
          rightAction="close-outline"
          onRightPress={onBack}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            styles.scroll
          }
        >
          <AppCard
            strong
            style={styles.heroCard}
          >
            <View
              style={styles.heroIcon}
            >
              {lesson.icon ===
              "crayfish" ? (
                <CrayfishIcon
                  size={38}
                  color={
                    colors.accent2
                  }
                />
              ) : (
                <Ionicons
                  name={lesson.icon}
                  size={30}
                  color={
                    colors.accent2
                  }
                />
              )}
            </View>

            <View
              style={styles.heroContent}
            >
              <Text
                style={styles.heroTitle}
              >
                {lesson.title}
              </Text>

              <Text
                style={styles.heroText}
              >
                {lesson.summary}
              </Text>
            </View>
          </AppCard>

          <View
            style={
              styles.lessonInfo
            }
          >
            <View
              style={
                styles.lessonInfoIcon
              }
            >
              <Ionicons
                name="reader-outline"
                size={17}
                color={
                  colors.accent2
                }
              />
            </View>

            <View
              style={
                styles.lessonInfoContent
              }
            >
              <Text
                style={
                  styles.lessonInfoTitle
                }
              >
                {lesson.sections.length} lesson sections
              </Text>

              <Text
                style={
                  styles.lessonInfoText
                }
              >
                Read each section in
                order or review only the
                part you need.
              </Text>
            </View>
          </View>

          <View
            style={styles.sectionHeader}
          >
            <Text
              style={styles.sectionHeaderTitle}
            >
              Lesson Details
            </Text>

            <Text
              style={
                styles.sectionHeaderText
              }
            >
              Beginner-friendly reference
            </Text>
          </View>

          <View
            style={styles.sectionList}
          >
            {lesson.sections.map(
              (section, index) => (
                <LessonSection
                  key={`${lesson.key}-${index}`}
                  index={index + 1}
                  section={section}
                  colors={colors}
                  styles={styles}
                />
              )
            )}
          </View>

          <View
            style={styles.reminderCard}
          >
            <View
              style={
                styles.reminderIcon
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

            <Text
              style={
                styles.reminderText
              }
            >
              Use this guide together
              with the latest tank
              readings, alerts, and your
              own observation of the
              crayfish.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.86}
            style={
              styles.backBottomButton
            }
            onPress={onBack}
          >
            <Ionicons
              name="chevron-back"
              size={17}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.backBottomText
              }
            >
              Back to Guide
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function LessonSection({
  index,
  section,
  colors,
  styles,
}) {
  const isImportant =
    section.title
      .toLowerCase()
      .includes("important") ||
    section.title
      .toLowerCase()
      .includes("emergency") ||
    section.title
      .toLowerCase()
      .includes("avoid");

  const isSystemSection =
    section.title ===
    "How CrayThrive Helps";

  return (
    <AppCard
      strong
      noShadow
      style={[
        styles.lessonSection,

        isImportant &&
          styles.lessonSectionImportant,

        isSystemSection &&
          styles.lessonSectionSystem,
      ]}
    >
      <View
        style={
          styles.sectionTitleRow
        }
      >
        <View
          style={[
            styles.numberBadge,

            isImportant &&
              styles.numberBadgeImportant,

            isSystemSection &&
              styles.numberBadgeSystem,
          ]}
        >
          {isSystemSection ? (
            <Ionicons
              name="hardware-chip-outline"
              size={15}
              color={
                colors.accent2
              }
            />
          ) : isImportant ? (
            <Ionicons
              name="warning-outline"
              size={15}
              color={
                colors.warning
              }
            />
          ) : (
            <Text
              style={
                styles.numberText
              }
            >
              {index}
            </Text>
          )}
        </View>

        <Text
          style={
            styles.lessonSectionTitle
          }
        >
          {section.title}
        </Text>
      </View>

      {section.body ? (
        <Text
          style={styles.sectionBody}
        >
          {section.body}
        </Text>
      ) : null}

      {section.bullets?.length >
      0 ? (
        <View
          style={styles.bulletList}
        >
          {section.bullets.map(
            (
              item,
              bulletIndex
            ) => (
              <View
                key={`${section.title}-${bulletIndex}`}
                style={
                  styles.bulletRow
                }
              >
                <View
                  style={
                    styles.bulletIcon
                  }
                >
                  <Ionicons
                    name="checkmark"
                    size={11}
                    color={
                      colors.accent2
                    }
                  />
                </View>

                <Text
                  style={
                    styles.bulletText
                  }
                >
                  {item}
                </Text>
              </View>
            )
          )}
        </View>
      ) : null}
    </AppCard>
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
  }, [
    theme?.colors,
    isDark,
  ]);

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

    surface:
      sourceColors.surface ||
      (isDark
        ? COLORS.surface
        : "rgba(255,255,255,0.90)"),

    surfaceStrong:
      sourceColors.surfaceStrong ||
      (isDark
        ? COLORS.surfaceStrong
        : "#FFFFFF"),

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

    warning:
      sourceColors.warning ||
      COLORS.warning,

    warningSoft:
      sourceColors.warningSoft ||
      COLORS.warningSoft,
  };
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

    /*
    |--------------------------------------------------------------------------
    | HERO
    |--------------------------------------------------------------------------
    */

    heroCard: {
      padding: 16,
      borderRadius: 21,
      flexDirection: "row",
      alignItems: "center",
      ...SHADOW.soft,
    },

    heroIcon: {
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
      marginRight: 13,
    },

    heroContent: {
      flex: 1,
      minWidth: 0,
    },

    heroTitle: {
      color: colors.textStrong,
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "700",
      letterSpacing: -0.2,
    },

    heroText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | INFO
    |--------------------------------------------------------------------------
    */

    lessonInfo: {
      marginTop: 11,
      padding: 11,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    lessonInfoIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor:
        colors.surfaceSoft,
    },

    lessonInfoContent: {
      flex: 1,
    },

    lessonInfoTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    lessonInfoText: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | SECTION HEADER
    |--------------------------------------------------------------------------
    */

    sectionHeader: {
      marginTop: 24,
      marginBottom: 11,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent:
        "space-between",
      gap: 10,
    },

    sectionHeaderTitle: {
      color: colors.textStrong,
      fontSize: 16,
      fontWeight: "700",
    },

    sectionHeaderText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | LESSON SECTIONS
    |--------------------------------------------------------------------------
    */

    sectionList: {
      gap: 10,
    },

    lessonSection: {
      padding: 14,
      borderRadius: 18,
      backgroundColor:
        colors.surface,
    },

    lessonSectionImportant: {
      borderWidth: 1,
      borderColor:
        "rgba(251,191,36,0.22)",
      backgroundColor:
        colors.warningSoft,
    },

    lessonSectionSystem: {
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      backgroundColor:
        colors.accentSoft,
    },

    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    numberBadge: {
      width: 31,
      height: 31,
      borderRadius: 10,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
    },

    numberBadgeImportant: {
      backgroundColor:
        colors.warningSoft,
      borderColor:
        "rgba(251,191,36,0.22)",
    },

    numberBadgeSystem: {
      backgroundColor:
        colors.surfaceSoft,
    },

    numberText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700",
    },

    lessonSectionTitle: {
      flex: 1,
      color: colors.textStrong,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "700",
    },

    sectionBody: {
      marginTop: 11,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | BULLETS
    |--------------------------------------------------------------------------
    */

    bulletList: {
      marginTop: 11,
      gap: 9,
    },

    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },

    bulletIcon: {
      width: 20,
      height: 20,
      borderRadius: 7,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      marginTop: 1,
    },

    bulletText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | REMINDER
    |--------------------------------------------------------------------------
    */

    reminderCard: {
      marginTop: 17,
      padding: 12,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    reminderIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor:
        colors.accentSoft,
    },

    reminderText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | BACK
    |--------------------------------------------------------------------------
    */

    backBottomButton: {
      marginTop: 18,
      height: 48,
      borderRadius: 15,
      backgroundColor:
        colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },

    backBottomText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
    },
  });
}