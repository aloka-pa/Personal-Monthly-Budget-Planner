// ============================================================
// currency.js - shared currency preference + formatting helper
// ============================================================
//
// Currency is a one-time, per-user choice stored on
// `profiles.currency`. It's picked the first time the user saves
// their income (see income.js) and never changes after that, so
// every page just needs to read it once and format amounts with
// it. This file must load after supabaseClient.js and before any
// page script that formats money or reads/sets the currency.
// ============================================================

window.SUPPORTED_CURRENCIES = ["LKR", "USD"];

// Explicit symbols instead of Intl's `style: "currency"` - that
// renders USD as "US$" in several locales (e.g. en-GB, en-AU), and
// we always want the plain "$".
const CURRENCY_SYMBOLS = {
  LKR: "LKR ",
  USD: "$",
};

let cachedCurrency = null;

const numberFormatter = new Intl.NumberFormat(undefined, {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Fetches (and caches) the logged-in user's saved currency.
// Returns null if they haven't picked one yet.
window.getUserCurrency = async function getUserCurrency() {
  if (cachedCurrency) return cachedCurrency;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("currency")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load currency preference:", error.message);
    return null;
  }

  cachedCurrency = (data && data.currency) || null;
  return cachedCurrency;
};

// Called right after the user picks their currency for the first
// time, so the rest of the already-loaded page can use it without
// another round trip to Supabase.
window.setCachedCurrency = function setCachedCurrency(currencyCode) {
  cachedCurrency = currencyCode;
};

// Formats an amount in the user's saved currency. Falls back to
// LKR if the currency hasn't loaded yet (e.g. static text shown
// before getUserCurrency() resolves).
window.formatCurrency = function formatCurrency(amount) {
  const currencyCode = cachedCurrency || "LKR";
  const symbol = CURRENCY_SYMBOLS[currencyCode] || `${currencyCode} `;
  return `${symbol}${numberFormatter.format(Number(amount) || 0)}`;
};

// Updates every element carrying a `data-currency-label` template
// (e.g. `data-currency-label="Amount ({cur})"`) or a
// `data-currency-badge` marker with the user's actual currency code,
// once it's known. Static HTML shows "LKR" until this runs.
async function applyCurrencyLabels() {
  const currencyCode = (await window.getUserCurrency()) || "LKR";

  document.querySelectorAll("[data-currency-label]").forEach((el) => {
    el.textContent = el.dataset.currencyLabel.replace("{cur}", currencyCode);
  });

  document.querySelectorAll("[data-currency-badge]").forEach((el) => {
    el.textContent = currencyCode;
  });
}

document.addEventListener("DOMContentLoaded", applyCurrencyLabels);
