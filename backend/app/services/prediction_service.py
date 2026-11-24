
from pathlib import Path
from io import BytesIO

import joblib
import librosa
import numpy as np
import pandas as pd
import soundfile as sf


# Project paths
BASE_DIR = Path(__file__).resolve().parents[2]

MODEL_PATH = BASE_DIR / "models" / "voiceshield_random_forest.joblib"

THRESHOLD = 0.30
HIGH_RISK_THRESHOLD = 0.70


# Load trained model
package = joblib.load(MODEL_PATH)

model = package["model"]
feature_columns = package["feature_columns"]


def _build_model_input_waveform(audio: np.ndarray, max_points: int = 240) -> dict:
    """Summarize the exact normalized signal used for model feature extraction."""

    point_count = min(max_points, int(audio.size))
    if point_count == 0:
        return {
            "sample_rate": 16000,
            "channels": 1,
            "duration_seconds": 0.0,
            "peaks": [],
        }

    boundaries = np.linspace(0, audio.size, point_count + 1, dtype=np.int64)
    peaks = []
    for start, end in zip(boundaries[:-1], boundaries[1:]):
        segment = audio[start:max(end, start + 1)]
        peaks.append({
            "min": round(float(np.min(segment)), 4),
            "max": round(float(np.max(segment)), 4),
        })

    return {
        "sample_rate": 16000,
        "channels": 1,
        "duration_seconds": round(float(audio.size) / 16000, 3),
        "peaks": peaks,
    }


def extract_features(audio_bytes: bytes, include_waveform_preview: bool = False):
    """Extract the same features used during model training."""

    audio, original_sr = sf.read(
        BytesIO(audio_bytes),
        dtype="float32"
    )

    # Convert stereo to mono
    if audio.ndim == 2:
        audio = np.mean(audio, axis=1)

    if len(audio) == 0:
        raise ValueError("Audio file is empty.")

    # Resample to 16 kHz
    if original_sr != 16000:
        audio = librosa.resample(
            audio,
            orig_sr=original_sr,
            target_sr=16000
        )

    # Normalize audio
    peak = np.max(np.abs(audio))

    if peak > 0:
        audio = audio / peak

    # MFCC features
    mfcc = librosa.feature.mfcc(
        y=audio,
        sr=16000,
        n_mfcc=13
    )

    # Mel spectrogram
    mel = librosa.feature.melspectrogram(
        y=audio,
        sr=16000,
        n_mels=40
    )

    mel_db = librosa.power_to_db(mel, ref=np.max)

    # Spectral features
    centroid = librosa.feature.spectral_centroid(
        y=audio,
        sr=16000
    )

    bandwidth = librosa.feature.spectral_bandwidth(
        y=audio,
        sr=16000
    )

    zcr = librosa.feature.zero_crossing_rate(audio)

    rms = librosa.feature.rms(y=audio)

    # Pitch features
    if len(audio) >= 512:
        pitch = librosa.yin(
            audio,
            fmin=65,
            fmax=400,
            sr=16000
        )

        pitch_mean = float(np.mean(pitch))
        pitch_std = float(np.std(pitch))
    else:
        pitch_mean = 0.0
        pitch_std = 0.0

    # Build feature dictionary
    features = {}

    for i in range(13):
        features[f"mfcc_mean_{i + 1}"] = float(
            np.mean(mfcc[i])
        )

        features[f"mfcc_std_{i + 1}"] = float(
            np.std(mfcc[i])
        )

    features["mel_mean"] = float(np.mean(mel_db))
    features["mel_std"] = float(np.std(mel_db))
    features["spectral_centroid"] = float(np.mean(centroid))
    features["spectral_bandwidth"] = float(np.mean(bandwidth))
    features["zero_crossing_rate"] = float(np.mean(zcr))
    features["rms_energy"] = float(np.mean(rms))
    features["pitch_mean"] = pitch_mean
    features["pitch_std"] = pitch_std

    feature_df = pd.DataFrame([features])

    ordered_features = feature_df[feature_columns]
    if include_waveform_preview:
        return ordered_features, _build_model_input_waveform(audio)
    return ordered_features


def assess_impersonation_risk(spoof_probability: float):
    """
    Convert the model's spoof probability into a risk assessment.

    This is an experimental risk indicator, not proof of
    speaker identity or impersonation.
    """

    risk_score = round(spoof_probability * 100, 2)

    if spoof_probability >= HIGH_RISK_THRESHOLD:
        risk_level = "HIGH"

        recommendation = (
            "High potential spoof risk detected. "
            "Do not rely on this voice alone for authentication. "
            "Verify the speaker using a trusted, independent channel."
        )

        security_action = "Perform strong secondary verification."

    elif spoof_probability >= THRESHOLD:
        risk_level = "MEDIUM"

        recommendation = (
            "Potential synthetic or manipulated speech detected. "
            "Request additional identity verification before "
            "performing sensitive actions."
        )

        security_action = "Request additional verification."

    else:
        risk_level = "LOW"

        recommendation = (
            "The model did not detect sufficient evidence of spoofing. "
            "This does not prove the speaker's identity. "
            "Continue normal identity verification when necessary."
        )

        security_action = "Continue normal verification."

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "security_action": security_action,
        "recommendation": recommendation,
        "assessment_basis": "Random Forest spoof probability",
        "threshold_used": THRESHOLD
    }


def explain_random_forest_paths(features: pd.DataFrame) -> dict | None:
    """Return a local, additive explanation from the forest's actual paths.

    For each tree, feature contributions are the change in spoof probability
    between consecutive nodes on the sample's path. Averaging those changes
    across trees reconstructs the Random Forest's spoof probability from the
    average root probability. This is a path explanation, not a causal claim.
    """

    classifier = getattr(model, "named_steps", {}).get("classifier")
    estimators = getattr(classifier, "estimators_", None)
    if not estimators:
        return None

    transformed = model[:-1].transform(features)
    if transformed.shape[1] != len(feature_columns):
        return None

    class_indexes = np.flatnonzero(np.asarray(classifier.classes_) == 1)
    if class_indexes.size != 1:
        return None
    spoof_index = int(class_indexes[0])

    contributions = np.zeros(len(feature_columns), dtype=np.float64)
    baseline_total = 0.0

    for estimator in estimators:
        tree = estimator.tree_
        path = estimator.decision_path(transformed)
        nodes = path.indices[path.indptr[0]:path.indptr[1]]
        node_values = np.asarray(tree.value[nodes, 0, :], dtype=np.float64)
        node_totals = node_values.sum(axis=1)
        node_probabilities = np.divide(
            node_values[:, spoof_index],
            node_totals,
            out=np.zeros_like(node_totals),
            where=node_totals != 0,
        )
        baseline_total += float(node_probabilities[0])

        for step, parent_node in enumerate(nodes[:-1]):
            feature_index = int(tree.feature[parent_node])
            if feature_index >= 0:
                contributions[feature_index] += (
                    node_probabilities[step + 1] - node_probabilities[step]
                )

    tree_count = len(estimators)
    baseline_probability = baseline_total / tree_count
    contributions /= tree_count

    feature_evidence = [
        {
            "name": str(feature_name),
            "value": float(transformed[0, index]),
            "probability_contribution": float(contributions[index]),
        }
        for index, feature_name in enumerate(feature_columns)
    ]
    feature_evidence.sort(
        key=lambda item: abs(item["probability_contribution"]),
        reverse=True,
    )

    return {
        "method": "random_forest_decision_path_decomposition",
        "feature_count": len(feature_columns),
        "tree_count": tree_count,
        "baseline_spoof_probability": float(baseline_probability),
        "reconstructed_spoof_probability": float(
            baseline_probability + contributions.sum()
        ),
        "features": feature_evidence,
    }


def predict_audio(audio_bytes: bytes, include_waveform_preview: bool = False):
    """Predict whether uploaded audio may contain spoofed speech."""

    extracted = extract_features(
        audio_bytes,
        include_waveform_preview=include_waveform_preview,
    )
    if include_waveform_preview:
        features, model_input_waveform = extracted
    else:
        features = extracted

    spoof_probability = float(
        model.predict_proba(features)[0][1]
    )
    model_explanation = explain_random_forest_paths(features)

    classification = (
        "SPOOF"
        if spoof_probability >= THRESHOLD
        else "BONA_FIDE"
    )

    risk_assessment = assess_impersonation_risk(
        spoof_probability
    )

    prediction = {
        "classification": classification,
        "spoof_probability": round(spoof_probability, 4),
        "risk_level": risk_assessment["risk_level"],
        "risk_score": risk_assessment["risk_score"],
        "security_action": risk_assessment["security_action"],
        "recommendation": risk_assessment["recommendation"],
        "assessment_basis": risk_assessment["assessment_basis"],
        "threshold_used": THRESHOLD,
        "model_explanation": model_explanation,
    }
    if include_waveform_preview:
        prediction["model_input_waveform"] = model_input_waveform
    return prediction
