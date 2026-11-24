
from pathlib import Path

import joblib
import pandas as pd

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
    precision_score,
    recall_score,
    f1_score,
)


# Project paths
BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_FILE = BASE_DIR / "models" / "voiceshield_random_forest.joblib"
TEST_FILE = BASE_DIR / "data" / "features" / "test_features.csv"

# Selected using validation data
THRESHOLD = 0.30


def main():

    print("===== VOICESHIELD AI FINAL MODEL EVALUATION =====")

    # Load trained model
    print("\nLoading trained model...")
    package = joblib.load(MODEL_FILE)

    model = package["model"]
    feature_columns = package["feature_columns"]

    # Load test dataset
    print("Loading unseen test dataset...")
    test_df = pd.read_csv(TEST_FILE)

    X_test = test_df[feature_columns]
    y_test = test_df["target"].astype(int)

    print(f"\nTest samples: {len(X_test)}")
    print(f"Number of features: {len(feature_columns)}")
    print(f"Selected threshold: {THRESHOLD}")

    # Predict spoof probabilities
    probabilities = model.predict_proba(X_test)[:, 1]

    # Apply selected threshold
    predictions = (probabilities >= THRESHOLD).astype(int)

    # Calculate metrics
    accuracy = accuracy_score(y_test, predictions)

    precision = precision_score(
        y_test, predictions, zero_division=0
    )

    recall = recall_score(
        y_test, predictions, zero_division=0
    )

    f1 = f1_score(
        y_test, predictions, zero_division=0
    )

    auc = roc_auc_score(y_test, probabilities)

    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(
        y_test,
        predictions,
        labels=[0, 1]
    ).ravel()

    false_alarm_rate = fp / (fp + tn) if (fp + tn) else 0
    missed_spoof_rate = fn / (fn + tp) if (fn + tp) else 0

    # Display results
    print("\n===== FINAL TEST RESULTS =====")

    print(f"\nAccuracy: {accuracy * 100:.2f}%")
    print(f"Spoof Precision: {precision * 100:.2f}%")
    print(f"Spoof Recall: {recall * 100:.2f}%")
    print(f"Spoof F1-score: {f1:.4f}")
    print(f"ROC-AUC: {auc:.4f}")

    print("\n===== CONFUSION MATRIX =====")

    print("                 Predicted")
    print("              Genuine  Spoof")
    print(f"Actual Genuine  {tn:6d}  {fp:6d}")
    print(f"Actual Spoof    {fn:6d}  {tp:6d}")

    print("\n===== ERROR ANALYSIS =====")

    print(f"False alarms: {fp}")
    print(f"Missed spoof recordings: {fn}")
    print(f"False alarm rate: {false_alarm_rate * 100:.2f}%")
    print(f"Missed spoof rate: {missed_spoof_rate * 100:.2f}%")

    print("\n===== CLASSIFICATION REPORT =====")

    print(
        classification_report(
            y_test,
            predictions,
            labels=[0, 1],
            target_names=["Bona-fide", "Spoof"],
            zero_division=0
        )
    )

    print("\nFinal model evaluation completed!")


if __name__ == "__main__":
    main()
