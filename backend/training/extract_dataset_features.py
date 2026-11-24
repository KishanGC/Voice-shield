import csv
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from tqdm import tqdm


# Project paths
BASE_DIR = Path(__file__).resolve().parents[1]

AUDIO_DIR = BASE_DIR / "data" / "raw" / "in_the_wild" / "audio"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
FEATURES_DIR = BASE_DIR / "data" / "features"

SAMPLE_RATE = 16000
CHECKPOINT_INTERVAL = 50


def extract_features(audio_path):
    """Read, preprocess, and extract numerical features from one audio file."""

    # Read audio
    audio, original_sr = sf.read(audio_path, dtype="float32")

    # Convert stereo audio to mono
    if audio.ndim == 2:
        audio = np.mean(audio, axis=1)

    if len(audio) == 0:
        raise ValueError("Audio file is empty")

    # Resample to 16 kHz
    if original_sr != SAMPLE_RATE:
        audio = librosa.resample(
            audio,
            orig_sr=original_sr,
            target_sr=SAMPLE_RATE
        )

    # Normalize audio
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    # Extract MFCC features
    mfcc = librosa.feature.mfcc(
        y=audio,
        sr=SAMPLE_RATE,
        n_mfcc=13
    )

    # Extract Mel spectrogram
    mel = librosa.feature.melspectrogram(
        y=audio,
        sr=SAMPLE_RATE,
        n_mels=40
    )
    mel_db = librosa.power_to_db(mel, ref=np.max)

    # Extract spectral features
    centroid = librosa.feature.spectral_centroid(
        y=audio, sr=SAMPLE_RATE
    )
    bandwidth = librosa.feature.spectral_bandwidth(
        y=audio, sr=SAMPLE_RATE
    )
    zcr = librosa.feature.zero_crossing_rate(audio)
    rms = librosa.feature.rms(y=audio)

    # Extract pitch when the recording is long enough
    if len(audio) >= 512:
        pitch = librosa.yin(
            audio,
            fmin=65,
            fmax=400,
            sr=SAMPLE_RATE
        )
        pitch_mean = float(np.mean(pitch))
        pitch_std = float(np.std(pitch))
    else:
        pitch_mean = 0.0
        pitch_std = 0.0

    # Store features in a flat dictionary
    result = {}

    for i in range(13):
        result[f"mfcc_mean_{i + 1}"] = float(np.mean(mfcc[i]))
        result[f"mfcc_std_{i + 1}"] = float(np.std(mfcc[i]))

    result["mel_mean"] = float(np.mean(mel_db))
    result["mel_std"] = float(np.std(mel_db))
    result["spectral_centroid"] = float(np.mean(centroid))
    result["spectral_bandwidth"] = float(np.mean(bandwidth))
    result["zero_crossing_rate"] = float(np.mean(zcr))
    result["rms_energy"] = float(np.mean(rms))
    result["pitch_mean"] = pitch_mean
    result["pitch_std"] = pitch_std

    # Metadata (not intended as model input)
    result["duration_seconds"] = len(audio) / SAMPLE_RATE
    result["sample_rate"] = SAMPLE_RATE

    return result


def process_split(split_name):
    """Process one split and save features, supporting resume after interruption."""

    input_csv = PROCESSED_DIR / f"{split_name}.csv"
    output_csv = FEATURES_DIR / f"{split_name}_features.csv"
    error_csv = FEATURES_DIR / "errors.csv"

    if not input_csv.exists():
        print(f"Missing split file: {input_csv}")
        return

    with open(input_csv, "r", newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    # Resume: skip audio files already saved successfully
    completed = set()

    if output_csv.exists():
        with open(output_csv, "r", newline="", encoding="utf-8") as file:
            completed = {
                row["file"] for row in csv.DictReader(file)
            }

    pending_rows = [
        row for row in rows
        if row["file"] not in completed
    ]

    print(f"\nProcessing {split_name.upper()} split")
    print(f"Total files: {len(rows)}")
    print(f"Already completed: {len(completed)}")
    print(f"Remaining: {len(pending_rows)}")

    if not pending_rows:
        print(f"{split_name} features are already complete.")
        return

    fieldnames = [
        "file", "speaker", "label", "target",
        *[f"mfcc_mean_{i}" for i in range(1, 14)],
        *[f"mfcc_std_{i}" for i in range(1, 14)],
        "mel_mean", "mel_std",
        "spectral_centroid", "spectral_bandwidth",
        "zero_crossing_rate", "rms_energy",
        "pitch_mean", "pitch_std",
        "duration_seconds", "sample_rate"
    ]

    file_exists = output_csv.exists()

    with open(output_csv, "a", newline="", encoding="utf-8") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=fieldnames)

        if not file_exists:
            writer.writeheader()

        with open(error_csv, "a", newline="", encoding="utf-8") as error_file:
            error_writer = csv.writer(error_file)

            if error_file.tell() == 0:
                error_writer.writerow(["split", "file", "error"])

            for index, row in enumerate(
                tqdm(pending_rows, desc=f"{split_name}"),
                start=1
            ):
                filename = row["file"]
                audio_path = AUDIO_DIR / filename

                try:
                    if not audio_path.exists():
                        raise FileNotFoundError("Audio file not found")

                    features = extract_features(audio_path)

                    output_row = {
                        "file": filename,
                        "speaker": row["speaker"],
                        "label": row["label"],
                        "target": 0 if row["label"].strip().lower() == "bona-fide" else 1,
                        **features
                    }

                    writer.writerow(output_row)

                except Exception as error:
                    error_writer.writerow([
                        split_name,
                        filename,
                        str(error)
                    ])

                # Save progress to disk
                if index % CHECKPOINT_INTERVAL == 0:
                    output_file.flush()
                    error_file.flush()

        output_file.flush()

    print(f"Finished {split_name}. Saved: {output_csv}")


def main():
    FEATURES_DIR.mkdir(parents=True, exist_ok=True)

    print("===== VOICESHIELD AI FEATURE EXTRACTION =====")

    for split in ["train", "validation", "test"]:
        process_split(split)

    print("\nFeature extraction process finished.")
    print(f"Feature files are saved in: {FEATURES_DIR}")


if __name__ == "__main__":
    main()