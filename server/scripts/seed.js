import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const demoUsers = [
  {
    email: "seller1@retailbridge.demo",
    password: "DemoPass123!",
    business_name: "Green Basket Foods",
    city: "Riyadh",
    phone: "+966500000001",
  },
  {
    email: "seller2@retailbridge.demo",
    password: "DemoPass123!",
    business_name: "Fresh Route Trading",
    city: "Jeddah",
    phone: "+966500000002",
  },
];

const sampleListings = [
  { product_name: "Organic Flour - 50kg", quantity: 50, unit: "kg", price: 140, location: "Riyadh", notes: "Near expiry but sealed bags." },
  { product_name: "Tomato Paste - 10 Crates", quantity: 10, unit: "crate", price: 220, location: "Jeddah", notes: "Warehouse pickup only." },
  { product_name: "Frozen Mixed Vegetables", quantity: 30, unit: "box", price: 90, location: "Dammam", notes: "Cold-chain stock available." },
  { product_name: "Olive Oil Bottles", quantity: 120, unit: "bottle", price: 4, location: "Makkah", notes: "Retail-ready packaging." },
  { product_name: "Dates Syrup - 25 Cases", quantity: 25, unit: "case", price: 75, location: "Madinah", notes: "Good for horeca buyers." },
];

async function ensureUser(user) {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers.users.find((item) => item.email === user.email);

  if (existing) {
    await supabase.from("profiles").upsert({
      id: existing.id,
      business_name: user.business_name,
      city: user.city,
      phone: user.phone,
      role: "MERCHANT",
    });

    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      business_name: user.business_name,
      city: user.city,
      phone: user.phone,
      role: "MERCHANT",
    },
  });

  if (error) {
    throw error;
  }

  return data.user.id;
}

async function main() {
  const sellerIds = [];

  for (const user of demoUsers) {
    sellerIds.push(await ensureUser(user));
  }

  const payload = sampleListings.map((listing, index) => ({
    seller_id: sellerIds[index % sellerIds.length],
    product_name: listing.product_name,
    quantity: listing.quantity,
    unit: listing.unit,
    price: listing.price,
    location: listing.location,
    notes: listing.notes,
    status: "ACTIVE",
    auto_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  }));

  const { error } = await supabase.from("listings").insert(payload);

  if (error) {
    throw error;
  }

  console.log("Seeded demo users and listings successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
