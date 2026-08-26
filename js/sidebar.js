// Shared application sidebar markup. Page-specific scripts should not duplicate navigation HTML.
(function () {
  const mount = document.getElementById("sidebarMount");
  if (!mount) return;

  const currentPage = window.location.pathname.split("/").pop() || "app.html";
  const workspaceLinks = [
    { href: "app.html", label: "Home", icon: "bi-house-door" },
    { href: "dashboard.html", label: "Dashboard", icon: "bi-bar-chart" },
    { href: "budgets.html", label: "Budgets", icon: "bi-cash-stack" },
    { href: "financial-goals.html", label: "Financial Goals", icon: "bi-bullseye" },
    { href: "financial-planner.html", label: "Financial Planner", icon: "bi-calendar2-check" },
  ];

  function workspaceLink({ href, label, icon }) {
    const active = currentPage === href;
    return `<a class="sidebar-link${active ? " active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}><i class="bi ${icon}"></i><span class="sidebar-link-label">${label}</span></a>`;
  }

  mount.outerHTML = `
    <aside class="app-sidebar" id="appSidebar" aria-label="Primary navigation">
      <div class="sidebar-header">
        <span class="brand-mark" aria-hidden="true"><i class="bi bi-wallet2"></i></span>
        <div class="brand-copy"><span class="brand-title">Wallet Check</span><span class="brand-subtitle">Personal Finance Platform</span></div>
        <button class="sidebar-control ms-auto d-none d-lg-inline-flex" id="sidebarToggle" type="button" aria-label="Collapse sidebar" aria-expanded="true"><i class="bi bi-list"></i></button>
        <button class="sidebar-control ms-auto d-lg-none" id="sidebarClose" type="button" aria-label="Close navigation"><i class="bi bi-x-lg"></i></button>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Workspace</div>
        ${workspaceLinks.map(workspaceLink).join("")}
      </nav>
      <div class="sidebar-footer">
        <button type="button" class="sidebar-link" id="logoutBtn"><i class="bi bi-box-arrow-right"></i><span class="sidebar-link-label">Logout</span></button>
      </div>
    </aside>
    <div class="sidebar-backdrop" id="sidebarBackdrop" aria-hidden="true"></div>`;
})();
