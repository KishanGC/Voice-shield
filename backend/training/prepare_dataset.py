from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit


# Project paths
BASE_DIR = Path(__file__).resolve().parents[1]

DATASET_DIR = BASE_DIR / "data" / "raw" / "in_the_wild"
AUDIO_DIR = DATASET_DIR / "audio"
METADATA_FILE = DATASET_DIR / "meta.csv"

OUTPUT_DIR = BASE_DIR / "data" / "processed"

RANDOM_STATE = 42


def prepare_dataset():

    print("\n===== VOICESHIELD AI DATASET PREPARATION =====\n")

    # Check dataset paths
    if not METADATA_FILE.exists():
        raise FileNotFoundError(
            f"Metadata file not found: {METADATA_FILE}"
        )

    if not AUDIO_DIR.exists():
        raise FileNotFoundError(
            f"Audio folder not found: {AUDIO_DIR}"
        )

    # Read metadata
    df = pd.read_csv(METADATA_FILE)

    required_columns = {"file", "speaker", "label"}

    if not required_columns.issubset(df.columns):
        raise ValueError(
            f"Metadata must contain columns: {required_columns}"
        )

    # Remove duplicate metadata entries
    df = df.drop_duplicates(subset=["file"]).copy()

    # Check labels
    df["label"] = df["label"].astype(str).str.strip().str.lower()

    valid_labels = {"bona-fide", "spoof"}

    invalid_labels = set(df["label"].unique()) - valid_labels

    if invalid_labels:
        raise ValueError(f"Unknown labels found: {invalid_labels}")

    # Convert labels into numerical values
    df["target"] = df["label"].map({
        "bona-fide": 0,
        "spoof": 1
    })

    # Check audio file availability
    df["audio_path"] = df["file"].apply(
        lambda filename: str(AUDIO_DIR / filename)
    )

    df["exists"] = df["file"].apply(
        lambda filename: (AUDIO_DIR / filename).is_file()
    )

    missing = df[~df["exists"]]

    print("Total metadata entries:", len(df))
    print("Missing audio files:", len(missing))

    # Keep only existing audio files
    df = df[df["exists"]].copy()

    if df.empty:
        raise ValueError("No matching audio files were found.")

    # Check speaker information
    if df["speaker"].isna().any():
        raise ValueError("Some recordings have missing speaker labels.")

    if df["speaker"].nunique() < 3:
        raise ValueError("Not enough unique speakers for dataset splitting.")

    print("\nDataset label distribution:")
    print(df["label"].value_counts())

    print("\nUnique speakers:", df["speaker"].nunique())

    # First split: 80% train+validation, 20% test
    first_split = GroupShuffleSplit(
        n_splits=1,
        test_size=0.20,
        random_state=RANDOM_STATE
    )

    train_val_idx, test_idx = next(
        first_split.split(
            df,
            y=df["target"],
            groups=df["speaker"]
        )
    )

    train_val = df.iloc[train_val_idx].copy()
    test = df.iloc[test_idx].copy()

    # Second split: approximately 70% train, 10% validation
    second_split = GroupShuffleSplit(
        n_splits=1,
        test_size=0.125,
        random_state=RANDOM_STATE
    )

    train_idx, val_idx = next(
        second_split.split(
            train_val,
            y=train_val["target"],
            groups=train_val["speaker"]
        )
    )

    train = train_val.iloc[train_idx].copy()
    validation = train_val.iloc[val_idx].copy()

    # Check both classes exist in every split
    for name, split in [
        ("Train", train),
        ("Validation", validation),
        ("Test", test)
    ]:
        if set(split["target"].unique()) != {0, 1}:
            raise ValueError(
                f"{name} split does not contain both classes. "
                "We need to adjust the speaker split."
            )

    # Verify no speaker leakage
    train_speakers = set(train["speaker"])
    val_speakers = set(validation["speaker"])
    test_speakers = set(test["speaker"])

    assert train_speakers.isdisjoint(val_speakers)
    assert train_speakers.isdisjoint(test_speakers)
    assert val_speakers.isdisjoint(test_speakers)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Save dataset splits
    train.to_csv(OUTPUT_DIR / "train.csv", index=False)
    validation.to_csv(OUTPUT_DIR / "validation.csv", index=False)
    test.to_csv(OUTPUT_DIR / "test.csv", index=False)

    # Display results
    print("\n===== DATASET SPLIT RESULTS =====")

    for name, split in [
        ("TRAIN", train),
        ("VALIDATION", validation),
        ("TEST", test)
    ]:
        print(f"\n{name}")
        print("Audio files:", len(split))
        print("Speakers:", split["speaker"].nunique())
        print(split["label"].value_counts())

    print("\nSpeaker leakage check: PASSED")

    print("\nDataset preparation completed!")

    print("Output location:", OUTPUT_DIR)


if __name__ == "__main__":
    prepare_dataset()