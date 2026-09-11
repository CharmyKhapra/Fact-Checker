// FactLens AI — Auth0 configuration
//
// Fill these in from your Auth0 Dashboard (Applications → your app → Settings).
// This app is a Single Page Application, so the Client ID is public by design —
// it is safe to ship in frontend code. Never put a Client SECRET here.
//
// In your Auth0 application settings, set:
//   Allowed Callback URLs:  http://localhost:8000/login.html, https://YOUR_DOMAIN/login.html
//   Allowed Logout URLs:    http://localhost:8000/login.html, https://YOUR_DOMAIN/login.html
//   Allowed Web Origins:    http://localhost:8000, https://YOUR_DOMAIN
window.AUTH0_CONFIG = {
  domain: "charmykhapra.us.auth0.com",
  clientId: "MbSEY9ojesfuLCTaaG3U3ODgc6f25jq8",

  // Optional: only set this if you protect the FastAPI backend with Auth0
  // access tokens. Leave blank to skip.
  audience: "",

  // Where Auth0 sends the user back after login. Must exactly match an
  // "Allowed Callback URL" above, including the port during local dev.
  redirectUri: "http://localhost:8000/login.html",

  // Where the user lands after clicking "Log out".
  logoutReturnTo: "http://localhost:8000/login.html",
};
