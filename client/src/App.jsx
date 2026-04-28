import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Bell, Handshake, Package, ShoppingCart, UserCircle } from "lucide-react";
import { supabase } from "./lib/supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

const emptyListing = { product_name: "", quantity: "", unit: "kg", price: "", expiry_date: "", location: "", notes: "" };

function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [claims, setClaims] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", business_name: "", city: "", phone: "" });
  const [listingForm, setListingForm] = useState(emptyListing);
  const [claimDrafts, setClaimDrafts] = useState({});
  const [filters, setFilters] = useState({ query: "", location: "" });
  const [tab, setTab] = useState("marketplace");

  const isArabic = i18n.language === "ar";
  const needsProfileCompletion = session?.user && profile && (profile.business_name === "Unknown Business" || profile.city === "Unknown City");
  const callbackParams = new URLSearchParams(location.search);
  const hasOAuthCallbackContext =
    Boolean(window.location.hash) ||
    callbackParams.has("code") ||
    callbackParams.has("error") ||
    callbackParams.has("access_token");

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
  }, [i18n.language, isArabic]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const currentSession = data.session ?? null;

      // If local storage contains a stale/foreign JWT, clear it so public reads keep working.
      if (currentSession?.access_token) {
        const { error: userError } = await supabase.auth.getUser(currentSession.access_token);
        if (userError) {
          await supabase.auth.signOut();
          setSession(null);
          setAuthReady(true);
          return;
        }
      }

      setSession(currentSession);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, next) => {
      setSession(next ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (session?.user) document.cookie = "rb_logged_in=1; path=/; max-age=2592000; SameSite=Lax";
    else document.cookie = "rb_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    refreshData();
  }, [authReady, session?.user?.id]);

  useEffect(() => {
    if (needsProfileCompletion && location.pathname !== "/complete-profile") navigate("/complete-profile");
  }, [needsProfileCompletion, location.pathname, navigate]);

  async function refreshData() {
    setLoading(true);
    setError("");
    const userId = session?.user?.id;
    const listingsQuery = supabase.from("listings").select("id,seller_id,product_name,quantity,unit,price,status,location,expiry_date,notes,created_at,profiles:seller_id(business_name,city)").order("created_at", { ascending: false });

    if (!userId) {
      const { data, error: listingsError } = await listingsQuery;
      if (listingsError) setError(listingsError.message);
      setListings(data || []);
      setProfile(null);
      setClaims([]);
      setTransactions([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    const [profileRes, listingsRes, claimsRes, txRes, notifRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      listingsQuery,
      supabase.from("claims").select("id,listing_id,buyer_id,quantity_requested,status,message,created_at,listings(product_name,seller_id,unit),profiles:buyer_id(business_name,city)").order("created_at", { ascending: false }),
      supabase.from("transactions").select("id,status,quantity,total_price,seller_id,buyer_id,seller_confirmed_at,buyer_confirmed_at,listings(product_name)").order("created_at", { ascending: false }),
      supabase.from("notifications").select("id,title,message,created_at").order("created_at", { ascending: false }),
    ]);

    if (profileRes.error || listingsRes.error || claimsRes.error || txRes.error || notifRes.error) {
      setError(profileRes.error?.message || listingsRes.error?.message || claimsRes.error?.message || txRes.error?.message || notifRes.error?.message || "Failed to load data");
    } else {
      setProfile(profileRes.data);
      setListings(listingsRes.data || []);
      setClaims(claimsRes.data || []);
      setTransactions(txRes.data || []);
      setNotifications(notifRes.data || []);
    }
    setLoading(false);
  }

  async function api(path, method = "POST", body) {
    const token = session?.access_token;
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setBusy("auth");
    setError("");
    setNotice("");
    const email = authForm.email.trim();
    const password = authForm.password.trim();

    if (authMode === "reset") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/auth` });
      if (resetError) setError(resetError.message);
      else setNotice("Password reset email sent.");
      setBusy("");
      return;
    }

    if (authMode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { business_name: authForm.business_name.trim(), city: authForm.city.trim(), phone: authForm.phone.trim(), role: "MERCHANT" } },
      });
      if (signUpError) setError(signUpError.message);
      else setNotice("Account created successfully.");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
      else navigate("/app");
    }
    setBusy("");
  }

  async function handleGoogleSignIn() {
    setBusy("google");
    setError("");
    const { error: googleError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${APP_URL}/app` } });
    if (googleError) setError(googleError.message);
    setBusy("");
  }

  async function handleCompleteProfile(event) {
    event.preventDefault();
    if (!session?.user) return;
    setBusy("profile");
    const { error: updateError } = await supabase.from("profiles").update({
      business_name: authForm.business_name.trim(),
      city: authForm.city.trim(),
      phone: authForm.phone.trim() || null,
    }).eq("id", session.user.id);
    if (updateError) setError(updateError.message);
    else {
      await refreshData();
      navigate("/app");
    }
    setBusy("");
  }

  async function handleCreateListing(event) {
    event.preventDefault();
    setBusy("listing");
    const { error: insertError } = await supabase.from("listings").insert({
      seller_id: session.user.id,
      product_name: listingForm.product_name.trim(),
      quantity: Number(listingForm.quantity),
      unit: listingForm.unit.trim(),
      price: Number(listingForm.price),
      expiry_date: listingForm.expiry_date || null,
      location: listingForm.location.trim(),
      notes: listingForm.notes.trim(),
    });
    if (insertError) setError(insertError.message);
    else {
      setListingForm(emptyListing);
      await refreshData();
      setTab("marketplace");
    }
    setBusy("");
  }

  async function handleClaim(listingId) {
    const draft = claimDrafts[listingId] || {};
    setBusy(`claim-${listingId}`);
    try {
      await api(`/listings/${listingId}/claim`, "POST", { quantity_requested: Number(draft.quantity_requested || 1), message: draft.message?.trim() || null });
      setNotice("Claim submitted.");
      await refreshData();
    } catch (e) { setError(e.message); }
    setBusy("");
  }

  const filteredListings = useMemo(() => listings.filter((l) => {
    if (l.status !== "ACTIVE") return false;
    if (filters.location && l.location !== filters.location) return false;
    if (!filters.query.trim()) return true;
    return `${l.product_name} ${l.profiles?.business_name || ""}`.toLowerCase().includes(filters.query.toLowerCase());
  }), [filters, listings]);

  const locationOptions = useMemo(() => Array.from(new Set(listings.map((l) => l.location).filter(Boolean))), [listings]);
  const sellerClaims = claims.filter((c) => c.listings?.seller_id === session?.user?.id);
  const myTransactions = transactions.filter((tx) => tx.seller_id === session?.user?.id || tx.buyer_id === session?.user?.id);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <Routes>
      <Route path="/" element={<Landing session={session} onLanguage={() => i18n.changeLanguage(i18n.language === "en" ? "ar" : "en")} onSignOut={signOut} />} />
      <Route
        path="/auth"
        element={
          !authReady ? (
            <AuthLoadingPage />
          ) : session?.user ? (
            <Navigate to={needsProfileCompletion ? "/complete-profile" : "/app"} replace />
          ) : (
            <AuthPage authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} busy={busy} onSubmit={handleAuthSubmit} onGoogle={handleGoogleSignIn} error={error} notice={notice} />
          )
        }
      />
      <Route path="/complete-profile" element={session?.user ? (
        <CompleteProfilePage authForm={authForm} setAuthForm={setAuthForm} busy={busy} onSubmit={handleCompleteProfile} />
      ) : <Navigate to="/auth" replace />} />
      <Route
        path="/app"
        element={
          !authReady || hasOAuthCallbackContext ? (
            <AuthLoadingPage />
          ) : session?.user ? (
            <Dashboard
              profile={profile}
              loading={loading}
              tab={tab}
              setTab={setTab}
              listings={filteredListings}
              sellerClaims={sellerClaims}
              notifications={notifications}
              myTransactions={myTransactions}
              listingForm={listingForm}
              setListingForm={setListingForm}
              claimDrafts={claimDrafts}
              setClaimDrafts={setClaimDrafts}
              filters={filters}
              setFilters={setFilters}
              locationOptions={locationOptions}
              busy={busy}
              onCreateListing={handleCreateListing}
              onClaim={handleClaim}
              onAcceptClaim={(id) => api(`/claims/${id}/accept`).then(refreshData).catch((e) => setError(e.message))}
              onDeclineClaim={(id) => supabase.from("claims").update({ status: "DECLINED" }).eq("id", id).then(refreshData)}
              onConfirmDelivery={(id) => api(`/transactions/${id}/confirm`).then(refreshData).catch((e) => setError(e.message))}
              onSignOut={signOut}
              clearFilters={() => setFilters({ query: "", location: "" })}
            />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
    </Routes>
  );
}

function AuthLoadingPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-3xl bg-white p-8 text-center shadow-panel">
        <p className="text-lg font-semibold text-brand-navy">Completing sign-in...</p>
      </div>
    </div>
  );
}

function Landing({ session, onLanguage, onSignOut }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
        <img src="/retail-bridge-logo.png" alt="Retail Bridge" className="h-10 w-auto sm:h-12" />
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={onLanguage}>AR/EN</button>
          {session?.user ? <button className="rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-white" onClick={onSignOut}>Sign out</button> : <>
            <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" to="/auth">Sign in</Link>
            <Link className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white" to="/auth?mode=signup">Get started</Link>
          </>}
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 pb-14 pt-6 lg:grid-cols-2 lg:items-center">
        <div>
          <h1 className="text-4xl font-bold leading-tight text-brand-navy sm:text-5xl">Move surplus food inventory with confidence.</h1>
          <p className="mt-4 text-base leading-7 text-brand-grey">Retail Bridge connects merchants with excess stock to verified buyers, with claim workflows, transaction tracking, and bilingual operations built in.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/auth?mode=signup" className="rounded-full bg-brand-orange px-5 py-3 font-semibold text-white">Create merchant account</Link>
            <Link to="/app" className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-brand-navy">Browse marketplace</Link>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-panel">
          <div className="grid gap-3 sm:grid-cols-2">
            {["Live marketplace listings", "Claims and accept/decline flow", "Dual delivery confirmation", "Arabic + English interface"].map((item) => (
              <div key={item} className="rounded-2xl bg-slate-50 p-4 font-semibold text-brand-navy">{item}</div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function AuthPage({ authMode, setAuthMode, authForm, setAuthForm, busy, onSubmit, onGoogle, error, notice }) {
  const location = useLocation();
  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode === "signup") setAuthMode("signup");
  }, [location.search, setAuthMode]);

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-3xl bg-white p-6 shadow-panel">
        <h1 className="text-3xl font-bold text-brand-navy">{authMode === "signup" ? "Create account" : authMode === "reset" ? "Reset password" : "Sign in"}</h1>
        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <Field label="Email" value={authForm.email} onChange={(v) => setAuthForm((c) => ({ ...c, email: v }))} type="email" />
          {authMode !== "reset" ? <Field label="Password" value={authForm.password} onChange={(v) => setAuthForm((c) => ({ ...c, password: v }))} type="password" /> : null}
          {authMode === "signup" ? <>
            <Field label="Business name" value={authForm.business_name} onChange={(v) => setAuthForm((c) => ({ ...c, business_name: v }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City" value={authForm.city} onChange={(v) => setAuthForm((c) => ({ ...c, city: v }))} />
              <Field label="Phone" value={authForm.phone} onChange={(v) => setAuthForm((c) => ({ ...c, phone: v }))} />
            </div>
          </> : null}
          <button className="w-full rounded-2xl bg-brand-orange px-4 py-3 font-semibold text-white" disabled={busy === "auth"}>{busy === "auth" ? "Loading..." : authMode === "signup" ? "Create account" : authMode === "reset" ? "Send reset link" : "Sign in"}</button>
        </form>
        <button className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 font-semibold" onClick={onGoogle} disabled={busy === "google"}>{busy === "google" ? "Loading..." : "Continue with Google"}</button>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <button className="underline" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Sign in" : "Create account"}</button>
          <button className="underline" onClick={() => setAuthMode("reset")}>Reset password</button>
        </div>
        {notice ? <p className="mt-4 text-sm font-semibold text-emerald-600">{notice}</p> : null}
        {error ? <p className="mt-4 text-sm font-semibold text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}

function CompleteProfilePage({ authForm, setAuthForm, busy, onSubmit }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-3xl bg-white p-6 shadow-panel">
        <h1 className="text-3xl font-bold text-brand-navy">Finish your account</h1>
        <p className="mt-2 text-brand-grey">Complete your business details before entering the platform.</p>
        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <Field label="Business name" value={authForm.business_name} onChange={(v) => setAuthForm((c) => ({ ...c, business_name: v }))} />
          <Field label="City" value={authForm.city} onChange={(v) => setAuthForm((c) => ({ ...c, city: v }))} />
          <Field label="Phone" value={authForm.phone} onChange={(v) => setAuthForm((c) => ({ ...c, phone: v }))} />
          <button className="w-full rounded-2xl bg-brand-navy px-4 py-3 font-semibold text-white" disabled={busy === "profile"}>{busy === "profile" ? "Saving..." : "Save and continue"}</button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({
  profile, loading, tab, setTab, listings, sellerClaims, notifications, myTransactions, listingForm, setListingForm, claimDrafts, setClaimDrafts, filters, setFilters, locationOptions, busy, onCreateListing, onClaim, onAcceptClaim, onDeclineClaim, onConfirmDelivery, onSignOut, clearFilters,
}) {
  const menu = [
    { id: "marketplace", label: "Marketplace", icon: Package },
    { id: "orders", label: "Orders", icon: ShoppingCart },
    { id: "transactions", label: "Transactions", icon: Handshake },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <img src="/retail-bridge-logo.png" alt="Retail Bridge" className="h-10 w-auto" />
        <button className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white" onClick={onSignOut}>Sign out</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl bg-brand-navy p-3 text-white">
          {menu.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`mb-2 flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm font-semibold ${tab === id ? "bg-brand-orange text-white" : "bg-white/10 text-white/90"}`} onClick={() => setTab(id)}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </aside>
        <main className="space-y-4">
          {tab === "marketplace" ? (
            <section className="rounded-3xl bg-white p-4 shadow-panel sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Search" value={filters.query} onChange={(v) => setFilters((c) => ({ ...c, query: v }))} />
                <SelectField label="Location" value={filters.location} onChange={(v) => setFilters((c) => ({ ...c, location: v }))} options={[{ label: "All locations", value: "" }, ...locationOptions.map((i) => ({ label: i, value: i }))]} />
                <button className="rounded-2xl border border-slate-300 px-4 py-3 font-semibold lg:col-span-2" onClick={clearFilters}>Clear filters</button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {loading ? <p>Loading...</p> : listings.map((listing) => (
                  <motion.div key={listing.id} whileHover={{ y: -3 }} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between">
                      <div><h3 className="text-lg font-bold">{listing.product_name}</h3><p className="text-sm text-brand-grey">{listing.profiles?.business_name}</p></div>
                      <StatusBadge status={listing.status} />
                    </div>
                    <p className="mt-2 text-sm text-brand-grey">{listing.quantity} {listing.unit} • ${listing.price}</p>
                    {listing.seller_id !== profile?.id ? <div className="mt-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Qty" value={claimDrafts[listing.id]?.quantity_requested || ""} onChange={(v) => setClaimDrafts((c) => ({ ...c, [listing.id]: { ...c[listing.id], quantity_requested: v } }))} type="number" />
                        <Field label="Message" value={claimDrafts[listing.id]?.message || ""} onChange={(v) => setClaimDrafts((c) => ({ ...c, [listing.id]: { ...c[listing.id], message: v } }))} />
                      </div>
                      <button className="mt-2 w-full rounded-2xl bg-brand-orange px-4 py-2 font-semibold text-white" onClick={() => onClaim(listing.id)} disabled={busy === `claim-${listing.id}`}>Claim</button>
                    </div> : null}
                  </motion.div>
                ))}
              </div>
            </section>
          ) : null}

          {tab === "orders" ? <section className="rounded-3xl bg-white p-6 shadow-panel space-y-3">
            <h2 className="text-2xl font-bold">Incoming claims</h2>
            {sellerClaims.map((claim) => (
              <div key={claim.id} className="rounded-2xl border border-slate-100 p-4">
                <p className="font-semibold">{claim.listings?.product_name}</p>
                <p className="text-sm text-brand-grey">{claim.profiles?.business_name} • {claim.quantity_requested} {claim.listings?.unit}</p>
                {claim.status === "PENDING" ? <div className="mt-3 flex gap-2">
                  <button className="rounded-xl bg-brand-navy px-3 py-2 text-sm font-semibold text-white" onClick={() => onAcceptClaim(claim.id)}>Accept</button>
                  <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => onDeclineClaim(claim.id)}>Decline</button>
                </div> : <StatusBadge status={claim.status} />}
              </div>
            ))}
          </section> : null}

          {tab === "transactions" ? <section className="rounded-3xl bg-white p-6 shadow-panel space-y-3">
            <h2 className="text-2xl font-bold">Transactions</h2>
            {myTransactions.map((tx) => (
              <div key={tx.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between"><p className="font-semibold">{tx.listings?.product_name}</p><StatusBadge status={tx.status} /></div>
                <p className="text-sm text-brand-grey">{tx.quantity} units • ${tx.total_price}</p>
                {tx.status !== "COMPLETED" ? <button className="mt-2 rounded-xl bg-brand-orange px-3 py-2 text-sm font-semibold text-white" onClick={() => onConfirmDelivery(tx.id)}>Confirm delivery</button> : null}
              </div>
            ))}
          </section> : null}

          {tab === "notifications" ? <section className="rounded-3xl bg-white p-6 shadow-panel space-y-3">
            <h2 className="text-2xl font-bold">Notifications</h2>
            {notifications.map((n) => <div key={n.id} className="rounded-2xl border border-slate-100 p-4"><p className="font-semibold">{n.title}</p><p className="text-sm text-brand-grey">{n.message}</p></div>)}
          </section> : null}

          {tab === "profile" ? <section className="rounded-3xl bg-white p-6 shadow-panel">
            <h2 className="text-2xl font-bold">Create listing</h2>
            <form className="mt-4 space-y-3" onSubmit={onCreateListing}>
              <Field label="Product name" value={listingForm.product_name} onChange={(v) => setListingForm((c) => ({ ...c, product_name: v }))} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Quantity" value={listingForm.quantity} onChange={(v) => setListingForm((c) => ({ ...c, quantity: v }))} type="number" />
                <Field label="Unit" value={listingForm.unit} onChange={(v) => setListingForm((c) => ({ ...c, unit: v }))} />
                <Field label="Price" value={listingForm.price} onChange={(v) => setListingForm((c) => ({ ...c, price: v }))} type="number" />
              </div>
              <Field label="Location" value={listingForm.location} onChange={(v) => setListingForm((c) => ({ ...c, location: v }))} />
              <Field label="Notes" value={listingForm.notes} onChange={(v) => setListingForm((c) => ({ ...c, notes: v }))} as="textarea" />
              <button className="w-full rounded-2xl bg-brand-navy px-4 py-3 font-semibold text-white" disabled={busy === "listing"}>{busy === "listing" ? "Saving..." : "Post listing"}</button>
            </form>
          </section> : null}
        </main>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", as = "input" }) {
  const fieldId = `field-${String(label).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <label className="block" htmlFor={fieldId}>
      <span className="mb-2 block text-sm font-semibold text-brand-grey">{label}</span>
      {as === "textarea" ? (
        <textarea id={fieldId} name={fieldId} value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-brand-orange" />
      ) : (
        <input id={fieldId} name={fieldId} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-brand-orange" />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  const fieldId = `field-${String(label).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <label className="block" htmlFor={fieldId}>
      <span className="mb-2 block text-sm font-semibold text-brand-grey">{label}</span>
      <select id={fieldId} name={fieldId} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-brand-orange">
        {options.map((opt) => <option key={`${label}-${opt.value}`} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}

function StatusBadge({ status }) {
  const tones = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    PENDING: "bg-amber-100 text-amber-700",
    CLOSED: "bg-slate-200 text-slate-600",
    ACCEPTED: "bg-emerald-100 text-emerald-700",
    DECLINED: "bg-rose-100 text-rose-700",
    COMPLETED: "bg-brand-navy text-white",
    SELLER_CONFIRMED: "bg-orange-100 text-brand-orange",
    BUYER_CONFIRMED: "bg-sky-100 text-sky-700",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tones[status] || "bg-slate-100 text-slate-700"}`}>{status}</span>;
}

export default App;
