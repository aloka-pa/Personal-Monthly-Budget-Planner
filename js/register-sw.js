// ============================================================
// register-sw.js - registers service-worker.js when supported.
// Included on every page; relative path keeps it working when
// the app is served from a sub-path (e.g. GitHub Pages).
// ============================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
