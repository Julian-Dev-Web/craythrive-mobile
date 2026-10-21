// src/screens/SplashScreen.js

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppScreen from "../components/ui/AppScreen";
import BrandLogo from "../components/ui/BrandLogo";

import useThemedStyles from '../hooks/useThemedStyles';

export default function SplashScreen({ onFinish }) {
  const { styles } = useThemedStyles(makeStyles);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.86)).current;

  const brandOpacity = useRef(new Animated.Value(0)).current;
  const brandY = useRef(new Animated.Value(14)).current;

  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  const ringScale = useRef(new Animated.Value(0.9)).current;
  const ringOpacity = useRef(new Animated.Value(0.28)).current;

  const progress = useRef(new Animated.Value(0)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  useEffect(() => {
    const introAnimation = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 55,
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),

        Animated.timing(brandY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),

      Animated.timing(loaderOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    const ringPulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.08,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),

          Animated.timing(ringOpacity, {
            toValue: 0.1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),

        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 0.9,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),

          Animated.timing(ringOpacity, {
            toValue: 0.28,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    const progressAnimation = Animated.timing(progress, {
      toValue: 1,
      duration: 2050,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    introAnimation.start();
    ringPulse.start();
    progressAnimation.start();

    const timer = setTimeout(() => {
      onFinishRef.current?.();
    }, 2400);

    return () => {
      clearTimeout(timer);
      introAnimation.stop();
      ringPulse.stop();
      progressAnimation.stop();
    };
  }, [brandOpacity, brandY, loaderOpacity, logoOpacity, logoScale, progress, ringOpacity, ringScale, subtitleOpacity]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <AppScreen>
      <View style={styles.container}>
        <BackgroundDecoration />

        <View style={styles.content}>
          <View style={styles.logoArea}>
            <Animated.View
              style={[
                styles.outerRing,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />

            <View style={styles.logoGlow} />

            <Animated.View
              style={[
                styles.logoContainer,
                {
                  opacity: logoOpacity,
                  transform: [{ scale: logoScale }],
                },
              ]}
            >
              <BrandLogo size={124} />
            </Animated.View>
          </View>

          <Animated.View
            style={[
              styles.brandBlock,
              {
                opacity: brandOpacity,
                transform: [{ translateY: brandY }],
              },
            ]}
          >
            <Text style={styles.brandName}>CrayThrive</Text>

            <Animated.Text
              style={[
                styles.tagline,
                {
                  opacity: subtitleOpacity,
                },
              ]}
            >
              Smarter monitoring. Simpler tank care.
            </Animated.Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.loaderContainer,
              {
                opacity: loaderOpacity,
              },
            ]}
          >
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressWidth,
                  },
                ]}
              />
            </View>

            <Text style={styles.loadingText}>
              Preparing your tanks
            </Text>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerDot} />

          <Text style={styles.footerText}>
            Smart crayfish monitoring
          </Text>
        </View>
      </View>
    </AppScreen>
  );
}

function BackgroundDecoration() {
  const { styles } = useThemedStyles(makeStyles);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.lineOne} />
      <View style={styles.lineTwo} />
      <View style={styles.lineThree} />
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 28,
  },

  logoArea: {
    width: 190,
    height: 190,
    alignItems: "center",
    justifyContent: "center",
  },

  outerRing: {
    position: "absolute",
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: "rgba(34,211,197,0.035)",
  },

  logoGlow: {
    position: "absolute",
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: "rgba(34,211,197,0.07)",
  },

  logoContainer: {
    width: 144,
    height: 144,
    borderRadius: 72,
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: colors.surfaceSoft,

    borderWidth: 1,
    borderColor: colors.border,
  },

  brandBlock: {
    marginTop: 12,
    alignItems: "center",
  },

  brandName: {
    color: colors.textStrong,
    fontSize: 36,
    lineHeight: 47,

    fontWeight: "800",

    letterSpacing: -1,
    textAlign: "center",
  },

  tagline: {
    marginTop: 9,

    maxWidth: 290,

    color: colors.muted,

    fontSize: 14,
    lineHeight: 21,

    fontWeight: "500",

    textAlign: "center",
  },

  loaderContainer: {
    width: 190,

    marginTop: 44,

    alignItems: "center",
  },

  progressTrack: {
    width: "100%",
    height: 4,

    borderRadius: 999,

    backgroundColor: colors.surfaceSoft,

    overflow: "hidden",
  },

  progressFill: {
    height: "100%",

    borderRadius: 999,

    backgroundColor: colors.accent2,
  },

  loadingText: {
    marginTop: 12,

    color: colors.muted2,

    fontSize: 12,

    fontWeight: "600",

    letterSpacing: 0.15,
  },

  footer: {
    position: "absolute",

    bottom: 30,
    left: 0,
    right: 0,

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",
  },

  footerDot: {
    width: 5,
    height: 5,

    marginRight: 7,

    borderRadius: 3,

    backgroundColor: colors.accent2,

    opacity: 0.75,
  },

  footerText: {
    color: colors.muted,

    fontSize: 12,

    fontWeight: "600",

    letterSpacing: 0.25,
  },

  glowTop: {
    position: "absolute",

    top: -140,
    right: -110,

    width: 320,
    height: 320,

    borderRadius: 160,

    backgroundColor: "rgba(34,211,197,0.065)",
  },

  glowBottom: {
    position: "absolute",

    bottom: -180,
    left: -130,

    width: 340,
    height: 340,

    borderRadius: 170,

    backgroundColor: "rgba(34,211,197,0.035)",
  },

  lineOne: {
    position: "absolute",

    top: 185,
    right: -45,

    width: 150,
    height: 1,

    backgroundColor: colors.surfaceSoft,

    transform: [{ rotate: "-32deg" }],
  },

  lineTwo: {
    position: "absolute",

    bottom: 185,
    left: -50,

    width: 170,
    height: 1,

    backgroundColor: colors.surfaceSoft,

    transform: [{ rotate: "27deg" }],
  },

  lineThree: {
    position: "absolute",

    top: "52%",
    left: -75,

    width: 120,
    height: 1,

    backgroundColor: "rgba(34,211,197,0.045)",

    transform: [{ rotate: "-18deg" }],
  },
});
}
