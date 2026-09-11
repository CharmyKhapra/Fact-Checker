import re
from difflib import SequenceMatcher

def _norm(s):
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9\s]"," ",(s or "").lower())).strip()

def attach_timestamps(results,segments):
    for result in results:
        snippet=_norm(result.claim.source_snippet)
        claim=_norm(result.claim.text)
        best=None; best_score=0
        for seg in segments:
            st=_norm(seg["text"])
            if snippet and snippet in st: score=1.0
            else: score=max(SequenceMatcher(None, snippet, st).ratio() if snippet else 0,
                            SequenceMatcher(None, claim, st).ratio()*0.75 if claim else 0)
            if score>best_score: best_score=score; best=seg
        if best and best_score>=0.35:
            result.timestamp_start=best["start"]; result.timestamp_end=best["end"]
    return results

def attach_pages(results,pages):
    # `pages` should be a list of {"page": n, "text": ...} dicts (see
    # services/pdf_extractor.py). Tolerate a flat list of strings too, so a
    # future caller passing raw page text doesn't crash with a TypeError.
    normalized=[]
    for i,p in enumerate(pages):
        if isinstance(p,dict):
            normalized.append(p)
        else:
            normalized.append({"page":i+1,"text":p})
    for result in results:
        snippet=_norm(result.claim.source_snippet)
        best=None; best_score=0
        for p in normalized:
            score=SequenceMatcher(None,snippet,_norm(p["text"])).ratio() if snippet else 0
            if snippet and snippet in _norm(p["text"]): score=1
            if score>best_score: best_score=score; best=p
        if best and best_score>=0.2: result.page=best["page"]
    return results
