import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"

# Load the project .env before reading configuration values.
load_dotenv(PROJECT_DIR / ".env")

UPLOAD_DIR = BASE_DIR / "uploads"
MEDIA_DIR = BASE_DIR / "media"
OUTPUT_DIR = BASE_DIR / "outputs"
TEMP_DIR = BASE_DIR / "temp"
for folder in (UPLOAD_DIR, MEDIA_DIR, OUTPUT_DIR, TEMP_DIR):
    folder.mkdir(parents=True, exist_ok=True)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")
TRANSCRIPTION_ENGINE = os.getenv("TRANSCRIPTION_ENGINE", "local")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Best available Gemini reasoning model for this fact-checking workflow.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EXTRACTION_MODEL = GEMINI_MODEL
VERIFICATION_BATCH_SIZE = int(os.getenv("VERIFICATION_BATCH_SIZE", "4"))
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "50000"))
MAX_CLAIMS = int(os.getenv("MAX_CLAIMS", "20"))
EXTRACTION_MAX_RETRIES = int(os.getenv("EXTRACTION_MAX_RETRIES", "1"))
VERIFICATION_MAX_RETRIES = int(os.getenv("VERIFICATION_MAX_RETRIES", "1"))

MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "500"))
MAX_PDF_MB = int(os.getenv("MAX_PDF_MB", "50"))
