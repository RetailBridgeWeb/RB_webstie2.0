import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { getUserEmail, sendEmail } from "./mailer.js";
import { getUserFromToken, supabaseAdmin } from "./supabase.js";

const app = express();

app.use(
  cors({
    origin: config.clientOrigin,
  }),
);
app.use(express.json());

async function requireUser(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.replace(/^Bearer\s+/i, "");

    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    req.user = await getUserFromToken(token);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

async function requireAdmin(req, res, next) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", req.user.id)
    .maybeSingle();

  if (error || !profile || profile.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }

  return next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/listings/:listingId/claim", requireUser, async (req, res) => {
  const { listingId } = req.params;
  const buyerId = req.user.id;
  const quantityRequested = Number(req.body.quantity_requested || 0);
  const message = req.body.message?.trim() || null;

  const { data: listing, error: listingError } = await supabaseAdmin
    .from("listings")
    .select("id,seller_id,product_name,quantity,unit,price,status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return res.status(400).json({ error: listingError.message });
  }

  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  if (listing.seller_id === buyerId) {
    return res.status(409).json({ error: "Sellers cannot claim their own listing" });
  }

  if (listing.status !== "ACTIVE") {
    return res.status(409).json({ error: "Listing is not available for claiming" });
  }

  if (!quantityRequested || quantityRequested <= 0 || quantityRequested > Number(listing.quantity)) {
    return res.status(400).json({ error: "Requested quantity is invalid" });
  }

  const { data: claim, error: claimError } = await supabaseAdmin
    .from("claims")
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      quantity_requested: quantityRequested,
      message,
      status: "PENDING",
    })
    .select("id")
    .maybeSingle();

  if (claimError) {
    return res.status(400).json({ error: claimError.message });
  }

  await supabaseAdmin.from("notifications").insert({
    user_id: listing.seller_id,
    type: "CLAIM_RECEIVED",
    title: "New claim received",
    message: `A buyer requested ${quantityRequested} ${listing.unit} of ${listing.product_name}.`,
    meta: { listing_id: listing.id, claim_id: claim?.id },
  });

  const sellerEmail = await getUserEmail(listing.seller_id);
  await sendEmail({
    to: sellerEmail,
    subject: "Retail Bridge: New claim received",
    text: `You received a new claim for ${listing.product_name}. Requested quantity: ${quantityRequested} ${listing.unit}.`,
    html: `<p>You received a new claim for <strong>${listing.product_name}</strong>.</p><p>Requested quantity: ${quantityRequested} ${listing.unit}</p>`,
  });

  return res.json({ ok: true, claimId: claim?.id });
});

app.post("/api/claims/:claimId/accept", requireUser, async (req, res) => {
  const { claimId } = req.params;
  const sellerId = req.user.id;

  const { data: claim, error: claimError } = await supabaseAdmin
    .from("claims")
    .select("id,listing_id,buyer_id,quantity_requested,status,listings!inner(id,seller_id,product_name,price,status)")
    .eq("id", claimId)
    .maybeSingle();

  if (claimError) {
    return res.status(400).json({ error: claimError.message });
  }

  if (!claim) {
    return res.status(404).json({ error: "Claim not found" });
  }

  if (claim.listings.seller_id !== sellerId) {
    return res.status(403).json({ error: "Only the seller can accept a claim" });
  }

  if (claim.status !== "PENDING") {
    return res.status(409).json({ error: "Claim is no longer pending" });
  }

  if (claim.listings.status !== "ACTIVE") {
    return res.status(409).json({ error: "Listing is not available for claiming" });
  }

  const txPayload = {
    claim_id: claim.id,
    listing_id: claim.listing_id,
    seller_id: sellerId,
    buyer_id: claim.buyer_id,
    quantity: claim.quantity_requested,
    total_price: Number(claim.quantity_requested) * Number(claim.listings.price),
    status: "PENDING",
  };

  const [{ error: claimUpdateError }, { error: listingUpdateError }, { error: txError }] = await Promise.all([
    supabaseAdmin.from("claims").update({ status: "ACCEPTED" }).eq("id", claim.id),
    supabaseAdmin.from("listings").update({ status: "PENDING" }).eq("id", claim.listing_id),
    supabaseAdmin.from("transactions").insert(txPayload),
  ]);

  if (claimUpdateError || listingUpdateError || txError) {
    return res.status(400).json({
      error: claimUpdateError?.message || listingUpdateError?.message || txError?.message,
    });
  }

  await supabaseAdmin
    .from("claims")
    .update({ status: "DECLINED" })
    .eq("listing_id", claim.listing_id)
    .neq("id", claim.id)
    .eq("status", "PENDING");

  await supabaseAdmin.from("notifications").insert([
    {
      user_id: sellerId,
      type: "CLAIM_RECEIVED",
      title: "Claim accepted",
      message: "You accepted a buyer claim and created a transaction.",
      meta: { claim_id: claim.id, listing_id: claim.listing_id },
    },
    {
      user_id: claim.buyer_id,
      type: "CLAIM_ACCEPTED",
      title: "Your claim was accepted",
      message: "The seller accepted your claim. Delivery confirmation is now available.",
      meta: { claim_id: claim.id, listing_id: claim.listing_id },
    },
  ]);

  const buyerEmail = await getUserEmail(claim.buyer_id);
  const sellerEmail = await getUserEmail(sellerId);

  await Promise.all([
    sendEmail({
      to: sellerEmail,
      subject: "Retail Bridge: Claim accepted",
      text: `You accepted a claim for ${claim.listings.product_name}. A transaction has been created.`,
      html: `<p>You accepted a claim for <strong>${claim.listings.product_name}</strong> and a transaction has been created.</p>`,
    }),
    sendEmail({
      to: buyerEmail,
      subject: "Retail Bridge: Your claim was accepted",
      text: "The seller accepted your claim. Please confirm delivery when the order arrives.",
      html: "<p>The seller accepted your claim. Please confirm delivery when the order arrives.</p>",
    }),
  ]);

  return res.json({ ok: true });
});

app.post("/api/transactions/:transactionId/confirm", requireUser, async (req, res) => {
  const { transactionId } = req.params;
  const actorId = req.user.id;

  const { data: transaction, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("id,buyer_id,seller_id,status,seller_confirmed_at,buyer_confirmed_at,listing_id")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError) {
    return res.status(400).json({ error: txError.message });
  }

  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  if (transaction.buyer_id !== actorId && transaction.seller_id !== actorId) {
    return res.status(403).json({ error: "Only the buyer or seller can confirm delivery" });
  }

  if (transaction.status === "COMPLETED") {
    return res.json({ ok: true, status: "COMPLETED" });
  }

  const now = new Date().toISOString();
  const sellerConfirmedAt =
    actorId === transaction.seller_id ? transaction.seller_confirmed_at || now : transaction.seller_confirmed_at;
  const buyerConfirmedAt =
    actorId === transaction.buyer_id ? transaction.buyer_confirmed_at || now : transaction.buyer_confirmed_at;

  let status = "PENDING";
  let completedAt = null;

  if (sellerConfirmedAt && buyerConfirmedAt) {
    status = "COMPLETED";
    completedAt = now;
  } else if (sellerConfirmedAt) {
    status = "SELLER_CONFIRMED";
  } else if (buyerConfirmedAt) {
    status = "BUYER_CONFIRMED";
  }

  const { error: updateError } = await supabaseAdmin
    .from("transactions")
    .update({
      seller_confirmed_at: sellerConfirmedAt,
      buyer_confirmed_at: buyerConfirmedAt,
      completed_at: completedAt,
      status,
    })
    .eq("id", transaction.id);

  if (updateError) {
    return res.status(400).json({ error: updateError.message });
  }

  if (status === "COMPLETED") {
    await supabaseAdmin.from("listings").update({ status: "CLOSED" }).eq("id", transaction.listing_id);
  }

  await supabaseAdmin.from("notifications").insert([
    {
      user_id: transaction.seller_id,
      type: "DELIVERY_CONFIRMED",
      title: "Delivery update",
      message: `Delivery status is now ${status}.`,
      meta: { transaction_id: transaction.id },
    },
    {
      user_id: transaction.buyer_id,
      type: "DELIVERY_CONFIRMED",
      title: "Delivery update",
      message: `Delivery status is now ${status}.`,
      meta: { transaction_id: transaction.id },
    },
  ]);

  const sellerEmail = await getUserEmail(transaction.seller_id);
  const buyerEmail = await getUserEmail(transaction.buyer_id);

  await Promise.all([
    sendEmail({
      to: sellerEmail,
      subject: "Retail Bridge: Delivery status updated",
      text: `Delivery status is now ${status}.`,
      html: `<p>Delivery status is now <strong>${status}</strong>.</p>`,
    }),
    sendEmail({
      to: buyerEmail,
      subject: "Retail Bridge: Delivery status updated",
      text: `Delivery status is now ${status}.`,
      html: `<p>Delivery status is now <strong>${status}</strong>.</p>`,
    }),
  ]);

  return res.json({ ok: true, status });
});

app.post("/api/jobs/expire-listings", async (_req, res) => {
  const { error } = await supabaseAdmin.rpc("expire_listings");

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ ok: true });
});

app.get("/api/admin/overview", requireUser, requireAdmin, async (_req, res) => {
  const [profilesResult, listingsResult, transactionsResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,business_name,city,phone,role,is_flagged,created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("listings")
      .select("id,product_name,quantity,unit,price,status,location,created_at,seller_id,profiles:seller_id(business_name)")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("transactions")
      .select("id,status,quantity,total_price,created_at,seller_id,buyer_id,listings(product_name)")
      .order("created_at", { ascending: false }),
  ]);

  const error =
    profilesResult.error?.message || listingsResult.error?.message || transactionsResult.error?.message;

  if (error) {
    return res.status(400).json({ error });
  }

  return res.json({
    profiles: profilesResult.data || [],
    listings: listingsResult.data || [],
    transactions: transactionsResult.data || [],
  });
});

app.post("/api/admin/listings/:listingId/close", requireUser, requireAdmin, async (req, res) => {
  const { listingId } = req.params;
  const { error } = await supabaseAdmin.from("listings").update({ status: "CLOSED" }).eq("id", listingId);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ ok: true });
});

app.post("/api/admin/profiles/:profileId/flag", requireUser, requireAdmin, async (req, res) => {
  const { profileId } = req.params;
  const { error } = await supabaseAdmin.from("profiles").update({ is_flagged: true }).eq("id", profileId);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ ok: true });
});

export default app;
