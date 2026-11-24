
from pathlib import Path

import joblib
import pandas as pd

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
)


# Project paths
BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_FILE = BASE_DIR / "models" / "voiceshield_random_forest.joblib"
VALIDATION_FILE = BASE_DIR / "data" / "features" / "validation_features.csv"


print("===== VOICESHIELD AI THRESHOLD EVALUATION =====")

# Load saved model
package = joblib.load(MODEL_FILE)
model = package["model"]
feature_columns = package["feature_columns"]

# Load validation data
validation_df = pd.read_csv(VALIDATION_FILE)

X_validation = validation_df[feature_columns]
y_validation = validation_df["target"].astype(int)

# Calculate spoof probabilities
spoof_probabilities = model.predict_proba(X_validation)[:, 1]

# Test different thresholds
thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]

results = []

print("\nThreshold comparison:")
print("-" * 100)
print(
    f"{'Threshold':<12}"
    f"{'Accuracy':<12}"
    f"{'Precision':<12}"
    f"{'Recall':<12}"
    f"{'F1-score':<12}"
    f"{'False alarms':<15}"
    f"{'Missed spoofs':<15}"
)
print("-" * 100)

for threshold in thresholds:

    predictions = (spoof_probabilities >= threshold).astype(int)

    accuracy = accuracy_score(y_validation, predictions)
    precision = precision_score(
        y_validation, predictions, zero_division=0
    )
    recall = recall_score(
        y_validation, predictions, zero_division=0
    )
    f1 = f1_score(
        y_validation, predictions, zero_division=0
    )

    # Confusion matrix order: genuine (0), spoof (1)
    tn, fp, fn, tp = confusion_matrix(
        y_validation,
        predictions,
        labels=[0, 1]
    ).ravel()

    results.append({
        "threshold": threshold,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "false_alarms": fp,
        "missed_spoofs": fn,
    })

    print(
        f"{threshold:<12.2f}"
        f"{accuracy:<12.3f}"
        f"{precision:<12.3f}"
        f"{recall:<12.3f}"
        f"{f1:<12.3f}"
        f"{fp:<15}"
        f"{fn:<15}"
    )

# Select the threshold with the highest spoof F1-score
best_result = max(results, key=lambda item: item["f1"])

print("\n===== BEST VALIDATION F1 THRESHOLD =====")
print(f"Threshold: {best_result['threshold']:.2f}")
print(f"Spoof precision: {best_result['precision']:.3f}")
print(f"Spoof recall: {best_result['recall']:.3f}")
print(f"Spoof F1-score: {best_result['f1']:.3f}")
print(f"False alarms: {best_result['false_alarms']}")
print(f"Missed spoofs: {best_result['missed_spoofs']}")

print("\nThreshold evaluation completed.")
