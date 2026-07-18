// ============================================================
// Initializes and exposes a single shared Supabase client
// instance for the whole app to use.
// ============================================================

// `supabase` here refers to the global object created by the
// Supabase JS CDN script (window.supabase). We use it once to
// create our client, then rename our own variable so later files
// can just call `supabaseClient.from(...)`, `supabaseClient.auth...`, etc.
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
