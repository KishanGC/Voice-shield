from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.api.auth_routes import get_current_user

from app.services.sarvam_service import transcribe_audio

router = APIRouter(
    prefix="/transcription",
    tags=["Sarvam AI Transcription"]
)


@router.post("/analyze")
async def analyze_transcription(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    del user
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename provided."
        )

    if not file.filename.lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a WAV audio file."
        )

    try:
        audio_bytes = await file.read()

        if len(audio_bytes) > 20 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Audio file must be smaller than 20 MB."
            )

        result = transcribe_audio(
            audio_bytes,
            file.filename
        )

        return {
            "success": True,
            "filename": file.filename,
            "transcription": result
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    except RuntimeError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error)
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(error)}"
        )

    finally:
        await file.close()
