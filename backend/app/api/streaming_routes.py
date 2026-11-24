
import io
import wave

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi import HTTPException

from app.services.prediction_service import predict_audio
from app.services.auth_service import user_for_token


router = APIRouter(tags=["Live Audio Streaming"])

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2
SEGMENT_SECONDS = 3

BYTES_PER_SEGMENT = (
    SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * SEGMENT_SECONDS
)


def create_wav_bytes(pcm_data: bytes) -> bytes:
    """Convert incoming 16-bit PCM audio into a WAV file."""

    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(SAMPLE_WIDTH)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm_data)

    return buffer.getvalue()


@router.websocket("/ws/audio")
async def stream_audio(websocket: WebSocket):
    await websocket.accept()

    try:
        auth_message = await websocket.receive_json()
        token = auth_message.get("token") if isinstance(auth_message, dict) else None
        if not token:
            raise HTTPException(status_code=401, detail="Sign in to start live detection.")
        user_for_token(token)
    except WebSocketDisconnect:
        return
    except (HTTPException, ValueError):
        await websocket.close(code=4401, reason="Authentication required")
        return

    audio_buffer = bytearray()

    try:
        await websocket.send_json({
            "status": "connected",
            "message": "VoiceShield live audio connection established."
        })

        while True:
            pcm_chunk = await websocket.receive_bytes()

            audio_buffer.extend(pcm_chunk)

            while len(audio_buffer) >= BYTES_PER_SEGMENT:
                segment = bytes(
                    audio_buffer[:BYTES_PER_SEGMENT]
                )

                del audio_buffer[:BYTES_PER_SEGMENT]

                try:
                    wav_bytes = create_wav_bytes(segment)
                    result = predict_audio(wav_bytes)

                    await websocket.send_json({
                        "status": "analyzed",
                        "analysis": result
                    })

                except Exception as error:
                    await websocket.send_json({
                        "status": "error",
                        "message": str(error)
                    })

    except WebSocketDisconnect:
        print("VoiceShield audio streaming disconnected.")
