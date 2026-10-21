import { fetchMonitoringRows, newestMonitoringRow , normalizeSensorReading, normalizeAmmoniaScan, combineMonitoringReadings, evaluateMonitoring, fetchPairedTankIds, AMMONIA_CONTEXT_INSTRUCTION } from '../utils/sensorMonitoring';
import { analyzeTankReading } from '../utils/tankRules';
import { buildAiRuleFallback } from '../utils/aiFallback';
import { getAiAnswer, parseAiProviderText } from '../utils/aiResponseParsing';
import { fetchServerTime } from '../utils/serverClock';
// src/services/aiGuideService.js

import { supabase } from "../lib/supabase";

import {
  DEFAULT_THRESHOLDS,
  fetchThresholdSettings,
  applyTankThresholdPatch,
  normalizeThresholds,
} from "../utils/thresholdSettings";

const AI_FUNCTION_NAME =
  "craythrive-ai-guide";


const ALLOWED_AI_ACTIONS =
  new Set([
    "recommendation_only",
    "suggest_skip_feed",
    "suggest_fill",
    "suggest_drain",
    "suggest_threshold_change",
    "warning",
  ]);

const ALLOWED_AI_SCOPES =
  new Set([
    "allowed",
    "denied",
  ]);

const ALLOWED_THRESHOLD_PARAMETERS =
  new Set([
    "temperature",
    "ph",
    "turbidity",
    "water_level",
    "ammonia",
  ]);

/*
|--------------------------------------------------------------------------
| ASK CRAYTHRIVE AI
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| ASK CRAYTHRIVE AI
|--------------------------------------------------------------------------
*/

export async function askCrayThriveAi({
  question,
  context,
  history = []
}) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) throw Object.assign(new Error('Please enter a question.'), { code: 'AI_INVALID_REQUEST' });
  if (cleanQuestion.length > 2000) throw Object.assign(new Error('Please keep your question under 2,000 characters.'), { code: 'AI_INVALID_REQUEST' });
  if (!context?.tank?.id) throw Object.assign(new Error('Select a tank before asking the AI.'), { code: 'AI_MISSING_CONTEXT' });
  const sessionResult = await supabase.auth.getSession();
  let session = sessionResult.data?.session;
  if (sessionResult.error || !session?.access_token) throw Object.assign(new Error(getAiFailureMessage({ code: 'AI_AUTH_REQUIRED' })), { code: 'AI_AUTH_REQUIRED' });
  if (session.expires_at && session.expires_at <= Date.now() / 1000 + 30) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data?.session;
    if (refreshed.error || !session?.access_token) throw Object.assign(new Error(getAiFailureMessage({ code: 'AI_AUTH_REQUIRED' })), { code: 'AI_AUTH_REQUIRED' });
  }
  const {
    data: authData,
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw Object.assign(new Error(getAiFailureMessage({ code: 'AI_AUTH_REQUIRED' })), { code: 'AI_AUTH_REQUIRED' });
  if (context.user_id && context.user_id !== authData.user.id) throw Object.assign(new Error(getAiFailureMessage({ code: 'AI_TANK_FORBIDDEN' })), { code: 'AI_TANK_FORBIDDEN' });
  const options = {
    body: {
      question: cleanQuestion,
      context,
      history: sanitizeHistory(history)
    },
    timeout: 60000
  };
  // The Supabase client attaches its current session token; never embed a JWT.
  let result;
  try { result = await supabase.functions.invoke(AI_FUNCTION_NAME, options); }
  catch { result = { error: { name: 'FunctionsFetchError' } }; }
  if (result.error?.context?.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data?.session?.access_token) {
      try { result = await supabase.functions.invoke(AI_FUNCTION_NAME, options); }
      catch { result = { error: { name: 'FunctionsFetchError' } }; }
    }
  }
  if (result.error) {
    const failure = await readableAiError(result.error);
    reportAiFailure(failure);
    const fallback = buildAiRuleFallback(cleanQuestion, context, failure.code, history);
    if (fallback) return { ...fallback, request_id: failure.request_id || null };
    throw failure;
  }
  let data = result.data;
  if (data?.error) {
    const failure = await readableAiError({ context: { status: 503 }, body: data });
    reportAiFailure(failure);
    const fallback = buildAiRuleFallback(cleanQuestion, context, failure.code, history);
    if (fallback) return { ...fallback, request_id: failure.request_id || null };
    throw failure;
  }
  // Compatibility with older deployed functions returning structured model text
  // inside answer/message. Valid answer text survives malformed optional fields.
  const answer = getAiAnswer(data);
  if (typeof data === 'string' || (typeof answer === 'string' && /^\s*(?:\{|\[|```)/.test(answer))) {
    const parsed = parseAiProviderText(typeof data === 'string' ? data : answer);
    if (parsed.answer) data = { ...(typeof data === 'object' ? data : {}), ...parsed.parsed, answer: parsed.answer, message: parsed.answer };
  }
  const normalizedAnswer = getAiAnswer(data);
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof normalizedAnswer !== "string" || !normalizedAnswer.trim() || /^\s*(?:\{|\[|```)/.test(normalizedAnswer)) {
    throw Object.assign(new Error("The AI returned an incomplete answer. Please try your question again."), {
      code: "AI_INVALID_RESPONSE"
    });
  }
  return normalizeAiResponse({ ...data, answer: normalizedAnswer }, context.thresholds || DEFAULT_THRESHOLDS);
}

async function readableAiError(error) {
  const status = error?.context?.status || 0;
  let code = error?.code || (error?.name === 'FunctionsFetchError' ? 'AI_NETWORK_ERROR' : status ? 'AI_HTTP_ERROR' : 'AI_UNAVAILABLE');
  let requestId = null, stage = null;
  try {
    const body = error.body || await error.context.clone().json();
    code = body?.code || code;
    requestId = typeof body?.request_id === 'string' && /^[a-f0-9-]{36}$/i.test(body.request_id) ? body.request_id : null;
    stage = ['auth', 'scope_check', 'provider_request', 'provider_response', 'json_parse', 'response_validation'].includes(body?.stage) ? body.stage : null;
    // Older deployed functions wrap provider errors in HTTP 502 without a code.
    if (!body?.code && /rate.?limit|quota|too many requests/i.test(String(body?.error || ""))) code = "AI_RATE_LIMIT";
    if (!body?.code && /not.*configured/i.test(String(body?.error || ""))) code = "AI_NOT_CONFIGURED";
  } catch {/* Response may be empty or HTML. */}
  if (status === 401) code = 'AI_AUTH_REQUIRED';
  else if (status === 403) code = 'AI_TANK_FORBIDDEN';
  else if (status === 429) code = 'AI_RATE_LIMIT';
  else if (status === 504 || error?.context?.name === 'AbortError' || error?.context?.name === 'TimeoutError') code = 'AI_TIMEOUT';
  else if (status === 400 && code === 'AI_HTTP_ERROR') code = 'AI_INVALID_REQUEST';
  else if (status === 502 && code === 'AI_HTTP_ERROR') code = 'AI_PROVIDER_UNAVAILABLE';
  return Object.assign(new Error(getAiFailureMessage({ code })), {
    code, status, request_id: requestId, stage,
  });
}

export function getAiFailureMessage(error) {
  const messages = {
    AI_AUTH_REQUIRED: 'Your AI session could not be verified. Please sign in again.',
    AI_TANK_FORBIDDEN: 'This tank is unavailable to your account. Select your own tank and try again.',
    AI_MISSING_CONTEXT: 'Select a tank before asking the AI.',
    AI_INVALID_REQUEST: 'The AI could not read this question or tank context. Select your tank and try a shorter question.',
    AI_CONTEXT_TOO_LARGE: 'The AI provider rejected this request because its context is too large. Start a new conversation or try a shorter question.',
    AI_RATE_LIMIT: 'The AI is busy or its request limit has been reached. Please wait a minute before trying again.',
    AI_TIMEOUT: 'The AI took too long to answer. Please check your connection and try again.',
    AI_NETWORK_ERROR: 'Could not connect to the AI. Check your internet connection and try again.',
    AI_INVALID_RESPONSE: 'The AI returned an incomplete answer. Please try your question again.',
    AI_NOT_CONFIGURED: 'The AI service needs to be configured by the app administrator. Tank Check and Beginner Guide are still available.',
  };
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : 'CrayThrive AI is temporarily unavailable. Please try again shortly. Tank Check and Beginner Guide are still available.';
}

function reportAiFailure(error) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  // Fixed classifications only: no raw exceptions, responses or credentials.
  switch (error.code) {
    case 'AI_AUTH_REQUIRED': case 'AI_TANK_FORBIDDEN': console.info('CrayThrive AI diagnostic: authentication/access failure.'); break;
    case 'AI_MISSING_CONTEXT': case 'AI_INVALID_REQUEST': console.info('CrayThrive AI diagnostic: missing/invalid context.'); break;
    case 'AI_RATE_LIMIT': console.info('CrayThrive AI diagnostic: rate limit.'); break;
    case 'AI_TIMEOUT': console.info('CrayThrive AI diagnostic: timeout.'); break;
    case 'AI_NETWORK_ERROR': console.info('CrayThrive AI diagnostic: network failure.'); break;
    case 'AI_INVALID_RESPONSE': console.info('CrayThrive AI diagnostic: malformed backend response.'); break;
    case 'AI_PROVIDER_UNAVAILABLE': console.info('CrayThrive AI diagnostic: provider unavailable.'); break;
    default: console.info('CrayThrive AI diagnostic: function HTTP/configuration failure.');
  }
}

/*
|--------------------------------------------------------------------------
| BUILD TANK CONTEXT
|--------------------------------------------------------------------------
|
| This gives Groq the latest CrayThrive records.
| The AI does NOT control hardware from here.
|
*/

/*
|--------------------------------------------------------------------------
| BUILD TANK CONTEXT
|--------------------------------------------------------------------------
|
| This gives Groq the latest CrayThrive records.
| The AI does NOT control hardware from here.
|
*/

export async function buildAiTankContext({ tank }) {
  await fetchServerTime().catch(() => null);
  const {
    data: authData,
    error: authError,
  } =
    await supabase.auth.getUser();

  if (
    authError ||
    !authData?.user?.id
  ) {
    throw new Error(
      "Unable to identify the current user."
    );
  }

  const userId =
    authData.user.id;

  const tankId =
    getTankId(
      tank
    );

  if (!tankId) {
    throw new Error(
      "Unable to identify the selected tank."
    );
  }

  const [monitoringRows,alertResult,controlResult]=await Promise.all([
      fetchMonitoringRows(userId,[tankId],{sensorLimit:12,scanLimit:8}),
      supabase
        .from(
          "alerts"
        )
        .select("*")
        .eq(
          "user_id",
          userId
        )
        .eq(
          "tank_id",
          tankId
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .limit(
          10
        ),

      supabase
        .from(
          "control_logs"
        )
        .select("*")
        .eq(
          "user_id",
          userId
        )
        .eq(
          "tank_id",
          tankId
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .limit(
          10
        ),
    ]);

  if (
    alertResult.error
  ) {
    console.log("AI CONTEXT ALERT ERROR:");
  }

  if (
    controlResult.error
  ) {
    console.log("AI CONTEXT CONTROL ERROR:");
  }

  const sensorRows =
    monitoringRows.sensors;

  const ammoniaRows =
    monitoringRows.scans;

  const alertRows =
    alertResult.data ||
    [];

  const controlRows =
    controlResult.data ||
    [];

  const latestSensor =
    newestMonitoringRow(sensorRows);

  const latestAmmonia =
    newestMonitoringRow(ammoniaRows);

  const latestCombined =
    buildCombinedReading(
      latestSensor,
      latestAmmonia
    );

  const normalizedThresholds =
    await fetchThresholdSettings(userId, tankId);
  const pairedIds = await fetchPairedTankIds(userId, [tankId]);

  return {
    system:
      "CrayThrive",

    user_id:
      userId,

    tank: {
      id:
        tankId,

      name:
        tank?.tank_name ||
        "Tank",

      location:
        tank?.location ||
        null,

      population:
        getTankPopulation(
          tank
        ),

      created_at:
        tank?.created_at ||
        null,
    },

    latest_sensor: sanitizeReading(latestSensor, normalizedThresholds),
    latest_ammonia: sanitizeAmmoniaReading(latestAmmonia, normalizedThresholds),
    ammonia_instruction: AMMONIA_CONTEXT_INSTRUCTION,
    // Compatibility alias for older response consumers; always sensor-only.
    latest_reading: sanitizeReading(latestSensor, normalizedThresholds),

    thresholds:
      normalizedThresholds,

    rule_based_result:
      sanitizeRuleResult(analyzeTankReading(latestCombined, Boolean(latestCombined), normalizedThresholds, { paired: pairedIds.has(String(tankId)) })),

    recent_sensor_readings:
      sensorRows
        .slice(
          0,
          10
        )
        .map(
          row => sanitizeReading(row, normalizedThresholds)
        ),

    recent_ammonia_readings:
      ammoniaRows
        .slice(
          0,
          6
        )
        .map(
          row => sanitizeAmmoniaReading(row, normalizedThresholds)
        ),

    recent_alerts:
      alertRows
        .slice(
          0,
          8
        )
        .map(
          sanitizeAlert
        ),

    recent_control_logs:
      controlRows
        .slice(
          0,
          8
        )
        .map(
          sanitizeControlLog
        ),

    capabilities: {
      can_recommend:
        true,

      can_suggest_skip_feed:
        true,

      can_suggest_fill:
        true,

      can_suggest_drain:
        true,

      can_suggest_threshold_change:
        true,

      direct_hardware_control:
        false,

      automatic_threshold_change:
        false,

      threshold_change_requires_user_confirmation:
        true,
    },
  };
}

/*
|--------------------------------------------------------------------------
| APPLY AI THRESHOLD SUGGESTION
|--------------------------------------------------------------------------
*/

export async function applyAiThresholdSuggestion({ suggestion, tankId }) {
  if (!tankId) throw new Error('Select a tank before applying the AI recommendation.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Unable to identify your account. Please sign in again.');
  const current = await fetchThresholdSettings(data.user.id, tankId);
  const normalized = normalizeThresholdSuggestion(suggestion, current);
  if (!normalized) throw new Error('This AI threshold suggestion is invalid, incomplete, unsupported, or already matches the active setting.');
  const next = buildUpdatedThresholds(current, normalized);
  validateThresholds(next);
  const result = await applyTankThresholdPatch({ tankId,
    patch: buildParameterColumnPayload(normalized.parameter, next),
    scope: 'single_tank', source: 'ai_recommendation',
  });
  return { ...result, updated_parameter: normalized.parameter };
}

/*
|--------------------------------------------------------------------------
| APPLY SUGGESTION TO CURRENT THRESHOLDS
|--------------------------------------------------------------------------
*/

function buildUpdatedThresholds(
  current,
  suggestion
) {
  const next = {
    ...normalizeThresholds(
      current
    ),
  };

  const parameter =
    normalizeParameterName(
      suggestion.parameter
    );

  const suggestedMin =
    firstFinite(
      suggestion
        ?.suggested_min,

      suggestion
        ?.suggested
        ?.min
    );

  const suggestedMax =
    firstFinite(
      suggestion
        ?.suggested_max,

      suggestion
        ?.suggested
        ?.max
    );

  const suggestedValue =
    firstFinite(
      suggestion
        ?.suggested_value,

      suggestion
        ?.suggested
        ?.value,

      typeof suggestion
        ?.suggested ===
        "number"
        ? suggestion
            .suggested
        : null
    );

  switch (
    parameter
  ) {
    case "temperature": {
      if (
        suggestedMin ===
          null ||
        suggestedMax ===
          null
      ) {
        throw new Error(
          "The AI temperature suggestion is incomplete."
        );
      }

      next.temperatureMin =
        suggestedMin;

      next.temperatureMax =
        suggestedMax;

      break;
    }

    case "ph": {
      if (
        suggestedMin ===
          null ||
        suggestedMax ===
          null
      ) {
        throw new Error(
          "The AI pH suggestion is incomplete."
        );
      }

      next.phMin =
        suggestedMin;

      next.phMax =
        suggestedMax;

      break;
    }

    case "turbidity": {
      const value =
        suggestedValue ??
        suggestedMin ??
        suggestedMax;

      if (
        value ===
        null
      ) {
        throw new Error(
          "The AI turbidity suggestion is incomplete."
        );
      }

      next.turbidityMax =
        value;

      break;
    }

    case "water_level": {
      const value =
        suggestedValue ??
        suggestedMin ??
        suggestedMax;

      if (
        value ===
        null
      ) {
        throw new Error(
          "The AI water-level suggestion is incomplete."
        );
      }

      next.waterLevelMin =
        value;

      break;
    }

    case "ammonia": {
      const value =
        suggestedValue ??
        suggestedMax ??
        suggestedMin;

      if (
        value ===
        null
      ) {
        throw new Error(
          "The AI ammonia suggestion is incomplete."
        );
      }

      next.ammoniaMax =
        value;

      break;
    }

    default:
      throw new Error(
        "This AI threshold parameter is not supported."
      );
  }

  return normalizeThresholds(
    next
  );
}

function buildParameterColumnPayload(
  parameter,
  thresholds
) {
  switch (
    parameter
  ) {
    case "temperature":
      return {
        temperature_min:
          Number(
            thresholds
              .temperatureMin
          ),

        temperature_max:
          Number(
            thresholds
              .temperatureMax
          ),
      };

    case "ph":
      return {
        ph_min:
          Number(
            thresholds
              .phMin
          ),

        ph_max:
          Number(
            thresholds
              .phMax
          ),
      };

    case "turbidity":
      return {
        turbidity_max:
          Number(
            thresholds
              .turbidityMax
          ),
      };

    case "water_level":
      return {
        water_level_min:
          Number(
            thresholds
              .waterLevelMin
          ),
      };

    case "ammonia":
      return {
        ammonia_max:
          Number(
            thresholds
              .ammoniaMax
          ),
      };

    default:
      throw new Error(
        "This AI threshold parameter is not supported."
      );
  }
}

function numbersEqual(
  first,
  second
) {
  const firstNumber =
    Number(
      first
    );

  const secondNumber =
    Number(
      second
    );

  if (
    !Number.isFinite(
      firstNumber
    ) ||
    !Number.isFinite(
      secondNumber
    )
  ) {
    return false;
  }

  return (
    Math.abs(
      firstNumber -
      secondNumber
    ) <
    0.000001
  );
}

/*
|--------------------------------------------------------------------------
| THRESHOLD SAFETY VALIDATION
|--------------------------------------------------------------------------
|
| Technical input guards only.
|
*/

function validateThresholds(
  thresholds
) {
  const clean =
    normalizeThresholds(
      thresholds
    );

  requireFinite(
    clean.temperatureMin,
    "Minimum temperature"
  );

  requireFinite(
    clean.temperatureMax,
    "Maximum temperature"
  );

  if (
    clean.temperatureMin <
      10 ||
    clean.temperatureMin >
      40
  ) {
    throw new Error(
      "Minimum temperature must be between 10°C and 40°C."
    );
  }

  if (
    clean.temperatureMax <
      10 ||
    clean.temperatureMax >
      40
  ) {
    throw new Error(
      "Maximum temperature must be between 10°C and 40°C."
    );
  }

  if (
    clean.temperatureMin >=
    clean.temperatureMax
  ) {
    throw new Error(
      "Minimum temperature must be lower than maximum temperature."
    );
  }

  requireFinite(
    clean.phMin,
    "Minimum pH"
  );

  requireFinite(
    clean.phMax,
    "Maximum pH"
  );

  if (
    clean.phMin < 0 ||
    clean.phMin > 14
  ) {
    throw new Error(
      "Minimum pH must be between 0 and 14."
    );
  }

  if (
    clean.phMax < 0 ||
    clean.phMax > 14
  ) {
    throw new Error(
      "Maximum pH must be between 0 and 14."
    );
  }

  if (
    clean.phMin >=
    clean.phMax
  ) {
    throw new Error(
      "Minimum pH must be lower than maximum pH."
    );
  }

  requireFinite(
    clean.turbidityMax,
    "Turbidity threshold"
  );

  if (
    clean.turbidityMax < 0 ||
    clean.turbidityMax > 5
  ) {
    throw new Error(
      "Turbidity sensor threshold must be between 0V and 5V."
    );
  }

  requireFinite(
    clean.waterLevelMin,
    "Water level threshold"
  );

  if (
    clean.waterLevelMin < 0 ||
    clean.waterLevelMin > 20
  ) {
    throw new Error(
      "Water level threshold must be between 0cm and 20cm for the current prototype configuration."
    );
  }

  requireFinite(
    clean.ammoniaMax,
    "Ammonia threshold"
  );

  if (
    clean.ammoniaMax < 0 ||
    clean.ammoniaMax > 5
  ) {
    throw new Error(
      "Ammonia threshold must be between 0ppm and 5ppm."
    );
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE AI RESPONSE
|--------------------------------------------------------------------------
*/

function normalizeAiResponse(
  raw,
  currentThresholds
) {
  const source =
    raw &&
    typeof raw ===
      "object"
      ? raw
      : {};

  const scope =
    ALLOWED_AI_SCOPES.has(
      source.scope
    )
      ? source.scope
      : "allowed";

  let action =
    ALLOWED_AI_ACTIONS.has(
      source.action_type ||
      source.action
    )
      ? source.action_type ||
        source.action
      : "recommendation_only";

  let thresholdSuggestion =
    source.threshold_suggestion ||
    source.thresholdSuggestion ||
    null;

  if (
    action !==
    "suggest_threshold_change"
  ) {
    thresholdSuggestion =
      null;
  } else {
    thresholdSuggestion =
      normalizeThresholdSuggestion(
        thresholdSuggestion,
        currentThresholds
      );

    if (
      !thresholdSuggestion
    ) {
      action =
        "recommendation_only";
    }
  }

  if (
    scope ===
    "denied"
  ) {
    return {
      scope:
        "denied",

      category:
        "unrelated",

      action:
        "recommendation_only",

      answer:
        String(
          source.answer ||
          source.message ||
          "I can only help with CrayThrive, crayfish farming, tank conditions, feeding, water quality, and related system guidance."
        ),

      reason:
        "",

      threshold_suggestion:
        null,
      suggestion_id: null,
      suggestion_saved: false,
      source: 'ai',
      request_id: typeof source.request_id === 'string' && /^[a-f0-9-]{36}$/i.test(source.request_id) ? source.request_id : null,
    };
  }

  return {
    scope,

    category:
      String(
        source.category ||
        "craythrive"
      ),

    action,

    answer:
      String(
        source.answer ||
        source.message ||
        "No recommendation was returned."
      ),

    reason:
      String(
        source.reason ||
        ""
      ),

    threshold_suggestion:
      thresholdSuggestion,
    source: source.source === 'rule_based' ? 'rule_based' : 'ai',
    request_id: typeof source.request_id === 'string' && /^[a-f0-9-]{36}$/i.test(source.request_id) ? source.request_id : null,
    suggestion_id: source.suggestion_id || null,
    suggestion_saved: source.suggestion_saved === true,
  };
}

/*
|--------------------------------------------------------------------------
| NORMALIZE THRESHOLD SUGGESTION
|--------------------------------------------------------------------------
*/

function normalizeThresholdSuggestion(
  suggestion,
  currentThresholds
) {
  if (
    !suggestion ||
    typeof suggestion !==
      "object"
  ) {
    return null;
  }

  const parameter =
    normalizeParameterName(
      suggestion
        ?.parameter
    );

  if (
    !ALLOWED_THRESHOLD_PARAMETERS
      .has(
        parameter
      )
  ) {
    return null;
  }

  const current =
    normalizeThresholds(
      currentThresholds ||
      DEFAULT_THRESHOLDS
    );

  const suggestedMin =
    firstFinite(
      suggestion
        ?.suggested_min,

      suggestion
        ?.suggested
        ?.min
    );

  const suggestedMax =
    firstFinite(
      suggestion
        ?.suggested_max,

      suggestion
        ?.suggested
        ?.max
    );

  const suggestedValue =
    firstFinite(
      suggestion
        ?.suggested_value,

      suggestion
        ?.suggested
        ?.value,

      typeof suggestion
        ?.suggested ===
        "number"
        ? suggestion
            .suggested
        : null
    );

  const reason =
    String(
      suggestion
        ?.reason ||
      ""
    );

  if (
    parameter ===
    "temperature"
  ) {
    if (
      suggestedMin === null ||
      suggestedMax === null ||
      suggestedMin < 10 ||
      suggestedMax > 40 ||
      suggestedMin >=
        suggestedMax
    ) {
      return null;
    }

    if (
      numbersEqual(
        suggestedMin,
        current.temperatureMin
      ) &&
      numbersEqual(
        suggestedMax,
        current.temperatureMax
      )
    ) {
      return null;
    }

    return {
      parameter,

      current_min:
        current.temperatureMin,

      current_max:
        current.temperatureMax,

      current_value:
        null,

      suggested_min:
        suggestedMin,

      suggested_max:
        suggestedMax,

      suggested_value:
        null,

      reason,
    };
  }

  if (
    parameter ===
    "ph"
  ) {
    if (
      suggestedMin === null ||
      suggestedMax === null ||
      suggestedMin < 0 ||
      suggestedMax > 14 ||
      suggestedMin >=
        suggestedMax
    ) {
      return null;
    }

    if (
      numbersEqual(
        suggestedMin,
        current.phMin
      ) &&
      numbersEqual(
        suggestedMax,
        current.phMax
      )
    ) {
      return null;
    }

    return {
      parameter,

      current_min:
        current.phMin,

      current_max:
        current.phMax,

      current_value:
        null,

      suggested_min:
        suggestedMin,

      suggested_max:
        suggestedMax,

      suggested_value:
        null,

      reason,
    };
  }

  const singleValueConfig = {
    turbidity: {
      currentValue:
        current.turbidityMax,

      min:
        0,

      max:
        5,
    },

    water_level: {
      currentValue:
        current.waterLevelMin,

      min:
        0,

      max:
        20,
    },

    ammonia: {
      currentValue:
        current.ammoniaMax,

      min:
        0,

      max:
        5,
    },
  };

  const config =
    singleValueConfig[
      parameter
    ];

  if (
    !config ||
    suggestedValue === null ||
    suggestedValue <
      config.min ||
    suggestedValue >
      config.max ||
    numbersEqual(
      suggestedValue,
      config.currentValue
    )
  ) {
    return null;
  }

  return {
    parameter,

    current_min:
      null,

    current_max:
      null,

    current_value:
      config.currentValue,

    suggested_min:
      null,

    suggested_max:
      null,

    suggested_value:
      suggestedValue,

    reason,
  };
}

/*
|--------------------------------------------------------------------------
| HISTORY
|--------------------------------------------------------------------------
*/

function sanitizeHistory(
  history
) {
  if (
    !Array.isArray(
      history
    )
  ) {
    return [];
  }

  return history.filter(item => !item?.error && !item?.fallback && item?.source !== 'rule_based')
    .slice(
      -8
    )
    .map(
      (
        item
      ) => {
        const role =
          item?.role ===
          "assistant"
            ? "assistant"
            : "user";

        const content =
          String(
            item?.content ??
            item?.text ??
            ""
          )
            .trim()
            .slice(
              0,
              2000
            );

        return {
          role,
          content,
        };
      }
    )
    .filter(
      (
        item
      ) =>
        Boolean(
          item.content
        )
    );
}

/*
|--------------------------------------------------------------------------
| SANITIZE RULE RESULT
|--------------------------------------------------------------------------
*/

function sanitizeRuleResult(
  result
) {
  if (!result) {
    return null;
  }

  return {
    sensor_condition: result.sensorCondition || null,
    status:
      result.status ||
      null,

    type:
      result.type ||
      null,

    score:
      numberOrNull(
        result.score
      ),

    message:
      result.message ||
      "",

    suggestion:
      result.suggestion ||
      "",

    issues:
      Array.isArray(
        result.issues
      )
        ? result.issues
            .slice(
              0,
              10
            )
            .map(
              (
                issue
              ) => ({
                level:
                  issue
                    ?.level ||
                  null,

                title:
                  issue
                    ?.title ||
                  "",

                message:
                  issue
                    ?.message ||
                  "",

                action_type:
                  issue
                    ?.actionType ||
                  null,

                command_type:
                  issue
                    ?.commandType ||
                  null,
              })
            )
        : [],
  };
}

/*
|--------------------------------------------------------------------------
| SANITIZE SENSOR READING
|--------------------------------------------------------------------------
*/

function sanitizeReading(row, thresholds = DEFAULT_THRESHOLDS) {
 if (!row) return null;
 const reading = normalizeSensorReading(row);
 const evaluated = evaluateMonitoring(reading, thresholds);
 return { id: row.id || null, tank_id: row.tank_id || null, device_uid: row.device_uid || null, created_at: row.created_at || null,
 temperature: reading.temperature, ph: reading.ph, ph_voltage: firstFinite(row.ph_voltage),
 reading_type: 'water', turbidity: reading.turbidity, water_level: reading.water_level,
 evaluated_statuses: Object.fromEntries(Object.entries(evaluated.metrics).filter(([key]) => key !== 'ammonia').map(([key, metric]) => [key, { status: metric.label, severity: metric.severity, reason: metric.reason }])),
 raw_statuses: { temperature: row.temperature_status || row.temp_status || null, ph: row.ph_status || null,
 turbidity: row.turbidity_status || null, water: row.water_status || null } };
}

/*
|--------------------------------------------------------------------------
| SANITIZE AMMONIA
|--------------------------------------------------------------------------
*/

function sanitizeAmmoniaReading(row, thresholds = DEFAULT_THRESHOLDS) {
 if (!row) return null; const reading = normalizeAmmoniaScan(row); const metric = evaluateMonitoring(reading, thresholds).metrics.ammonia;
 return { id: row.id || null, tank_id: row.tank_id || null, created_at: row.created_at || null,
 reading_type: 'ammonia', value: metric.value, timestamp: row.created_at || null, condition: metric.label,
 ammonia: metric.value, status: metric.label, severity: metric.severity, reason: metric.reason,
 raw_status: row.ammonia_status || row.status || null, label: row.chart_label || row.color_label || null,
 source: 'manual_scan', input_method: row.source || row.input_method || row.scan_source || 'phone_camera_or_manual' };
}

/*
|--------------------------------------------------------------------------
| SANITIZE ALERT
|--------------------------------------------------------------------------
*/

function sanitizeAlert(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.id ||
      null,

    created_at:
      row.created_at ||
      null,

    type:
      row.type ||
      row.alert_type ||
      null,

    severity:
      row.severity ||
      null,

    title:
      row.title ||
      "",

    message:
      row.message ||
      "",

    status:
      row.status ||
      null,

    resolved:
      row.resolved ??
      row.is_resolved ??
      false,
  };
}

/*
|--------------------------------------------------------------------------
| SANITIZE CONTROL LOG
|--------------------------------------------------------------------------
*/

function sanitizeControlLog(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.id ||
      null,

    created_at:
      row.created_at ||
      null,

    action:
      row.action ||
      row.command ||
      row.command_type ||
      null,

    status:
      row.status ||
      null,

    source:
      row.source ||
      null,

    message:
      row.message ||
      row.notes ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| COMBINED READING
|--------------------------------------------------------------------------
*/

function buildCombinedReading(sensor, ammonia) { return combineMonitoringReadings(sensor, ammonia); }

/*
|--------------------------------------------------------------------------
| PARAMETER NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeParameterName(
  value
) {
  const parameter =
    String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        "_"
      )
      .replace(
        /-/g,
        "_"
      );

  if (
    parameter === "ph" ||
    parameter === "ph_level"
  ) {
    return "ph";
  }

  if (
    parameter === "temperature" ||
    parameter === "temp" ||
    parameter ===
      "water_temperature"
  ) {
    return "temperature";
  }

  if (
    parameter === "turbidity" ||
    parameter ===
      "water_clarity" ||
    parameter === "clarity"
  ) {
    return "turbidity";
  }

  if (
    parameter === "water" ||
    parameter ===
      "water_level" ||
    parameter ===
      "water_depth"
  ) {
    return "water_level";
  }

  if (
    parameter === "ammonia" ||
    parameter === "nh3"
  ) {
    return "ammonia";
  }

  return parameter;
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getTankId(
  tank
) {
  return (
    tank?.id ||
    tank?.uuid ||
    tank?.tank_id ||
    null
  );
}

function getTankPopulation(
  tank
) {
  const value =
    firstFinite(
      tank?.population,
      tank?.population_count,
      tank?.estimated_population,
      tank?.crayfish_count
    );

  return value;
}

function firstFinite(
  ...values
) {
  for (
    const value of
    values
  ) {
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !value.trim())
    ) {
      continue;
    }

    const number =
      Number(
        value
      );

    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }

  return null;
}

function numberOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function requireFinite(
  value,
  label
) {
  if (
    !Number.isFinite(
      Number(
        value
      )
    )
  ) {
    throw new Error(
      `${label} is invalid.`
    );
  }
}


