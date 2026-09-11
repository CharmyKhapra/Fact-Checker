import { puterClient } from "./services/puterClient";
import { useEffect, useRef, useState } from "react";
import { getHistory, verifyText } from "./api/verify";
import indexPage from "./pages/index.html?raw";
import verifyPage from "./pages/verify.html?raw";
import resultsPage from "./pages/results.html?raw";
import historyPage from "./pages/history.html?raw";
import reportsPage from "./pages/reports.html?raw";
import sourcesPage from "./pages/sources.html?raw";
import "./style.css";

const pages = {
  "/": indexPage,
  "/index.html": indexPage,
  "/verify": verifyPage,
  "/verify.html": verifyPage,
  "/results": resultsPage,
  "/results.html": resultsPage,
  "/history": historyPage,
  "/history.html": historyPage,
  "/reports": reportsPage,
  "/reports.html": reportsPage,
  "/sources": sourcesPage,
  "/sources.html": sourcesPage,
};

function navigate(url) {
  const u = new URL(url, window.location.origin);
  const path = u.pathname + u.search;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function verdictLabel(v) {
  return ({verified:"Verified", partially_true:"Partially True", false:"False", unverifiable:"Unverifiable"})[v] || v;
}
function verdictClass(v) {
  return v === "verified" ? "green" : v === "false" ? "red" : v === "partially_true" ? "amber" : "gray";
}

export default function App() {
  // Expose the optional Puter client for debugging/integration without
  // replacing FactLens's existing backend verification pipeline.
  useEffect(() => {
    window.FactLensPuter = puterClient();
    return () => { delete window.FactLensPuter; };
  }, []);
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  const [key, setKey] = useState(0);
  const htmlRef = useRef(null);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const pathname = window.location.pathname;
  const pageHtml = pages[pathname] || indexPage;

  useEffect(() => {
    const root = htmlRef.current;
    if (!root) return;
    const bodyPage = pathname.split("/").pop() || "index.html";
    document.body.dataset.page =
      bodyPage.startsWith("verify") ? "verify" :
      bodyPage.startsWith("history") ? "history" :
      bodyPage.startsWith("reports") ? "reports" :
      bodyPage.startsWith("sources") ? "sources" : "dashboard";

    // SPA navigation: preserve the original HTML/CSS while making all internal links work.
    const onLink = (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http")) return;
      if (href.endsWith(".html") || href.startsWith("/")) {
        e.preventDefault();
        navigate(href);
      }
    };
    root.addEventListener("click", onLink);

    if (pathname.includes("verify")) setupVerify(root);
    if (pathname.includes("results")) setupResults(root);
    if (pathname.includes("history")) setupHistory(root);
    return () => root.removeEventListener("click", onLink);
  }, [pathname, key]);

  async function setupHistory(root) {
    const search = root.querySelector("#historySearch");
    if (search) {
      search.addEventListener("input", () => {
        const q = search.value.toLowerCase().trim();
        root.querySelectorAll(".hist-row").forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }
    try {
      const items = await getHistory();
      const body = root.querySelector("#historyBody");
      if (!body || !items?.length) return;
      body.innerHTML = items.map(item => {
        const cls = verdictClass(item.verdict);
        const typeIcon = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`;
        const date = item.createdAt ? new Date(item.createdAt).toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}) : "—";
        const safeText = escapeHtml(item.text);
        return `<tr class="hist-row">
          <td>${safeText}</td>
          <td><span class="type-chip">${typeIcon}Text</span></td>
          <td class="text-muted">${date}</td>
          <td>${Number(item.confidence)}%</td>
          <td><span class="badge badge-${cls}"><span class="badge-dot"></span>${escapeHtml(verdictLabel(item.verdict))}</span></td>
          <td><a class="row-link" href="/results">View report →</a></td>
        </tr>`;
      }).join("");
    } catch (err) {
      const body = root.querySelector("#historyBody");
      if (body) body.insertAdjacentHTML("beforebegin", `<p class="text-muted">Could not load live history: ${escapeHtml(err.message)}</p>`);
    }
  }

  return <div key={key} ref={htmlRef} dangerouslySetInnerHTML={{ __html: pageHtml }} />;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function setupVerify(root) {
  const methodCards = root.querySelectorAll("#methodGrid .method-card");
  const panels = root.querySelectorAll(".panel");
  const activate = (method) => {
    methodCards.forEach(c => c.classList.toggle("active", c.dataset.method === method));
    panels.forEach(p => p.classList.toggle("active", p.id === "panel-" + method));
  };
  methodCards.forEach(card => card.addEventListener("click", () => activate(card.dataset.method)));

  const params = new URLSearchParams(window.location.search);
  const initial = params.get("method");
  if (initial) {
    const map = {"video-file":"video","video-url":"video","pdf":"pdf","text":"text"};
    activate(map[initial] || initial);
    if (initial === "video-url") {
      root.querySelector('[data-toggle="video-source"] [data-value="url"]')?.click();
    }
  }

  root.querySelectorAll("[data-toggle]").forEach(group => {
    const name = group.dataset.toggle.split("-")[0];
    group.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      root.querySelector(`[data-panel-source="${name}-file"]`)?.classList.toggle("hidden", btn.dataset.value !== "file");
      root.querySelector(`[data-panel-source="${name}-url"]`)?.classList.toggle("hidden", btn.dataset.value !== "url");
    }));
  });

  function renderChip(container, file) {
    container.innerHTML = `<div class="file-chip">
      <div class="fc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg></div>
      <div><div class="fc-name">${escapeHtml(file.name)}</div><div class="fc-size">${formatBytes(file.size)}</div></div>
      <button class="fc-remove" aria-label="Remove file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>`;
    container.querySelector(".fc-remove").onclick = () => container.innerHTML = "";
  }
  function initDropzone(zone, input, cb) {
    if (!zone || !input) return;
    zone.onclick = () => input.click();
    input.onchange = () => input.files?.[0] && cb(input.files[0]);
    ["dragenter","dragover"].forEach(ev => zone.addEventListener(ev, e => {e.preventDefault(); zone.classList.add("dragover");}));
    ["dragleave","drop"].forEach(ev => zone.addEventListener(ev, e => {e.preventDefault(); zone.classList.remove("dragover");}));
    zone.addEventListener("drop", e => e.dataTransfer.files?.[0] && cb(e.dataTransfer.files[0]));
  }
  initDropzone(root.querySelector("#dz-video"), root.querySelector("#file-video"), f => renderChip(root.querySelector("#chip-video"), f));
  initDropzone(root.querySelector("#dz-pdf"), root.querySelector("#file-pdf"), f => renderChip(root.querySelector("#chip-pdf"), f));

  const textarea = root.querySelector("#panel-text textarea");
  const charCount = root.querySelector("#charCount");
  textarea?.addEventListener("input", () => charCount.textContent = `${textarea.value.length} characters`);

  const verifyBtn = [...root.querySelectorAll("a.btn-primary")].find(a => a.textContent.includes("Verify now"));
  if (verifyBtn) {
    verifyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!textarea?.value.trim()) {
        showVerifyError(root, "Type or paste some text first.");
        activate("text");
        return;
      }
      if (textarea.value.trim().length > 1000) {
        showVerifyError(root, "Text is too long. Keep claims under 1000 characters for now.");
        return;
      }
      verifyBtn.setAttribute("aria-busy", "true");
      verifyBtn.style.pointerEvents = "none";
      const original = verifyBtn.innerHTML;
      verifyBtn.textContent = "Verifying…";
      try {
        const result = await verifyText(textarea.value);
        localStorage.setItem("factlens:lastResult", JSON.stringify(result));
        navigate("/results");
      } catch (err) {
        showVerifyError(root, err.message);
        verifyBtn.innerHTML = original;
        verifyBtn.style.pointerEvents = "";
      } finally {
        verifyBtn.removeAttribute("aria-busy");
      }
    });
  }
}
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B","KB","MB","GB"];
  const i = Math.min(units.length-1, Math.floor(Math.log(bytes)/Math.log(1024)));
  return `${parseFloat((bytes/Math.pow(1024,i)).toFixed(1))} ${units[i]}`;
}
function showVerifyError(root, message) {
  let el = root.querySelector("#verifyError");
  if (!el) {
    el = document.createElement("div");
    el.id = "verifyError";
    el.className = "factlens-error";
    root.querySelector("#panel-text")?.appendChild(el);
  }
  el.textContent = message;
}

function setupResults(root) {
  const saved = localStorage.getItem("factlens:lastResult");
  if (!saved) return;
  let result;
  try { result = JSON.parse(saved); } catch { return; }
  const score = Math.max(0, Math.min(100, Number(result.confidence) || 0));
  const label = verdictLabel(result.verdict);
  const cls = verdictClass(result.verdict);

  const scoreEl = root.querySelector(".score-center .num");
  if (scoreEl) scoreEl.textContent = `${score}%`;
  const verdictHeading = root.querySelector(".overview-grid h2");
  if (verdictHeading) {
    verdictHeading.textContent = label;
    verdictHeading.style.color = `var(--${cls}-600)`;
  }
  const overviewText = verdictHeading?.parentElement?.nextElementSibling;
  if (overviewText) overviewText.textContent = result.explanation || "";

  const summary = root.querySelector(".overview-grid");
  if (summary) {
    const counts = summary.querySelectorAll(".overview-grid > div:nth-child(2) .badge");
    counts.forEach(b => { b.style.display = "none"; });
  }

  const claimRows = root.querySelectorAll(".claim-row");
  if (claimRows.length) {
    const row = claimRows[0];
    row.querySelector(".claim-text")?.replaceChildren(document.createTextNode(result.text || ""));
    const badge = row.querySelector(".badge");
    if (badge) {
      badge.className = `claim-badge badge badge-${cls}`;
      badge.innerHTML = `<span class="badge-dot"></span>${escapeHtml(label)}`;
    }
    row.querySelector(".claim-confidence")?.replaceChildren(document.createTextNode(`${score}% Confidence`));
    root.querySelectorAll(".claim-row").forEach((r,i) => { if(i>0) r.style.display="none"; });
    const epText = root.querySelector("#epClaimText"); if (epText) epText.textContent = result.text || "";
    const epEvidence = root.querySelector("#epEvidence"); if (epEvidence) epEvidence.textContent = result.explanation || "";
    const epBadge = root.querySelector("#epBadge");
    if (epBadge) { epBadge.className = `badge badge-${cls}`; epBadge.innerHTML = `<span class="badge-dot"></span>${escapeHtml(label)}`; }
    const sourceList = root.querySelector(".evidence-panel .source-list");
    if (sourceList && Array.isArray(result.sources) && result.sources.length) {
      sourceList.innerHTML = result.sources.map((s, i) => `<div class="source-row"><div class="source-num">${i+1}</div><div><div class="source-title">${escapeHtml(s)}</div><div class="text-muted">Referenced by verification model</div></div></div>`).join("");
    }
  }
  drawScoreRing(root.querySelector("#scoreRing"), [
    {value: score, color: `var(--${cls}-600)`},
    {value: 100-score, color: "var(--border)"}
  ], 150, 14);
}
function drawScoreRing(svg, segments, size=150, stroke=14) {
  if (!svg) return;
  const r=(size-stroke)/2, c=size/2, circumference=2*Math.PI*r;
  let offset=0; svg.innerHTML="";
  const track=document.createElementNS("http://www.w3.org/2000/svg","circle");
  track.setAttribute("cx",c); track.setAttribute("cy",c); track.setAttribute("r",r);
  track.setAttribute("fill","none"); track.setAttribute("stroke","#EEEEF4"); track.setAttribute("stroke-width",stroke); svg.appendChild(track);
  segments.forEach(seg=>{
    const len=seg.value/100*circumference;
    const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");
    circle.setAttribute("cx",c); circle.setAttribute("cy",c); circle.setAttribute("r",r);
    circle.setAttribute("fill","none"); circle.setAttribute("stroke",seg.color); circle.setAttribute("stroke-width",stroke);
    circle.setAttribute("stroke-linecap","round"); circle.setAttribute("stroke-dasharray",`${len} ${circumference-len}`);
    circle.setAttribute("stroke-dashoffset",-offset); svg.appendChild(circle); offset+=len;
  });
}
