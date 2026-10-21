// src/utils/ammoniaReadings.js

import { supabase } from "../lib/supabase";

export async function saveAmmoniaReading({
  tankId,
  result,
}) {
  if (!tankId) {
    throw new Error(
      "No selected tank was found."
    );
  }

  if (!result) {
    throw new Error(
      "No ammonia result was provided."
    );
  }

  if (!result.shouldSave) {
    throw new Error(
      "This result cannot be saved because the scan was not valid."
    );
  }

  if (typeof result.ammoniaLevel !== 'number' ||
      !Number.isFinite(result.ammoniaLevel) || result.ammoniaLevel < 0) {
    throw new Error('Enter or scan a valid ammonia measurement before saving.');
  }

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError ||
    !userData?.user?.id
  ) {
    throw new Error(
      "Unable to identify the current user. Please sign in again."
    );
  }

  const payload = {
    user_id: userData.user.id,
    tank_id: tankId,

    // Smartphone/manual ammonia scanning does not use an IoT camera.
    device_id: null,
    camera_device_uid: null,

    ammonia_level:
      result.ammoniaLevel,

    status:
      result.status,

    // No verified ammonia image bucket currently exists.
    image_url: null,

    message:
      result.message || null,

    rgb_r:
      numberOrNull(result.avgR),

    rgb_g:
      numberOrNull(result.avgG),

    rgb_b:
      numberOrNull(result.avgB),

    chart_label:
      result.chartLabel || null,

    distance:
      numberOrNull(result.distance),
  };

  const { data, error } = await supabase
    .from("ammonia_readings")
    .insert(payload)
    .select('id,user_id,tank_id,created_at,ammonia_level,status')
    .single();

  if (error) {
    console.log("SAVE AMMONIA READING ERROR:");

    throw new Error(
      error.message ||
        "Failed to save ammonia result."
    );
  }

  return data;
}

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}
