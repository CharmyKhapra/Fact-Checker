# FactLens AI

FactLens AI is a full-stack factual-claim verification platform designed to analyze **video, PDF, and plain text** and return evidence-backed verification results.

The project extracts factual claims, verifies them using web-backed AI reasoning, and presents the results to the user. For videos, verified claims can also be mapped back to transcript/SRT timestamps so the user can jump to the moment where a claim was spoken.

---

## 1. Main Features

### Supported input types

- **Video**
  - Upload a video file.
  - Extract/transcribe speech into SRT.
  - Extract factual claims from the transcript.
  - Verify claims using the configured verification engine.
  - Map verification results back to SRT timestamps.
  - Persist uploaded video/results where supported.

- **PDF**
  - Upload a PDF.
  - Extract text from the PDF.
  - Verify factual claims from the extracted text.
  - Supports text-based PDF extraction and the current PDF extraction pipeline can be extended for scanned/image-only PDFs.

- **Plain Text**
  - Paste/type text directly in the frontend.
  - Click **Verify Now**.
  - Extract and verify factual claims without uploading a file.

---

## 2. High-Level Pipeline

### Video

```text
Video Upload
    ↓
Speech Transcription
    ↓
SRT
    ↓
Transcript Text
    ↓
Claim Extraction
    ↓
Live Web Fact Verification
    ↓
Verification Results
    ↓
Timestamp Mapping
    ↓
Frontend Results
```

### PDF

```text
PDF Upload
    ↓
PDF Text Extraction
    ↓
Claim Extraction
    ↓
AI Fact Verification
    ↓
Frontend Results
```

### Plain Text

```text
User enters text
    ↓
Claim Extraction
    ↓
AI Fact Verification
    ↓
Frontend Results
```

---

## 3. Technology Stack

### Backend

- Python
- FastAPI
- Uvicorn
- Faster-Whisper for local video transcription
- Gemini API for the existing backend claim extraction/video verification pipeline
- PyMuPDF (`pymupdf`) for PDF extraction
- SRT parsing
- Sequence matching for timestamp mapping
- MongoDB / project persistence components where configured

### Frontend

- HTML/CSS/JavaScript for the currently served verification interface
- React/JS components in the separate Vite integration
- Puter.js for browser-side PDF/plain-text AI verification
- Microsoft Edge/Chrome during local development

---

## 4. Important Backend Components

Typical FactLens backend structure:

```text
backend/
├── main.py
├── routes/
│   └── verify.py
├── services/
│   ├── pdf_extractor.py
│   ├── mapping.py
│   ├── srt_utils.py
│   ├── transcriber.py
│   └── ...
├── app/
│   ├── claim_extractor.py
│   ├── verifier.py
│   ├── gemini_client.py
│   └── models.py
└── ...
```

Names can differ between FactLens versions (`V5`, `V10`, etc.). Keep the imports and function names consistent across the route and service files.

---

## 5. Video Verification

The video pipeline currently follows four main stages.

### Stage 1 — Transcription

Faster-Whisper is used to convert speech into timestamped SRT segments.

Example configuration used during development:

```env
TRANSCRIPTION_ENGINE=local
WHISPER_MODEL=large-v3-turbo
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

The project also experimented with Groq Whisper during development.

### Stage 2 — Claim Extraction

The transcript is sent to the configured LLM to identify checkable factual claims.

Example:

```text
Found 8 checkable claims
```

### Stage 3 — Live Web Verification

Claims are verified using live web evidence in the backend verification path.

Typical development logs included:

```text
Stage 3/4: live web fact verification
Gemini verified claim 1/8
Gemini verified claim 2/8
...
```

Batch verification was later used successfully:

```text
Gemini verified batch 1-4
Gemini verified batch 5-8
Gemini verified batch 9-12
Gemini verified batch 13-16
Gemini verified batch 17-20
```

### Stage 4 — Timestamp Mapping

The verification result is matched back to the original SRT segments.

The mapping implementation normalizes strings and uses sequence similarity. A matching threshold around `0.35` was used during development.

The goal is:

```text
Claim
  ↓
Matching transcript snippet
  ↓
timestamp_start
timestamp_end
```

This lets the frontend jump to the exact point where a claim was spoken.

---

## 6. PDF Verification

PDF support was added after the video pipeline.

### Recommended import

Use:

```python
import pymupdf
```

instead of:

```python
import fitz
```

The older:

```python
import fitz
```

API produced this warning:

```text
The `fitz` API is deprecated and will be removed in future.
Use `import pymupdf` instead.
```

Install/update PyMuPDF with:

```powershell
python -m pip install -U PyMuPDF
```

A PDF extractor should expose the exact return structure expected by the verification route.

A compatible structure is:

```python
{
    "text": "...",
    "page_count": 5,
    "pages": [...]
}
```

The `pages` field is useful when the final report needs to map claims back to their source PDF pages.

Do not return only a string if the route expects a dictionary.

---

## 7. Plain Text Verification

Plain text verification is intended to be the simplest frontend workflow:

```text
Type/paste text
        ↓
Click Verify Now
        ↓
Verify with the selected AI engine
        ↓
Extract claims
        ↓
Verify claims
        ↓
Display results
```

The frontend should send the text in the format expected by the FastAPI `/api/verify/text` endpoint when using the backend path.

When the Puter engine is selected on the current verification page, the browser can perform claim extraction and verification through Puter.js without sending the claim-verification request through Gemini.

---

## 8. Verification Architecture

FactLens separates **content extraction** from **claim verification**.

### Video

Video-specific processing is handled by the backend because it needs:

- media upload handling
- transcription
- SRT generation
- timestamp mapping

### PDF

The current verification page can use a split flow:

```text
PDF
 ↓
FastAPI
 ↓
PyMuPDF text extraction
 ↓
Browser
 ↓
Puter.js claim extraction + verification
 ↓
Page mapping
 ↓
Results
```

Gemini remains available through the existing backend verification pipeline for compatibility and fallback scenarios.

### Plain Text

Plain text can be verified directly in the browser through Puter.js or through the existing backend Gemini endpoint, depending on the selected verification engine.

### Architectural rule

Keep the extraction layer separate from the verification layer so that different AI engines can be swapped without rewriting PDF, video, or frontend handling.

---

## 9. Configuration

Example environment variables used during development:

```env
WHISPER_MODEL=large-v3-turbo
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8

MAX_TEXT_LENGTH=20000
MAX_CLAIMS=20
EXTRACTION_MAX_RETRIES=1
VERIFICATION_MAX_RETRIES=1

MAX_VIDEO_MB=500
MAX_PDF_MB=50

VERIFICATION_BATCH_SIZE=4

GEMINI_MODEL=gemini-3.1-flash-lite
```

Keep API keys in `.env` and never hard-code them into source files.

Puter.js browser verification does not require the Gemini API key for the Puter path.

---

## 10. Running the Backend

From the project root:

```powershell
python -m uvicorn backend.main:app --reload
```

Expected output:

```text
Uvicorn running on
Application startup complete.
```

Typical API endpoints:

```text
POST /api/verify/video
POST /api/verify/pdf
POST /api/verify/text
GET  /api/health
```

The currently served frontend is mounted by FastAPI at:

```text

```

---

## 11. Frontend

The frontend contains the verification interface and displays:

- overall credibility
- verified claims
- partially true claims
- false claims
- unverifiable claims
- evidence/reasoning
- source links returned by the verification engine
- timestamps for video claims
- video playback where the uploaded video is available for playback

The verification cards should distinguish between:

```text
Verified
Partially true
False
Unverifiable
```

---

## 12. Important FactLens Issues We Encountered

This section documents the actual development problems encountered while building FactLens.

## Issue 1 — Groq Whisper 413: Request Entity Too Large

Error:

```text
Groq Whisper: Error code: 413
Request Entity Too Large
```

This happened when sending a relatively large video to the Groq Whisper API.

### Lesson

Do not assume a large video file can always be uploaded directly to the transcription API.

Possible solution:

- compress/extract audio locally
- split long/large media into smaller chunks
- use local Faster-Whisper
- enforce upload-size validation

The project later successfully used:

```text
Faster-Whisper
large-v3-turbo
```

locally.

---

## Issue 2 — ffmpeg Not Found

During local media processing, `ffmpeg` was initially not recognized by PowerShell.

### Lesson

If video/audio conversion is required, make sure FFmpeg is installed and available on the system PATH.

Verify:

```powershell
ffmpeg -version
```

If that command is not recognized, Windows cannot find FFmpeg.

---

## Issue 3 — Gemini 429 RESOURCE_EXHAUSTED

Gemini returned:

```text
429 RESOURCE_EXHAUSTED
```

with messages such as:

```text
You exceeded your current quota
```

### Lesson

Changing models or creating another API key does not automatically remove project/account quota restrictions.

Better solutions:

- reduce the number of API requests
- batch claims
- wait for quota reset
- use an appropriate paid/billed project if required
- avoid unnecessary retries
- use Puter.js for browser-side PDF/plain-text verification where appropriate

Batching eventually produced logs such as:

```text
Gemini verified batch 1-4
Gemini verified batch 5-8
Gemini verified batch 9-12
Gemini verified batch 13-16
Gemini verified batch 17-20
```

---

## Issue 4 — Gemini AFC Warning

Gemini produced:

```text
Direct use of automatic function calling (AFC) in
Models.generate_content is not recommended.
```

This is a warning rather than the direct cause of a failed request.

### Lesson

Do not confuse SDK warnings with actual pipeline failures.

---

## Issue 5 — `extract_pdf` ImportError

Error:

```text
ImportError: cannot import name 'extract_pdf'
from 'backend.services.pdf_extractor'
```

### Cause

`verify.py` imported a function named:

```python
extract_pdf
```

but `pdf_extractor.py` did not expose a function with exactly that name.

### Lesson

Imports must match actual function names.

For example:

```python
from ..services.pdf_extractor import extract_pdf
```

requires:

```python
def extract_pdf(...):
    ...
```

in `pdf_extractor.py`.

---

## Issue 6 — PDF extractor returned the wrong type

Error:

```text
TypeError: string indices must be integers, not 'str'
```

at:

```python
if not extracted["text"].strip():
```

### Cause

The route expected:

```python
extracted["text"]
```

which means `extracted` must be a dictionary.

But the extractor returned a plain string.

### Correct contract

Return:

```python
{
    "text": extracted_text,
    "page_count": page_count,
    "pages": pages
}
```

---

## Issue 7 — PDF `page_count` missing

Error:

```text
KeyError: 'page_count'
```

at:

```python
page_count=extracted["page_count"]
```

### Cause

The extractor returned text but not the page count.

### Lesson

The PDF extractor and PDF route must share one stable return contract.

Recommended:

```python
return {
    "text": text,
    "page_count": len(doc),
    "pages": pages
}
```

---

## Issue 8 — `fitz` Deprecation Warning

Warning:

```text
The `fitz` API is deprecated and will be removed in future.
Use `import pymupdf` instead.
```

### Fix

Change:

```python
import fitz
```

to:

```python
import pymupdf
```

and update:

```python
fitz.open(...)
```

to:

```python
pymupdf.open(...)
```

and:

```python
fitz.Matrix(...)
```

to:

```python
pymupdf.Matrix(...)
```

---

## Issue 9 — Frontend showed `Unverifiable`

The frontend displayed something like:

```text
0% credibility score
0 verified, 0 partially true, 0 false, 1 unverifiable
```

for a claim such as:

```text
Narendra Modi is the Prime Minister of India
```

### Cause observed during development

The frontend received a claim but no usable verification result:

```text
No verification result was returned for this claim.
```

This can happen when:

- the verification API fails
- the LLM request is rate-limited
- a result is dropped during mapping
- the frontend expects a different JSON property
- backend and frontend response schemas do not match

### Lesson

Check the actual verification response in the browser Network tab before changing the UI.

---

## Issue 10 — Video could not be retained for playback

The frontend showed:

```text
The video could not be retained for playback.
```

while verification itself could still complete.

### Lesson

Video verification and video playback are separate concerns.

The backend must persist the uploaded file somewhere accessible to the frontend if playback is required.

---

## Issue 11 — Timestamp mapping

The system successfully reached:

```text
Stage 4/4: mapping verified claims to SRT timestamps
```

and logged claims/snippets.

The mapping logic uses normalized text and similarity matching.

### Lesson

Verification can succeed even if timestamp mapping fails.

Therefore, the response should preserve the verification result even when no timestamp is available.

---

## Issue 12 — Backend 422

A request returned:

```text
POST /api/verify/video HTTP/1.1" 422
```

A 422 generally means FastAPI rejected the request because its input did not match the endpoint's expected schema.

### Check

- multipart field name
- file field name
- required parameters
- frontend `FormData`
- backend endpoint signature

---

# 13. Debugging Checklist

When something fails, check in this order:

### 1. Is FastAPI running?

```powershell
python -m uvicorn backend.main:app --reload
```

### 2. Is the endpoint being called?

Look for:

```text
POST /api/verify/video
POST /api/verify/pdf
POST /api/verify/text
```

### 3. Check the HTTP status

- `200` → request completed
- `422` → request/schema problem
- `429` → API quota/rate limit
- `500` → backend exception
- `413` → payload too large

### 4. Read the Python traceback

The final lines usually identify the actual failing file and line.

### 5. Check frontend Network tab

In Edge/Chrome:

```text
F12
→ Network
→ Fetch/XHR
→ select the /api/verify/... request
→ Response
```

Compare the returned JSON with what the frontend expects.

---

# 14. Testing PDF

Use the included:

```text
sample_document_factlens.pdf
```

It contains factual statements suitable for testing claim extraction and verification.

Test:

```text
Frontend
→ PDF
→ Upload sample_document_factlens.pdf
→ Verify Now
```

Expected high-level flow:

```text
PDF received
→ text extracted
→ factual claims found
→ claims verified
→ results displayed
```

For the current Puter-enabled PDF path, the verification page can extract the PDF on the backend, then send the extracted text to Puter.js for claim extraction and verification.

---

# 15. Testing Plain Text

Paste a short paragraph containing several factual statements.

Example:

```text
The Earth orbits the Sun. Water freezes at 0 degrees Celsius
under standard atmospheric pressure. The Eiffel Tower is in Paris.
```

Then:

```text
Plain Text
→ Verify Now
```

The selected engine should extract and verify the claims.

When using the backend engine, the request goes to:

```text
/api/verify/text
```

When using the Puter engine, the claim verification is performed in the browser through Puter.js.

---

# 16. Testing Video

Use a short video first.

Recommended development strategy:

- keep test videos short
- keep file size reasonable
- verify that transcription creates SRT
- verify claim extraction
- verify web verification
- verify timestamp mapping
- then test larger files

The current video path remains backend-based and uses Faster-Whisper plus the existing Gemini verification pipeline.

---

# 17. API Response Contract

Keep one consistent response structure across video, PDF, and text verification.

Each claim should ideally contain:

```json
{
  "claim": "Example factual claim",
  "verdict": "True",
  "confidence": 0.95,
  "explanation": "Evidence-based explanation",
  "sources": [],
  "timestamp_start": null,
  "timestamp_end": null,
  "page": null
}
```

For non-video inputs, timestamps can be:

```json
null
```

For non-PDF inputs, page can be:

```json
null
```

This prevents the frontend from treating missing timestamps/pages as failed verification.

---

# 18. Security Notes

- Never commit `.env` files.
- Never expose API keys in frontend JavaScript.
- Validate uploaded files.
- Enforce maximum file sizes.
- Sanitize extracted text where appropriate.
- Treat external web content returned by AI tools as untrusted input.
- Keep API keys only on the backend.
- Rotate any API key that has accidentally been exposed in terminal output or source control.
- Puter.js should be treated as a browser-side service and should not be used as a place to store backend secrets.

---

# 19. Current Development Status

### Working / demonstrated

- Video upload
- Faster-Whisper transcription
- SRT creation
- Claim extraction
- Gemini live verification
- Batched Gemini verification
- Timestamp mapping pipeline
- PDF text extraction
- Plain-text verification architecture
- Puter.js browser verification path for PDF/plain text
- Frontend claim/result display

### Areas requiring continued integration/testing

- Robust large-video handling
- Reliable video playback persistence
- Scanned/image-only PDF OCR
- Consistent frontend/backend response schema
- Better handling of LLM quota exhaustion
- Reliable Puter error handling and fallback behavior
- Production deployment

---

# 20. Recommended Next Steps

1. Keep PDF extractor return values consistent.
2. Finish and test the plain-text verification flow.
3. Standardize the verification response JSON.
4. Add graceful handling for Gemini 429 errors.
5. Keep Puter.js as the browser-side verification option for PDF/plain text.
6. Reuse the same claim-verification result structure for every supported input type.
7. Add OCR for scanned PDFs if required.
8. Improve video storage/playback.
9. Add automated backend tests for:
   - PDF
   - text
   - video
   - timestamp mapping
   - API failure handling
10. Deploy only after local pipelines are stable.

---

## FactLens Core Principle

The most important architectural rule is:

```text
INPUT
   ↓
EXTRACT TEXT / TRANSCRIPT
   ↓
EXTRACT CLAIMS
   ↓
VERIFY CLAIMS WITH EVIDENCE
   ↓
RETURN ONE STANDARD RESULT FORMAT
   ↓
DISPLAY IN FRONTEND
```

Video, PDF, and plain text should share the same verification result contract wherever possible. Only the extraction layer and engine integration should differ.

---

## Using the Included PDF

The project ZIP includes a sample PDF named:

```text
sample_document_factlens.pdf
```

in the project root. Use it to test the FactLens PDF verification feature.

### Where the PDF is

```text
FactLens_V15/
├── sample_document_factlens.pdf
├── backend/
└── frontend/
```

### How to use it

1. Start the FactLens backend:

```powershell
python -m uvicorn backend.main:app --reload
```

2. Open the FactLens verification page.

3. Select the **PDF** verification option.

4. Click the PDF upload area and select:

```text
sample_document_factlens.pdf
```

5. Choose the verification engine. The current page defaults to **Puter** for the browser-based PDF path.

6. Click **Verify Now**.

### What should happen

```text
sample_document_factlens.pdf
        ↓
PDF text extraction (PyMuPDF)
        ↓
Puter claim extraction
        ↓
Puter claim verification
        ↓
PDF page mapping
        ↓
Verdicts + evidence
```

### If PDF verification fails

Check the backend terminal first. Common errors encountered during FactLens development include:

- `fitz` deprecation warning — use `import pymupdf` instead.
- `KeyError: 'page_count'` — the PDF extractor must return `page_count`.
- `KeyError: 'pages'` — the PDF extractor must return page-level data when page mapping is enabled.
- `TypeError: string indices must be integers` — the extractor returned a string instead of the dictionary expected by the route.
- HTTP `500` — inspect the final traceback line for the actual backend exception.
- Puter errors — check the browser console and confirm `typeof window.puter === "object"`.

---

## Puter.js Integration

`frontend/verify.html` (the page the FastAPI backend serves at `/verify.html`) uses **Puter.js as the default AI verification engine for PDF and plain-text verification**, reducing dependence on the Gemini API quota for these browser-side flows.

### How it's wired up

`verify.html` is a plain static page with no bundler, so it loads Puter.js through the official CDN script tag:

```html
<script src="
<script src="js/puter-verify.js"></script>
```

The npm package:

```text
@heyputer/puter.js
```

may also exist in the separate Vite/React source tree, but it is not required by the static `/verify.html` page.

`frontend/js/puter-verify.js` contains the browser-side claim extraction and verification logic and builds a report with the same core fields used by the normal results page.

### PDF flow with Puter

1. The PDF is POSTed to the PDF extraction endpoint.
2. PyMuPDF extracts the PDF text on the backend.
3. The extracted text is sent to Puter for claim extraction.
4. Claims are sent to Puter for verification.
5. Claims are matched back to PDF pages locally in the browser.
6. The finished report is stored in `sessionStorage`.
7. The page redirects to `results.html`.

### Plain-text flow with Puter

1. The user enters text.
2. The browser sends the text to the Puter verification path.
3. Puter extracts checkable claims.
4. Puter verifies the claims.
5. The report is stored and displayed by the normal results page.

### Engine toggle & fallback

The Verify page includes a verification-engine toggle. The Puter option is intended for browser-side PDF/plain-text verification.

The existing Gemini backend pipeline remains available as a fallback/compatibility path. Video continues to use the backend Gemini pipeline because that path also requires Faster-Whisper transcription and SRT timestamp mapping.

### Testing Puter.js

1. Open:

```text

```

2. In the browser console, confirm:

```javascript
typeof window.puter
```

Expected:

```text
"object"
```

3. Select **Puter** as the verification engine.

4. Submit a PDF or plain text.

5. The first Puter AI call may display a Puter authentication/consent prompt. Follow the on-screen prompt if it appears.

### About `frontend/src/services/puterClient.js` / `App.jsx`

Those files belong to the separate `frontend/src` Vite/React app and use the npm package:

```text
@heyputer/puter.js
```

The FastAPI-served `/verify.html` page does **not** depend on that React runtime. The active browser-side Puter integration for the current verification page is:

```text
frontend/verify.html
frontend/js/puter-verify.js
```

Puter.js documentation:
