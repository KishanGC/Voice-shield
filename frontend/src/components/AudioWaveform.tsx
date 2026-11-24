import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import "./AudioWaveform.css";
import "./WaveformComparison.css";

export type ModelInputWaveform = {
  sample_rate: number;
  channels: number;
  duration_seconds: number;
  peaks: { min: number; max: number }[];
};

type AudioWaveformProps = {
  audioUrl: string;
  modelInputWaveform?: ModelInputWaveform | null;
};

function AudioWaveform({ audioUrl, modelInputWaveform }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#6685c5",
      progressColor: "#83a5ff",
      cursorColor: "#ffffff",
      height: 100,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      normalize: true,
      interact: false,
    });
    waveSurferRef.current = waveSurfer;
    void waveSurfer.load(audioUrl).catch(() => {
      // Playback uses a separate native audio instance if waveform decoding fails.
    });

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    const onMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        waveSurferRef.current?.setTime(audio.currentTime);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onError = () => setAudioError("The browser could not load this audio file.");

    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("durationchange", onMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("durationchange", onMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      waveSurfer.destroy();
      waveSurferRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError("");
  }, [audioUrl]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError("");
    if (!audio.paused) { audio.pause(); return; }

    try {
      if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        await new Promise<void>((resolve, reject) => {
          const clearListeners = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onLoadError);
          };
          const onCanPlay = () => { clearListeners(); resolve(); };
          const onLoadError = () => { clearListeners(); reject(new Error("Audio load failed")); };
          audio.addEventListener("canplay", onCanPlay, { once: true });
          audio.addEventListener("error", onLoadError, { once: true });
          audio.load();
        });
      }
      await audio.play();
    } catch {
      setAudioError("This audio file could not be played. Try selecting the WAV again.");
    }
  };

  const formatTime = (time: number) => `${Math.floor(time / 60).toString().padStart(2, "0")}:${Math.floor(time % 60).toString().padStart(2, "0")}`;
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="waveform-section">
      <div className="reference-wave-heading"><span><h3>Original uploaded audio</h3><p>Full playback waveform of the selected recording.</p></span><span className="wave-reference-tag">ORIGINAL</span></div>
      <div ref={containerRef} className="waveform-container" />
      <div className="waveform-controls">
        <button type="button" className="play-button" onClick={() => void togglePlayback()} aria-label={isPlaying ? "Pause audio" : "Play audio"}>
          <span className="play-symbol">{isPlaying ? "Ⅱ" : "▶"}</span>{isPlaying ? "Pause audio" : "Play audio"}
        </button>
        <input aria-label="Audio playback position" className="playback-seek" type="range" min={0} max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => {
          const time = Number(event.target.value);
          if (audioRef.current) audioRef.current.currentTime = time;
          setCurrentTime(time);
        }} style={{ "--progress": `${progress}%` } as React.CSSProperties} disabled={!duration} />
        <span className="playback-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
      {audioError && <p className="waveform-error" role="alert">{audioError}</p>}
      {modelInputWaveform && (
        <div className="model-input-waveform">
          <div className="model-input-heading">
            <span>
              <small>MODEL INPUT</small>
              <strong>Preprocessed signal</strong>
              <em>Same recording after backend audio preparation.</em>
            </span>
            <span className="model-input-badge">USED FOR ANALYSIS</span>
          </div>
          <svg
            className="model-input-waveform-svg"
            viewBox="0 0 720 112"
            role="img"
            aria-label={"Preprocessed model input waveform: mono, " + (modelInputWaveform.sample_rate / 1000) + " kilohertz, peak normalized."}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="modelInputWaveformGradient" x1="0" x2="1">
                <stop offset="0%" stopColor="#8f7bf0" />
                <stop offset="52%" stopColor="#6688df" />
                <stop offset="100%" stopColor="#52b99c" />
              </linearGradient>
            </defs>
            <line className="model-input-centerline" x1="8" x2="712" y1="56" y2="56" />
            {modelInputWaveform.peaks.map((peak, index) => {
              const x = 8 + index / Math.max(1, modelInputWaveform.peaks.length - 1) * 704;
              const magnitude = Math.max(Math.abs(peak.min), Math.abs(peak.max));
              return (
                <line
                  key={index}
                  className="model-input-waveform-bar"
                  x1={x}
                  x2={x}
                  y1={56 - peak.max * 45}
                  y2={56 - peak.min * 45}
                  stroke="url(#modelInputWaveformGradient)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  opacity={Math.min(0.95, 0.35 + magnitude * 0.6)}
                />
              );
            })}
          </svg>
          <div className="model-input-metadata">
            <span>{modelInputWaveform.channels === 1 ? "Mono" : modelInputWaveform.channels + " channels"}</span>
            <span>{(modelInputWaveform.sample_rate / 1000).toFixed(0)} kHz</span>
            <span>Peak normalized</span>
            <span>{formatTime(modelInputWaveform.duration_seconds)} duration</span>
          </div>
          <p className="model-input-note">
            This is the signal used to calculate the model’s audio features. The Random Forest analyzes this recording; it does not compare it with a separate reference speaker.
          </p>
        </div>
      )}
    </div>
  );
}

export default AudioWaveform;
