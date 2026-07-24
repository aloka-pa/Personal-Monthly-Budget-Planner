// Sidebar navigation behavior only. Finance and authentication logic live elsewhere.
(function () {
  const STORAGE_KEY = "wc-sidebar-collapsed";
  const desktopQuery = window.matchMedia("(min-width: 992px)");

  function setupSidebar() {
    const body = document.body;
    const sidebar = document.getElementById("appSidebar");
    const desktopToggle = document.getElementById("sidebarToggle");
    const mobileToggle = document.getElementById("mobileMenuToggle");
    const closeButton = document.getElementById("sidebarClose");
    const backdrop = document.getElementById("sidebarBackdrop");

    if (!sidebar) return;

    function setCollapsed(collapsed) {
      body.classList.toggle("sidebar-collapsed", collapsed);
      localStorage.setItem(STORAGE_KEY, String(collapsed));
      desktopToggle?.setAttribute("aria-expanded", String(!collapsed));
      desktopToggle?.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar"
      );
    }

    function setDrawerOpen(open) {
      body.classList.toggle("sidebar-open", open);
      mobileToggle?.setAttribute("aria-expanded", String(open));
      sidebar.setAttribute("aria-hidden", String(!open && !desktopQuery.matches));
      if (open) {
        closeButton?.focus();
      } else if (!desktopQuery.matches) {
        mobileToggle?.focus();
      }
    }

    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    sidebar.setAttribute("aria-hidden", String(!desktopQuery.matches));

    desktopToggle?.addEventListener("click", () => {
      setCollapsed(!body.classList.contains("sidebar-collapsed"));
    });
    mobileToggle?.addEventListener("click", () => setDrawerOpen(true));
    closeButton?.addEventListener("click", () => setDrawerOpen(false));
    backdrop?.addEventListener("click", () => setDrawerOpen(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && body.classList.contains("sidebar-open")) {
        setDrawerOpen(false);
      }
    });

    desktopQuery.addEventListener("change", (event) => {
      body.classList.remove("sidebar-open");
      sidebar.setAttribute("aria-hidden", String(!event.matches));
    });
  }

  document.addEventListener("DOMContentLoaded", setupSidebar);
})();
