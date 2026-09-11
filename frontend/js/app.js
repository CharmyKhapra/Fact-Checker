/* =========================================================
   FactLens AI — shared behaviour
   ========================================================= */

/* ---------- Score ring drawing ---------- */
function drawScoreRing(svg, segments, size = 150, stroke = 14) {
  // segments: [{value, color}], values sum to 100
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.innerHTML = "";

  // track
  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("cx", c);
  track.setAttribute("cy", c);
  track.setAttribute("r", r);
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "#EEEEF4");
  track.setAttribute("stroke-width", stroke);
  svg.appendChild(track);

  segments.forEach((seg) => {
    const len = (seg.value / 100) * circumference;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", c);
    circle.setAttribute("cy", c);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", seg.color);
    circle.setAttribute("stroke-width", stroke);
    circle.setAttribute("stroke-linecap", "round");
    circle.setAttribute("stroke-dasharray", `${len} ${circumference - len}`);
    circle.setAttribute("stroke-dashoffset", -offset);
    svg.appendChild(circle);
    offset += len;
  });
}

/* ---------- Dropzone (drag & drop + click to browse) ---------- */
function initDropzone(zoneEl, inputEl, onFile) {
  if (!zoneEl || !inputEl) return;
  zoneEl.addEventListener("click", () => inputEl.click());
  inputEl.addEventListener("change", () => {
    if (inputEl.files && inputEl.files[0]) onFile(inputEl.files[0]);
  });
  ["dragenter", "dragover"].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      zoneEl.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      zoneEl.classList.remove("dragover");
    })
  );
  zoneEl.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/* ---------- Generic tab switcher ---------- */
function initTabs(container, onChange) {
  if (!container) return;
  const tabs = Array.from(container.querySelectorAll("[data-tab]"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (onChange) onChange(tab.dataset.tab);
    });
  });
}

/* ---------- Simple table / list text filter ---------- */
function initSearchFilter(inputEl, itemsSelector, textSelector) {
  if (!inputEl) return;
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim().toLowerCase();
    document.querySelectorAll(itemsSelector).forEach((item) => {
      const target = textSelector ? item.querySelector(textSelector) : item;
      const text = (target ? target.textContent : "").toLowerCase();
      item.style.display = text.includes(q) ? "" : "none";
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Mark active sidebar link based on data-page attribute on <body>
  const page = document.body.dataset.page;
  if (page) {
    document.querySelectorAll(`.nav-link[data-nav="${page}"]`).forEach((el) => {
      el.classList.add("active");
    });
  }
});