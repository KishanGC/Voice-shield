
import { useEffect, useRef, useState } from "react";
import MicrophoneIcon from "./MicrophoneIcon";
import VoiceActivityWaveform from "./VoiceActivityWaveform";

type MicrophoneRecorderProps = {
  onRecordingComplete: (audioBlob: Blob) => void;
};

function encodeWav(audioBuffer: AudioBuffer): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = 1;
  const length = audioBuffer.length;

  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * 2, true);

  const channelData = audioBuffer.getChannelData(0);
  let offset = 44;

  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    const pcmValue = sample < 0
      ? sample * 0x8000
      : sample * 0x7fff;

    view.setInt16(offset, pcmValue, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function convertToWav(recordedBlob: Blob): Promise<Blob> {
  if (!recordedBlob.size) {
    throw new Error("The microphone recording is empty.");
  }

  const audioContext = new AudioContext();

  try {
    const audioData = await recordedBlob.arrayBuffer();
    const decodedAudio = await audioContext.decodeAudioData(audioData);

    if (decodedAudio.length === 0) {
      throw new Error("No audio data was recorded.");
    }

    // Convert stereo audio into mono.
    const monoContext = new OfflineAudioContext(
      1,
      Math.ceil(decodedAudio.duration * 16000),
      16000
    );

    const source = monoContext.createBufferSource();
    source.buffer = decodedAudio;
    source.connect(monoContext.destination);
    source.start(0);

    // Resample to 16 kHz.
    const monoAudio = await monoContext.startRendering();

    // Check whether the recording contains audible signal.
    const samples = monoAudio.getChannelData(0);
    let totalEnergy = 0;

    for (let i = 0; i < samples.length; i++) {
      totalEnergy += samples[i] * samples[i];
    }

    const rms = Math.sqrt(totalEnergy / samples.length);

    if (rms < 0.00001) {
      throw new Error(
        "The recording appears to be silent. Check your microphone."
      );
    }

    return encodeWav(monoAudio);
  } finally {
    await audioContext.close();
  }
}

function MicrophoneRecorder({
  onRecordingComplete,
}: MicrophoneRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activityContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activityFrameRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioSamples, setAudioSamples] = useState<number[]>(() => Array(36).fill(0));

  const stopActivityMonitor = () => {
    if (activityFrameRef.current !== null) cancelAnimationFrame(activityFrameRef.current);
    activityFrameRef.current = null;
    analyserRef.current = null;
    if (activityContextRef.current) void activityContextRef.current.close();
    activityContextRef.current = null;
    setAudioSamples(Array(36).fill(0));
  };

  useEffect(() => {
    if (!recording) return;

    const timer = window.setInterval(() => {
      setRecordingTime((previousTime) => previousTime + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [recording]);

  const startRecording = async () => {
    try {
      setError("");
      setRecordingTime(0);
      chunksRef.current = [];

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is not supported by this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const activityContext = new AudioContext();
      activityContextRef.current = activityContext;
      await activityContext.resume();
      const analyser = activityContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      activityContext.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const updateWaveform = () => {
        analyser.getByteFrequencyData(frequencyData);
        setAudioSamples(Array.from({ length: 36 }, (_, index) => {
          const bin = Math.min(frequencyData.length - 1, Math.floor(index * frequencyData.length / 36));
          return frequencyData[bin] / 255;
        }));
        activityFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();

      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];

      const mimeType = supportedTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("A microphone recording error occurred.");
        setRecording(false);
      };

      recorder.onstop = async () => {
        setRecording(false);
        setProcessing(true);

        try {
          const recordedBlob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });

          const wavBlob = await convertToWav(recordedBlob);

          console.log("Microphone WAV created:", {
            size: wavBlob.size,
            type: wavBlob.type,
          });

          onRecordingComplete(wavBlob);
        } catch (conversionError) {
          console.error("Recording conversion error:", conversionError);

          setError(
            conversionError instanceof Error
              ? conversionError.message
              : "Unable to convert the recording. Please try again."
          );
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          mediaRecorderRef.current = null;
          stopActivityMonitor();
          setProcessing(false);
        }
      };

      recorder.start(250);
      setRecording(true);
    } catch (recordingError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      stopActivityMonitor();

      setError(
        recordingError instanceof Error
          ? recordingError.message
          : "Microphone access failed. Please check your microphone permission."
      );
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === "recording") {
      recorder.stop();
      setRecording(false);
    }
  };

  const minutes = Math.floor(recordingTime / 60)
    .toString()
    .padStart(2, "0");

  const seconds = (recordingTime % 60)
    .toString()
    .padStart(2, "0");

  return (
    <div className="microphone-recorder">
      <h3>Live Microphone Recording</h3>

      <p>Record your voice directly using your device microphone.</p>

      <div className="recording-status">
        {recording
          ? "Recording..."
          : processing
          ? "Processing audio..."
          : "Ready"}
      </div>

      <VoiceActivityWaveform samples={audioSamples} active={recording} label={recording ? "Listening · speak to see your voice waveform" : "Microphone waveform idle"} />

      <div className="recording-timer">
        {minutes}:{seconds}
      </div>

      <div className="recording-buttons">
        <button
          className="analyze-button"
          onClick={startRecording}
          disabled={recording || processing}
        >
          <MicrophoneIcon size={15} /> Start Recording
        </button>

        <button
          className="reset-button"
          onClick={stopRecording}
          disabled={!recording}
        >
          Stop Recording
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}
    </div>
  );
}

export default MicrophoneRecorder;
