import numpy as np
import librosa


def extract_audio_features(audio: np.ndarray, sample_rate: int = 16000) -> dict:
    """
    Extract numerical features from preprocessed audio.

    Input:
        audio: Mono audio waveform as a NumPy array.
        sample_rate: Sampling rate of the waveform.

    Output:
        Dictionary containing summary statistics.
    """

    audio = np.asarray(audio, dtype=np.float32)

    if audio.ndim != 1:
        raise ValueError("Audio must be mono.")

    if audio.size == 0:
        raise ValueError("Audio is empty.")

    if not np.all(np.isfinite(audio)):
        raise ValueError("Audio contains invalid numerical values.")

    if sample_rate <= 0:
        raise ValueError("Sample rate must be positive.")

    # MFCC: summarize characteristics of the audio spectrum.
    mfcc = librosa.feature.mfcc(
        y=audio,
        sr=sample_rate,
        n_mfcc=13,
        n_fft=512,
        hop_length=160,
    )

    # Mel spectrogram in decibels.
    mel_spectrogram = librosa.feature.melspectrogram(
        y=audio,
        sr=sample_rate,
        n_fft=512,
        hop_length=160,
        n_mels=40,
    )

    mel_db = librosa.power_to_db(
        mel_spectrogram,
        ref=np.max,
    )

    # Spectral features.
    spectral_centroid = librosa.feature.spectral_centroid(
        y=audio,
        sr=sample_rate,
        n_fft=512,
        hop_length=160,
    )

    spectral_bandwidth = librosa.feature.spectral_bandwidth(
        y=audio,
        sr=sample_rate,
        n_fft=512,
        hop_length=160,
    )

    zero_crossing_rate = librosa.feature.zero_crossing_rate(
        audio,
        frame_length=512,
        hop_length=160,
    )

    # Estimate fundamental frequency (pitch).
    f0 = librosa.yin(
        audio,
        fmin=65,
        fmax=400,
        sr=sample_rate,
        frame_length=512,
        hop_length=160,
    )

    # Ignore invalid pitch estimates.
    valid_pitch = f0[np.isfinite(f0)]

    # Calculate summary statistics.
    features = {
        "mfcc_mean": np.mean(mfcc, axis=1).tolist(),
        "mfcc_std": np.std(mfcc, axis=1).tolist(),
        "mel_spectrogram_mean": float(np.mean(mel_db)),
        "mel_spectrogram_std": float(np.std(mel_db)),
        "spectral_centroid_mean": float(np.mean(spectral_centroid)),
        "spectral_bandwidth_mean": float(np.mean(spectral_bandwidth)),
        "zero_crossing_rate_mean": float(np.mean(zero_crossing_rate)),
        "rms_energy_mean": float(
            np.mean(
                librosa.feature.rms(
                    y=audio,
                    frame_length=512,
                    hop_length=160,
                )
            )
        ),
        "pitch_mean_hz": (
            float(np.mean(valid_pitch))
            if valid_pitch.size > 0
            else None
        ),
        "pitch_std_hz": (
            float(np.std(valid_pitch))
            if valid_pitch.size > 0
            else None
        ),
        "duration_seconds": round(len(audio) / sample_rate, 3),
        "sample_rate": sample_rate,
    }

    return features