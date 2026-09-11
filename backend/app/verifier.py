from .. import config
from .gemini_client import call_json
from .models import Report, Source, Verdict, VerificationResult

# Keep this <= 4 so the normal video/PDF flow stays below the Gemini free-tier
# 5 requests/minute limit for verification. Extraction is a separate request.
VERIFICATION_BATCH_SIZE = max(
    1, int(getattr(config, "VERIFICATION_BATCH_SIZE", 4))
)

SYSTEM_PROMPT = """You are FactLens, a professional factual claim verifier.

Verify EVERY supplied claim using live Google Search.
Prefer primary and authoritative evidence: government websites, official
organizations, primary sources, peer-reviewed research, reputable news
organizations, and authoritative reference sources.

Rules:
- Verify each claim separately.
- Preserve claim_index exactly.
- Never guess.
- Never invent evidence or URLs.
- True = reliable evidence substantially supports the claim.
- False = reliable evidence contradicts the claim.
- Partially True = the claim mixes accurate and inaccurate elements or is materially incomplete.
- Unverifiable = reliable evidence is insufficient to establish true or false.
- Keep explanations concise and evidence-based.

Return ONLY valid JSON with this structure:
{
  "results": [
    {
      "claim_index": 1,
      "claim_text": "original claim",
      "verdict": "True",
      "confidence": 0.95,
      "explanation": "Brief evidence-based explanation."
    }
  ]
}

Return exactly one result for every supplied claim."""


def _build_batch_prompt(batch, start_index):
    lines = []
    for offset, claim in enumerate(batch):
        lines.append(f"{start_index + offset}. {claim.text}")
    return (
        "Verify the following factual claims using live Google Search.\n\n"
        + "\n".join(lines)
        + "\n\nReturn exactly one JSON result for every numbered claim."
    )


def _normalize_sources(sources):
    out = []
    seen = set()
    for source in sources or []:
        if not isinstance(source, dict):
            continue
        url = str(source.get("url", "")).strip()
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(
            Source(
                title=str(source.get("title") or "Web source"),
                url=url,
            )
        )
    return out


def verify_claims(claims):
    if not claims:
        return Report(
            overall_score=None,
            summary="No checkable claims were found.",
            claims=[],
            warnings=[],
        )

    all_raw = []
    warnings = []
    all_sources = {}

    total_batches = (len(claims) + VERIFICATION_BATCH_SIZE - 1) // VERIFICATION_BATCH_SIZE

    for start in range(0, len(claims), VERIFICATION_BATCH_SIZE):
        batch = claims[start:start + VERIFICATION_BATCH_SIZE]
        first_index = start + 1
        last_index = start + len(batch)

        try:
            data, sources = call_json(
                SYSTEM_PROMPT,
                _build_batch_prompt(batch, first_index),
                max_retries=config.VERIFICATION_MAX_RETRIES,
                model=config.GEMINI_MODEL,
                # IMPORTANT: Search grounding is enabled, so call_json must
                # parse JSON from normal Gemini text instead of structured mode.
                json_object=False,
                enable_web_search=True,
            )

            raw = data.get("results", []) if isinstance(data, dict) else []
            if not isinstance(raw, list):
                raise ValueError("Gemini returned an invalid 'results' field.")

            all_raw.extend(raw)

            # Grounding metadata belongs to the whole batch. Keep it available
            # for every returned claim so the UI has real clickable evidence.
            for item in raw:
                if isinstance(item, dict):
                    idx = _safe_int(item.get("claim_index"))
                    if idx is not None:
                        all_sources[idx] = sources

            print(
                f"[FactLens] Gemini verified batch {first_index}-{last_index} "
                f"({first_index}-{last_index} of {len(claims)})"
            )

        except Exception as exc:
            msg = (
                f"Gemini verification batch {first_index}-{last_index} failed: {exc}"
            )
            print(f"[FactLens] WARNING: {msg}")
            warnings.append(msg)

    results = []
    for i, claim in enumerate(claims, start=1):
        raw_result = next(
            (
                item for item in all_raw
                if isinstance(item, dict)
                and _safe_int(item.get("claim_index")) == i
            ),
            None,
        )

        if raw_result is None:
            results.append(
                VerificationResult(
                    claim=claim,
                    verdict=Verdict.UNVERIFIABLE,
                    confidence=0.0,
                    explanation=(
                        "Gemini did not return a verification result for this claim."
                    ),
                    sources=[],
                )
            )
            continue

        try:
            verdict = Verdict(raw_result.get("verdict", "Unverifiable"))
        except ValueError:
            verdict = Verdict.UNVERIFIABLE

        confidence = max(
            0.0,
            min(1.0, _safe_float(raw_result.get("confidence", 0.0))),
        )

        results.append(
            VerificationResult(
                claim=claim,
                verdict=verdict,
                confidence=confidence,
                explanation=str(raw_result.get("explanation", "")).strip(),
                sources=_normalize_sources(all_sources.get(i, [])),
            )
        )

    score = _score(results)
    return Report(
        overall_score=score,
        summary=_summary(results, score),
        claims=results,
        warnings=warnings,
    )


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _score(results):
    weights = {
        Verdict.TRUE: 1.0,
        Verdict.PARTIALLY_TRUE: 0.5,
        Verdict.FALSE: 0.0,
    }
    vals = [weights[r.verdict] for r in results if r.verdict in weights]
    return sum(vals) / len(vals) if vals else None


def _summary(results, score):
    if not results:
        return "No claims were verified."
    counts = {}
    for result in results:
        counts[result.verdict.value] = counts.get(result.verdict.value, 0) + 1
    detail = ", ".join(
        f"{count} {label.lower()}" for label, count in counts.items()
    )
    base = f"Checked {len(results)} claim(s): {detail}."
    return (
        base
        if score is not None
        else base + " Overall credibility could not be scored."
    )
