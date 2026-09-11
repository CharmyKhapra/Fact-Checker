"""SRT generation/parsing helpers.

The video pipeline deliberately treats the SRT as the canonical transcript:
Whisper segments -> .srt -> parse .srt -> claim extraction -> fact checking.
"""
import re
from pathlib import Path


def seconds_to_srt(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    total_ms = int(round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def segments_to_srt(segments) -> str:
    blocks = []
    for i, seg in enumerate(segments, 1):
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        blocks.append(
            f"{i}\n{seconds_to_srt(seg['start'])} --> {seconds_to_srt(seg['end'])}\n{text}"
        )
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def parse_srt(srt_text: str):
    """Parse standard SRT into timestamped segments."""
    results = []
    blocks = re.split(r"\n\s*\n", (srt_text or "").strip())
    time_re = re.compile(
        r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*"
        r"(\d{2}):(\d{2}):(\d{2}),(\d{3})"
    )

    def to_seconds(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 3:
            continue
        match = time_re.search(lines[1])
        if not match:
            continue
        start = to_seconds(*match.groups()[:4])
        end = to_seconds(*match.groups()[4:])
        text = " ".join(lines[2:]).strip()
        if text:
            results.append({"start": round(start, 3), "end": round(end, 3), "text": text})
    return results


def write_srt(srt_text: str, path: str | Path) -> str:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(srt_text, encoding="utf-8")
    return str(path)
