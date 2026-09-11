const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

async function parseResponse(res, fallback) {
  let json = {};
  try { json = await res.json(); } catch {}
  if (!res.ok || !json.success) throw new Error(json.error || fallback);
  return json.data;
}

export async function verifyText(text) {
  const res = await fetch(`${API_BASE}/verify/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return parseResponse(res, "Verification failed");
}

export async function getHistory() {
  const res = await fetch(`${API_BASE}/verify/history`);
  return parseResponse(res, "Could not load history");
}
