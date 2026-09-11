from .. import config
from .gemini_client import call_json
from .models import Claim

SYSTEM_PROMPT = """You are the claim-extraction stage of a fact-checking tool.
Read ALL supplied transcript text and extract concrete, checkable factual claims.
Do not summarize. Preserve the meaning of each claim and include a short source_snippet
from the supplied text. Skip opinions, jokes, predictions, and purely subjective
statements. Return only the requested JSON object."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "claims": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "text": {"type": "STRING"},
                    "source_snippet": {"type": "STRING"},
                },
                "required": ["text", "source_snippet"],
            },
        }
    },
    "required": ["claims"],
}


def extract_claims(text):
    if not text or not text.strip():
        return []
    data, _ = call_json(
        SYSTEM_PROMPT,
        text,
        max_retries=config.EXTRACTION_MAX_RETRIES,
        model=config.GEMINI_MODEL,
        json_object=True,
        response_schema=SCHEMA,
    )
    data = data.get("claims", []) if isinstance(data, dict) else []
    claims = []
    for item in data[: config.MAX_CLAIMS]:
        if isinstance(item, dict) and item.get("text"):
            claims.append(
                Claim(
                    text=str(item["text"]).strip(),
                    source_snippet=str(item.get("source_snippet", "")).strip(),
                )
            )
    return claims
