import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DEBUG_ENDPOINT = "http://127.0.0.1:7778/ingest/d39bf410-cbce-4861-a70b-151d638381f5";
const DEBUG_SESSION_ID = "770c4f";

// #region agent log
fetch(DEBUG_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": DEBUG_SESSION_ID },
  body: JSON.stringify({
    sessionId: DEBUG_SESSION_ID,
    runId: "run-2",
    hypothesisId: "H6",
    location: "lib/supabase.js:init",
    message: "Supabase env key shape",
    data: {
      hasUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(supabaseAnonKey),
      anonKeyLength: supabaseAnonKey?.length || 0,
      anonKeyStartsWithEy: Boolean(supabaseAnonKey?.startsWith("eyJ")),
      anonKeyHasTemplateSyntax: Boolean(supabaseAnonKey?.includes("${")),
    },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

if (!supabaseUrl || !supabaseAnonKey) {
  // Keeping a visible runtime error here makes missing deployment config obvious in demos.
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
