import "./LiveProbabilityTrend.css";

type Props = {
  probabilities: number[];
  sequence: number;
  threshold: number;
  highRiskThreshold: number;
};

const clampProbability = (value: number) => Math.min(1, Math.max(0, value));
const chartX = (slot: number) => 28 + slot * 62;
const chartY = (probability: number) => 100 - clampProbability(probability) * 80;

function LiveProbabilityTrend({ probabilities, sequence, threshold, highRiskThreshold }: Props) {
  const recent = probabilities.slice(-5);
  const firstSlot = 5 - recent.length;
  const points = recent.map((probability, index) => ({
    probability: clampProbability(probability),
    slot: firstSlot + index,
  }));
  const pointString = points
    .map((point) => chartX(point.slot) + "," + chartY(point.probability))
    .join(" ");

  return (
    <section className="live-trend" aria-label="Recent live spoof probabilities">
      <div className="live-trend-heading">
        <div>
          <strong>Segment probability trend</strong>
          <small>Each point is a completed three-second model analysis.</small>
        </div>
        <span className="live-trend-count">{recent.length}/5</span>
      </div>

      <div className="live-trend-legend">
        <span><i className="trend-cutoff-key" /> Classification cutoff {(threshold * 100).toFixed(0)}%</span>
        <span><i className="trend-high-key" /> High risk {(highRiskThreshold * 100).toFixed(0)}%</span>
      </div>

      <svg
        className="live-trend-chart"
        viewBox="0 0 320 128"
        role="img"
        aria-label={
          recent.length
            ? "Spoof probabilities for the latest " + recent.length + " live audio segments."
            : "Waiting for the first completed three-second audio segment."
        }
      >
        <defs>
          <linearGradient id="liveTrendLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#8e7cf0" />
            <stop offset="100%" stopColor="#627fe0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((probability) => (
          <g key={probability}>
            <line className="live-trend-grid" x1="28" x2="276" y1={chartY(probability)} y2={chartY(probability)} />
            <text className="live-trend-axis" x="2" y={chartY(probability) + 3}>
              {Math.round(probability * 100)}%
            </text>
          </g>
        ))}

        <line className="live-trend-high-line" x1="28" x2="276" y1={chartY(highRiskThreshold)} y2={chartY(highRiskThreshold)} />
        <line className="live-trend-cutoff-line" x1="28" x2="276" y1={chartY(threshold)} y2={chartY(threshold)} />

        {points.length > 1 && (
          <polyline
            key={sequence + ":" + pointString}
            className="live-trend-path"
            points={pointString}
          />
        )}

        {points.map((point, index) => {
          const color = point.probability >= threshold ? "#d86e7d" : "#39a982";
          const cx = chartX(point.slot);
          const cy = chartY(point.probability);
          return (
            <g
              key={(index === points.length - 1 ? "latest:" + sequence : point.slot + ":" + point.probability)}
              className={index === points.length - 1 ? "live-trend-point latest" : "live-trend-point"}
              style={{ animationDelay: index * 45 + "ms" }}
            >
              <circle className="live-trend-halo" cx={cx} cy={cy} r="7" fill={color} />
              <circle cx={cx} cy={cy} r="3.5" fill={color} />
              <text className="live-trend-value" x={cx} y={cy - 9} textAnchor="middle">
                {(point.probability * 100).toFixed(0)}
              </text>
            </g>
          );
        })}

        {recent.length === 0 && (
          <text className="live-trend-empty" x="152" y="63" textAnchor="middle">
            Waiting for first segment…
          </text>
        )}

        {[0, 1, 2, 3, 4].map((slot) => (
          <text key={slot} className="live-trend-slot" x={chartX(slot)} y="121" textAnchor="middle">
            {slot + 1}
          </text>
        ))}
      </svg>
      <div className="live-trend-axis-title">Recent segments · oldest to newest</div>
    </section>
  );
}

export default LiveProbabilityTrend;
