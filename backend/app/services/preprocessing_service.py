import io

import librosa
import numpy as np
import soundfile as sf


TARGET_SAMPLE_RATE = 16000


def preprocess_audio(audio_bytes: bytes) -> dict:
    """
    Convert uploaded audio into a standard format for analysis.

    Steps:
    1. Decode audio.
    2. Convert to mono.
    3. Resample to 16 kHz.
    4. Normalize audio amplitude.
    """

    try:
        # Decode the audio file.
        audio, sample_rate = sf.read(
            io.BytesIO(audio_bytes),
            dtype="float32",
        )

        if audio.size == 0:
            raise ValueError("The audio file is empty.")

        # Convert stereo or multichannel audio to mono.
        if audio.ndim == 2:
            audio = np.mean(audio, axis=1)

        # Reject invalid audio values.
        if not np.all(np.isfinite(audio)):
            raise ValueError("The audio contains invalid numerical values.")

        # Resample to 16 kHz if necessary.
        if sample_rate != TARGET_SAMPLE_RATE:
            audio = librosa.resample(
                audio,
                orig_sr=sample_rate,
                target_sr=TARGET_SAMPLE_RATE,
            )

        # Normalize amplitude without changing silent audio.
        peak = float(np.max(np.abs(audio)))

        if peak > 0:
            audio = audio / peak

        return {
            "audio": audio,
            "sample_rate": TARGET_SAMPLE_RATE,
            "duration_seconds": round(
                len(audio) / TARGET_SAMPLE_RATE, 3
            ),
            "channels": 1,
            "peak_amplitude": round(float(np.max(np.abs(audio))), 4),
        }

    except Exception as exc:
        raise ValueError(f"Audio preprocessing failed: {exc}") from exc