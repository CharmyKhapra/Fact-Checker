const puppeteer = require('C:/Users/admin/AppData/Local/npm-cache/_npx/668c188756b835f3/node_modules/puppeteer-core');
const path = require('path');
const fs   = require('fs');

// Find the bundled Chromium executable
const execPath = (() => {
  const base = 'C:/Users/admin/AppData/Local/npm-cache/_npx/668c188756b835f3/node_modules/puppeteer-core';
  // try common locations
  const candidates = [
    path.join(base, '.local-chromium'),
    path.join(base, 'chromium'),
  ];
  // walk to find chrome.exe
  function find(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && (e.name === 'chrome.exe' || e.name === 'chromium.exe' || e.name === 'chrome')) return full;
      if (e.isDirectory()) { const r = find(full); if (r) return r; }
    }
    return null;
  }
  for (const c of candidates) { const r = find(c); if (r) return r; }
  return null;
})();

// Also try finding chrome via mermaid-cli's own browser resolver
let chromePath = execPath;
if (!chromePath) {
  // Try the mermaid-cli bundled browser path discovery
  try {
    const { executablePath } = require('C:/Users/admin/AppData/Local/npm-cache/_npx/668c188756b835f3/node_modules/puppeteer-core');
    if (typeof executablePath === 'function') chromePath = executablePath();
  } catch(e) {}
}

(async () => {
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (chromePath) {
    launchOpts.executablePath = chromePath;
    console.log('Using Chromium at:', chromePath);
  } else {
    // Let puppeteer-core auto-discover
    console.log('No Chromium path found, trying auto-discovery...');
  }

  const browser = await puppeteer.launch(launchOpts);
  const page = await browser.newPage();

  const htmlPath = path.resolve('arch-render.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });

  await page.setViewport({ width: 1600, height: 1220, deviceScaleFactor: 2 });

  await page.screenshot({
    path: 'factlens-architecture.png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 1600, height: 1220 },
  });

  await browser.close();
  console.log('Done → factlens-architecture.png');
})().catch(e => { console.error(e); process.exit(1); });
