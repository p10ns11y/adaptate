type SparklineProps = {
  values: number[];
  label: string;
  unit: string;
  tone: "reparse" | "incremental" | "heap";
  formatValue: (value: number) => string;
};

export function Sparkline(props: SparklineProps) {
  let values = props.values;
  let latest = values.length > 0 ? (values[values.length - 1] ?? 0) : 0;
  let peak = 0;
  for (let value of values) {
    if (value > peak) peak = value;
  }
  let latestLabel = `${props.formatValue(latest)} ${props.unit}`;
  return (
    <figure className={`sparkline sparkline-${props.tone}`}>
      <figcaption>
        <span>{props.label}</span>
        <strong className="num">{latestLabel}</strong>
      </figcaption>
      <svg viewBox="0 0 160 48" role="img" aria-label={`${props.label}, latest ${latestLabel}`}>
        <polyline points={polylinePoints(values, peak)} />
      </svg>
    </figure>
  );
}

function polylinePoints(values: number[], peak: number): string {
  if (values.length === 0) return "0,46 160,46";
  let plotHeight = 44;
  let plotTop = 2;
  let span = Math.max(peak, 1);
  let parts: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    let horizontal = values.length === 1 ? 0 : (index / (values.length - 1)) * 160;
    let value = values[index] ?? 0;
    let vertical = plotTop + plotHeight - (value / span) * plotHeight;
    parts.push(`${horizontal.toFixed(2)},${vertical.toFixed(2)}`);
  }
  return parts.join(" ");
}
