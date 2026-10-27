/**
 * Trading Session Service (`tradingSessionService`)
 *
 * Implements Phase 7: Market-session controls for Indian F&O (NSE Equity Derivatives).
 * Official trading hours:
 * - Pre-market: 09:00 AM to 09:15 AM IST
 * - Normal session: 09:15 AM to 03:30 PM IST (with buffer up to 03:40 PM IST)
 * - Post-market & Settlement: 03:30 PM to 03:40 PM IST
 * - Market Closed: 03:40 PM to 09:00 AM IST next trading day
 * - Weekends & NSE 2026 official exchange holidays
 */

export type SessionPhase =
  "PRE_MARKET" | "NORMAL_SESSION" | "POST_MARKET" | "CLOSED" | "WEEKEND" | "HOLIDAY";

export interface TradingSessionInfo {
  isMarketOpen: boolean;
  phase: SessionPhase;
  sessionText: string;
  istTimeString: string;
  istDateString: string;
  nextSessionOpensAt: string;
  canGenerateFreshCandidates: boolean;
  isExpiryAfternoon: boolean; // After 13:30 IST on weekly/monthly expiry
  marketNotice?: string;
}

// Officially declared NSE Holidays for 2026 (ISO YYYY-MM-DD)
export const NSE_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-26": "Republic Day",
  "2026-02-16": "Mahashivratri",
  "2026-03-03": "Holi",
  "2026-03-20": "Id-Ul-Fitr (Ramzan Id)",
  "2026-03-27": "Ram Navami",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. Ambedkar Jayanti",
  "2026-05-01": "Maharashtra Day",
  "2026-05-28": "Bakri Id",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali - Laxmi Pujan (Special Muhurat)",
  "2026-11-10": "Diwali Balipratipada",
  "2026-11-24": "Gurunanak Jayanti",
  "2026-12-25": "Christmas",
};

export class TradingSessionService {
  /**
   * Get current time in Indian Standard Time (IST, UTC+5:30)
   */
  public getIstTime(inputDate: Date = new Date()): {
    istDate: Date;
    hours: number;
    minutes: number;
    seconds: number;
    dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
    isoDateString: string;
    formattedTime: string;
  } {
    // Offset for IST is +5h 30m = 330 minutes
    const utcTime = inputDate.getTime() + inputDate.getTimezoneOffset() * 60000;
    const istTime = new Date(utcTime + 330 * 60000);

    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const seconds = istTime.getSeconds();
    const dayOfWeek = istTime.getDay();

    const y = istTime.getFullYear();
    const m = String(istTime.getMonth() + 1).padStart(2, "0");
    const d = String(istTime.getDate()).padStart(2, "0");
    const isoDateString = `${y}-${m}-${d}`;

    const formattedTime = istTime.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    return {
      istDate: istTime,
      hours,
      minutes,
      seconds,
      dayOfWeek,
      isoDateString,
      formattedTime,
    };
  }

  /**
   * Evaluate full market session status
   */
  public getSessionInfo(inputDate: Date = new Date(), instrument?: string): TradingSessionInfo {
    const { hours, minutes, dayOfWeek, isoDateString, formattedTime } = this.getIstTime(inputDate);
    const minuteOfDay = hours * 60 + minutes;

    // Check if instrument is Global (US Equity & CME Derivatives)
    const isGlobal =
      ["S&P 500", "NASDAQ 100", "DOW JONES", "SP500", "NASDAQ100", "DOWJONES"].includes(
        (instrument || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ) ||
      (instrument || "").includes("$") ||
      (instrument || "").includes("S&P") ||
      (instrument || "").includes("NASDAQ") ||
      (instrument || "").includes("DOW");

    if (isGlobal) {
      // US / CME Globex hours:
      // Active Monday morning through Saturday 03:30 AM IST (nearly 24/5)
      const isWeekend = dayOfWeek === 0 || (dayOfWeek === 6 && hours >= 4);
      if (isWeekend) {
        return {
          isMarketOpen: false,
          phase: "WEEKEND",
          sessionText: "WEEKEND — US / CME Markets Closed (Opens Monday)",
          istTimeString: formattedTime,
          istDateString: isoDateString,
          nextSessionOpensAt: "Sunday 6:00 PM EST (Monday 03:30 AM IST)",
          canGenerateFreshCandidates: false,
          isExpiryAfternoon: false,
          marketNotice: "US Markets closed for the weekend.",
        };
      }

      // Check US cash regular session: 19:00 to 01:30 IST
      const isRegularUsSession = (hours >= 19 && hours <= 23) || (hours >= 0 && hours < 2);
      return {
        isMarketOpen: true,
        phase: "NORMAL_SESSION",
        sessionText: isRegularUsSession
          ? "US REGULAR SESSION LIVE (NYSE / NASDAQ / CBOE)"
          : "CME GLOBEX EXTENDED SESSION ACTIVE",
        istTimeString: formattedTime,
        istDateString: isoDateString,
        nextSessionOpensAt: "Live continuous session active",
        canGenerateFreshCandidates: true,
        isExpiryAfternoon: false,
        marketNotice: "Global US F&O session active with live CBOE / CME quotes.",
      };
    }

    // 1. Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const daysUntilMon = dayOfWeek === 6 ? 2 : 1;
      return {
        isMarketOpen: false,
        phase: "WEEKEND",
        sessionText: `WEEKEND — NSE Closed (Opens Monday 09:15 AM IST)`,
        istTimeString: formattedTime,
        istDateString: isoDateString,
        nextSessionOpensAt: `Next Monday 09:15 AM IST`,
        canGenerateFreshCandidates: false,
        isExpiryAfternoon: false,
        marketNotice: "Indian markets closed for the weekend.",
      };
    }

    // 2. Official Exchange Holiday check
    if (NSE_HOLIDAYS_2026[isoDateString]) {
      const holidayName = NSE_HOLIDAYS_2026[isoDateString];
      return {
        isMarketOpen: false,
        phase: "HOLIDAY",
        sessionText: `NSE HOLIDAY — ${holidayName}`,
        istTimeString: formattedTime,
        istDateString: isoDateString,
        nextSessionOpensAt: `Next regular trading day 09:15 AM IST`,
        canGenerateFreshCandidates: false,
        isExpiryAfternoon: false,
        marketNotice: `Exchange closed today in observance of ${holidayName}.`,
      };
    }

    // Normal weekday schedule:
    // 09:00 (540m) to 09:15 (555m): Pre-market
    // 09:15 (555m) to 15:30 (930m): Normal trading session
    // 15:30 (930m) to 15:40 (940m): Post-market settlement buffer
    // Before 540m or after 940m: Closed

    const isThursday = dayOfWeek === 4; // Typical weekly index expiry
    const isExpiryAfternoon = isThursday && minuteOfDay >= 13 * 60 + 30; // 1:30 PM+

    if (minuteOfDay >= 540 && minuteOfDay < 555) {
      return {
        isMarketOpen: false,
        phase: "PRE_MARKET",
        sessionText: "PRE-MARKET (09:00 - 09:15 IST) — Order matching & quote preparation",
        istTimeString: formattedTime,
        istDateString: isoDateString,
        nextSessionOpensAt: "Today 09:15 AM IST",
        canGenerateFreshCandidates: false,
        isExpiryAfternoon: false,
      };
    }

    if (minuteOfDay >= 555 && minuteOfDay <= 930) {
      return {
        isMarketOpen: true,
        phase: "NORMAL_SESSION",
        sessionText: "LIVE SESSION — NSE Derivatives Open (Closes 03:30 PM IST)",
        istTimeString: formattedTime,
        istDateString: isoDateString,
        nextSessionOpensAt: "Session Active",
        canGenerateFreshCandidates: true,
        isExpiryAfternoon,
      };
    }

    if (minuteOfDay > 930 && minuteOfDay <= 940) {
      return {
        isMarketOpen: false,
        phase: "POST_MARKET",
        sessionText: "POST-MARKET (03:30 - 03:40 IST) — Settlement & closing prices",
        istTimeString: formattedTime,
        istDateString: isoDateString,
        nextSessionOpensAt: "Tomorrow 09:15 AM IST",
        canGenerateFreshCandidates: false,
        isExpiryAfternoon: false,
      };
    }

    return {
      isMarketOpen: false,
      phase: "CLOSED",
      sessionText: "MARKET CLOSED — Session ended (Resumes 09:15 AM IST)",
      istTimeString: formattedTime,
      istDateString: isoDateString,
      nextSessionOpensAt: "Tomorrow 09:15 AM IST",
      canGenerateFreshCandidates: false,
      isExpiryAfternoon: false,
    };
  }
}

export const tradingSessionService = new TradingSessionService();
