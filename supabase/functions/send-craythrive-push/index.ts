// Supabase Deno resolves this remote import at deployment/runtime.
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatPumpAction, formatPumpAlert } from '../_shared/pumpActionWording.js';

const CHANNEL_ID = "craythrive-alerts";
const TABLES = new Set(["alerts", "marketplace_orders", "marketplace_chat_messages"]);
type RecordData = Record<string, unknown>;
type PreferenceKey = "tank_alerts" | "marketplace_alerts" | "feeding_alerts" | "pump_alerts";
type Delivery = { userId: string; title: string; body: string; preference: PreferenceKey; data: RecordData };
// Best-effort retry deduplication within a warm worker; no new database table.
const acceptedEvents = new Map<string, number>();

function json(body: RecordData, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function text(value: unknown, fallback = "", length = 180) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, length) : fallback;
}
function preferenceForAlert(type: unknown): PreferenceKey {
  const kind = text(type).toLowerCase();
  if (/marketplace|reservation|order|chat/.test(kind)) return "marketplace_alerts";
  if (/feed/.test(kind)) return "feeding_alerts";
  if (/pump|fill|drain/.test(kind)) return "pump_alerts";
  return "tank_alerts";
}
async function secretMatches(received: string, expected: string) {
  const encode = new TextEncoder();
  const [left, right] = await Promise.all([received, expected].map(value => crypto.subtle.digest("SHA-256", encode.encode(value))));
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
function deliveriesFor(table: string, event: string, record: RecordData, old: RecordData): Delivery[] {
  const id = text(record.id);
  if (table === "alerts") {
    const wording = formatPumpAlert(record);
    const userId = text(record.user_id);
    const preference = formatPumpAction(record) ? "pump_alerts" : preferenceForAlert(record.type);
    return userId ? [{ userId, title: text(wording.title, "CrayThrive Alert", 80),
      body: text(wording.message, "An update is available in CrayThrive."), preference,
      data: { screen: preference === "marketplace_alerts" ? "marketplace" : "alerts", alert_id: id, tank_id: record.tank_id || null } }] : [];
  }
  if (table === "marketplace_chat_messages") {
    const receiver = text(record.receiver_id), sender = text(record.sender_id);
    if (!receiver || !sender || receiver === sender) return [];
    return [{ userId: receiver, title: "New Marketplace message",
      body: "You have a new message in CrayThrive Marketplace.", preference: "marketplace_alerts",
      data: { screen: "marketplace", thread_id: record.thread_id, message_id: id } }];
  }
  const buyer = text(record.buyer_id), seller = text(record.seller_id);
  if (!buyer || !seller || buyer === seller) return [];
  const base = { preference: "marketplace_alerts" as PreferenceKey, data: { screen: "marketplace", order_id: id, listing_id: record.listing_id } };
  if (event === "INSERT") {
    return [{ ...base, userId: seller, title: "New product reservation", body: "A buyer reserved your product. Open Marketplace Sales to review it." }];
  }
  if (old.status === record.status) return [];
  if (record.status === "confirmed" || record.status === "completed") {
    return [{ ...base, userId: buyer, title: "Reservation updated", body: `Your Marketplace reservation is ${record.status}.` }];
  }
  if (record.status === "cancelled") {
    return [buyer, seller].map(userId => ({ ...base, userId, title: "Reservation cancelled", body: "A Marketplace reservation was cancelled. Open Marketplace for details." }));
  }
  return [];
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || webhookSecret.length < 32 || !url || !key) return json({ error: "Push sender is not configured." }, 503);
  if (!await secretMatches(request.headers.get("x-craythrive-webhook-secret") || "", webhookSecret)) {
    return json({ error: "Unauthorized webhook." }, 401);
  }
  try {
    let payload;
    try {
      const body = await request.text();
      if (body.length > 131072) return json({ error: "Webhook body is too large." }, 413);
      payload = JSON.parse(body);
    } catch { return json({ error: "Invalid JSON." }, 400); }
    const table = text(payload?.table), event = text(payload?.type), id = text(payload?.record?.id);
    if (payload?.schema !== "public" || !TABLES.has(table) || !id ||
        !(event === "INSERT" || (table === "marketplace_orders" && event === "UPDATE"))) {
      return json({ error: "Unsupported webhook event." }, 400);
    }
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Resolve the canonical row. Never trust a caller-supplied recipient/token.
    const { data: record, error: recordError } = await db.from(table).select("*").eq("id", id).maybeSingle();
    if (recordError) throw new Error("Could not load webhook record.");
    if (!record) return json({ skipped: "record no longer exists" });
    if (event === "UPDATE" && record.status !== payload.record.status) return json({ skipped: "stale status event" });
    const deliveries = deliveriesFor(table, event, record, payload.old_record || {});
    if (!deliveries.length) return json({ skipped: "no recipient or relevant change" });
    const userIds = [...new Set(deliveries.map(item => item.userId))];
    const { data: preferences, error: preferenceError } = await db.from("notification_preferences")
      .select("user_id,tank_alerts,marketplace_alerts,feeding_alerts,pump_alerts").in("user_id", userIds);
    if (preferenceError) throw new Error("Could not load notification preferences.");
    const allowed = deliveries.filter(item => {
      const pref = preferences?.find(p => p.user_id === item.userId);
      return !pref || pref[item.preference] !== false;
    });
    if (!allowed.length) return json({ skipped: "notifications disabled by user" });
    const { data: devices, error: tokenError } = await db.from("push_tokens")
      .select("user_id,expo_push_token").in("user_id", allowed.map(item => item.userId)).eq("is_active", true).limit(1000);
    if (tokenError) throw new Error("Could not load device tokens.");
    const now = Date.now();
    for (const [eventKey, expires] of acceptedEvents) if (expires < now) acceptedEvents.delete(eventKey);
    const seen = new Set();
    const jobs: { key: string; token: string; userId: string; message: RecordData }[] = [];
    for (const delivery of allowed) for (const device of devices || []) {
      const token = device.expo_push_token;
      if (device.user_id !== delivery.userId || !/^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token)) continue;
      const eventKey = `${table}:${id}:${event}:${record.status || ""}:${delivery.userId}:${token}`;
      if (seen.has(eventKey) || acceptedEvents.has(eventKey)) continue;
      seen.add(eventKey);
      jobs.push({ key: eventKey, token, userId: delivery.userId, message: {
        to: token, title: delivery.title, body: delivery.body, sound: "default",
        priority: "high", channelId: CHANNEL_ID, ttl: 3600,
        data: { ...delivery.data, user_id: delivery.userId },
      } });
    }
    if (!jobs.length) return json({ skipped: "no active device or already queued in this worker" });
    let accepted = 0, rejected = 0, retryableFailures = 0;
    const receiptIds: string[] = [];
    for (let offset = 0; offset < jobs.length; offset += 100) {
      const batch = jobs.slice(offset, offset + 100);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      let response: Response, result;
      try {
        const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
        response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify(batch.map(job => job.message)), signal: controller.signal,
        });
        result = await response.json();
      } finally { clearTimeout(timeout); }
      if (!response.ok || !Array.isArray(result?.data) || result.data.length !== batch.length) {
        throw new Error("Expo rejected the push request. Check server credentials and Expo access settings.");
      }
      for (let i = 0; i < batch.length; i++) {
        const ticket = result.data[i], job = batch[i];
        if (ticket.status === "ok") {
          accepted++; if (ticket.id) receiptIds.push(ticket.id);
          acceptedEvents.set(job.key, now + 600000);
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          const { error } = await db.from("push_tokens").update({ is_active: false })
            .eq("expo_push_token", job.token).eq("user_id", job.userId);
          if (error) throw new Error("Could not deactivate a retired device token.");
          rejected++; acceptedEvents.set(job.key, now + 600000);
        } else {
          rejected++;
          retryableFailures++;
          console.error("PUSH TICKET ERROR CODE:", ticket.details?.error || "UnknownError");
        }
      }
    }
    // Tickets are queue acknowledgements, not proof of delivery. Check Expo
    // receipts later (instructions in docs/mobile-notifications.md).
    console.log("PUSH QUEUE RESULT:", JSON.stringify({ accepted, rejected, receiptIds }));
    return json({ accepted, rejected, receiptIds }, retryableFailures ? 502 : 200);
  } catch (error) {
    console.error("PUSH SENDER FAILED:", error instanceof Error ? error.message : "UnknownError");
    return json({ error: "Push delivery could not be queued. Check function logs and credentials." }, 502);
  }
});
