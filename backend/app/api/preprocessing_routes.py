from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.api.auth_routes import get_current_user

from app.services.preprocessing_service import preprocess_audio


router = APIRouter(prefix="/audio", tags=["Audio Processing"])

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a"}
MAX_FILE_SIZE = 20 * 1024 * 1024


@router.post("/preprocess")
async def preprocess_uploaded_audio(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    del user
    filename = file.filename or "unknown"
    extension = "." + filename.rsplit(".", 1)[-1].lower()

    if "." not in filename or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Upload a WAV, MP3, or M4A file.",
        )

    audio_bytes = await file.read()

    if not audio_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(audio_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Maximum file size is 20 MB.",
        )

    try:
        result = preprocess_audio(audio_bytes)

        return {
            "success": True,
            "filename": filename,
            "sample_rate": result["sample_rate"],
            "channels": result["channels"],
            "duration_seconds": result["duration_seconds"],
            "peak_amplitude": result["peak_amplitude"],
            "message": "Audio preprocessed successfully.",
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
