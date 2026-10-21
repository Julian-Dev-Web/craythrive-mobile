// src/context/ThemeContext.js

import React, { createContext, useContext, useMemo, useState } from "react";
import { getThemeColors } from "../constants/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState("dark");

  function setThemeMode(nextMode) {
    console.log("THEME MODE SET:");

    if (nextMode !== "dark" && nextMode !== "light") return;

    setThemeModeState(nextMode);
  }

  function toggleTheme() {
    setThemeModeState((previous) => {
      const nextMode = previous === "dark" ? "light" : "dark";
      console.log("THEME MODE TOGGLE:");
      return nextMode;
    });
  }

  const value = useMemo(() => {
    const colors = getThemeColors(themeMode);
    const isDark = themeMode === "dark";

    return {
      themeMode,
      colors,
      isDark,
      isLight: !isDark,
      setThemeMode,
      toggleTheme,
    };
  }, [themeMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used inside ThemeProvider.");
  }

  return context;
}