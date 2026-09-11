from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class Verdict(str, Enum):
    TRUE = "True"
    FALSE = "False"
    PARTIALLY_TRUE = "Partially True"
    UNVERIFIABLE = "Unverifiable"

class Claim(BaseModel):
    text: str
    source_snippet: str = ""

class Source(BaseModel):
    title: str = "Untitled"
    url: str

class VerificationResult(BaseModel):
    claim: Claim
    verdict: Verdict
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    sources: List[Source] = []
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None
    page: Optional[int] = None

class Report(BaseModel):
    overall_score: Optional[float] = None
    summary: str
    claims: List[VerificationResult] = []
    warnings: List[str] = []
