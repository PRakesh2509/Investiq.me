export type AdminTab = "apikeys" | "telegram" | "sheets" | "stocks" | "notifications";

export const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "apikeys", label: "API Keys" },
  { id: "telegram", label: "Telegram" },
  { id: "sheets", label: "Google Sheets" },
  { id: "stocks", label: "Stocks" },
  { id: "notifications", label: "Notifications" },
];
