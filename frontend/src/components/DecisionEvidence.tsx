import "./DecisionEvidence.css";
import "./DecisionEvidenceMotion.css";

export type ModelExplanation = {
  method: string;
  feature_count: number;
  tree_count: number;
  baseline_spoof_probability: number;
  reconstructed_spoof_probability: number;
  features: {
    name: string;
    value: number;
    probability_contribution: number;
  }[];
};

type Props = {
  explanation: ModelExplanation;
  classification: string;
  spoofProbability: number;
  threshold: number;
};

const featureLabel = (name: string) => {
  const mfcc = name.match(/^mfcc_(mean|std)_(\d+)$/);
  if (mfcc) {
    return "MFCC " + mfcc[2] + (mfcc[1] === "mean" ? " mean" : " standard deviation");
  }

  const labels: Record<string, string> = {
    mel_mean: "Mel spectrum mean",
    mel_std: "Mel spectrum variation",
    spectral_centroid: "Spectral centroid",
    spectral_bandwidth: "Spectral bandwidth",
    zero_crossing_rate: "Zero-crossing rate",
    rms_energy: "RMS energy",
    pitch_mean: "Average pitch",
    pitch_std: "Pitch variation",
  };
  return labels[name] || name.replaceAll("_", " ");
};

const featureUnit = (name: string) => {
  if (["spectral_centroid", "spectral_bandwidth", "pitch_mean", "pitch_std"].includes(name)) return "Hz";
  if (name === "mel_mean" || name === "mel_std") return "dB";
  return "";
};

const formatValue = (value: number, name: string) => {
  const precision = Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 1 ? 2 : 4;
  const formatted = value.toFixed(precision);
  const unit = featureUnit(name);
  return unit ? formatted + " " + unit : formatted;
};

function DecisionFeature({
  feature,
  maxMagnitude,
  compact = false,
}: {
  feature: ModelExplanation["features"][number];
  maxMagnitude: number;
  compact?: boolean;
}) {
  const contribution = feature.probability_contribution;
  const percentagePoints = contribution * 100;
  const direction = contribution >= 0 ? "raises" : "lowers";
  const width = maxMagnitude > 0
    ? Math.max(3, Math.abs(contribution) / maxMagnitude * 100)
    : 0;

  return (
    <div className={"decision-feature " + (contribution >= 0 ? "positive" : "negative") + (compact ? " compact" : "")}>
      <div className="decision-feature-copy">
        <strong>{featureLabel(feature.name)}</strong>
        <small>Model input: {formatValue(feature.value, feature.name)}</small>
        {!compact && <i style={{ width: width + "%" }} />}
      </div>
      <strong className="decision-feature-delta" aria-label={direction + " spoof score by " + Math.abs(percentagePoints).toFixed(2) + " percentage points"}>
        {percentagePoints >= 0 ? "+" : "−"}{Math.abs(percentagePoints).toFixed(2)} pp
      </strong>
    </div>
  );
}

function DecisionEvidence({ explanation, classification, spoofProbability, threshold }: Props) {
  if (!explanation.features.length) return null;

  const positive = explanation.features
    .filter((feature) => feature.probability_contribution > 0)
    .sort((left, right) => right.probability_contribution - left.probability_contribution)
    .slice(0, 3);
  const negative = explanation.features
    .filter((feature) => feature.probability_contribution < 0)
    .sort((left, right) => left.probability_contribution - right.probability_contribution)
    .slice(0, 3);
  const maxMagnitude = Math.max(
    ...explanation.features.map((feature) => Math.abs(feature.probability_contribution)),
    0,
  );
  const scorePercent = Math.min(100, Math.max(0, spoofProbability * 100));
  const thresholdPercent = Math.min(100, Math.max(0, threshold * 100));
  const resultLabel = classification === "SPOOF" ? "Potential spoof" : "Likely genuine";

  return (
    <section className="decision-evidence" aria-label="Per-record model decision evidence">
      <div className="decision-evidence-heading">
        <span className="decision-evidence-icon" aria-hidden="true">⌁</span>
        <div>
          <span className="section-kicker">PER-RECORD MODEL TRACE</span>
          <h3>Why the model classified this audio</h3>
          <p>Evidence from this recording’s actual paths through the Random Forest.</p>
        </div>
        <span className={"decision-outcome " + (classification === "SPOOF" ? "spoof" : "genuine")}>
          {resultLabel}
        </span>
      </div>

      <div className="decision-overview">
        <div className="decision-score">
          <div className="decision-score-heading">
            <span>Spoof probability</span>
            <strong>{scorePercent.toFixed(1)}%</strong>
          </div>
          <div
            className="decision-score-track"
            role="img"
            aria-label={"Spoof probability " + scorePercent.toFixed(1) + " percent; classification threshold " + thresholdPercent.toFixed(0) + " percent"}
          >
            <i style={{ width: scorePercent + "%" }} />
            <b style={{ left: thresholdPercent + "%" }} />
          </div>
          <small>Classification changes to potential spoof at {thresholdPercent.toFixed(0)}%.</small>
        </div>
        <div className="decision-facts">
          <div><span>Model inputs</span><strong>{explanation.feature_count} audio features</strong></div>
          <div><span>Ensemble</span><strong>{explanation.tree_count} decision trees</strong></div>
          <div><span>Average tree starting score</span><strong>{(explanation.baseline_spoof_probability * 100).toFixed(1)}%</strong></div>
        </div>
      </div>

      <div className="decision-contributions">
        <div className="decision-contribution-group">
          <h4><i className="raises-dot" /> Raised the spoof score</h4>
          {positive.length
            ? positive.map((feature) => <DecisionFeature key={feature.name} feature={feature} maxMagnitude={maxMagnitude} />)
            : <p className="decision-none">No feature path increased the score.</p>}
        </div>
        <div className="decision-contribution-group">
          <h4><i className="lowers-dot" /> Lowered the spoof score</h4>
          {negative.length
            ? negative.map((feature) => <DecisionFeature key={feature.name} feature={feature} maxMagnitude={maxMagnitude} />)
            : <p className="decision-none">No feature path lowered the score.</p>}
        </div>
      </div>

      <details className="decision-all-features">
        <summary>Inspect all {explanation.feature_count} model inputs and path effects</summary>
        <div className="decision-all-list">
          {explanation.features.map((feature) => (
            <DecisionFeature key={feature.name} feature={feature} maxMagnitude={maxMagnitude} compact />
          ))}
        </div>
      </details>

      <p className="decision-method-note">
        Each path effect is the averaged change in spoof probability as trees branch on that feature. All path effects reconstruct the ensemble score from its average starting score. This explains the model output; it does not prove speaker identity or that a feature caused spoofing.
      </p>
    </section>
  );
}

export default DecisionEvidence;
