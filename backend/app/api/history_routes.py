
from fastapi import APIRouter, Depends, HTTPException

from app.api.auth_routes import get_current_user
from app.services.history_service import get_history

router = APIRouter(
    prefix="/history",
    tags=["Analysis History"]
)


@router.get("/")
def read_history(user: dict = Depends(get_current_user)):
    try:
        records = get_history(user["id"])

        return {
            "success": True,
            "total_records": len(records),
            "history": records
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve history: {str(error)}"
        )
