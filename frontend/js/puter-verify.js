/* =========================================================
   FactLens AI — Puter.js verification engine (browser-side)

   Ported from the backend Gemini pipeline so PDF/text verification
   can run entirely client-side via puter.ai.chat(), without touching
   the Gemini quota. Requires <script src="https://js.puter.com/v2/">
   to be loaded before this file.

   Mirrors:
     backend/app/claim_extractor.py  -> extractClaims()
     backend/app/verifier.py         -> verifyClaims(), score(), summary()
     backend/services/mapping.py     -> attachPages()
     backend/app/gemini_client.py    -> extractJSON()  (_extract_json)
   ========================================================= */
(() => {
  const MAX_CLAIMS = 20;
  const VERIFY_BATCH_SIZE = 4;
  const VERDICTS = ["True", "False", "Partially True", "Unverifiable"];

  const EXTRACT_SYSTEM_PROMPT = `You are the claim-extraction stage of a fact-checking tool.
Read ALL supplied text and extract concrete, checkable factual claims.
Do not summarize. Preserve the meaning of each claim and include a short source_snippet
from the supplied text. Skip opinions, jokes, predictions, and purely subjective
statements. Return ONLY valid JSON with this structure:
{
  "claims": [
    { "text": "original claim", "source_snippet": "short quote it came from" }
  ]
}`;

  const VERIFY_SYSTEM_PROMPT = `You are FactLens, a professional factual claim verifier.

Verify EVERY supplied claim using your training knowledge. You do not have live
web access in this mode, so if you are not confident from what you already know,
say so honestly instead of guessing.

Rules:
- Verify each claim separately.
- Preserve claim_index exactly.
- Never guess.
- Never invent evidence or URLs. Only include a "sources" entry if you are certain
  the URL is real; otherwise leave "sources" as an empty array.
- True = you are confident reliable evidence supports the claim.
- False = you are confident reliable evidence contradicts the claim.
- Partially True = the claim mixes accurate and inaccurate elements or is materially incomplete.
- Unverifiable = you cannot establish true or false with confidence.
- Keep explanations concise and evidence-based.

Return ONLY valid JSON with this structure:
{
  "results": [
    {
      "claim_index": 1,
      "claim_text": "original claim",
      "verdict": "True",
      "confidence": 0.95,
      "explanation": "Brief evidence-based explanation.",
      "sources": []
    }
  ]
}

Return exactly one result for every supplied claim.`;

  /* ---------- JSON extraction (mirrors gemini_client._extract_json) ---------- */
  function extractJSON(rawText) {
    let text = (rawText || "").trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();

    try {
      return JSON.parse(text);
    } catch (_) {
      /* fall through */
    }

    for (const [open, close] of [["{", "}"], ["[", "]"]]) {
      const i = text.indexOf(open);
      const j = text.lastIndexOf(close);
      if (i >= 0 && j > i) {
        try {
          return JSON.parse(text.slice(i, j + 1));
        } catch (_) {
          /* try next bracket type */
        }
      }
    }
    throw new Error(
      "Could not parse JSON from Puter's response: " + text.slice(0, 300)
    );
  }

  function isAvailable() {
    return !!(window.puter && window.puter.ai && typeof window.puter.ai.chat === "function");
  }

  function messageText(response) {
    if (typeof response === "string") return response;
    if (response && typeof response === "object") {
      if (typeof response.text === "string") return response.text;
      if (response.message && typeof response.message.content === "string") {
        return response.message.content;
      }
      if (Array.isArray(response.message?.content)) {
        return response.message.content.map((c) => c.text || "").join("\n");
      }
    }
    return String(response ?? "");
  }

  async function chatJSON(systemPrompt, userPrompt) {
    if (!isAvailable()) {
      throw new Error(
        "Puter.js is not available (window.puter.ai.chat is missing). " +
        "Make sure <script src=\"https://js.puter.com/v2/\"></script> loaded successfully."
      );
    }
    const prompt = `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\nUSER INPUT:\n${userPrompt}`;
    const options = {};
    if (window.FACTLENS_PUTER_MODEL) options.model = window.FACTLENS_PUTER_MODEL;
    const response = await window.puter.ai.chat(prompt, options);
    const text = messageText(response);
    if (!text.trim()) throw new Error("Puter returned an empty response.");
    return extractJSON(text);
  }

  /* ---------- claim extraction ---------- */
  async function extractClaims(text) {
    if (!text || !text.trim()) return [];
    const data = await chatJSON(EXTRACT_SYSTEM_PROMPT, text);
    const raw = Array.isArray(data?.claims) ? data.claims : [];
    return raw
      .slice(0, MAX_CLAIMS)
      .filter((c) => c && c.text)
      .map((c) => ({
        text: String(c.text).trim(),
        source_snippet: String(c.source_snippet || "").trim(),
      }));
  }

  function buildBatchPrompt(batch, startIndex) {
    const lines = batch.map((c, i) => `${startIndex + i}. ${c.text}`);
    return (
      "Verify the following factual claims.\n\n" +
      lines.join("\n") +
      "\n\nReturn exactly one JSON result for every numbered claim."
    );
  }

  /* ---------- verification (batched, like verifier.py) ---------- */
  async function verifyClaims(claims, { onProgress } = {}) {
    const allRaw = [];
    const warnings = [];
    const totalBatches = Math.ceil(claims.length / VERIFY_BATCH_SIZE);

    for (let start = 0, batchNum = 0; start < claims.length; start += VERIFY_BATCH_SIZE, batchNum++) {
      const batch = claims.slice(start, start + VERIFY_BATCH_SIZE);
      if (onProgress) onProgress(batchNum + 1, totalBatches);
      try {
        const data = await chatJSON(VERIFY_SYSTEM_PROMPT, buildBatchPrompt(batch, start + 1));
        const raw = Array.isArray(data?.results) ? data.results : [];
        allRaw.push(...raw);
      } catch (err) {
        warnings.push(`Puter verification batch ${start + 1}-${start + batch.length} failed: ${err.message}`);
      }
    }

    const results = claims.map((claim, i) => {
      const idx = i + 1;
      const found = allRaw.find((r) => Number(r?.claim_index) === idx);
      if (!found) {
        return {
          claim: { text: claim.text, source_snippet: claim.source_snippet },
          verdict: "Unverifiable",
          confidence: 0,
          explanation: "Puter did not return a verification result for this claim.",
          sources: [],
          timestamp_start: null,
          timestamp_end: null,
          page: null,
        };
      }
      const verdict = VERDICTS.includes(found.verdict) ? found.verdict : "Unverifiable";
      const confidence = Math.max(0, Math.min(1, Number(found.confidence) || 0));
      const sources = Array.isArray(found.sources)
        ? found.sources
            .filter((s) => s && s.url)
            .map((s) => ({ title: String(s.title || "Web source"), url: String(s.url) }))
        : [];
      return {
        claim: { text: claim.text, source_snippet: claim.source_snippet },
        verdict,
        confidence,
        explanation: String(found.explanation || "").trim(),
        sources,
        timestamp_start: null,
        timestamp_end: null,
        page: null,
      };
    });

    return { results, warnings };
  }

  /* ---------- scoring (mirrors verifier.py _score / _summary) ---------- */
  function score(results) {
    const weights = { True: 1, "Partially True": 0.5, False: 0 };
    const vals = results.filter((r) => r.verdict in weights).map((r) => weights[r.verdict]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function summary(results, s) {
    if (!results.length) return "No claims were verified.";
    const counts = {};
    results.forEach((r) => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
    const detail = Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ");
    const base = `Checked ${results.length} claim(s): ${detail}.`;
    return s === null ? base + " Overall credibility could not be scored." : base;
  }

  /* ---------- page matching (mirrors services/mapping.py attach_pages) ---------- */
  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Dice-coefficient bigram similarity: a lightweight stand-in for Python's
  // difflib.SequenceMatcher ratio, good enough for "which page is this from".
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
    const A = bigrams(a);
    const B = bigrams(b);
    let matches = 0;
    for (const bg of A) {
      const idx = B.indexOf(bg);
      if (idx !== -1) { matches++; B.splice(idx, 1); }
    }
    return (2 * matches) / (A.length + B.length || 1);
  }

  function attachPages(results, pages) {
    const normalizedPages = (pages || []).map((p, i) => (typeof p === "object" ? p : { page: i + 1, text: p }));
    results.forEach((r) => {
      const snippet = norm(r.claim.source_snippet);
      let best = null;
      let bestScore = 0;
      normalizedPages.forEach((p) => {
        const pageText = norm(p.text);
        let sc = snippet ? similarity(snippet, pageText) : 0;
        if (snippet && pageText.includes(snippet)) sc = 1;
        if (sc > bestScore) { bestScore = sc; best = p; }
      });
      if (best && bestScore >= 0.2) r.page = best.page;
    });
    return results;
  }

  /* ---------- high-level entry points used by verify.html ---------- */
  async function verifyPlainText(text, { onProgress } = {}) {
    const claims = await extractClaims(text);
    if (!claims.length) {
      return { overall_score: null, summary: "No checkable claims were found.", claims: [], warnings: [], input_type: "text", input_text: text };
    }
    const { results, warnings } = await verifyClaims(claims, { onProgress });
    const s = score(results);
    return { overall_score: s, summary: summary(results, s), claims: results, warnings, input_type: "text", input_text: text };
  }

  // `extraction` is the JSON returned by POST /api/verify/pdf-extract
  // ({ input_type, filename, extracted_text, pages, page_count }).
  async function verifyPdfExtraction(extraction, { onProgress } = {}) {
    const claims = await extractClaims(extraction.extracted_text);
    if (!claims.length) {
      return { overall_score: null, summary: "No checkable claims were found.", claims: [], warnings: [], ...extraction };
    }
    const { results, warnings } = await verifyClaims(claims, { onProgress });
    attachPages(results, extraction.pages);
    const s = score(results);
    return { overall_score: s, summary: summary(results, s), claims: results, warnings, ...extraction };
  }

  window.FactLensPuterVerify = {
    isAvailable,
    extractClaims,
    verifyClaims,
    attachPages,
    score,
    summary,
    verifyPlainText,
    verifyPdfExtraction,
  };
})();
