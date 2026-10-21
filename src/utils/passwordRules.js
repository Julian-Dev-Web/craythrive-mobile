// src/utils/passwordRules.js

import { COLORS } from "../constants/theme";

export function getPasswordChecks(password) {
  return {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

export function getPasswordScore(password) {
  const checks = getPasswordChecks(password);
  return Object.values(checks).filter(Boolean).length;
}

export function isPasswordStrong(password) {
  return getPasswordScore(password) === 4;
}

export function getPasswordStrength(password) {
  const score = getPasswordScore(password);

  if (!password) {
    return {
      score,
      label: "No password",
      color: "rgba(255,255,255,0.35)",
      percent: "0%",
    };
  }

  if (score <= 2) {
    return {
      score,
      label: "Weak",
      color: COLORS.danger,
      percent: `${(score / 4) * 100}%`,
    };
  }

  if (score === 3) {
    return {
      score,
      label: "Medium",
      color: COLORS.warning,
      percent: "75%",
    };
  }

  return {
    score,
    label: "Strong",
    color: COLORS.success,
    percent: "100%",
  };
}
