
from pathlib import Path

import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline


# Project paths
BASE_DIR = Path(__file__).resolve().parents[1]

FEATURES_DIR = BASE_DIR / "data" / "features"
MODELS_DIR = BASE_DIR / "models"

TRAIN_FILE = FEATURES_DIR / "train_features.csv"
VALIDATION_FILE = FEATURES_DIR / "validation_features.csv"

MODEL_FILE = MODELS_DIR / "voiceshield_random_forest.joblib"


# Load datasets
print("===== VOICESHIELD AI MODEL TRAINING =====")

print("\nLoading training dataset...")
train_df = pd.read_csv(TRAIN_FILE)

print("Loading validation dataset...")
validation_df = pd.read_csv(VALIDATION_FILE)


# Select acoustic features only.
# Exclude filename, speaker, label, target, duration and sample rate.
feature_columns = [
    column
    for column in train_df.columns
    if column.startswith("mfcc_")
    or column in [
        "mel_mean",
        "mel_std",
        "spectral_centroid",
        "spectral_bandwidth",
        "zero_crossing_rate",
        "rms_energy",
        "pitch_mean",
        "pitch_std",
    ]
]

if not feature_columns:
    raise ValueError("No acoustic feature columns were found.")

X_train = train_df[feature_columns]
y_train = train_df["target"].astype(int)

X_validation = validation_df[feature_columns]
y_validation = validation_df["target"].astype(int)

print(f"\nTraining samples: {len(X_train)}")
print(f"Validation samples: {len(X_validation)}")
print(f"Number of features: {len(feature_columns)}")


# Build model pipeline
model = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    (
        "classifier",
        RandomForestClassifier(
            n_estimators=200,
            max_depth=None,
            min_samples_split=2,
            min_samples_leaf=1,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        ),
    ),
])


# Train model
print("\nTraining Random Forest model...")
model.fit(X_train, y_train)

print("Training completed!")


# Validation evaluation
print("\n===== VALIDATION RESULTS =====")

predictions = model.predict(X_validation)
probabilities = model.predict_proba(X_validation)[:, 1]

accuracy = accuracy_score(y_validation, predictions)

print(f"\nAccuracy: {accuracy * 100:.2f}%")

print("\nClassification Report:")
print(
    classification_report(
        y_validation,
        predictions,
        labels=[0, 1],
        target_names=["Bona-fide", "Spoof"],
        zero_division=0,
    )
)

print("\nConfusion Matrix:")
print(
    confusion_matrix(
        y_validation,
        predictions,
        labels=[0, 1],
    )
)

if y_validation.nunique() == 2:
    auc = roc_auc_score(y_validation, probabilities)
    print(f"\nROC-AUC: {auc:.4f}")
else:
    print("\nROC-AUC cannot be calculated: validation data has one class.")


# Save model and feature information
MODELS_DIR.mkdir(parents=True, exist_ok=True)

model_package = {
    "model": model,
    "feature_columns": feature_columns,
    "model_name": "Random Forest",
    "version": "1.0",
}

joblib.dump(model_package, MODEL_FILE)

print("\n===== MODEL SAVED =====")
print(f"Location: {MODEL_FILE}")
print("Training milestone completed!")
