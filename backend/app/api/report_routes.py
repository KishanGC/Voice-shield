from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.services.history_service import get_history_record
from app.services.report_service import generate_analysis_pdf
from app.api.auth_routes import get_current_user


router = APIRouter(
    prefix="/reports",
    tags=["PDF Reports"]
)


@router.get("/{history_id}/pdf")
def download_analysis_report(history_id: int, user: dict = Depends(get_current_user)):

    record = get_history_record(history_id, user["id"])

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis record not found."
        )

    try:
        pdf_buffer = generate_analysis_pdf(record)

        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="VoiceShield_Report_{history_id}.pdf"'
                )
            }
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to generate PDF report: {str(error)}"
        )
