import io
import soundfile as sf

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.api.auth_routes import get_current_user

router = APIRouter(prefix="/audio", tags=["Audio"])

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/upload")
async def upload_audio(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    del user
    filename = file.filename or "unknown"
    extension = "." + filename.rsplit(".", 1)[-1].lower()

    if "." not in filename or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format. Upload WAV, MP3, or M4A.",
        )

    audio_bytes = await file.read()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(audio_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum allowed size is 20 MB.",
        )

    try:
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not read this audio file. "
                "For this milestone, try uploading a valid WAV file."
            ),
        )

    duration_seconds = len(audio_data) / sample_rate

    if duration_seconds <= 0:
        raise HTTPException(status_code=400, detail="Audio duration is invalid.")

    channels = 1 if audio_data.ndim == 1 else audio_data.shape[1]

    return {
        "success": True,
        "filename": filename,
        "format": extension[1:],
        "sample_rate": int(sample_rate),
        "channels": int(channels),
        "duration_seconds": round(duration_seconds, 2),
        "size_bytes": len(audio_bytes),
        "message": "Audio uploaded and validated successfully.",
    }
