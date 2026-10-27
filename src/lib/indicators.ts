import type { Bar } from "./terminal.functions";

export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      const seed = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
      prev = seed;
      out.push(seed);
    } else {
      prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i]!;
    const variance = slice.reduce((s, v) => s + (v - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

export function vwap(bars: Bar[]): (number | null)[] {
  // Session VWAP resets by calendar day (UTC).
  const out: (number | null)[] = [];
  let day = -1;
  let cumPV = 0;
  let cumV = 0;
  for (const b of bars) {
    const d = Math.floor(b.time / 86400);
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * (b.volume || 0);
    cumV += b.volume || 0;
    out.push(cumV > 0 ? cumPV / cumV : null);
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let gain = 0,
    loss = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const diff = values[i] - values[i - 1];
    const g = Math.max(diff, 0),
      l = Math.max(-diff, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        const rs = loss === 0 ? 100 : gain / loss;
        out.push(100 - 100 / (1 + rs));
      } else out.push(null);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      const rs = loss === 0 ? 100 : gain / loss;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export interface SupertrendResult {
  value: (number | null)[];
  direction: (1 | -1 | null)[];
}

export function supertrend(bars: Bar[], period = 10, multiplier = 3): SupertrendResult {
  if (bars.length < period) {
    return {
      value: bars.map(() => null),
      direction: bars.map(() => null),
    };
  }

  const tr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const prevC = bars[i - 1].close;
    const h = bars[i].high;
    const l = bars[i].low;
    tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
  }

  const atr: (number | null)[] = [];
  let trSum = 0;
  for (let i = 0; i < bars.length; i++) {
    trSum += tr[i];
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      atr.push(trSum / period);
    } else {
      const prevAtr = atr[i - 1]!;
      atr.push((prevAtr * (period - 1) + tr[i]) / period);
    }
  }

  const values: (number | null)[] = [];
  const directions: (1 | -1 | null)[] = [];

  let prevUpper = 0;
  let prevLower = 0;
  let prevSupertrend = 0;

  for (let i = 0; i < bars.length; i++) {
    const a = atr[i];
    if (a === null) {
      values.push(null);
      directions.push(null);
      continue;
    }

    const hl2 = (bars[i].high + bars[i].low) / 2;
    const basicUpper = hl2 + multiplier * a;
    const basicLower = hl2 - multiplier * a;
    const prevClose = i > 0 ? bars[i - 1].close : bars[i].close;

    const finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
    const finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;

    let currentDir: 1 | -1;
    if (prevSupertrend === prevUpper) {
      currentDir = bars[i].close > finalUpper ? 1 : -1;
    } else {
      currentDir = bars[i].close < finalLower ? -1 : 1;
    }

    const currentSupertrend = currentDir === 1 ? finalLower : finalUpper;
    values.push(currentSupertrend);
    directions.push(currentDir);

    prevUpper = finalUpper;
    prevLower = finalLower;
    prevSupertrend = currentSupertrend;
  }

  return { value: values, direction: directions };
}
