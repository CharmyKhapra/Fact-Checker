import json
import re
import time
from typing import Any

from google import genai
from google.genai import types
from .. import config


class GeminiClientError(Exception):
    pass


class JsonParseError(Exception):
    pass


_client = None


def _get_client():
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise GeminiClientError(
                "GEMINI_API_KEY is not set. Put it in the project-root .env file."
            )
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _extract_json(text: str):
    """Parse JSON even when Gemini wraps it in markdown/code fences."""
    text = (text or "").strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL | re.I)
    if m:
        text = m.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find the largest JSON object/array in the response.
    for a, b in (("{", "}"), ("[", "]")):
        i, j = text.find(a), text.rfind(b)
        if i >= 0 and j > i:
            try:
                return json.loads(text[i : j + 1])
            except json.JSONDecodeError:
                pass

    raise JsonParseError(
        f"Could not parse JSON from Gemini output: {text[:800]!r}"
    )


def _error_text(exc: Exception) -> str:
    return f"Gemini API error: {exc}"


def _retry_delay(exc: Exception, attempt: int) -> float:
    """Use Gemini's suggested retry delay when available, otherwise back off."""
    text = str(exc)
    match = re.search(r"retryDelay[^\n]*?(\d+)s", text, re.I)
    if match:
        return min(float(match.group(1)) + 1.0, 65.0)
    match = re.search(r"retry in (\d+(?:\.\d+)?)s", text, re.I)
    if match:
        return min(float(match.group(1)) + 1.0, 65.0)
    return min(2.0 * (attempt + 1), 8.0)


def _grounding_sources(response: Any):
    """Extract URLs actually returned by Google Search grounding metadata."""
    out = []
    seen = set()
    try:
        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            gm = getattr(candidate, "grounding_metadata", None)
            if not gm:
                continue
            chunks = getattr(gm, "grounding_chunks", None) or []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if not web:
                    continue
                uri = getattr(web, "uri", None)
                title = getattr(web, "title", None) or "Web source"
                if uri and uri not in seen:
                    seen.add(uri)
                    out.append({"title": title, "url": uri})
    except Exception:
        pass
    return out


def call_json(
    system_prompt,
    user_prompt,
    max_retries=2,
    temperature=0.0,
    model=None,
    json_object=True,
    enable_web_search=False,
    response_schema=None,
):
    """
    Shared Gemini request helper.

    Google Search grounding and application/json response mode are intentionally
    mutually exclusive because the API rejects that combination in the current
    SDK/API configuration used by FactLens.
    """
    client = _get_client()
    model = model or config.GEMINI_MODEL
    last = None

    for attempt in range(max_retries + 1):
        try:
            contents = (
                f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n"
                f"USER INPUT:\n{user_prompt}"
            )
            kwargs = {}

            if enable_web_search:
                # Search-grounded requests use normal text output. We parse the
                # JSON ourselves after the model responds.
                kwargs["tools"] = [
                    types.Tool(google_search=types.GoogleSearch())
                ]
            elif json_object:
                schema = response_schema or {
                    "type": "OBJECT",
                    "properties": {
                        "results": {
                            "type": "ARRAY",
                            "items": {"type": "OBJECT"},
                        }
                    },
                    "required": ["results"],
                }
                kwargs["response_mime_type"] = "application/json"
                kwargs["response_schema"] = schema

            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(**kwargs),
            )

            text = getattr(response, "text", None) or ""
            if not text.strip():
                raise GeminiClientError("Gemini returned an empty response.")

            return _extract_json(text), _grounding_sources(response)

        except Exception as exc:
            last = exc
            if attempt < max_retries:
                wait = _retry_delay(exc, attempt)
                print(
                    f"[FactLens] Gemini request failed; retrying in {wait:.1f}s "
                    f"(attempt {attempt + 1}/{max_retries})..."
                )
                time.sleep(wait)
            else:
                raise GeminiClientError(_error_text(exc)) from exc

    raise GeminiClientError(
        _error_text(last or RuntimeError("unknown error"))
    )
