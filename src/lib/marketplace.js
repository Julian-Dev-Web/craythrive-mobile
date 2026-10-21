import { supabase } from "./supabase";

export const MARKETPLACE_CATEGORIES = [
  "crayfish", "feeds", "tanks_enclosures", "water_care",
  "test_kits", "equipment", "accessories", "others",
];

export function normalizeStoreUrl(value) {
  const text = String(value || "").trim();
  if (!text || /[\s\\]/.test(text)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : text.startsWith("//") ? `https:${text}` : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function validateReservation(listing, buyerId, quantity) {
  if (!buyerId) throw new Error("Please sign in before reserving a product.");
  if (!listing?.id || !listing.seller_id) throw new Error("This product is no longer available.");
  if (listing.seller_id === buyerId) throw new Error("You cannot reserve your own product.");
  if (String(listing.status || "").toLowerCase() !== "active") {
    throw new Error("This product is no longer available for reservation.");
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Please enter a valid whole-number quantity.");
  const stock = Number(listing.quantity);
  if (!Number.isFinite(stock) || stock < 1 || quantity > stock) {
    throw new Error(`Only ${Number.isFinite(stock) ? stock : 0} units available.`);
  }
  const price = Number(listing.price);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(price * quantity)) {
    throw new Error("This product has an invalid price. Please contact the seller.");
  }
}

// Recheck the session, availability, stock and price immediately before inserting.
// Keep the existing pending-order / whole-listing reservation behavior.
const reservationLocks = new Set();

export async function reserveMarketplaceProduct(input, client = supabase) {
  const listingId = input?.listingId;
  if (!listingId) throw new Error("This product is no longer available.");
  if (reservationLocks.has(listingId)) throw new Error("A reservation for this product is already being sent.");
  reservationLocks.add(listingId);
  try {
    return await insertReservation(input, client);
  } finally {
    reservationLocks.delete(listingId);
  }
}

async function insertReservation({ listingId, quantity, buyerNote = "" }, client) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const buyerId = auth?.user?.id;
  if (!buyerId) throw new Error("Please sign in before reserving a product.");
  const { data: listing, error: listingError } = await client
    .from("marketplace_listings").select("*").eq("id", listingId).maybeSingle();
  if (listingError) throw listingError;
  validateReservation(listing, buyerId, quantity);
  const { data: existingOrder, error: existingError } = await client.from("marketplace_orders")
    .select("id").eq("listing_id", listing.id).eq("buyer_id", buyerId)
    .in("status", ["pending", "confirmed"]).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existingOrder) throw new Error("You already have an active reservation for this product. Check Orders.");
  const { error: orderError } = await client.from("marketplace_orders").insert({
    listing_id: listing.id,
    buyer_id: buyerId,
    seller_id: listing.seller_id,
    quantity,
    total_price: quantity * Number(listing.price),
    status: "pending",
    buyer_note: String(buyerNote || "").trim() || null,
  });
  if (orderError) throw orderError;
  // Some deployments apply this transition with a database trigger; others allow
  // the existing buyer update. An order already saved must never be retried.
  let statusError = null;
  try {
    const transition = await client.from("marketplace_listings")
      .update({ status: "reserved" }).eq("id", listing.id).eq("status", "active");
    statusError = transition.error || null;
    if (!statusError) {
      const verification = await client.from("marketplace_listings")
        .select("status").eq("id", listing.id).maybeSingle();
      statusError = verification.error || (
        verification.data?.status === "reserved" ? null :
          new Error("The saved reservation's listing status could not be verified.")
      );
    }
  } catch (error) {
    statusError = error;
  }
  return { listing, statusError };
}
