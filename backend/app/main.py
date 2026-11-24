
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.audio_routes import router as audio_router
from app.api.preprocessing_routes import router as preprocessing_router
from app.api.feature_routes import router as feature_router
from app.api.prediction_routes import router as prediction_router
from app.api.history_routes import router as history_router
from app.api.report_routes import router as report_router
from app.api.streaming_routes import router as streaming_router

from app.services.history_service import initialize_database
from app.api.transcription_routes import router as transcription_router
from app.api.auth_routes import router as auth_router


app = FastAPI(
    title="VoiceShield AI",
    description=(
        "AI-Powered Real-Time Detection and "
        "Prevention of Voice Cloning Impersonation Attacks"
    ),
    version="0.5.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    initialize_database()


@app.get("/")
def home():
    return {
        "project": "VoiceShield AI",
        "status": "running",
        "message": "Welcome to the VoiceShield AI backend",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "backend": "FastAPI",
    }


app.include_router(audio_router)
app.include_router(auth_router)
app.include_router(preprocessing_router)
app.include_router(feature_router)
app.include_router(prediction_router)
app.include_router(history_router)
app.include_router(report_router)
app.include_router(streaming_router)
app.include_router(transcription_router)
