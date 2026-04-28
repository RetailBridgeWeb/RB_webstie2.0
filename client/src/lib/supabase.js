import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY – " +
    "Supabase features will be unavailable. " +
    "Set these in your GitHub repository secrets for full functionality."
  );
}

// true when Supabase credentials are missing – the app renders in demo mode.
export const isDemo = !supabaseUrl || !supabaseAnonKey;

// Create a real client when credentials exist, otherwise a lightweight stub
// so the app can still render landing/marketing pages.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createStubClient();

function createStubClient() {
  const noop = () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } });
  const noopSingle = () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } });
  const chainable = () => ({ select: chainable, eq: chainable, order: chainable, maybeSingle: noopSingle, then: noop().then.bind(noop()) });
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: noop,
      onAuthStateChange: (_cb) => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: noop,
      signInWithPassword: noop,
      signInWithOAuth: noop,
      signOut: () => Promise.resolve({}),
      resetPasswordForEmail: noop,
    },
    from: () => chainable(),
  };
}

