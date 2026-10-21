// src/utils/ammoniaScanner.js

import { decode as base64Decode } from "base-64";
import * as FileSystem from "expo-file-system/legacy";
import jpeg from "jpeg-js";

/*
  IMPORTANT:
  These RGB values preserve the current CrayThrive scanner reference approach.

  Before final thesis deployment, calibrate these RGB values using the actual
  LIANKAI strip/chart under controlled lighting.

  We are NOT changing the ammonia classification scale in this camera update.
*/

export const AMMONIA_REFERENCES = [
  {
    label: "0 ppm",
    value: 0,
    rgb: [242, 244, 226],
    status: "SAFE",
    message: "No visible ammonia color detected.",
  },
  {
    label: "0.5 ppm",
    value: 0.5,
    rgb: [221, 235, 199],
    status: "SAFE",
    message: "Very low ammonia detected. Continue monitoring the tank.",
  },
  {
    label: "1 ppm",
    value: 1,
    rgb: [199, 224, 178],
    status: "WARNING",
    message:
      "Ammonia is starting to rise. Avoid overfeeding and monitor closely.",
  },
  {
    label: "3 ppm",
    value: 3,
    rgb: [169, 207, 166],
    status: "WARNING",
    message: "Elevated ammonia detected. Review water condition and feeding.",
  },
  {
    label: "5 ppm",
    value: 5,
    rgb: [134, 190, 168],
    status: "CRITICAL",
    message: "Critical ammonia level detected.",
  },
  {
    label: "10 ppm",
    value: 10,
    rgb: [92, 164, 170],
    status: "CRITICAL",
    message: "Very critical ammonia level detected.",
  },
];

export async function analyzeAmmoniaImage(localUri) {
  if (!localUri) {
    return invalidResult("No image was provided.");
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const bytes = base64ToUint8Array(base64);

    let decoded;

    try {
      decoded = jpeg.decode(bytes, {
        useTArray: true,
      });
    } catch (_decodeError) {
      console.log("AMMONIA IMAGE DECODE ERROR:");

      return invalidResult(
        "This image format could not be analyzed. Try taking a new photo with the camera or select a JPG/JPEG photo."
      );
    }

    const { width, height, data } = decoded || {};

    if (!width || !height || !data) {
      return invalidResult(
        "The selected image could not be decoded. Please capture another photo."
      );
    }

    const quality = getImageQuality({
      width,
      height,
      data,
    });

    if (quality.avgLum < 30 || quality.darkRatio > 0.68) {
      return invalidResult(
        "The image is too dark. Use better lighting or turn on the scanner light."
      );
    }

    if (quality.avgLum > 248 && quality.brightRatio > 0.92) {
      return invalidResult(
        "The image is too bright. Avoid direct glare and capture again."
      );
    }

    const sample = sampleCenterReactionPad({
      width,
      height,
      data,
    });

    if (!sample || sample.count < 80) {
      return invalidResult(
        "The reaction pad could not be read clearly. Center the colored test pad inside the guide and capture again."
      );
    }

    const avgR = Math.round(sample.r);
    const avgG = Math.round(sample.g);
    const avgB = Math.round(sample.b);

    const qualityWarnings = [];

    if (quality.avgLum < 65) {
      qualityWarnings.push(
        "Lighting is slightly dim. A brighter, even light may improve accuracy."
      );
    }

    if (quality.avgLum > 225) {
      qualityWarnings.push(
        "Lighting is bright. Make sure there is no glare on the strip."
      );
    }

    if (quality.contrast < 7) {
      qualityWarnings.push(
        "The image may be slightly blurry or low contrast."
      );
    }

    const colorInfo = getColorInfo(avgR, avgG, avgB);

    if (isNearWhitePad(colorInfo)) {
      const reference =
        AMMONIA_REFERENCES.find((item) => item.value === 0) ||
        AMMONIA_REFERENCES[0];

      return buildResult({
        reference,
        avgR,
        avgG,
        avgB,
        distance: 0,
        qualityWarnings,
        method: "camera",
      });
    }

    let nearestReference = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const reference of AMMONIA_REFERENCES) {
      const distance = normalizedColorDistance(
        [avgR, avgG, avgB],
        reference.rgb
      );

      if (distance < nearestDistance) {
        nearestReference = reference;
        nearestDistance = distance;
      }
    }

    if (!nearestReference) {
      return invalidResult(
        "No ammonia reference could be matched. Capture the strip again."
      );
    }

    if (nearestDistance > 135) {
      return invalidResult(
        "The detected color is too different from the supported ammonia references. Check the strip position and lighting."
      );
    }

    if (nearestDistance > 85) {
      qualityWarnings.push(
        "The color match is not very close, so this result should be treated as an estimate."
      );
    }

    return buildResult({
      reference: nearestReference,
      avgR,
      avgG,
      avgB,
      distance: nearestDistance,
      qualityWarnings,
      method: "camera",
    });
  } catch (error) {
    console.log("ANALYZE AMMONIA IMAGE ERROR:");

    return invalidResult(
      error?.message ||
        "The image could not be analyzed. Please capture another photo."
    );
  }
}

export function classifyManualAmmonia(rawValue) {
  if ((typeof rawValue !== 'number' && typeof rawValue !== 'string') ||
      (typeof rawValue === 'string' && !rawValue.trim())) {
    return invalidResult("Enter a valid ammonia value.");
  }
  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    return invalidResult("Enter a valid ammonia value.");
  }

  let status = "SAFE";
  let message =
    "Ammonia is within the current scanner's low reference range.";

  if (value >= 5) {
    status = "CRITICAL";
    message =
      "Critical ammonia level entered. Check the tank and water condition immediately.";
  } else if (value >= 1) {
    status = "WARNING";
    message =
      "Elevated ammonia entered. Review feeding and water condition and continue monitoring.";
  }

  let nearest = AMMONIA_REFERENCES[0];
  let smallestDifference = Math.abs(value - nearest.value);

  for (const reference of AMMONIA_REFERENCES) {
    const difference = Math.abs(value - reference.value);

    if (difference < smallestDifference) {
      nearest = reference;
      smallestDifference = difference;
    }
  }

  return {
    status,
    ammoniaLevel: value,
    chartLabel:
      smallestDifference < 0.001
        ? nearest.label
        : `${formatNumber(value)} ppm`,
    message,
    avgR: null,
    avgG: null,
    avgB: null,
    distance: null,
    qualityWarnings: [],
    recommendations: getRecommendations(status),
    shouldSave: true,
    method: "manual",
    measuredAt: new Date().toISOString(),
  };
}

function buildResult({
  reference,
  avgR,
  avgG,
  avgB,
  distance,
  qualityWarnings,
  method,
}) {
  return {
    status: reference.status,
    ammoniaLevel: reference.value,
    chartLabel: reference.label,
    message: reference.message,
    avgR,
    avgG,
    avgB,
    distance,
    qualityWarnings: qualityWarnings || [],
    recommendations: getRecommendations(reference.status),
    shouldSave: true,
    method: method || "camera",
    measuredAt: new Date().toISOString(),
  };
}

function sampleCenterReactionPad({ width, height, data }) {
  /*
    The UI asks the user to place the reaction pad in the middle guide.

    This samples a centered square rather than the whole strip/background.
  */

  const size = Math.max(
    24,
    Math.floor(Math.min(width, height) * 0.18)
  );

  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  const x1 = Math.max(0, centerX - Math.floor(size / 2));
  const x2 = Math.min(width - 1, centerX + Math.floor(size / 2));

  const y1 = Math.max(0, centerY - Math.floor(size / 2));
  const y2 = Math.min(height - 1, centerY + Math.floor(size / 2));

  const samples = [];

  const step = Math.max(
    1,
    Math.floor(Math.min(width, height) / 500)
  );

  for (let y = y1; y <= y2; y += step) {
    for (let x = x1; x <= x2; x += step) {
      const index = (y * width + x) * 4;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      if (
        r === undefined ||
        g === undefined ||
        b === undefined
      ) {
        continue;
      }

      const info = getColorInfo(r, g, b);

      // Avoid almost-black shadows and clipped white highlights.
      if (info.lum < 30 || info.lum > 252) {
        continue;
      }

      samples.push({
        r,
        g,
        b,
        lum: info.lum,
      });
    }
  }

  if (samples.length < 80) {
    return null;
  }

  samples.sort((a, b) => a.lum - b.lum);

  const trimStart = Math.floor(samples.length * 0.1);
  const trimEnd = Math.ceil(samples.length * 0.9);

  const trimmed = samples.slice(trimStart, trimEnd);

  if (!trimmed.length) {
    return null;
  }

  const totals = trimmed.reduce(
    (accumulator, pixel) => {
      accumulator.r += pixel.r;
      accumulator.g += pixel.g;
      accumulator.b += pixel.b;

      return accumulator;
    },
    {
      r: 0,
      g: 0,
      b: 0,
    }
  );

  return {
    r: totals.r / trimmed.length,
    g: totals.g / trimmed.length,
    b: totals.b / trimmed.length,
    count: trimmed.length,
  };
}

function getImageQuality({ width, height, data }) {
  const stride = Math.max(
    4,
    Math.floor(Math.min(width, height) / 180)
  );

  let total = 0;
  let lumSum = 0;
  let lumSquareSum = 0;
  let darkCount = 0;
  let brightCount = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      if (
        r === undefined ||
        g === undefined ||
        b === undefined
      ) {
        continue;
      }

      const lum = getColorInfo(r, g, b).lum;

      lumSum += lum;
      lumSquareSum += lum * lum;

      if (lum < 35) {
        darkCount += 1;
      }

      if (lum > 245) {
        brightCount += 1;
      }

      total += 1;
    }
  }

  if (!total) {
    return {
      avgLum: 0,
      contrast: 0,
      darkRatio: 1,
      brightRatio: 0,
    };
  }

  const avgLum = lumSum / total;

  const variance = Math.max(
    lumSquareSum / total - avgLum * avgLum,
    0
  );

  return {
    avgLum,
    contrast: Math.sqrt(variance),
    darkRatio: darkCount / total,
    brightRatio: brightCount / total,
  };
}

function getRecommendations(status) {
  if (status === "CRITICAL") {
    return [
      "Pause feeding while the ammonia condition is being checked.",
      "Inspect water quality and confirm the result with another strip if needed.",
      "Review the latest pH, turbidity, temperature, and water-level readings.",
      "Continue monitoring after corrective action.",
    ];
  }

  if (status === "WARNING") {
    return [
      "Monitor the tank closely.",
      "Avoid overfeeding.",
      "Check for leftover feed or deteriorating water quality.",
      "Repeat the strip test if the color or lighting was uncertain.",
    ];
  }

  return [
    "Continue normal tank monitoring.",
    "Keep regular feeding and water-quality checks.",
    "Repeat ammonia testing as part of the normal monitoring routine.",
  ];
}

function getColorInfo(r, g, b) {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);

  const lum =
    0.299 * r +
    0.587 * g +
    0.114 * b;

  const saturation =
    maximum === 0
      ? 0
      : (maximum - minimum) / maximum;

  const greenStrength =
    g - (r + b) / 2;

  return {
    lum,
    saturation,
    greenStrength,
  };
}

function isNearWhitePad(info) {
  return (
    info.lum >= 145 &&
    info.saturation <= 0.18 &&
    info.greenStrength <= 16
  );
}

function normalizeBrightness(rgb, targetLum = 205) {
  const [r, g, b] = rgb;

  const lum = Math.max(
    1,
    0.299 * r +
      0.587 * g +
      0.114 * b
  );

  const scale = targetLum / lum;

  return [
    clampColor(r * scale),
    clampColor(g * scale),
    clampColor(b * scale),
  ];
}

function normalizedColorDistance(rgb, referenceRgb) {
  const normalizedRgb = normalizeBrightness(rgb);
  const normalizedReference =
    normalizeBrightness(referenceRgb);

  const chromaDistance = rgbDistance(
    normalizedRgb,
    normalizedReference
  );

  const rawDistance = rgbDistance(
    rgb,
    referenceRgb
  );

  return (
    chromaDistance * 0.72 +
    rawDistance * 0.28
  );
}

function rgbDistance(first, second) {
  return Math.sqrt(
    Math.pow(first[0] - second[0], 2) +
      Math.pow(first[1] - second[1], 2) +
      Math.pow(first[2] - second[2], 2)
  );
}

function clampColor(value) {
  return Math.max(
    0,
    Math.min(255, value)
  );
}

function invalidResult(message) {
  return {
    status: "INVALID",
    ammoniaLevel: null,
    chartLabel: "Unable to determine",
    message,
    avgR: null,
    avgG: null,
    avgB: null,
    distance: null,
    qualityWarnings: [],
    recommendations: [
      "Check the lighting.",
      "Keep the strip flat and centered.",
      "Avoid glare and shadows.",
      "Capture another photo when the reaction pad is clear.",
    ],
    shouldSave: false,
    method: "camera",
    measuredAt: new Date().toISOString(),
  };
}

function base64ToUint8Array(base64) {
  const binaryString = base64Decode(base64);

  const bytes =
    new Uint8Array(binaryString.length);

  for (
    let index = 0;
    index < binaryString.length;
    index += 1
  ) {
    bytes[index] =
      binaryString.charCodeAt(index);
  }

  return bytes;
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) {
    return "--";
  }

  return Number(value)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}
