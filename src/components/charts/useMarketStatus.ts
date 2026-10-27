import { useEffect, useState } from "react";

export function useMarketStatus() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  // Convert to IST minute-of-day.
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMin = (utcMin + 330) % 1440;
  const istDay = (now.getUTCDay() + (utcMin + 330 >= 1440 ? 1 : 0)) % 7;
  const OPEN = 9 * 60 + 15;
  const CLOSE = 15 * 60 + 30;
  const isWeekday = istDay >= 1 && istDay <= 5;
  const open = isWeekday && istMin >= OPEN && istMin < CLOSE;
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const s = 60 - now.getUTCSeconds();
    return `${h}h ${m}m ${s === 60 ? 0 : s}s`;
  };
  if (open)
    return { open: true, label: "Market Open", countdown: `Closes in ${fmt(CLOSE - istMin - 1)}` };
  // Time until next open
  let mins = 0;
  if (!isWeekday) {
    const daysToMon = istDay === 6 ? 2 : istDay === 0 ? 1 : 0;
    mins = daysToMon * 1440 + (OPEN - istMin);
  } else if (istMin < OPEN) {
    mins = OPEN - istMin;
  } else {
    mins = (istDay === 5 ? 3 : 1) * 1440 - istMin + OPEN;
  }
  return { open: false, label: "Market Closed", countdown: `Opens in ${fmt(mins)}` };
}
