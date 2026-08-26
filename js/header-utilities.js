// Shared upper-toolbar navigation and application controls.
(function () {
  "use strict";

  function setupHeaderUtilities() {
    const headerActions = document.querySelector(".top-header .app-shell");
    if (!headerActions || document.getElementById("walletDashboardShortcut")) return;

    const dashboardShortcut = document.createElement("a");
    dashboardShortcut.className = "header-action header-utility-action text-decoration-none";
    dashboardShortcut.id = "walletDashboardShortcut";
    dashboardShortcut.href = "dashboard.html";
    dashboardShortcut.title = "View Insights";
    dashboardShortcut.setAttribute("aria-label", "View Insights");
    dashboardShortcut.innerHTML = '<i class="bi bi-bar-chart" aria-hidden="true"></i>';

    const themeToggle = document.createElement("button");
    themeToggle.className = "header-action header-utility-action header-theme-toggle";
    themeToggle.id = "headerThemeToggle";
    themeToggle.type = "button";
    themeToggle.title = "Toggle dark/light mode";
    themeToggle.setAttribute("aria-label", "Toggle color theme");
    themeToggle.setAttribute("data-theme-toggle", "");
    themeToggle.innerHTML = '<i class="bi bi-moon-stars" data-theme-icon aria-hidden="true"></i><span class="visually-hidden" data-theme-label>Dark mode</span>';

    headerActions.appendChild(dashboardShortcut);
    headerActions.appendChild(themeToggle);

    window.WalletCheckHeaderUtilities = {
      insertBeforeTheme(control) {
        headerActions.insertBefore(control, themeToggle);
      },
    };

    // These controls are injected after the theme module's initial DOM scan.
    window.WalletCheckTheme?.applyTheme(
      document.documentElement.getAttribute("data-theme") || "dark"
    );
    themeToggle.addEventListener("click", () => window.WalletCheckTheme?.toggleTheme());
  }

  // Turns every [data-bs-toggle="tooltip"] help icon on the page into a
  // real Bootstrap tooltip. Same mechanism as the Expense/Saving type
  // tooltips (see initExpenseHelpTooltips in expenses.js) - reused here
  // so every page can init contextual help icons without duplicating the
  // Bootstrap.Tooltip wiring. Safe to call repeatedly (e.g. after a
  // section re-renders): already-initialized elements are skipped.
  function initHelpTooltips(root) {
    if (typeof bootstrap === "undefined" || !bootstrap.Tooltip) return;
    (root || document).querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      if (!bootstrap.Tooltip.getInstance(el)) {
        new bootstrap.Tooltip(el);
      }
    });
  }

  window.WalletCheckTooltips = { init: initHelpTooltips };

  document.addEventListener("DOMContentLoaded", () => {
    setupHeaderUtilities();
    initHelpTooltips();
  });
})();
