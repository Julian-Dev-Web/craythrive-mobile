// src/utils/tankRules.js

import { DEFAULT_THRESHOLDS, evaluateMonitoring } from './thresholdSettings';

// ============================================================================
// TANK CONSTANTS & SETUP RULES
// ============================================================================

export const TANK_TYPES = {
  BREEDER: "Breeder",
  JUVENILE: "Juvenile",
};

export const DEFAULT_TANK_REFERENCE = {
  label: "Standard Tank (75x45x45 cm) / 40 Gallons",
};

export function getDefaultTankPopulation(type) {
  if (type === TANK_TYPES.BREEDER) {
    return {
      maleCount: 1,
      femaleCount: 2,
      juvenileCount: 0,
      display: "1 male + 2 females",
    };
  }

  return {
    maleCount: 0,
    femaleCount: 0,
    juvenileCount: 15,
    display: "15 juveniles",
  };
}

export function validateTankForm({ tankName, tankType, juvenileCount }) {
  if (!tankName || tankName.trim().length === 0) {
    return { valid: false, message: "Please enter a tank name." };
  }

  if (tankType === TANK_TYPES.JUVENILE) {
    const count = Number(juvenileCount);

    if (!juvenileCount || isNaN(count)) {
      return { valid: false, message: "Please enter a valid juvenile count." };
    }

    if (count < 15 || count > 20) {
      return {
        valid: false,
        message: "Juvenile tank must have 15 to 20 crayfish only.",
      };
    }
  }

  return { valid: true, message: "" };
}

export function buildTankPayload({
  userId,
  tankName,
  tankType,
  juvenileCount,
  notes,
}) {
  const isBreeder = tankType === TANK_TYPES.BREEDER;

  return {
    user_id: userId,
    tank_name: tankName.trim(),
    tank_type: tankType,
    male_count: isBreeder ? 1 : 0,
    female_count: isBreeder ? 2 : 0,
    juvenile_count: isBreeder ? 0 : Number(juvenileCount),
    notes: notes ? notes.trim() : null,
  };
}

// ============================================================================
// TANK SENSOR ANALYTICS / RULE-BASED DECISION SUPPORT
// ============================================================================

export function analyzeTankReading(reading, hasData = false, thresholds = DEFAULT_THRESHOLDS, options = {}) {
  const result = evaluateMonitoring(hasData ? reading : null, thresholds, options);
  const actions = {
    temperature: ['MONITOR_TEMPERATURE', null, 'Avoid sudden temperature changes and inspect the tank environment.'],
    ph: ['RETEST_PH', null, 'Retest pH before making gradual water adjustments.'],
    turbidity: ['PARTIAL_WATER_CHANGE', 'DRAIN_REFILL_SUGGESTED', 'Inspect waste, filtration and leftover feed before a partial water change.'],
    water: ['REFILL_WATER', 'REFILL_FOR', 'Inspect the tank and refill carefully if needed.'],
    ammonia: ['REDUCE_FEEDING_RETEST', 'STOP_FEEDING', 'Reduce or pause feeding, remove leftover food and retest ammonia.'],
  };
  const issues = Object.values(result.metrics).filter(metric => metric.severity === 'warning' || metric.severity === 'critical')
    .map(metric => ({ level: metric.severity, title: metric.label + ' ' + metric.title.toLowerCase(),
      message: metric.displayValue + '. ' + metric.reason + (metric.scanTimestampLabel ? ' ' + metric.scanTimestampLabel + '.' : '') + ' ' + actions[metric.key][2], icon: metric.icon,
      actionType: metric.key === 'ammonia' && metric.severity === 'critical' ? 'STOP_FEEDING_AND_CHANGE_WATER'
        : metric.key === 'turbidity' && metric.severity === 'warning' ? 'CLEAN_AND_MONITOR' : actions[metric.key][0],
      commandType: (metric.key === 'ammonia' || metric.key === 'turbidity') && metric.severity !== 'critical'
        ? null : actions[metric.key][1] }));
  return { ...result, title: result.label + ' tank condition', issues,
    values: { temperature: result.metrics.temperature.value, ph: result.metrics.ph.value,
      turbidity: result.metrics.turbidity.value, waterLevel: result.metrics.water.value, ammonia: result.metrics.ammonia.value } };
}

// ============================================================================
// TANK POPULATION FORMATTER
// ============================================================================

export function formatTankPopulation(tank) {
  if (!tank) return "No population data";

  const male = Number(tank.male_count || tank.males || 0);
  const female = Number(tank.female_count || tank.females || 0);
  const juvenile = Number(tank.juvenile_count || tank.juveniles || 0);

  const total = male + female + juvenile;

  if (total > 0) {
    return `${total} crayfish`;
  }

  if (tank.population_label) {
    return tank.population_label;
  }

  if (tank.population) {
    return `${tank.population} crayfish`;
  }

  return "No population data";
}
