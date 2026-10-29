export type AdminTab =
  "overview" | "apikeys" | "telegram" | "sheets" | "stocks" | "notifications" | "users";

export const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "apikeys", label: "API Keys" },
  { id: "telegram", label: "Telegram" },
  { id: "sheets", label: "Google Sheets" },
  { id: "stocks", label: "Stocks" },
  { id: "notifications", label: "Notifications" },
  { id: "users", label: "Users" },
];
