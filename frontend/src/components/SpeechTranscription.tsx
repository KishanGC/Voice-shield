
import { useState } from "react";
import { API_BASE_URL } from "../api";
import "./SpeechTranscription.css";

type TranscriptionResult = {
  transcript: string;
  language_code: string | null;
  request_id: string | null;
};

type DetectionResult = {
  classification: string;
  spoof_probability: number;
  risk_level: string;
  risk_score: number;
  security_action: string;
  recommendation: string;
  assessment_basis: string;
  threshold_used: number;
};

function SpeechTranscription({ authToken }: { authToken: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] =
    useState<TranscriptionResult | null>(null);
  const [detection, setDetection] =
    useState<DetectionResult | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [historySaved, setHistorySaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalysis = async () => {
    if (!file) {
      setError("Please select a WAV audio file.");
      return;
    }

    setLoading(true);
    setError("");
    setTranscription(null);
    setDetection(null);
    setHistoryId(null);
    setHistorySaved(false);

    const transcriptionData = new FormData();
    transcriptionData.append("file", file);

    const detectionData = new FormData();
    detectionData.append("file", file);

    try {
      const [transcriptionResponse, detectionResponse] =
        await Promise.all([
          fetch(`${API_BASE_URL}/transcription/analyze`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}` },
            body: transcriptionData,
          }),
          fetch(`${API_BASE_URL}/prediction/analyze`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}` },
            body: detectionData,
          }),
        ]);

      const transcriptionJson = await transcriptionResponse.json();
      const detectionJson = await detectionResponse.json();

      if (!transcriptionResponse.ok) {
        throw new Error(
          transcriptionJson.detail || "Speech transcription failed."
        );
      }

      if (!detectionResponse.ok) {
        throw new Error(
          detectionJson.detail || "Voice detection failed."
        );
      }

      const transcriptionResult = transcriptionJson.transcription;
      const detectionResult = detectionJson.analysis;
      const savedHistoryId = detectionJson.history_id;

      setTranscription(transcriptionResult);
      setDetection(detectionResult);
      setHistoryId(savedHistoryId);

      // Save transcription and language in the same history record.
      const historyResponse = await fetch(
        `${API_BASE_URL}/prediction/history/${savedHistoryId}/transcription`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            transcript: transcriptionResult.transcript || "",
            language_code: transcriptionResult.language_code,
          }),
        }
      );

      const historyJson = await historyResponse.json();

      if (!historyResponse.ok) {
        throw new Error(
          historyJson.detail || "Unable to save transcription to history."
        );
      }

      setHistorySaved(true);

    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Analysis failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const getRiskClass = (riskLevel: string) => {
    switch (riskLevel.toUpperCase()) {
      case "HIGH":
        return "high";
      case "MEDIUM":
        return "medium";
      default:
        return "low";
    }
  };

  return (
    <section className="speech-transcription">
      <div className="transcription-heading">
        <div>
          <h3>Integrated Voice Analysis</h3>
          <p>
            Speech transcription and AI voice spoof detection
          </p>
        </div>
        <span className="transcription-badge">VOICESHIELD AI</span>
      </div>

      <div className="transcription-upload">
        <label htmlFor="transcription-audio">
          Select WAV Audio
        </label>

        <input
          id="transcription-audio"
          type="file"
          accept=".wav,audio/wav"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setTranscription(null);
            setDetection(null);
            setHistoryId(null);
            setHistorySaved(false);
            setError("");
          }}
        />

        {file && (
          <p className="selected-audio">
            Selected: {file.name}
          </p>
        )}

        <button
          type="button"
          onClick={handleAnalysis}
          disabled={!file || loading}
        >
          {loading ? "Analyzing Audio..." : "Analyze Voice"}
        </button>
      </div>

      {error && (
        <div className="transcription-error">
          {error}
        </div>
      )}

      {transcription && (
        <div className="transcription-result">
          <h4>Recognized Speech</h4>

          <p className="transcript-text">
            {transcription.transcript ||
              "No speech was recognized."}
          </p>

          <div className="transcription-language">
            <span>Detected Language</span>
            <strong>
              {transcription.language_code || "Not available"}
            </strong>
          </div>
        </div>
      )}

      {detection && (
        <div className="transcription-result">
          <h4>Voice Spoof Detection</h4>

          <div className="transcription-language">
            <span>Classification</span>
            <strong>{detection.classification}</strong>
          </div>

          <div className="transcription-language">
            <span>Spoof Probability</span>
            <strong>
              {(detection.spoof_probability * 100).toFixed(2)}%
            </strong>
          </div>

          <div className="transcription-language">
            <span>Risk Score</span>
            <strong>{detection.risk_score}/100</strong>
          </div>

          <div className="transcription-language">
            <span>Risk Level</span>
            <strong>{detection.risk_level}</strong>
          </div>

          <div
            className={`security-alert ${getRiskClass(
              detection.risk_level
            )}`}
            role="status"
          >
            {detection.risk_level.toUpperCase() === "HIGH" && (
              <>
                <h4>🚨 HIGH SECURITY RISK</h4>
                <p>Suspicious voice characteristics detected.</p>
                <strong>
                  Do not authorize sensitive transactions.
                </strong>
                <p>
                  Perform strong secondary identity verification.
                </p>
              </>
            )}

            {detection.risk_level.toUpperCase() === "MEDIUM" && (
              <>
                <h4>⚠️ MEDIUM SECURITY RISK</h4>
                <p>
                  Potentially suspicious voice characteristics detected.
                </p>
                <strong>
                  Additional verification is recommended.
                </strong>
                <p>
                  Verify the speaker through a trusted communication channel.
                </p>
              </>
            )}

            {detection.risk_level.toUpperCase() === "LOW" && (
              <>
                <h4>✓ LOW SECURITY RISK</h4>
                <p>
                  No sufficient evidence of spoofing was detected by the model.
                </p>
                <strong>
                  Continue normal identity verification.
                </strong>
              </>
            )}
          </div>

          <p className="transcript-text">
            <strong>Recommended Action:</strong>
            <br />
            {detection.security_action}
            <br />
            {detection.recommendation}
          </p>

          <div className="transcription-language">
            <span>History Record ID</span>
            <strong>{historyId ?? "Not available"}</strong>
          </div>

          {historySaved && (
            <p className="history-save-success">
              ✓ Analysis, transcript, and detected language saved successfully.
            </p>
          )}
        </div>
      )}

      <p className="transcription-disclaimer">
        Sarvam AI provides speech transcription and language
        identification. Voice spoof detection is performed
        separately by the VoiceShield AI Random Forest model.
        Results are indicative and do not establish speaker identity.
      </p>
    </section>
  );
}

export default SpeechTranscription;
