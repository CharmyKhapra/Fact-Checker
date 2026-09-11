// FactLens AI — shared Auth0 helper.
// Loaded on every page (via the auth0-spa-js CDN script + auth-config.js first).
// Responsibilities:
//   1. Create a single Auth0 client (cached across page loads via localStorage).
//   2. On login.html: handle the redirect-back-from-Auth0 callback.
//   3. On every other page: require a valid session, or bounce to login.html.
//   4. Populate the sidebar avatar/name/email from the Auth0 profile.
//   5. Wire up logout from the sidebar's account menu button.

(() => {
  const cfg = window.AUTH0_CONFIG || {};
  let clientPromise = null;

  function getClient() {
    if (!clientPromise) {
      clientPromise = auth0.createAuth0Client({
        domain: cfg.domain,
        clientId: cfg.clientId,
        cacheLocation: "localstorage",
        authorizationParams: {
          redirect_uri: cfg.redirectUri || (window.location.origin + "/login.html"),
          ...(cfg.audience ? { audience: cfg.audience } : {}),
        },
      });
    }
    return clientPromise;
  }

  function configured() {
    return !!(cfg.domain && cfg.clientId &&
      cfg.domain !== "YOUR_AUTH0_DOMAIN" && cfg.clientId !== "YOUR_AUTH0_CLIENT_ID");
  }

  async function login(returnTo) {
    const client = await getClient();
    if (returnTo) sessionStorage.setItem("factlensReturnTo", returnTo);
    await client.loginWithRedirect();
  }

  async function logout() {
    const client = await getClient();
    sessionStorage.removeItem("factlensReturnTo");
    await client.logout({
      logoutParams: { returnTo: cfg.logoutReturnTo || (window.location.origin + "/login.html") },
    });
  }

  // Fills the sidebar's avatar initials / name / email from the Auth0 profile,
  // and wires the account-menu button to log out. Safe no-op if elements are missing.
  function populateSidebar(user) {
    const nameEl = document.querySelector(".sidebar-footer .u-name");
    const emailEl = document.querySelector(".sidebar-footer .u-email");
    const avatarEl = document.querySelector(".sidebar-footer .avatar");
    const menuBtn = document.querySelector(".sidebar-footer button[aria-label='Account menu']");

    const displayName = user.name || user.nickname || user.email || "Account";
    const initials = displayName
      .split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
      .map(p => p[0].toUpperCase()).join("") || "U";

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email || "";
    if (avatarEl) {
      if (user.picture) {
        avatarEl.style.backgroundImage = `url(${user.picture})`;
        avatarEl.style.backgroundSize = "cover";
        avatarEl.style.backgroundPosition = "center";
        avatarEl.textContent = "";
      } else {
        avatarEl.textContent = initials;
      }
    }
    if (menuBtn) {
      menuBtn.title = "Log out";
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("Log out of FactLens AI?")) logout();
      });
    }
  }

  function reveal() {
    document.documentElement.style.visibility = "visible";
  }

  // requireAuth(): call on every protected page. Redirects to login.html if
  // there's no session; otherwise reveals the page and fills in the sidebar.
  async function requireAuth() {
    if (!configured()) {
      // Auth0 isn't set up yet — don't lock the user out of a broken app;
      // just reveal the page so local dev/demo still works, and warn loudly.
      console.warn(
        "FactLens: Auth0 is not configured yet. Edit frontend/js/auth-config.js " +
        "with your Auth0 domain and client ID to enable login."
      );
      reveal();
      return;
    }
    try {
      const client = await getClient();
      const isAuthenticated = await client.isAuthenticated();
      if (!isAuthenticated) {
        const here = window.location.pathname.split("/").pop() || "index.html";
        window.location.replace(`login.html?returnTo=${encodeURIComponent(here)}`);
        return;
      }
      const user = await client.getUser();
      populateSidebar(user || {});
      reveal();
    } catch (err) {
      console.error("FactLens auth check failed:", err);
      window.location.replace("login.html");
    }
  }

  window.FactLensAuth = { getClient, login, logout, requireAuth, configured };
})();
