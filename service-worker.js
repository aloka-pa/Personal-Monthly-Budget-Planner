// ============================================================
// service-worker.js - offline app-shell caching for Wallet Check
// ------------------------------------------------------------
// Cache-first for same-origin static assets (HTML/CSS/JS/images).
// Supabase requests are never intercepted - they always hit the
// network so auth/data stays live and correct.
// ============================================================

const CACHE_NAME = "wallet-check-static-v1";

// Paths are relative to this file's own location so caching still
// works correctly when the site is served from a sub-path (e.g.
// GitHub Pages project sites).
const PRECACHE_ASSETS = [
  "index.html",
  "app.html",
  "budgets.html",
  "dashboard.html",
  "financial-goals.html",
  "financial-health-guide.html",
  "financial-planner.html",
  "manifest.json",
  "config.js",
  "css/styles.css",
  "css/calculator.css",
  "css/spending-streaks.css",
  "css/goal-progress.css",
  "css/header-utilities.css",
  "css/pages/financial-goals.css",
  "css/pages/financial-planner.css",
  "css/pages/expenses.css",
  "css/pages/financialHealthGuide.css",
  "css/pages/financial-health-score.css",
  "js/supabaseClient.js",
  "js/profile.js",
  "js/layout.js",
  "js/dashboard.js",
  "js/currency.js",
  "js/income.js",
  "js/calculator.js",
  "js/financial-planner.js",
  "js/theme.js",
  "js/expenses.js",
  "js/budgets.js",
  "js/spending-streaks.js",
  "js/financial-goals.js",
  "js/goal-progress.js",
  "js/sidebar.js",
  "js/header-utilities.js",
  "js/financial-health-score.js",
  "js/auth.js",
  "js/register-sw.js",
  "images/wallet2.svg",
  "images/icon-192.png",
  "images/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle simple same-origin GET requests; let everything
  // else (POST/PUT, CDN scripts, browser extensions, etc.) fall
  // through to normal network handling untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase calls (auth + REST/API) must always go to the network -
  // never serve them from cache and never intercept them.
  if (url.hostname.endsWith(".supabase.co")) return;

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((networkResponse) => {
        const responseToCache = networkResponse.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, responseToCache));
        return networkResponse;
      });
    })
  );
});
