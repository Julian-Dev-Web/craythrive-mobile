// src/constants/theme.js

export const DARK_COLORS = {
  mode: "dark",

  deep: "#061826",
  deep2: "#081F30",
  mid: "#0B2538",
  mid2: "#10354F",

  background: "#061826",
  background2: "#081F30",

  surface: "rgba(255,255,255,0.075)",
  surfaceStrong: "rgba(255,255,255,0.105)",
  surfaceSoft: "rgba(255,255,255,0.055)",

  card: "rgba(255,255,255,0.075)",
  cardStrong: "rgba(255,255,255,0.105)",
  input: "rgba(255,255,255,0.065)",

  accent: "#22D3C5",
  accent2: "#35E6C8",
  accentSoft: "rgba(34,211,197,0.14)",
  accentBorder: "rgba(34,211,197,0.26)",

  white: "#FFFFFF",
  text: "#FFFFFF",
  textStrong: "#FFFFFF",
  muted: "rgba(255,255,255,0.66)",
  muted2: "rgba(255,255,255,0.48)",
  border: "rgba(255,255,255,0.105)",

  danger: "#F87171",
  warning: "#FBBF24",
  success: "#4ADE80",

  dangerSoft: "rgba(248,113,113,0.14)",
  warningSoft: "rgba(251,191,36,0.14)",
  successSoft: "rgba(74,222,128,0.14)",

  tabBar: "rgba(6,24,38,0.92)",
  tabActive: "rgba(34,211,197,0.18)",
  tabInactive: "rgba(255,255,255,0.06)",

  authWave: "#0D3A50",
  authWave2: "#0A2A3D",
  authPanel: "#F8FFFD",
  authPanelText: "#102330",
};

export const LIGHT_COLORS = {
  mode: "light",

  deep: "#EAFBF8",
  deep2: "#DFF7F4",
  mid: "#CFF1ED",
  mid2: "#B8E8E3",

  background: "#F3FFFC",
  background2: "#E9FAF7",

  surface: "rgba(8,31,48,0.065)",
  surfaceStrong: "rgba(8,31,48,0.105)",
  surfaceSoft: "rgba(8,31,48,0.045)",

  card: "#FFFFFF",
  cardStrong: "#F7FFFD",
  input: "rgba(8,31,48,0.055)",

  accent: "#11B7A8",
  accent2: "#087F75",
  accentSoft: "rgba(17,183,168,0.13)",
  accentBorder: "rgba(17,183,168,0.26)",

  white: "#FFFFFF",
  text: "#102330",
  textStrong: "#061826",
  muted: "rgba(16,35,48,0.66)",
  muted2: "rgba(16,35,48,0.66)",
  border: "rgba(8,31,48,0.12)",

  danger: "#DC2626",
  warning: "#9A5700",
  success: "#157A3B",

  dangerSoft: "rgba(220,38,38,0.10)",
  warningSoft: "rgba(217,119,6,0.12)",
  successSoft: "rgba(22,163,74,0.12)",

  tabBar: "rgba(255,255,255,0.92)",
  tabActive: "rgba(17,183,168,0.16)",
  tabInactive: "rgba(8,31,48,0.055)",

  authWave: "#33D7CA",
  authWave2: "#9AF4E9",
  authPanel: "#FFFFFF",
  authPanelText: "#102330",
};

// IMPORTANT:
// Keep COLORS as dark default para hindi masira existing screens na naka-import pa rin sa COLORS.
export const COLORS = DARK_COLORS;

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 32,
  pill: 999,
};

export const SPACING = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
};

export const TYPO = {
  title: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  section: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },

  small: {
    fontSize: 12,
    fontWeight: "800",
  },
};

export const SHADOW = {
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },

  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },

  lightSoft: {
    shadowColor: "#0A2A3D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
};

export function getThemeColors(mode) {
  return mode === "light" ? LIGHT_COLORS : DARK_COLORS;
}
