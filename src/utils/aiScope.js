// Shared scope rules contain no credentials or provider calls. The Edge Function
// authenticates and verifies tank ownership before attaching its canonical context.
export function normalizeForScope(value) {
  return String(value || '').toLowerCase().replace(/[–—]/g, '-').replace(/[’']/g, "'")
    .replace(/[^a-z0-9._%+\-\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isCrayThriveQuestionInScope(question, context = null, history = []) {
  const value = normalizeForScope(question).replace(/\.+$/, '').trim();
  if (!value) return false;
  // Explicit unrelated topics win over attached context/history and keyword bait.
  if (/\b(adobo|sinigang|ulam|magluto|pagluluto|lutuin)\b/.test(value)) return false;
  const feedRecipe = /\b(crayfish|redclaw|cherax)\b/.test(value) && /\b(feed|feeding|diet|nutrition|pellet|ration)\b/.test(value);
  if (/\b(recipe|recipes|ingredient|ingredients|cook|cooking|bake|baking)\b/.test(value) && !feedRecipe) return false;
  if (/\b(politics|political|election|elections|president|senator|congress|mayor|governor|politika|pulitika|halalan|presidente|senador|celebrity|celebrities|actor|actress|artista|movie|movies|film|films|netflix|anime|song|songs|lyrics|singer|album|music|nba|basketball|football|soccer|boxing|sports score|weather|forecast|facebook|instagram|tiktok|youtube|book|novel|literature|capital of|prime minister|world war|historical figure)\b/.test(value)) return false;
  const projectContext = /\b(craythrive|crayfish|redclaw|cherax|sensor|esp32|supabase|tank|threshold|ammonia|turbidity|feeder|pump)\b/.test(value);
  if (/\b(programming|coding|code|javascript|typescript|python|java|react|sql|algorithm|api|homework|assignment|essay|quiz|exam|calculus|algebra|geometry|school question)\b/.test(value) && !projectContext) return false;
  if (/\b(craythrive|crayfish|redclaw|cherax|aquaculture|tank|tangke|water quality|water change|water level|water depth|water clarity|turbidity|ammonia|ph|temperature|readings?|feeding|feed|pellets?|feeder|sensors?|thresholds?|alerts?|refill|drain|pumps?|esp32|test strip|molting|moulting|shelters?|hiding places?|stocking density|cannibalism|aeration|filtration|dissolved oxygen|antas ng tubig|kalidad ng tubig|kalinawan ng tubig|temperatura ng tubig|pakain|magpakain|pagpapakain)\b/.test(value)) return true;
  const recentDomainTurn = Array.isArray(history) && history.slice(-8).some(turn => {
    if (turn?.scope === 'denied' || turn?.error) return false;
    return /\b(craythrive|crayfish|tank|reading|readings|ph|water|threshold|feeding|ammonia|tangke|pakain)\b/.test(normalizeForScope(turn?.content ?? turn?.text));
  });
  const selectedTankContext = Boolean(context?.tank?.id &&
    (context.system === 'CrayThrive' || context.rule_based_result || context.latest_reading || recentDomainTurn));
  if (!selectedTankContext) return false;
  // UI follow-ups need an actual threshold conversation, not merely an attached
  // tank. The question itself must refer to previewing/testing the Apply button.
  const recentThresholdTurn = Array.isArray(history) && history.slice(-8).some(turn =>
    turn?.role === 'user' && turn?.scope !== 'denied' && !turn?.error &&
    /\bthresholds?\b/.test(normalizeForScope(turn?.content ?? turn?.text)));
  // A range-only reply can answer the assistant's threshold clarification.
  // It does not authorize a save; the provider must still identify the parameter.
  if (recentThresholdTurn && /^(?:temp(?:erature)?\s+)?-?\d{1,3}(?:\.\d{1,3})?\s*(?:c|degrees?|deg)?\s*(?:to|[-–])\s*-?\d{1,3}(?:\.\d{1,3})?\s*(?:c|degrees?|deg)?$/.test(value)) return true;
  if (recentThresholdTurn && value.length <= 240 &&
    /\bapply(?: threshold)? button\b/.test(value) &&
    /\b(test|testing|try|show|see|preview|makita|ipakita|tingnan)\b/.test(value)) return true;
  // Bounded follow-ups are permitted; arbitrary unrelated questions are not.
  return /^(?:bakit|why|ano muna|what next|explain(?: mo)? (?:ito|this)|paano ko aayusin(?: ito)?|how (?:can|do) i fix (?:it|this)|pwede ba ngayon|ano ang mas importante|anong susunod kong gagawin|is this (?:safe|okay)|is it safe|is everything okay|what (?:should|do) i do(?: first| now)?|what needs attention|ano(?: ang)? (?:muna )?(?:dapat (?:kong )?)?gawin(?: ko)?(?: muna| ngayon)?|ano (?:muna )?dapat kong gawin(?: muna)?|current condition|current status)$/.test(value);
}
