import "./VoiceActivityWaveform.css";

type Props = { samples: number[]; active: boolean; label: string };

function VoiceActivityWaveform({ samples, active, label }: Props) {
  const bars = Array.from({ length: 36 }, (_, index) => {
    const sample = Math.max(0, Math.min(1, samples[index] ?? 0));
    const idleShape = 0.08 + Math.abs(Math.sin(index * 0.72)) * 0.13;
    const level = active ? Math.max(sample, idleShape * 0.55) : idleShape * 0.5;
    return <i key={index} style={{ "--bar-height": `${Math.round(4 + level * 34)}px`, "--bar-delay": `${(index % 9) * 35}ms` } as React.CSSProperties} />;
  });

  return <div className={`voice-activity ${active ? "is-active" : ""}`} role="img" aria-label={label}>
    <div className="voice-bars">{bars}</div>
    <span className="voice-activity-label"><i/>{label}</span>
  </div>;
}

export default VoiceActivityWaveform;
