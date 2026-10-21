// src/components/ui/BottomNav.js

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, SHADOW } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import useKeyboardVisible from "../../hooks/useKeyboardVisible";

const tabs = [
  {
    key: "home",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    key: "market",
    label: "Market",
    icon: "storefront-outline",
    activeIcon: "storefront",
  },
  {
    key: "aiGuide",
    label: "Guide",
    icon: "sparkles-outline",
    activeIcon: "sparkles",
  },
  {
    key: "reports",
    label: "Reports",
    icon: "bar-chart-outline",
    activeIcon: "bar-chart",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    activeIcon: "settings",
  },
];

export default function BottomNav({ activeTab, onChangeTab }) {
  const keyboardVisible = useKeyboardVisible();
  const theme = useSafeTheme();
  const colors = theme.colors;
  const isDark = theme.isDark;
  const styles = makeStyles(colors, isDark);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Reserve four 44 dp targets and all container padding on narrow phones.
  const activeWidth = Math.min(112, Math.max(44, width - 28 - 22.6 - 4 * 44));
  if (keyboardVisible) return null;

  return (
    <View style={[styles.wrap, { bottom: Math.max(12, insets.bottom + 8) }]} pointerEvents="box-none">
      <View style={styles.nav}>
        {tabs.map((tab) => (
          <BottomNavItem
            key={tab.key}
            tab={tab}
            active={activeTab === tab.key}
            onPress={() => onChangeTab?.(tab.key)}
            colors={colors}
            styles={styles}
            activeWidth={activeWidth}
          />
        ))}
      </View>
    </View>
  );
}

function BottomNavItem({ tab, active, onPress, colors, styles, activeWidth }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: active ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 90,
    }).start();
  }, [active, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [44, activeWidth],
  });

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1],
  });

  const labelOpacity = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0, 1],
  });

  const labelWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, activeWidth - 48)],
  });

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress}
      accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }}>
      <Animated.View
        style={[
          styles.item,
          {
            width,
            transform: [{ scale }],
            backgroundColor: active ? colors.accentSoft : "transparent",
            borderColor: active ? colors.accentBorder : "transparent",
          },
        ]}
      >
        <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
          <Ionicons
            name={active ? tab.activeIcon : tab.icon}
            size={20}
            color={active ? "#061826" : colors.muted}
          />
        </View>

        <Animated.View
          style={[
            styles.labelWrap,
            {
              opacity: labelOpacity,
              width: labelWidth,
            },
          ]}
        >
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {tab.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function useSafeTheme() {
  try {
    return useAppTheme();
  } catch {
    return {
      colors: COLORS,
      isDark: true,
    };
  }
}

function makeStyles(colors, isDark) {
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 12,
      alignItems: "center",
    },

    nav: {
      width: "100%",
      minHeight: 76,
      borderRadius: 30,
      backgroundColor: isDark
        ? "rgba(6,24,38,0.96)"
        : "rgba(255,255,255,0.96)",
      borderWidth: 1.3,
      borderColor: colors.accentBorder,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingVertical: 10,
      ...SHADOW.soft,
    },

    item: {
      height: 52,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },

    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark
        ? "rgba(255,255,255,0.055)"
        : "rgba(8,31,48,0.055)",
    },

    iconWrapActive: {
      backgroundColor: colors.accent,
    },

    labelWrap: {
      marginLeft: 7,
      overflow: "hidden",
    },

    label: {
      color: colors.textStrong || colors.white,
      fontSize: 12,
      fontWeight: "900",
    },
  });
}
