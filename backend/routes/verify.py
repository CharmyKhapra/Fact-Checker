import os, tempfile, uuid, shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from .. import config
from ..app.claim_extractor import extract_claims
from ..app.verifier import verify_claims
from ..services.transcriber import transcribe_video
from ..services.pdf_extractor import extract_pdf
from ..services.mapping import attach_timestamps, attach_pages

router=APIRouter(prefix="/api/verify",tags=["verification"])

def _save_upload(upload, max_mb):
    suffix=Path(upload.filename or "").suffix.lower()
    if upload.size and upload.size > max_mb*1024*1024:
        raise HTTPException(413,f"File exceeds {max_mb} MB limit.")
    fd,path=tempfile.mkstemp(suffix=suffix,dir=config.TEMP_DIR)
    os.close(fd)
    with open(path,"wb") as f:
        while True:
            chunk=upload.file.read(1024*1024)
            if not chunk: break
            f.write(chunk)
    if os.path.getsize(path)>max_mb*1024*1024:
        os.unlink(path); raise HTTPException(413,f"File exceeds {max_mb} MB limit.")
    return path

def _report(report,**extra):
    data=report.model_dump()
    data.update(extra)
    return data


def _persist_video(path: str, original_name: str) -> str:
    """Copy the verified video to the served media directory so the results page can replay it."""
    ext = Path(original_name or path).suffix.lower() or ".mp4"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = config.MEDIA_DIR / safe_name
    shutil.copy2(path, dest)
    return f"/media/{safe_name}"

@router.post("/text")
def verify_text(text: str = Form(...)):
    text = (text or "").strip()
    if not text: raise HTTPException(400,"Text is required.")
    if len(text)>config.MAX_TEXT_LENGTH: raise HTTPException(413,"Text is too long.")
    print(f"[FactLens] Text received: {len(text)} chars")
    claims=extract_claims(text)
    print(f"[FactLens] Found {len(claims)} checkable claims")
    report=verify_claims(claims)
    return _report(report,input_type="text",input_text=text)


@router.post("/video-url")
def verify_video_url(url:str=Form(...)):
    if not url.startswith(("http://","https://")): raise HTTPException(400,"Invalid video URL.")
    temp=None
    try:
        import yt_dlp
        import tempfile
        d=tempfile.mkdtemp(dir=config.TEMP_DIR)

        # Locate an ffmpeg binary. Prefer one on the system PATH; if none is
        # found, fall back to the portable binary bundled with the
        # imageio-ffmpeg package (already a project dependency), so merging
        # separate video/audio streams works without any manual install.
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            try:
                import imageio_ffmpeg
                ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            except Exception:
                ffmpeg_path = None
        has_ffmpeg = bool(ffmpeg_path)
        if has_ffmpeg:
            video_format = "bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best"
        else:
            print("[FactLens] ffmpeg not found; downloading a single progressive stream instead of merging.")
            video_format = "best[ext=mp4]/best"

        # YouTube's "web" client (the default) now requires deciphering a
        # signature via a JS runtime, and yt-dlp's web/android-vr fallbacks
        # can come back as HTTP 403. Extracting from the "android" and "ios"
        # clients sidesteps that signature step entirely and is the
        # currently-recommended workaround, so try them ahead of "web".
        opts={
            "outtmpl":str(Path(d)/"%(id)s.%(ext)s"),
            "format":video_format,
            "merge_output_format":"mp4",
            "noplaylist":True,
            "extractor_args":{"youtube":{"player_client":["android","ios","web"]}},
        }
        if ffmpeg_path:
            opts["ffmpeg_location"] = ffmpeg_path

        def _download(o):
            with yt_dlp.YoutubeDL(o) as ydl:
                info=ydl.extract_info(url,download=True)
                t=Path(ydl.prepare_filename(info))
                if not t.exists():
                    candidates=list(Path(d).glob("*"))
                    t=candidates[0] if candidates else None
                return t

        try:
            temp=_download(opts)
        except yt_dlp.utils.DownloadError as e:
            msg=str(e)
            if "ffmpeg is not installed" in msg:
                # Safety net if the merge step still needs ffmpeg for some
                # reason: retry once without needing it at all.
                print("[FactLens] Merge failed despite ffmpeg check; retrying with progressive-only format.")
                opts["format"]="best[ext=mp4]/best"
                temp=_download(opts)
            elif "403" in msg or "Forbidden" in msg:
                # Some formats/clients get blocked with 403s; fall back to
                # yt-dlp's own best-effort format selection with no client
                # restriction, which often finds a working stream.
                print("[FactLens] Got 403 from YouTube; retrying with default client/format selection.")
                opts.pop("extractor_args", None)
                opts["format"]="best"
                temp=_download(opts)
            else:
                raise
        if not temp or not temp.exists(): raise HTTPException(422,"Could not download the video.")
        transcript=transcribe_video(str(temp))
        claims=extract_claims(transcript["text"])
        print("[FactLens] Stage 3/4: live web fact verification")
        report=verify_claims(claims)
        print("[FactLens] Stage 4/4: mapping verified claims to SRT timestamps")
        attach_timestamps(report.claims,transcript["segments"])
        media_url = _persist_video(str(temp), Path(temp).name)
        return _report(report,input_type="video",filename=url,transcript=transcript,media_url=media_url,source_url=url)
    except HTTPException: raise
    except Exception as e: raise HTTPException(422,f"Could not process video URL: {e}")
    finally:
        if temp:
            try:
                shutil.rmtree(Path(temp).parent,ignore_errors=True)
            except Exception: pass

@router.post("/pdf-url")
def verify_pdf_url(url:str=Form(...)):
    if not url.startswith(("http://","https://")): raise HTTPException(400,"Invalid PDF URL.")
    path=None
    try:
        import requests
        r=requests.get(url,timeout=30,stream=True)
        r.raise_for_status()
        fd,path=tempfile.mkstemp(suffix=".pdf",dir=config.TEMP_DIR); os.close(fd)
        total=0
        with open(path,"wb") as f:
            for chunk in r.iter_content(1024*1024):
                total+=len(chunk)
                if total>config.MAX_PDF_MB*1024*1024: raise HTTPException(413,"PDF exceeds size limit.")
                f.write(chunk)
        extracted=extract_pdf(path)
        if not extracted["text"].strip(): raise HTTPException(422,"No readable text found in PDF.")
        claims=extract_claims(extracted["text"]); report=verify_claims(claims)
        attach_pages(report.claims,extracted["pages"])
        return _report(report,input_type="pdf",filename=url,extracted_text=extracted["text"],pages=extracted["pages"],page_count=extracted["page_count"])
    except HTTPException: raise
    except Exception as e: raise HTTPException(422,f"Could not process PDF URL: {e}")
    finally:
        if path:
            try: os.unlink(path)
            except OSError: pass

@router.post("/video")
def verify_video(file:UploadFile=File(...)):
    path=_save_upload(file,config.MAX_VIDEO_MB)
    try:
        print(f"[FactLens] Video received: {file.filename}")
        print("[FactLens] Stage 1/4: transcription -> SRT")
        transcript=transcribe_video(path)
        print(f"[FactLens] SRT created with {len(transcript["segments"])} segments")
        print("[FactLens] Stage 2/4: extracting factual claims from SRT text")
        claims=extract_claims(transcript["text"])
        print(f"[FactLens] Found {len(claims)} checkable claims")
        print("[FactLens] Stage 3/4: live web fact verification")
        report=verify_claims(claims)
        if report.warnings:
            for w in report.warnings:
                print(f"[FactLens] Stage 3 WARNING: {w}")
        print("[FactLens] Stage 4/4: mapping verified claims to SRT timestamps")

        print(f"[FactLens] Stage 4: {len(report.claims)} verification results")
        print(f"[FactLens] Stage 4: {len(transcript['segments'])} transcript segments")

        for i, result in enumerate(report.claims):
            print(f"[FactLens] Stage 4 result {i}: claim={result.claim.text[:80]!r}")
            print(f"[FactLens] Stage 4 result {i}: snippet={result.claim.source_snippet[:80]!r}")

        print("[FactLens] Stage 4: starting attach_timestamps()")
        attach_timestamps(report.claims, transcript["segments"])
        print("[FactLens] Stage 4: attach_timestamps() finished")

        print("[FactLens] Stage 4: starting video persistence")
        media_url = _persist_video(path, file.filename)
        print("[FactLens] Stage 4: video persistence finished")
        return _report(report,input_type="video",filename=file.filename,transcript=transcript,media_url=media_url)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FactLens] VIDEO PIPELINE FAILED: {type(e).__name__}: {e}")
        raise HTTPException(422, f"Video verification failed: {e}") from e
    finally:
        try: os.unlink(path)
        except OSError: pass

@router.post("/pdf-url-extract")
def verify_pdf_url_extract(url: str = Form(...)):
    """PDF-by-URL parsing only -- no Gemini call. See /pdf-extract."""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid PDF URL.")
    path = None
    try:
        import requests
        r = requests.get(url, timeout=30, stream=True)
        r.raise_for_status()
        fd, path = tempfile.mkstemp(suffix=".pdf", dir=config.TEMP_DIR); os.close(fd)
        total = 0
        with open(path, "wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                total += len(chunk)
                if total > config.MAX_PDF_MB * 1024 * 1024:
                    raise HTTPException(413, "PDF exceeds size limit.")
                f.write(chunk)
        extracted = extract_pdf(path)
        if not extracted["text"].strip():
            raise HTTPException(422, "No readable text found in PDF.")
        return {
            "input_type": "pdf",
            "filename": url,
            "extracted_text": extracted["text"],
            "pages": extracted["pages"],
            "page_count": extracted["page_count"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Could not process PDF URL: {e}")
    finally:
        if path:
            try: os.unlink(path)
            except OSError: pass


@router.post("/pdf-extract")
def verify_pdf_extract(file: UploadFile = File(...)):
    """
    PDF parsing only -- no Gemini call.

    Used by the browser-side Puter.js verification flow: the backend still
    does local PDF text extraction (PyMuPDF), but claim extraction and
    verification happen client-side via puter.ai.chat() instead of Gemini.
    """
    path = _save_upload(file, config.MAX_PDF_MB)
    try:
        extracted = extract_pdf(path)
        if not extracted["text"].strip():
            raise HTTPException(
                422,
                "No readable text was found. For scanned PDFs, install Tesseract OCR and try again.",
            )
        return {
            "input_type": "pdf",
            "filename": file.filename,
            "extracted_text": extracted["text"],
            "pages": extracted["pages"],
            "page_count": extracted["page_count"],
        }
    finally:
        try: os.unlink(path)
        except OSError: pass


@router.post("/pdf")
def verify_pdf(file:UploadFile=File(...)):
    path=_save_upload(file,config.MAX_PDF_MB)
    try:
        extracted=extract_pdf(path)
        if not extracted["text"].strip():
            raise HTTPException(422,"No readable text was found. For scanned PDFs, install Tesseract OCR and try again.")
        claims=extract_claims(extracted["text"])
        report=verify_claims(claims)
        attach_pages(report.claims,extracted["pages"])
        return _report(report,input_type="pdf",filename=file.filename,
                       extracted_text=extracted["text"],pages=extracted["pages"],
                       page_count=extracted["page_count"])
    finally:
        try: os.unlink(path)
        except OSError: pass
