// ============================================================
// theme.js - dark/light theme toggle
// ============================================================

const THEME_STORAGE_KEY = "wc-theme";

function getStoredTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  // Update every toggle button on the page.
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const themeIcon = btn.querySelector("[data-theme-icon]");
    const themeLabel = btn.querySelector("[data-theme-label]");

    if (themeIcon && themeLabel) {
      const switchLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      themeIcon.className = `bi ${theme === "dark" ? "bi-sun" : "bi-moon-stars"}`;
      themeLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
      btn.setAttribute("title", switchLabel);
      btn.setAttribute("aria-label", switchLabel);
      return;
    }

    btn.textContent = theme === "dark" ? "☀️" : "🌙";
    btn.setAttribute(
      "title",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  });
}

function setupThemeToggle() {
  const buttons = document.querySelectorAll("[data-theme-toggle]");
  if (buttons.length === 0) return;

  applyTheme(getStoredTheme());

  buttons.forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

// Allows shared utilities added after DOMContentLoaded to use the same theme behavior.
window.WalletCheckTheme = { applyTheme, toggleTheme };

document.addEventListener("DOMContentLoaded", setupThemeToggle);
