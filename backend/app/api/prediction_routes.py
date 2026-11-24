
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel

from app.services.prediction_service import predict_audio
from app.services.history_service import save_analysis
from app.api.auth_routes import get_current_user

router = APIRouter(
    prefix="/prediction",
    tags=["AI Prediction"]
)


class TranscriptionUpdate(BaseModel):
    transcript: str
    language_code: str | None = None


@router.post("/analyze")
async def analyze_audio(file: UploadFile = File(...), user: dict = Depends(get_current_user)):

    if not file.filename or not file.filename.lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a WAV audio file."
        )

    try:
        audio_bytes = await file.read()

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded audio file is empty."
            )

        if len(audio_bytes) > 20 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Audio file must be smaller than 20 MB."
            )

        result = predict_audio(audio_bytes, include_waveform_preview=True)

        history_id = save_analysis(file.filename, result, user_id=user["id"])

        return {
            "success": True,
            "filename": file.filename,
            "history_id": history_id,
            "analysis": result
        }

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Audio analysis failed: {str(error)}"
        )
    finally:
        await file.close()


@router.patch("/history/{history_id}/transcription")
async def update_history_transcription(
    history_id: int,
    transcription: TranscriptionUpdate,
    user: dict = Depends(get_current_user),
):
    from app.services.history_service import get_history_record

    try:
        record = get_history_record(history_id, user["id"])

        if record is None:
            raise HTTPException(
                status_code=404,
                detail="Analysis history record not found."
            )

        from app.services.history_service import get_connection

        with get_connection() as connection:
            connection.execute(
                """
                UPDATE analysis_history
                SET transcript = ?, language_code = ?
                WHERE id = ? AND user_id = ?
                """,
                (
                    transcription.transcript,
                    transcription.language_code,
                    history_id,
                    user["id"]
                )
            )

        return {
            "success": True,
            "message": "Transcription saved to analysis history.",
            "history_id": history_id
        }

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to update transcription: {str(error)}"
        )
