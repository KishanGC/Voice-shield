import os
import requests
from dotenv import load_dotenv

load_dotenv()

SARVAM_API_URL = "https://api.sarvam.ai/speech-to-text"


def transcribe_audio(audio_bytes: bytes, filename: str):
    api_key = os.getenv("SARVAM_API_KEY")

    if not api_key:
        raise ValueError("SARVAM_API_KEY is missing from the backend .env file.")

    if not audio_bytes:
        raise ValueError("The uploaded audio file is empty.")

    headers = {
        "api-subscription-key": api_key
    }

    files = {
        "file": (
            filename,
            audio_bytes,
            "audio/wav"
        )
    }

    data = {
        "model": "saaras:v4",
        "mode": "transcribe",
        "language_code": "unknown"
    }

    try:
        response = requests.post(
            SARVAM_API_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=60
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Sarvam API error ({response.status_code}): {response.text}"
            )

        result = response.json()

        return {
            "transcript": result.get("transcript", ""),
            "language_code": result.get("language_code"),
            "request_id": result.get("request_id")
        }

    except requests.RequestException as error:
        raise RuntimeError(
            f"Unable to connect to Sarvam AI: {str(error)}"
        )