
import { useEffect, useRef, useState } from "react";
import { AUDIO_WEBSOCKET_URL } from "../api";
import DecisionEvidence, { type ModelExplanation } from "./DecisionEvidence";
import LiveProbabilityTrend from "./LiveProbabilityTrend";
import MicrophoneIcon from "./MicrophoneIcon";
import VoiceActivityWaveform from "./VoiceActivityWaveform";
import "./LiveAudioStreaming.css";

type StreamResult = {
  classification: string;
  spoof_probability: number;
  risk_level: string;
  recommendation: string;
  threshold_used: number;
  model_explanation?: ModelExplanation | null;
};

function LiveAudioStreaming({ authToken }: { authToken: string }) {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<StreamResult | null>(null);
  const [smoothedProbability, setSmoothedProbability] =
    useState<number | null>(null);
  const [recentProbabilities, setRecentProbabilities] =
    useState<number[]>([]);
  const [segmentSequence, setSegmentSequence] = useState(0);
  const [error, setError] = useState("");
  const [audioSamples, setAudioSamples] = useState<number[]>(() => Array(36).fill(0));

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const pendingSamplesRef = useRef<number[]>([]);
  const probabilitiesRef = useRef<number[]>([]);

  const TARGET_SAMPLE_RATE = 16000;
  const SEGMENT_SAMPLES = TARGET_SAMPLE_RATE * 3;
  const WINDOW_SIZE = 5;
  const DETECTION_THRESHOLD = 0.30;
  const HIGH_RISK_THRESHOLD = 0.70;

  const cleanup = async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    gainRef.current?.disconnect();
    gainRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (socketRef.current) {
      const socket = socketRef.current;
      socketRef.current = null;

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    }

    pendingSamplesRef.current = [];
    setAudioSamples(Array(36).fill(0));

    setConnected(false);
    setRecording(false);
    setProcessing(false);
  };

  useEffect(() => {
    return () => {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      gainRef.current?.disconnect();

      streamRef.current?.getTracks().forEach((track) => track.stop());

      if (
        socketRef.current &&
        socketRef.current.readyState < WebSocket.CLOSING
      ) {
        socketRef.current.close();
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const handleAnalysis = (analysis: StreamResult) => {
    setResult(analysis);
    setSegmentSequence((sequence) => sequence + 1);

    const updatedProbabilities = [
      ...probabilitiesRef.current,
      analysis.spoof_probability,
    ].slice(-WINDOW_SIZE);

    probabilitiesRef.current = updatedProbabilities;

    const average =
      updatedProbabilities.reduce((sum, value) => sum + value, 0) /
      updatedProbabilities.length;

    setRecentProbabilities(updatedProbabilities);
    setSmoothedProbability(average);
    setProcessing(false);
  };

  const startStreaming = async () => {
    try {
      setError("");
      setResult(null);
      setSmoothedProbability(null);
      setRecentProbabilities([]);
      setSegmentSequence(0);
      setProcessing(false);

      if (!authToken.trim()) {
        throw new Error("Your sign-in session is missing. Please sign in again to use live detection.");
      }

      probabilitiesRef.current = [];
      pendingSamplesRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const audioContext = new AudioContext({
        sampleRate: TARGET_SAMPLE_RATE,
      });

      audioContextRef.current = audioContext;

      await audioContext.resume();

      const socket = new WebSocket(AUDIO_WEBSOCKET_URL);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      let resolveAuthenticated!: () => void;
      let rejectAuthenticated!: (reason: Error) => void;
      let serverAuthenticated = false;
      const authenticated = new Promise<void>((resolve, reject) => {
        resolveAuthenticated = resolve;
        rejectAuthenticated = reject;
      });

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.status === "connected") {
            serverAuthenticated = true;
            setConnected(true);
            resolveAuthenticated();
            return;
          }
          if (message.status === "error") {
            const messageText = message.message || "Live detection authentication failed.";
            setError(messageText);
            rejectAuthenticated(new Error(messageText));
            setProcessing(false);
            return;
          }

          if (message.status === "analyzed") {
            handleAnalysis(message.analysis);
            return;
          }

        } catch {
          setError("Unable to read the server response.");
          setProcessing(false);
          rejectAuthenticated(new Error("Unable to read the streaming server response."));
        }
      };

      socket.onerror = () => {
        const message = "Unable to connect to the VoiceShield streaming server. Check that the backend is running and try again.";
        rejectAuthenticated(new Error(message));
        setError(message);
      };

      socket.onclose = (event) => {
        setConnected(false);
        setRecording(false);
        setProcessing(false);
        const message = event.code === 4401
          ? "Your sign-in session is invalid or expired. Please sign in again to use live detection."
          : event.reason || "Live detection connection closed.";
        if (event.code === 4401 || !serverAuthenticated) {
          rejectAuthenticated(new Error(message));
        }
        if (event.code === 4401) setError(message);
      };

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify({ token: authToken }));
        } catch {
          rejectAuthenticated(new Error("Unable to send your sign-in token to the streaming server."));
        }
      };

      await authenticated;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const gain = audioContext.createGain();
      gain.gain.value = 0;
      gainRef.current = gain;

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return;

        const input = event.inputBuffer.getChannelData(0);
        setAudioSamples(Array.from({ length: 36 }, (_, bar) => {
          const start = Math.floor(bar * input.length / 36);
          const end = Math.max(start + 1, Math.floor((bar + 1) * input.length / 36));
          let peak = 0;
          for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
            peak = Math.max(peak, Math.abs(input[sampleIndex]));
          }
          return Math.min(1, peak * 3.5);
        }));
        const inputRate = audioContext.sampleRate;
        const ratio = inputRate / TARGET_SAMPLE_RATE;

        for (let i = 0; i < input.length; i += ratio) {
          const index = Math.floor(i);
          const nextIndex = Math.min(index + 1, input.length - 1);
          const fraction = i - index;

          const sample =
            input[index] * (1 - fraction) +
            input[nextIndex] * fraction;

          const clamped = Math.max(-1, Math.min(1, sample));

          pendingSamplesRef.current.push(
            clamped < 0
              ? Math.round(clamped * 32768)
              : Math.round(clamped * 32767)
          );
        }

        while (
          pendingSamplesRef.current.length >= SEGMENT_SAMPLES
        ) {
          const segment = pendingSamplesRef.current.splice(
            0,
            SEGMENT_SAMPLES
          );

          const pcmData = new Int16Array(segment);

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(pcmData.buffer);
            setProcessing(true);
          }
        }
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(audioContext.destination);

      setRecording(true);
    } catch (startError) {
      console.error("Live streaming error:", startError);

      await cleanup();

      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start live audio streaming."
      );
    }
  };

  const stopStreaming = async () => {
    await cleanup();
  };

  const stableClassification =
    smoothedProbability !== null
      ? smoothedProbability >= DETECTION_THRESHOLD
        ? "POTENTIAL SPOOF"
        : "LIKELY GENUINE"
      : "Waiting for analysis";

  const stableRisk =
    smoothedProbability !== null
      ? smoothedProbability >= HIGH_RISK_THRESHOLD
        ? "HIGH"
        : smoothedProbability >= DETECTION_THRESHOLD
        ? "MEDIUM"
        : "LOW"
      : "WAITING";

  const getAlertClass = () => {
    if (stableRisk === "HIGH") return "high";
    if (stableRisk === "MEDIUM") return "medium";
    return "low";
  };

  return (
    <div className="live-streaming-section">
      <h3>Real-Time Voice Analysis</h3>

      <p>
        Analyze microphone audio continuously in three-second segments.
        The displayed probability is smoothed using the latest five
        predictions.
      </p>

      <div className="recording-status">
        {recording
          ? "Live analysis running..."
          : connected
          ? "Connected"
          : "Not streaming"}
      </div>

      <VoiceActivityWaveform samples={audioSamples} active={recording} label={recording ? "Live microphone · waveform responds to speech" : "Live microphone waveform idle"} />
      <LiveProbabilityTrend
        probabilities={recentProbabilities}
        sequence={segmentSequence}
        threshold={DETECTION_THRESHOLD}
        highRiskThreshold={HIGH_RISK_THRESHOLD}
      />

      <div className="recording-buttons">
        <button
          className="analyze-button"
          onClick={startStreaming}
          disabled={recording || connected}
        >
          <MicrophoneIcon size={15} /> Start Live Analysis
        </button>

        <button
          className="reset-button"
          onClick={stopStreaming}
          disabled={!recording && !connected}
        >
          Stop Live Analysis
        </button>
      </div>

      {processing && (
        <p className="segment-processing" role="status">
          <i /> Analyzing the latest three-second segment…
        </p>
      )}

      {error && <p className="error-message">{error}</p>}

      {result && smoothedProbability !== null && (
        <div className="live-result">
          <h4>Live Detection Results</h4>

          <p>
            Latest Segment Probability:{" "}
            <strong>
              {(result.spoof_probability * 100).toFixed(2)}%
            </strong>
          </p>

          <p>
            <strong>Smoothed Spoof Probability:</strong>{" "}
            {(smoothedProbability * 100).toFixed(2)}%
          </p>

          <div className="probability-track">
            <div
              className="probability-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(0, smoothedProbability * 100)
                )}%`,
                background:
                  smoothedProbability >= DETECTION_THRESHOLD
                    ? "#ef5350"
                    : "#35c98a",
              }}
            />
          </div>

          <p>
            Stable Classification:{" "}
            <strong>{stableClassification}</strong>
          </p>

          <p>
            Smoothed Risk Level: <strong>{stableRisk}</strong>
          </p>

          {result.model_explanation && (
            <DecisionEvidence
              explanation={result.model_explanation}
              classification={result.classification}
              spoofProbability={result.spoof_probability}
              threshold={result.threshold_used}
            />
          )}

          {/* Real-Time Security Alert */}
          <div
            className={`security-alert ${getAlertClass()}`}
            role="status"
          >
            {stableRisk === "HIGH" && (
              <>
                <h4>🚨 HIGH SECURITY RISK</h4>
                <p>
                  The rolling average indicates a high spoof probability.
                </p>
                <strong>
                  Do not authorize sensitive transactions.
                </strong>
                <p>
                  Perform strong secondary identity verification.
                </p>
              </>
            )}

            {stableRisk === "MEDIUM" && (
              <>
                <h4>⚠️ MEDIUM SECURITY RISK</h4>
                <p>
                  The rolling average indicates potentially suspicious
                  voice characteristics.
                </p>
                <strong>
                  Additional identity verification is recommended.
                </strong>
                <p>
                  Verify the speaker through a trusted communication channel.
                </p>
              </>
            )}

            {stableRisk === "LOW" && (
              <>
                <h4>✓ LOW SECURITY RISK</h4>
                <p>
                  The model has not detected sufficient evidence of spoofing
                  in the recent audio segments.
                </p>
                <strong>
                  Continue normal identity verification.
                </strong>
              </>
            )}
          </div>

          <p>
            Segments Included:{" "}
            <strong>
              {recentProbabilities.length} / {WINDOW_SIZE}
            </strong>
          </p>

          <p>
            <strong>Latest Model Recommendation:</strong>{" "}
            {result.recommendation}
          </p>

          <p>
            <small>
              The smoothed result is an experimental indicator.
              It does not guarantee accurate detection or prove identity.
              The first results use fewer than five segments until the
              rolling window is full.
            </small>
          </p>
        </div>
      )}
    </div>
  );
}

export default LiveAudioStreaming;
