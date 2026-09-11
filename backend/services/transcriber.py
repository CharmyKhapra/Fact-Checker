import os
from pathlib import Path

from faster_whisper import WhisperModel

from .. import config
from .srt_utils import segments_to_srt, parse_srt, write_srt

_model = None


def _get_local_model():
    global _model
    if _model is None:
        print(f"[FactLens] Loading Faster-Whisper model: {config.WHISPER_MODEL}")
        _model = WhisperModel(
            config.WHISPER_MODEL,
            device=config.DEVICE,
            compute_type=config.COMPUTE_TYPE,
        )
        print("[FactLens] Whisper model loaded.")
    return _model


def _local_transcribe(video_path):
    segments, info = _get_local_model().transcribe(
        video_path, beam_size=5, vad_filter=True
    )
    rows = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            rows.append({"start": float(seg.start), "end": float(seg.end), "text": text})
    return rows, getattr(info, "language", None), getattr(info, "language_probability", None), getattr(info, "duration", None)


def transcribe_video(video_path: str):
    """Transcribe locally with Faster-Whisper and make the SRT canonical."""
    try:
        rows, language, probability, duration = _local_transcribe(video_path)
    except Exception as exc:
        raise RuntimeError(f"Video transcription failed. Faster-Whisper: {exc}") from exc

    srt = segments_to_srt(rows)
    srt_path = Path(config.OUTPUT_DIR) / (Path(video_path).stem + ".srt")
    write_srt(srt, srt_path)
    parsed_segments = parse_srt(Path(srt_path).read_text(encoding="utf-8"))
    transcript_text = " ".join(x["text"] for x in parsed_segments).strip()

    return {
        "language": language,
        "language_probability": probability,
        "duration": duration if duration is not None else (parsed_segments[-1]["end"] if parsed_segments else 0),
        "segments": parsed_segments,
        "srt": srt,
        "srt_path": str(srt_path),
        "text": transcript_text,
        "transcript_source": "srt",
    }

