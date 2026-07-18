// ============================================================
// auth.js - authentication logic (login, register, logout,
// session checks/redirects)
// ============================================================
//
// This file is included on EVERY page (index.html, app.html,
// dashboard.html) so it does two jobs:
//   1. On every page load, check whether the user has an active
//      Supabase session and redirect accordingly.
//   2. On index.html only, wire up the login/register forms and
//      the toggle links between them.
//
// SESSION PERSISTENCE EXPLANATION:
// By default, supabase-js stores the session (access token +
// refresh token) in the browser's localStorage. That means once
// a user logs in, closing the tab or refreshing the page will NOT
// log them out - `supabaseClient.auth.getSession()` will return
// the still-valid (or auto-refreshed) session on the next load.
// Logging out explicitly clears that stored session.
// ============================================================

const AUTH_PAGES = {
  LOGIN: "index.html",
  APP: "app.html",
  DASHBOARD: "dashboard.html",
};

// Figure out which page we're currently on by looking at the
// last segment of the URL path. Falls back to LOGIN for the
// root path ("/") since GitHub Pages/Live Server may serve
// index.html without it appearing in the URL.
function getCurrentPage() {
  const path = window.location.pathname;
  if (path.endsWith(AUTH_PAGES.APP)) return AUTH_PAGES.APP;
  if (path.endsWith(AUTH_PAGES.DASHBOARD)) return AUTH_PAGES.DASHBOARD;
  return AUTH_PAGES.LOGIN;
}

// Redirect based on session state + current page.
async function guardPageWithSession() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  const currentPage = getCurrentPage();
  const isProtectedPage =
    currentPage === AUTH_PAGES.APP || currentPage === AUTH_PAGES.DASHBOARD;

  if (session && currentPage === AUTH_PAGES.LOGIN) {
    // Already logged in but sitting on the login page -> go to app.
    window.location.replace(AUTH_PAGES.APP);
  } else if (!session && isProtectedPage) {
    // Not logged in but trying to view a protected page -> go to login.
    window.location.replace(AUTH_PAGES.LOGIN);
  }
}

// Show a Bootstrap alert message inside #authAlert (only present
// on index.html).
function showAuthAlert(message, type = "danger") {
  const alertBox = document.getElementById("authAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
}

function hideAuthAlert() {
  const alertBox = document.getElementById("authAlert");
  if (!alertBox) return;
  alertBox.classList.add("d-none");
}

// Wire up the login/register forms - only runs if they exist
// on the current page (i.e. index.html).
function setupAuthForms() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const showRegisterLink = document.getElementById("showRegister");
  const showLoginLink = document.getElementById("showLogin");

  if (!loginForm || !registerForm) return;

  // Toggle between the two forms.
  showRegisterLink.addEventListener("click", (e) => {
    e.preventDefault();
    hideAuthAlert();
    loginForm.classList.add("d-none");
    registerForm.classList.remove("d-none");
  });

  showLoginLink.addEventListener("click", (e) => {
    e.preventDefault();
    hideAuthAlert();
    registerForm.classList.add("d-none");
    loginForm.classList.remove("d-none");
  });

  // LOGIN submit handler.
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      showAuthAlert(error.message);
      return;
    }

    window.location.replace(AUTH_PAGES.APP);
  });

  // REGISTER submit handler.
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      showAuthAlert(error.message);
      return;
    }

    // If your Supabase project has email confirmation enabled,
    // the user won't have a session yet until they confirm their
    // email - let them know either way.
    showAuthAlert(
      "Account created! If email confirmation is required, check your inbox before logging in.",
      "success"
    );
    registerForm.reset();
  });
}

// Wire up the logout button - only runs if it exists on the
// current page (i.e. app.html/dashboard.html).
function setupLogoutButton() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.replace(AUTH_PAGES.LOGIN);
  });
}

// Run on every page load.
document.addEventListener("DOMContentLoaded", async () => {
  await guardPageWithSession();
  setupAuthForms();
  setupLogoutButton();
});
