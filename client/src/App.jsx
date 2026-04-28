import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Bell,
  ChartBar,
  ChevronDown,
  Handshake,
  Headset,
  Menu,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCircle,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
const emptyListing = { product_name: "", quantity: "", unit: "kg", price: "", expiry_date: "", location: "", notes: "" };

const seededInventory = [
  { product: "عصير برتقال", status: "SURPLUS", quantity: 120 },
  { product: "مياه معدنية", status: "SHORTAGE", quantity: 35 },
  { product: "زيت نخيل", status: "NORMAL", quantity: 78 },
  { product: "أرز بسمتي", status: "SURPLUS", quantity: 95 },
];

const seededMerchants = [
  { name: "مؤسسة الخير الغذائية", email: "khair@example.com", status: "نشط", joined: "2026-02-10" },
  { name: "أسواق الروضة", email: "rawda@example.com", status: "نشط", joined: "2026-01-22" },
  { name: "شركة النسيم التجارية", email: "naseem@example.com", status: "قيد المراجعة", joined: "2026-03-03" },
  { name: "توزيع البركة", email: "baraka@example.com", status: "نشط", joined: "2025-12-30" },
  { name: "متاجر الندى", email: "nada@example.com", status: "نشط", joined: "2026-03-19" },
];

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
  const [filters, setFilters] = useState({ query: "", location: "", category: "", layer: "" });

  const isArabic = i18n.language === "ar";
  const needsProfileCompletion = session?.user && profile && (profile.business_name === "Unknown Business" || profile.city === "Unknown City");
  const callbackParams = new URLSearchParams(location.search);
  const hasOAuthCallbackContext = Boolean(window.location.hash) || callbackParams.has("code") || callbackParams.has("error") || callbackParams.has("access_token");

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
  }, [i18n.language, isArabic]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const currentSession = data.session ?? null;
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
      supabase.from("transactions").select("id,status,quantity,total_price,seller_id,buyer_id,created_at,seller_confirmed_at,buyer_confirmed_at,listings(product_name)").order("created_at", { ascending: false }),
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
      else setNotice(t("resetSent"));
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
      else setNotice(t("accountCreated"));
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
      else navigate("/dashboard");
    }
    setBusy("");
  }

  async function handleGoogleSignIn() {
    setBusy("google");
    setError("");
    const { error: googleError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${APP_URL}/dashboard` } });
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
      navigate("/dashboard");
    }
    setBusy("");
  }

  async function handleCreateListing(event) {
    event.preventDefault();
    if (!session?.user) return;
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
      setNotice(t("listingPosted"));
      setListingForm(emptyListing);
      await refreshData();
    }
    setBusy("");
  }

  async function handleClaim(listingId) {
    const draft = claimDrafts[listingId] || {};
    setBusy(`claim-${listingId}`);
    try {
      await api(`/listings/${listingId}/claim`, "POST", { quantity_requested: Number(draft.quantity_requested || 1), message: draft.message?.trim() || null });
      setNotice(t("claimSubmitted"));
      await refreshData();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
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
  const liquidityUnlocked = myTransactions.reduce((sum, tx) => sum + Number(tx.total_price || 0), 0);

  const sharedProps = {
    t,
    session,
    profile,
    onLanguage: () => i18n.changeLanguage(i18n.language === "en" ? "ar" : "en"),
    onSignOut: signOut,
  };

  return (
    <Routes>
      <Route path="/" element={<SiteLayout {...sharedProps}><LandingPage t={t} /></SiteLayout>} />
      <Route path="/marketplace" element={<SiteLayout {...sharedProps}><MarketplacePage t={t} listings={filteredListings} profile={profile} claimDrafts={claimDrafts} setClaimDrafts={setClaimDrafts} onClaim={handleClaim} busy={busy} filters={filters} setFilters={setFilters} locationOptions={locationOptions} loading={loading} /></SiteLayout>} />
      <Route path="/dashboard" element={!authReady || hasOAuthCallbackContext ? <AuthLoadingPage t={t} /> : session?.user ? <SiteLayout {...sharedProps}><DashboardPage t={t} listings={filteredListings} myTransactions={myTransactions} liquidityUnlocked={liquidityUnlocked} notifications={notifications} /></SiteLayout> : <Navigate to="/auth" replace />} />
      <Route path="/admin" element={!authReady || hasOAuthCallbackContext ? <AuthLoadingPage t={t} /> : session?.user ? (profile?.role === "ADMIN" ? <SiteLayout {...sharedProps}><AdminPage t={t} listings={listings} tx={transactions} /></SiteLayout> : <Navigate to="/dashboard" replace />) : <Navigate to="/auth" replace />} />
      <Route path="/profile" element={!authReady || hasOAuthCallbackContext ? <AuthLoadingPage t={t} /> : session?.user ? <SiteLayout {...sharedProps}><ProfilePage t={t} profile={profile} tx={myTransactions} /></SiteLayout> : <Navigate to="/auth" replace />} />
      <Route path="/app" element={<Navigate to="/dashboard" replace />} />
      <Route path="/auth" element={!authReady ? <AuthLoadingPage t={t} /> : session?.user ? <Navigate to={needsProfileCompletion ? "/complete-profile" : "/dashboard"} replace /> : <SiteLayout {...sharedProps}><AuthPage t={t} authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} busy={busy} onSubmit={handleAuthSubmit} onGoogle={handleGoogleSignIn} error={error} notice={notice} /></SiteLayout>} />
      <Route path="/complete-profile" element={session?.user ? <SiteLayout {...sharedProps}><CompleteProfilePage t={t} authForm={authForm} setAuthForm={setAuthForm} busy={busy} onSubmit={handleCompleteProfile} /></SiteLayout> : <Navigate to="/auth" replace />} />
      <Route path="/legacy-dashboard" element={!authReady || hasOAuthCallbackContext ? <AuthLoadingPage t={t} /> : session?.user ? <SiteLayout {...sharedProps}><LegacyOps t={t} profile={profile} sellerClaims={sellerClaims} myTransactions={myTransactions} listingForm={listingForm} setListingForm={setListingForm} onCreateListing={handleCreateListing} onAcceptClaim={(id) => api(`/claims/${id}/accept`).then(refreshData).catch((e) => setError(e.message))} onDeclineClaim={(id) => supabase.from("claims").update({ status: "DECLINED" }).eq("id", id).then(refreshData)} onConfirmDelivery={(id) => api(`/transactions/${id}/confirm`).then(refreshData).catch((e) => setError(e.message))} /></SiteLayout> : <Navigate to="/auth" replace />} />
    </Routes>
  );
}

function SiteLayout({ t, session, profile, onSignOut, onLanguage, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = profile?.role === "ADMIN";
  const navItems = [
    { to: "/", label: t("home") },
    { to: "/dashboard", label: t("dashboard") },
    { to: "/marketplace", label: t("marketplace") },
    { to: "/profile", label: t("profile") },
    ...(isAdmin ? [{ to: "/admin", label: t("adminPanel") }] : []),
  ];
  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-40 border-b border-brand-border bg-white/95 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/retail-bridge-logo.png" alt="Retail Bridge" className="h-9 w-auto sm:h-10" />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex">
            {navItems.map((item) => <Link key={item.to} className="text-sm font-semibold text-brand-grey hover:text-brand-navy" to={item.to}>{item.label}</Link>)}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <button className="rounded-full border border-brand-navy px-3 py-2 text-xs font-semibold text-brand-navy" onClick={onLanguage}>AR / EN</button>
            {session?.user ? <button className="rounded-full bg-brand-orange px-4 py-2 text-xs font-semibold text-white" onClick={onSignOut}>{t("signOut")}</button> : <Link to="/auth?mode=signup" className="rounded-full bg-brand-orange px-4 py-2 text-xs font-semibold text-white">{t("startNow")}</Link>}
          </div>
          <button className="rounded-xl border border-brand-border p-2 lg:hidden" onClick={() => setMobileOpen((s) => !s)}>{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {mobileOpen ? (
          <div className="brand-pattern border-t border-brand-border bg-white p-3 lg:hidden">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => <Link key={item.to} className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-navy" to={item.to} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}
              <button className="rounded-xl border border-brand-navy px-3 py-2 text-sm font-semibold text-brand-navy" onClick={onLanguage}>AR / EN</button>
            </div>
          </div>
        ) : null}
      </header>
      {children}
      <footer className="mt-12 border-t border-brand-border bg-brand-navy text-white">
        <div className="grid w-full gap-5 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <img src="/retail-bridge-logo.png" alt="Retail Bridge" className="h-10 w-auto" />
            <p className="mt-2 text-sm text-white/75">{t("taglineAr")}</p>
            <p className="text-sm text-white/75">{t("tagline")}</p>
          </div>
          <div>
            <p className="text-sm font-bold">{t("quickLinks")}</p>
            <div className="mt-2 flex flex-col gap-1 text-sm text-white/75">
              <Link to="/">{t("home")}</Link>
              <Link to="/dashboard">{t("dashboard")}</Link>
              <Link to="/marketplace">{t("marketplace")}</Link>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold">{t("contactInfo")}</p>
            <p className="mt-2 text-sm text-white/75">info@retailbridge.tech</p>
            <p className="text-sm text-white/75">+966 5X XXX XXXX</p>
          </div>
          <div>
            <p className="text-sm font-bold">{t("copyright")}</p>
            <p className="mt-2 text-sm text-white/75">{new Date().getFullYear()} Retail Bridge</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LandingPage({ t }) {
  const layers = [
    { title: t("layer1"), distance: "3-10 km", time: t("withinHours"), volume: t("smallVolume") },
    { title: t("layer2"), distance: "10-50 km", time: t("withinDay"), volume: t("mediumVolume") },
    { title: t("layer3"), distance: "+50 km", time: t("intercity"), volume: t("largeVolume") },
  ];
  return (
    <main className="w-full">
      <section className="relative min-h-[76vh] w-full overflow-hidden bg-brand-navy px-4 py-16 text-white sm:px-8">
        <div className="hero-grid" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-orange-200">{t("tagline")}</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">{t("heroTitleAr")}</h1>
            <p className="mt-4 text-base leading-8 text-white/85">{t("heroSub")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/auth?mode=signup" className="rounded-full bg-brand-orange px-6 py-3 text-sm font-bold">{t("startNow")}</Link>
              <Link to="/marketplace" className="rounded-full border border-white/80 px-6 py-3 text-sm font-bold">{t("learnPlatform")}</Link>
            </div>
          </div>
          <img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1600" alt="warehouse" className="h-72 w-full rounded-xl3 object-cover shadow-panel sm:h-96" />
        </div>
      </section>

      <FadeSection className="grid w-full gap-4 px-4 py-10 sm:grid-cols-2 sm:px-8">
        <Card title={t("shortage")} text={t("shortageDesc")} />
        <Card title={t("surplus")} text={t("surplusDesc")} />
      </FadeSection>

      <FadeSection className="brand-pattern w-full px-4 py-10 sm:px-8">
        <h2 className="text-2xl font-bold text-brand-navy">{t("howPhasesWork")}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card title={t("phase1")} text={t("phase1Desc")} icon={Truck} />
          <Card title={t("phase2")} text={t("phase2Desc")} icon={ChartBar} />
        </div>
      </FadeSection>

      <FadeSection className="w-full px-4 py-10 sm:px-8">
        <h2 className="text-2xl font-bold text-brand-navy">{t("geoLayers")}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {layers.map((layer) => <Card key={layer.title} title={layer.title} text={`${layer.distance} • ${layer.time} • ${layer.volume}`} />)}
        </div>
      </FadeSection>

      <FadeSection className="w-full px-4 py-10 sm:px-8">
        <h2 className="text-2xl font-bold text-brand-navy">{t("revenueModel")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card title={t("monthlySub")} text={t("monthlySubDesc")} />
          <Card title={t("exchangeCommission")} text={t("exchangeCommissionDesc")} />
        </div>
      </FadeSection>

      <FadeSection className="brand-pattern w-full px-4 py-10 sm:px-8">
        <h2 className="text-2xl font-bold text-brand-navy">{t("practicalExample")}</h2>
        <p className="mt-3 rounded-xl2 border border-brand-border bg-white p-4 text-sm leading-8 text-brand-grey">{t("practicalExampleDesc")}</p>
      </FadeSection>

      <FadeSection className="w-full px-4 py-10 sm:px-8">
        <h2 className="text-2xl font-bold text-brand-navy">{t("brandEssence")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[t("reliable"), t("efficient"), t("dynamic"), t("trustworthy")].map((v) => <Card key={v} title={v} text={t("valueCardDesc")} />)}
        </div>
      </FadeSection>

      <section className="w-full bg-brand-orange px-4 py-10 text-white sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-2xl font-bold">{t("ctaFooterTitle")}</h3>
          <Link to="/auth?mode=signup" className="rounded-full bg-white px-6 py-3 text-sm font-bold text-brand-orange">{t("startNow")}</Link>
        </div>
      </section>
    </main>
  );
}

function DashboardPage({ t, listings, myTransactions, liquidityUnlocked, notifications }) {
  const shortage = seededInventory.filter((item) => item.status === "SHORTAGE").reduce((s, item) => s + item.quantity, 0);
  const surplus = seededInventory.filter((item) => item.status === "SURPLUS").reduce((s, item) => s + item.quantity, 0);
  const chartData = [28, 35, 42, 39, 49, 58, 64];
  return (
    <main className="w-full px-4 py-6 sm:px-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("surplusUnits")} value={surplus} />
        <StatCard title={t("shortageUnits")} value={shortage} />
        <StatCard title={t("todayTransactions")} value={myTransactions.length} />
        <StatCard title={t("liquidityUnlocked")} value={`SAR ${Math.round(liquidityUnlocked)}`} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
          <h3 className="text-xl font-bold text-brand-navy">{t("smartInventory")}</h3>
          <table className="premium-table mt-3">
            <thead><tr><th>{t("productName")}</th><th>{t("status")}</th><th>{t("quantity")}</th></tr></thead>
            <tbody>
              {seededInventory.map((row) => (
                <tr key={row.product}>
                  <td>{row.product}</td>
                  <td><InventoryBadge status={row.status} /></td>
                  <td>{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <Card title={t("proactiveAlert")} text={t("alertText")} icon={Bell} />
          <div className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
            <h3 className="text-sm font-bold text-brand-navy">{t("weeklyForecast")}</h3>
            <div className="mt-4 flex h-32 items-end gap-2">
              {chartData.map((val) => <div key={val} className="flex-1 rounded-t bg-brand-orange/80" style={{ height: `${val}%` }} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
        <h3 className="text-xl font-bold text-brand-navy">{t("recentActivity")}</h3>
        <div className="mt-3 space-y-2">
          {(notifications.slice(0, 5)).map((item) => (
            <div key={item.id} className="rounded-xl2 bg-brand-soft px-3 py-2 text-sm text-brand-grey">{item.title} - {item.message}</div>
          ))}
          {notifications.length === 0 ? <p className="text-sm text-brand-grey">{t("noData")}</p> : null}
        </div>
      </section>
    </main>
  );
}

function MarketplacePage({ t, listings, profile, claimDrafts, setClaimDrafts, onClaim, busy, filters, setFilters, locationOptions, loading }) {
  const seededCards = [
    { id: "s1", product_name: "عصير برتقال", quantity: 50, unit: "كرتون", price: 120, location: "حي الروضة", distance: "4 كم" },
    { id: "s2", product_name: "أرز بسمتي", quantity: 30, unit: "كيس", price: 90, location: "حي النسيم", distance: "7 كم" },
  ];
  const displayListings = listings.length ? listings : seededCards;
  return (
    <main className="w-full px-4 py-6 sm:px-8">
      <section className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t("category")} value={filters.category || ""} onChange={(v) => setFilters((c) => ({ ...c, category: v }))} />
          <SelectField label={t("region")} value={filters.location} onChange={(v) => setFilters((c) => ({ ...c, location: v }))} options={[{ label: t("allLocations"), value: "" }, ...locationOptions.map((item) => ({ label: item, value: item }))]} />
          <SelectField label={t("geoLayer")} value={filters.layer || ""} onChange={(v) => setFilters((c) => ({ ...c, layer: v }))} options={[{ label: t("allLayers"), value: "" }, { label: t("layer1"), value: "1" }, { label: t("layer2"), value: "2" }, { label: t("layer3"), value: "3" }]} />
          <Field label={t("price")} value={filters.query} onChange={(v) => setFilters((c) => ({ ...c, query: v }))} />
        </div>
      </section>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? <p>{t("loading")}</p> : displayListings.map((listing) => (
          <motion.div key={listing.id} whileHover={{ y: -4 }} className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
            <p className="text-lg font-bold text-brand-navy">{listing.product_name}</p>
            <p className="mt-1 text-sm text-brand-grey">{listing.quantity} {listing.unit} • {listing.location}</p>
            <p className="mt-1 text-sm font-semibold text-brand-orange">SAR {listing.price}</p>
            <div className="mt-2 inline-flex rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-bold text-brand-navy">{listing.distance || "4 كم"}</div>
            {listing.seller_id !== profile?.id ? (
              <>
                <div className="mt-3 grid gap-2">
                  <Field label={t("quantityRequested")} value={claimDrafts[listing.id]?.quantity_requested || ""} onChange={(v) => setClaimDrafts((c) => ({ ...c, [listing.id]: { ...c[listing.id], quantity_requested: v } }))} type="number" />
                </div>
                <button className="mt-3 w-full rounded-2xl bg-brand-orange px-4 py-2 text-sm font-semibold text-white" onClick={() => onClaim(listing.id)} disabled={busy === `claim-${listing.id}`}>{t("reserveNow")}</button>
              </>
            ) : null}
          </motion.div>
        ))}
      </section>
    </main>
  );
}

function AdminPage({ t, listings, tx }) {
  const totalLiquidity = tx.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const merchantCount = new Set((listings || []).map((item) => item.seller_id)).size || seededMerchants.length;
  const rows = tx.length ? tx.slice(0, 12).map((item, i) => ({ id: i + 1, product: item.listings?.product_name || "منتج", value: item.total_price || 0, date: item.created_at?.slice(0, 10) || "-" })) : Array.from({ length: 10 }, (_, i) => ({ id: i + 1, product: `عصير برتقال ${i + 1}`, value: 100 + i * 8, date: `2026-04-${String(i + 10).padStart(2, "0")}` }));
  return (
    <main className="w-full px-4 py-6 sm:px-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard title={t("totalTransactions")} value={rows.length} />
        <StatCard title={t("totalLiquidity")} value={`SAR ${Math.round(totalLiquidity || 14890)}`} />
        <StatCard title={t("activeMerchants")} value={merchantCount} />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
          <h3 className="text-lg font-bold text-brand-navy">{t("merchantManagement")}</h3>
          <table className="premium-table mt-3">
            <thead><tr><th>{t("businessName")}</th><th>{t("email")}</th><th>{t("status")}</th><th>{t("joinDate")}</th></tr></thead>
            <tbody>
              {seededMerchants.map((m) => <tr key={m.email}><td>{m.name}</td><td>{m.email}</td><td>{m.status}</td><td>{m.joined}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
          <h3 className="text-lg font-bold text-brand-navy">{t("transactionsLog")}</h3>
          <table className="premium-table mt-3">
            <thead><tr><th>#</th><th>{t("productName")}</th><th>{t("totalPrice")}</th><th>{t("date")}</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.product}</td><td>SAR {r.value}</td><td>{r.date}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function ProfilePage({ t, profile, tx }) {
  const totalValue = tx.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  return (
    <main className="w-full px-4 py-6 sm:px-8">
      <section className="rounded-xl3 border border-brand-border bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-brand-navy"><UserCircle size={42} /></div>
          <div>
            <h2 className="text-2xl font-bold text-brand-navy">{profile?.business_name || "—"}</h2>
            <p className="text-sm text-brand-grey">{profile?.city || "-"}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title={t("email")} text={profile?.email || "merchant@retailbridge.tech"} />
          <Card title={t("membership")} text="Basic" />
          <Card title={t("joinDate")} text={profile?.created_at?.slice(0, 10) || "2026-01-01"} />
          <Card title={t("totalExchanges")} text={`${tx.length}`} />
        </div>
        <div className="mt-4 rounded-xl2 bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-navy">{t("totalValue")} : SAR {Math.round(totalValue)}</div>
      </section>
    </main>
  );
}

function LegacyOps({ t, sellerClaims, myTransactions, listingForm, setListingForm, onCreateListing, onAcceptClaim, onDeclineClaim, onConfirmDelivery }) {
  return (
    <main className="w-full px-4 py-6 sm:px-8">
      <section className="rounded-xl3 border border-brand-border bg-white p-6 shadow-soft">
        <h2 className="text-2xl font-bold text-brand-navy">{t("legacyOps")}</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-bold">{t("pendingClaims")}</h3>
            <div className="mt-3 space-y-3">
              {sellerClaims.map((claim) => <div key={claim.id} className="rounded-xl2 bg-brand-soft p-3"><p>{claim.listings?.product_name}</p><div className="mt-2 flex gap-2"><button className="rounded-xl bg-brand-navy px-3 py-2 text-xs text-white" onClick={() => onAcceptClaim(claim.id)}>{t("accept")}</button><button className="rounded-xl border border-brand-border px-3 py-2 text-xs" onClick={() => onDeclineClaim(claim.id)}>{t("decline")}</button></div></div>)}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold">{t("createListing")}</h3>
            <form className="mt-3 space-y-3" onSubmit={onCreateListing}>
              <Field label={t("productName")} value={listingForm.product_name} onChange={(v) => setListingForm((c) => ({ ...c, product_name: v }))} />
              <Field label={t("quantity")} value={listingForm.quantity} onChange={(v) => setListingForm((c) => ({ ...c, quantity: v }))} type="number" />
              <button className="rounded-xl bg-brand-orange px-4 py-2 text-sm font-semibold text-white">{t("postListing")}</button>
            </form>
          </div>
        </div>
        <div className="mt-5">
          <h3 className="text-lg font-bold">{t("transactions")}</h3>
          <div className="mt-3 space-y-2">{myTransactions.map((tx) => <div key={tx.id} className="rounded-xl2 bg-brand-soft p-3 text-sm"><span>{tx.listings?.product_name}</span><button className="ms-3 rounded-xl bg-brand-orange px-2 py-1 text-white" onClick={() => onConfirmDelivery(tx.id)}>{t("confirmDelivery")}</button></div>)}</div>
        </div>
      </section>
    </main>
  );
}

function AuthLoadingPage({ t }) {
  return (
    <div className="w-full px-4 py-20 sm:px-8">
      <div className="rounded-xl3 border border-brand-border bg-white p-10 text-center shadow-soft">
        <p className="text-xl font-bold text-brand-navy">{t("completingSignIn")}</p>
      </div>
    </div>
  );
}

function AuthPage({ t, authMode, setAuthMode, authForm, setAuthForm, busy, onSubmit, onGoogle, error, notice }) {
  const location = useLocation();
  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode === "signup") setAuthMode("signup");
  }, [location.search, setAuthMode]);
  return (
    <main className="w-full px-4 py-8 sm:px-8">
      <section className="grid gap-5 lg:grid-cols-2">
        <Card title={t("authHeading")} text={t("authSubheading")} />
        <div className="rounded-xl3 border border-brand-border bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-bold text-brand-navy">{authMode === "signup" ? t("signUp") : authMode === "reset" ? t("resetPassword") : t("signIn")}</h2>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <Field label={t("email")} value={authForm.email} onChange={(v) => setAuthForm((c) => ({ ...c, email: v }))} type="email" />
            {authMode !== "reset" ? <Field label={t("password")} value={authForm.password} onChange={(v) => setAuthForm((c) => ({ ...c, password: v }))} type="password" /> : null}
            {authMode === "signup" ? <>
              <Field label={t("businessName")} value={authForm.business_name} onChange={(v) => setAuthForm((c) => ({ ...c, business_name: v }))} />
              <Field label={t("city")} value={authForm.city} onChange={(v) => setAuthForm((c) => ({ ...c, city: v }))} />
            </> : null}
            <button className="w-full rounded-xl bg-brand-orange px-4 py-3 font-semibold text-white">{busy === "auth" ? t("loading") : t("submit")}</button>
          </form>
          <button className="mt-2 w-full rounded-xl border border-brand-navy px-4 py-3 text-sm font-semibold text-brand-navy" onClick={onGoogle}>{t("googleSignIn")}</button>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button className="underline" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? t("signIn") : t("signUp")}</button>
            <button className="underline" onClick={() => setAuthMode("reset")}>{t("resetPassword")}</button>
          </div>
          {notice ? <p className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

function CompleteProfilePage({ t, authForm, setAuthForm, busy, onSubmit }) {
  return (
    <main className="w-full px-4 py-8 sm:px-8">
      <section className="rounded-xl3 border border-brand-border bg-white p-6 shadow-soft">
        <h2 className="text-2xl font-bold text-brand-navy">{t("completeProfileHeading")}</h2>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <Field label={t("businessName")} value={authForm.business_name} onChange={(v) => setAuthForm((c) => ({ ...c, business_name: v }))} />
          <Field label={t("city")} value={authForm.city} onChange={(v) => setAuthForm((c) => ({ ...c, city: v }))} />
          <Field label={t("phone")} value={authForm.phone} onChange={(v) => setAuthForm((c) => ({ ...c, phone: v }))} />
          <button className="rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white">{busy === "profile" ? t("saving") : t("saveAndContinue")}</button>
        </form>
      </section>
    </main>
  );
}

function FadeSection({ children, className }) {
  return <motion.section whileInView={{ opacity: [0, 1], y: [24, 0] }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} className={className}>{children}</motion.section>;
}

function Card({ title, text, icon: Icon }) {
  return (
    <motion.div whileHover={{ y: -4 }} className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft">
      <div className="flex items-start gap-2">
        {Icon ? <Icon size={18} className="mt-1 text-brand-orange" /> : null}
        <div>
          <p className="text-sm font-bold text-brand-navy">{title}</p>
          <p className="mt-1 text-sm leading-7 text-brand-grey">{text}</p>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ title, value }) {
  return <div className="rounded-xl3 border border-brand-border bg-white p-4 shadow-soft"><p className="text-xs font-semibold text-brand-grey">{title}</p><p className="mt-2 text-2xl font-bold text-brand-navy">{value}</p></div>;
}

function Field({ label, value, onChange, type = "text", as = "input" }) {
  const fieldId = `field-${String(label).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <label className="block" htmlFor={fieldId}>
      <span className="mb-2 block text-sm font-semibold text-brand-grey">{label}</span>
      {as === "textarea" ? <textarea id={fieldId} name={fieldId} value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full rounded-2xl border border-brand-border bg-white px-4 py-3 outline-none transition focus:border-brand-orange" /> : <input id={fieldId} name={fieldId} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-brand-border bg-white px-4 py-3 outline-none transition focus:border-brand-orange" />}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  const fieldId = `field-${String(label).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <label className="block" htmlFor={fieldId}>
      <span className="mb-2 block text-sm font-semibold text-brand-grey">{label}</span>
      <div className="relative">
        <select id={fieldId} name={fieldId} value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none rounded-2xl border border-brand-border bg-white px-4 py-3 outline-none transition focus:border-brand-orange">
          {options.map((opt) => <option key={`${label}-${opt.value}`} value={opt.value}>{opt.label}</option>)}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute start-auto end-3 top-1/2 -translate-y-1/2 text-brand-grey" />
      </div>
    </label>
  );
}

function InventoryBadge({ status }) {
  if (status === "SURPLUS") return <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-brand-orange">فائض</span>;
  if (status === "SHORTAGE") return <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">نقص</span>;
  return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">طبيعي</span>;
}

export default App;
