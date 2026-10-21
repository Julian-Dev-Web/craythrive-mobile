export function getAiAnswer(source) {
  for (const value of [source?.message, source?.answer]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// Treat model output as data. Never evaluate it or repair action fields by guessing.
export function parseAiProviderText(raw) {
  if (typeof raw !== 'string') return { parsed: null, answer: '', recovered: false };
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let objectStart = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === '{') { if (depth === 0) objectStart = i; depth++; }
    if (char === '}' && depth > 0 && --depth === 0) {
      try {
        const parsed = JSON.parse(text.slice(objectStart, i + 1));
        if (getAiAnswer(parsed)) return { parsed, answer: getAiAnswer(parsed), recovered: false };
      } catch { /* An intact answer may precede a malformed optional field below. */ }
    }
  }
  // Recover only a complete top-level answer string from a truncated/malformed
  // object. Drop all actions/suggestions so malformed optional data cannot apply.
  depth = 0; quoted = false; escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char !== '"') continue;
    if (depth === 1) {
      const match = text.slice(i).match(/^"(?:message|answer)"\s*:\s*("(?:[^"\\]|\\.)*")/);
      if (match) {
        try {
          const answer = JSON.parse(match[1]).trim();
          if (answer) return { parsed: { message: answer, action_type: 'recommendation_only', threshold_suggestion: null }, answer, recovered: true };
        } catch { /* Invalid string escape: no invented answer. */ }
      }
    }
    quoted = true;
  }
  if (/^\s*(?:\{|\[|```)/.test(raw) || text.includes('{')) return { parsed: null, answer: '', recovered: false };
  return { parsed: null, answer: text, recovered: false };
}
