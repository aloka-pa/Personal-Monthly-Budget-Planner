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
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  });
}

document.addEventListener("DOMContentLoaded", setupThemeToggle);
