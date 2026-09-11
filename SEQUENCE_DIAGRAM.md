# FactLens AI — Sequence Diagram

## Full System Flow

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant Browser as Browser (HTML/JS)
    participant Auth0 as Auth0 (SPA)
    participant VerifyPage as verify.html + app.js
    participant FastAPI as FastAPI (main.py)
    participant VerifyRoute as routes/verify.py
    participant ClaimExtractor as app/claim_extractor.py
    participant Verifier as app/verifier.py
    participant GeminiClient as app/gemini_client.py
    participant GeminiAPI as Gemini API (Google)
    participant Whisper as Faster-Whisper (local)
    participant PyMuPDF as PyMuPDF (local)
    participant ytdlp as yt-dlp (local)
    participant Mapping as services/mapping.py
    participant ResultsPage as results.html

    %% =========================================================
    %% SECTION 1 — AUTH FLOW
    %% =========================================================
    rect rgb(230, 240, 255)
        Note over User, Auth0: ── AUTH FLOW ──

        User->>Browser: Navigate to protected page (e.g. index.html)
        Browser->>Browser: <head> sets visibility:hidden
        Browser->>Auth0: createAuth0Client(domain, clientId)
        Auth0-->>Browser: Auth0 client ready (cached in localStorage)
        Browser->>Auth0: client.isAuthenticated()
        Auth0-->>Browser: false

        Browser->>Browser: redirect → login.html?returnTo=index.html
        User->>Browser: Click "Log in with Auth0"
        Browser->>Auth0: client.loginWithRedirect()
        Auth0-->>User: Redirect to Auth0 Universal Login page
        User->>Auth0: Enter credentials
        Auth0-->>Browser: Redirect back → login.html?code=XXX&state=YYY

        Browser->>Browser: Check sessionStorage for handled code (de-dup guard)
        Browser->>Auth0: client.handleRedirectCallback()
        Auth0-->>Browser: Exchange code → tokens stored in localStorage
        Browser->>Browser: Redirect to saved returnTo (index.html)

        Browser->>Auth0: client.isAuthenticated() → true
        Browser->>Auth0: client.getUser()
        Auth0-->>Browser: User profile (name, email, picture)
        Browser->>Browser: populateSidebar(user) — fill avatar/name/email
        Browser->>Browser: reveal() → visibility:visible
    end

    %% =========================================================
    %% SECTION 2 — TEXT FACT-CHECKING FLOW
    %% =========================================================
    rect rgb(230, 255, 235)
        Note over User, ResultsPage: ── TEXT VERIFICATION FLOW ──

        User->>VerifyPage: Select "Plain text" panel, paste text, click "Verify now"
        VerifyPage->>VerifyPage: Build FormData {text: "..."}
        VerifyPage->>FastAPI: POST /api/verify/text (FormData)

        FastAPI->>VerifyRoute: verify_text(text)
        VerifyRoute->>VerifyRoute: Validate length ≤ MAX_TEXT_LENGTH

        VerifyRoute->>ClaimExtractor: extract_claims(text)
        ClaimExtractor->>GeminiClient: call_json(SYSTEM_PROMPT, text,\n json_object=True, response_schema)
        GeminiClient->>GeminiAPI: generate_content(model, contents,\n response_mime_type="application/json")
        GeminiAPI-->>GeminiClient: {"claims":[{text, source_snippet}, ...]}
        GeminiClient-->>ClaimExtractor: (parsed_dict, [])
        ClaimExtractor-->>VerifyRoute: List[Claim] (≤ MAX_CLAIMS=20)

        VerifyRoute->>Verifier: verify_claims(claims)
        loop Each batch of 4 claims
            Verifier->>GeminiClient: call_json(SYSTEM_PROMPT, batch_prompt,\n enable_web_search=True)
            GeminiClient->>GeminiAPI: generate_content(model, contents,\n tools=[GoogleSearch()])
            GeminiAPI->>GeminiAPI: Live Google Search per claim
            GeminiAPI-->>GeminiClient: text with JSON + grounding_metadata
            GeminiClient->>GeminiClient: _extract_json(text)
            GeminiClient->>GeminiClient: _grounding_sources(response) → [{title,url}]
            GeminiClient-->>Verifier: (results_dict, sources_list)
        end
        Verifier->>Verifier: Match raw results → claims by claim_index
        Verifier->>Verifier: Compute overall_score & summary
        Verifier-->>VerifyRoute: Report(score, summary, claims, warnings)

        VerifyRoute-->>FastAPI: report.model_dump() + {input_type:"text", input_text}
        FastAPI-->>VerifyPage: JSON response

        VerifyPage->>Browser: sessionStorage.setItem("factlensResult", JSON)
        VerifyPage->>Browser: window.location = "results.html"
        Browser->>ResultsPage: Load results.html
        ResultsPage->>Browser: sessionStorage.getItem("factlensResult")
        ResultsPage->>ResultsPage: Render score, verdict pills,\n explanations, source links
        ResultsPage-->>User: Display verification report
    end

    %% =========================================================
    %% SECTION 3 — VIDEO FILE FACT-CHECKING FLOW
    %% =========================================================
    rect rgb(255, 245, 225)
        Note over User, ResultsPage: ── VIDEO FILE VERIFICATION FLOW ──

        User->>VerifyPage: Select "Video" panel, drag/drop file, click "Verify now"
        VerifyPage->>VerifyPage: Build FormData {file: <video>}
        VerifyPage->>FastAPI: POST /api/verify/video (multipart)

        FastAPI->>VerifyRoute: verify_video(file)
        VerifyRoute->>VerifyRoute: _save_upload() → write to TEMP_DIR/<uuid>.mp4

        Note over VerifyRoute, Whisper: Stage 1 — Transcription
        VerifyRoute->>Whisper: transcribe_video(temp_path)
        Whisper->>Whisper: Load WhisperModel(large-v3-turbo, cpu, int8) [lazy singleton]
        Whisper->>Whisper: model.transcribe(beam_size=5, vad_filter=True)
        Whisper->>Whisper: segments_to_srt(rows) → SRT text
        Whisper->>Whisper: write_srt() → OUTPUT_DIR/<stem>.srt
        Whisper->>Whisper: parse_srt() → [{start, end, text}, ...]
        Whisper-->>VerifyRoute: {text, segments, srt, language, duration}

        Note over VerifyRoute, GeminiAPI: Stage 2 — Claim Extraction
        VerifyRoute->>ClaimExtractor: extract_claims(transcript.text)
        ClaimExtractor->>GeminiClient: call_json(..., json_object=True)
        GeminiClient->>GeminiAPI: generate_content (structured JSON mode)
        GeminiAPI-->>GeminiClient: {claims:[...]}
        GeminiClient-->>ClaimExtractor: (dict, [])
        ClaimExtractor-->>VerifyRoute: List[Claim]

        Note over VerifyRoute, GeminiAPI: Stage 3 — Web Verification
        VerifyRoute->>Verifier: verify_claims(claims)
        loop Each batch of 4 claims
            Verifier->>GeminiClient: call_json(..., enable_web_search=True)
            GeminiClient->>GeminiAPI: generate_content (Google Search grounded)
            GeminiAPI->>GeminiAPI: Live Google Search
            GeminiAPI-->>GeminiClient: results JSON + grounding_metadata URLs
            GeminiClient-->>Verifier: (results, sources)
        end
        Verifier-->>VerifyRoute: Report

        Note over VerifyRoute, Mapping: Stage 4 — Timestamp Mapping
        VerifyRoute->>Mapping: attach_timestamps(report.claims, segments)
        Mapping->>Mapping: Fuzzy-match source_snippet → SRT segment\n(exact substring → score 1.0\nSequenceMatcher ratio ≥ 0.35)
        Mapping->>Mapping: Set result.timestamp_start / timestamp_end
        Mapping-->>VerifyRoute: results (modified in-place)

        VerifyRoute->>VerifyRoute: _persist_video() → copy to MEDIA_DIR/<uuid>.mp4
        VerifyRoute->>VerifyRoute: Delete temp file (finally block)
        VerifyRoute-->>FastAPI: report + {input_type:"video", media_url, transcript}
        FastAPI-->>VerifyPage: JSON response

        VerifyPage->>Browser: sessionStorage.setItem("factlensResult", JSON)
        VerifyPage->>Browser: window.location = "results.html"
        Browser->>ResultsPage: Load results.html
        ResultsPage->>ResultsPage: player.src = result.media_url (/media/<uuid>.mp4)
        ResultsPage->>ResultsPage: Build colored timeline segments
        ResultsPage->>ResultsPage: Render claim cards (verdict + timestamp)
        ResultsPage->>ResultsPage: Render clickable transcript rows
        ResultsPage-->>User: Display video + timeline + claims
        User->>ResultsPage: Click claim / transcript row
        ResultsPage->>ResultsPage: seek(start, end) → player.currentTime = start; play()
    end

    %% =========================================================
    %% SECTION 4 — VIDEO URL FACT-CHECKING FLOW
    %% =========================================================
    rect rgb(255, 235, 235)
        Note over User, ResultsPage: ── VIDEO URL VERIFICATION FLOW ──

        User->>VerifyPage: Paste video URL, click "Verify link" (or "Verify now")
        VerifyPage->>FastAPI: POST /api/verify/video-url (FormData {url})

        FastAPI->>VerifyRoute: verify_video_url(url)
        VerifyRoute->>ytdlp: yt_dlp.YoutubeDL(opts).extract_info(url, download=True)
        Note over ytdlp: Supports YouTube, Instagram,\nTikTok, X/Twitter, Vimeo, etc.
        ytdlp-->>VerifyRoute: Downloaded MP4 in temp dir

        Note over VerifyRoute, ResultsPage: Identical to Video File flow (Stages 1–4)\nplus source_url returned in response
        VerifyRoute-->>FastAPI: report + {input_type:"video", media_url, source_url, transcript}
        FastAPI-->>VerifyPage: JSON response
        VerifyPage->>Browser: sessionStorage → results.html (same as video file)
    end

    %% =========================================================
    %% SECTION 5 — PDF FACT-CHECKING FLOW
    %% =========================================================
    rect rgb(240, 230, 255)
        Note over User, ResultsPage: ── PDF VERIFICATION FLOW ──

        User->>VerifyPage: Upload PDF file or paste PDF URL, click "Verify now"
        VerifyPage->>FastAPI: POST /api/verify/pdf (multipart)\nor POST /api/verify/pdf-url (FormData {url})

        FastAPI->>VerifyRoute: verify_pdf(file) / verify_pdf_url(url)
        alt PDF file upload
            VerifyRoute->>VerifyRoute: _save_upload() → TEMP_DIR/<uuid>.pdf
        else PDF URL
            VerifyRoute->>VerifyRoute: requests.get(url, stream=True)\n→ stream chunks → TEMP_DIR/<uuid>.pdf
        end

        VerifyRoute->>PyMuPDF: extract_pdf(path)
        PyMuPDF->>PyMuPDF: pymupdf.open(path)
        PyMuPDF->>PyMuPDF: page.get_text() per page
        PyMuPDF-->>VerifyRoute: {text, page_count, pages:[{page, text}]}

        VerifyRoute->>VerifyRoute: Check extracted text non-empty\n(raises 422 with Tesseract hint if blank)

        VerifyRoute->>ClaimExtractor: extract_claims(extracted.text)
        ClaimExtractor->>GeminiClient: call_json(..., json_object=True)
        GeminiClient->>GeminiAPI: generate_content (structured JSON)
        GeminiAPI-->>GeminiClient: {claims:[...]}
        GeminiClient-->>ClaimExtractor: (dict, [])
        ClaimExtractor-->>VerifyRoute: List[Claim]

        VerifyRoute->>Verifier: verify_claims(claims)
        loop Each batch of 4 claims
            Verifier->>GeminiClient: call_json(..., enable_web_search=True)
            GeminiClient->>GeminiAPI: generate_content (Google Search grounded)
            GeminiAPI-->>GeminiClient: results + sources
            GeminiClient-->>Verifier: (results, sources)
        end
        Verifier-->>VerifyRoute: Report

        VerifyRoute->>Mapping: attach_pages(report.claims, pages)
        Mapping->>Mapping: Fuzzy-match source_snippet → page text\n(SequenceMatcher ratio ≥ 0.20)
        Mapping->>Mapping: Set result.page
        Mapping-->>VerifyRoute: results (modified in-place)

        VerifyRoute->>VerifyRoute: Delete temp file (finally block)
        VerifyRoute-->>FastAPI: report + {input_type:"pdf", pages, page_count}
        FastAPI-->>VerifyPage: JSON response

        VerifyPage->>Browser: sessionStorage → results.html
        ResultsPage->>ResultsPage: Render claims with page numbers\n(no video player / no timeline)
        ResultsPage-->>User: Display PDF verification report
    end

    %% =========================================================
    %% SECTION 6 — GEMINI RETRY LOGIC (cross-cutting)
    %% =========================================================
    rect rgb(245, 245, 245)
        Note over GeminiClient, GeminiAPI: ── GEMINI RETRY LOGIC (applies to all Gemini calls) ──

        GeminiClient->>GeminiAPI: generate_content(...)
        alt Success
            GeminiAPI-->>GeminiClient: Response text
            GeminiClient->>GeminiClient: _extract_json(text) → dict
        else Rate limit / transient error
            GeminiAPI-->>GeminiClient: Error (e.g. 429 with retryDelay)
            GeminiClient->>GeminiClient: Parse retryDelay from error text\n(or backoff: min(2*(attempt+1), 8)s)
            GeminiClient->>GeminiClient: time.sleep(delay)
            GeminiClient->>GeminiAPI: Retry (up to MAX_RETRIES times)
            GeminiAPI-->>GeminiClient: Response or raise GeminiClientError
        end
    end

    %% =========================================================
    %% SECTION 7 — LOGOUT FLOW
    %% =========================================================
    rect rgb(255, 240, 240)
        Note over User, Auth0: ── LOGOUT FLOW ──

        User->>Browser: Click account menu button in sidebar
        Browser->>User: confirm("Log out of FactLens AI?")
        User->>Browser: Confirm
        Browser->>Auth0: client.logout({returnTo: login.html})
        Auth0-->>Browser: Redirect → login.html
        Browser->>Browser: sessionStorage.removeItem("factlensReturnTo")
        Browser-->>User: login.html shown (logged out)
    end
```

---

## Data Flow Summary

| Input Type | Endpoint | Transcription | Claim Extraction | Verification | Mapping |
|---|---|---|---|---|---|
| Plain Text | `POST /api/verify/text` | — | Gemini (structured JSON) | Gemini + Google Search | — |
| Video File | `POST /api/verify/video` | Faster-Whisper → SRT | Gemini (structured JSON) | Gemini + Google Search | `attach_timestamps` |
| Video URL | `POST /api/verify/video-url` | yt-dlp → Faster-Whisper → SRT | Gemini (structured JSON) | Gemini + Google Search | `attach_timestamps` |
| PDF File | `POST /api/verify/pdf` | PyMuPDF text extraction | Gemini (structured JSON) | Gemini + Google Search | `attach_pages` |
| PDF URL | `POST /api/verify/pdf-url` | requests → PyMuPDF | Gemini (structured JSON) | Gemini + Google Search | `attach_pages` |

## Key Gemini API Modes

| Stage | Mode | Reason |
|---|---|---|
| Claim Extraction | `response_mime_type="application/json"` + `response_schema` | Needs deterministic structured output |
| Claim Verification | `tools=[GoogleSearch()]` (web search grounded) | Needs live web evidence; mutually exclusive with structured mode |

## Session / State Boundaries

- **Auth tokens** → `localStorage` (persists across page reloads, via Auth0 SPA SDK)
- **Verification result** → `sessionStorage["factlensResult"]` (passed from verify.html → results.html, overwritten on each new run)
- **Auth0 callback de-dup** → `sessionStorage["factlensHandledCode"]` (prevents double token exchange)
- **Backend** → fully **stateless** (no database, no server-side session)
