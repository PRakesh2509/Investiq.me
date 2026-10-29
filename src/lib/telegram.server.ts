/**
 * Shared Telegram helpers for all alert hooks.
 *
 * - HTML escaping, 4096-char chunking, recipient resolution
 * - sendMessage: per-request timeout, retry on 429 (honours retry_after) and 5xx,
 *   plain-text fallback when Telegram rejects HTML entities
 * - The bot token is never logged and is scrubbed from every error message.
 *
 * Pure Web APIs only (no Nitro imports) so it can be unit-tested with node --test.
 */

import { readEnv } from "./api-auth.server.ts";

export const TELEGRAM_MAX_LEN = 4096;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRY_WAIT_MS = 15_000;
const MAX_RECIPIENTS = 25;

export const DEFAULT_TELEGRAM_BOT_TOKEN = "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";

/** Chat IDs that always receive alerts (plus TELEGRAM_CHAT_ID from the environment). */
export const PERMANENT_CHAT_IDS: readonly string[] = [
  "7350570004",
  "5589831995",
  "1840901163",
  "1360613728",
  "8155139346",
  "6799336293",
  "7280324188",
  "6698697147",
];

/* --------------------------------- escaping -------------------------------- */

/** Escape text for Telegram parse_mode=HTML (also safe inside double-quoted attributes). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remove HTML tags and unescape entities (plain-text fallback). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/* --------------------------------- chunking -------------------------------- */

/** Largest cut index <= max that does not split a surrogate pair or an HTML tag. */
function safeCut(s: string, max: number): number {
  let cut = Math.min(max, s.length);
  if (cut >= s.length) return s.length;
  const code = s.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1; // high surrogate left dangling
  const lt = s.lastIndexOf("<", cut - 1);
  const gt = s.lastIndexOf(">", cut - 1);
  if (lt > gt && lt > 0) cut = lt; // cut would fall inside a tag
  return Math.max(cut, 1);
}

/**
 * Split text into pieces of at most `limit` characters, preferring line breaks.
 * Never returns empty pieces.
 */
export function chunkMessage(text: string, limit = TELEGRAM_MAX_LEN): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) out.push(buf);
    buf = "";
  };
  for (const line of text.split("\n")) {
    if (line.length > limit) {
      flush();
      let rest = line;
      while (rest.length > limit) {
        const cut = safeCut(rest, limit);
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      buf = rest;
      continue;
    }
    if (buf && buf.length + 1 + line.length > limit) {
      flush();
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  flush();
  return out;
}

/* -------------------------------- recipients ------------------------------- */

const CHAT_ID_RE = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

/** Parse a comma separated string or array of chat ids, dropping invalid values and duplicates. */
export function parseChatIds(raw: unknown): string[] {
  const parts: unknown[] = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (typeof p !== "string" && typeof p !== "number") continue;
    const id = String(p).trim();
    if (CHAT_ID_RE.test(id)) seen.add(id);
  }
  return Array.from(seen).slice(0, MAX_RECIPIENTS);
}

/**
 * Explicit `override` list (request body) wins; otherwise PERMANENT_CHAT_IDS + TELEGRAM_CHAT_ID.
 */
export function resolveChatIds(
  override?: unknown,
  envValue: string | undefined = readEnv("TELEGRAM_CHAT_ID") ||
    (typeof process !== "undefined" ? process.env?.TELEGRAM_CHAT_ID : undefined),
): string[] {
  const explicit = parseChatIds(override);
  if (explicit.length) return explicit;
  return Array.from(new Set([...PERMANENT_CHAT_IDS, ...parseChatIds(envValue ?? "")])).slice(
    0,
    MAX_RECIPIENTS,
  );
}

/** Bot token from TELEGRAM_BOT_TOKEN (with safe default for production worker). */
export function getBotToken(): string | null {
  const envToken = readEnv("TELEGRAM_BOT_TOKEN");
  const procToken =
    typeof process !== "undefined" ? (process.env?.TELEGRAM_BOT_TOKEN ?? "").trim() : "";
  return envToken || procToken || DEFAULT_TELEGRAM_BOT_TOKEN;
}

/* --------------------------------- sending --------------------------------- */

export class TelegramError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TelegramError";
    this.status = status;
  }
}

/** Remove the bot token (and anything shaped like one) from a message before it is logged/returned. */
export function redactSecrets(message: string, token?: string | null): string {
  let out = message;
  if (token) out = out.split(token).join("[redacted]");
  return out.replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, "bot[redacted]");
}

export interface SendOptions {
  /** Inline keyboard etc. Attached to the last chunk only. */
  replyMarkup?: unknown;
  disablePreview?: boolean;
  /** "HTML" (default) or undefined for plain text. */
  parseMode?: "HTML" | null;
  timeoutMs?: number;
  /** Retries for 429 / 5xx / network errors (default 2). */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface TgResponse {
  ok?: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

async function postOnce(
  token: string,
  payload: Record<string, unknown>,
  opts: SendOptions,
): Promise<{ status: number; json: TgResponse | null; retryAfterHeader: number }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as TgResponse | null;
  const retryAfterHeader = Number(res.headers?.get?.("retry-after") ?? 0) || 0;
  return { status: res.status, json, retryAfterHeader };
}

/** Send one chunk with retries. Throws TelegramError (token-free) on failure. */
async function sendChunk(
  token: string,
  chatId: string,
  text: string,
  opts: SendOptions,
  replyMarkup: unknown,
): Promise<void> {
  const sleep = opts.sleepFn ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? 2;
  let parseMode: "HTML" | null = opts.parseMode === null ? null : (opts.parseMode ?? "HTML");
  let body = text;
  let lastError = "unknown error";

  for (let attempt = 0; attempt <= maxRetries + 1; attempt++) {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: body,
      disable_web_page_preview: opts.disablePreview ?? true,
    };
    if (parseMode) payload.parse_mode = parseMode;
    if (replyMarkup) payload.reply_markup = replyMarkup;

    let result;
    try {
      result = await postOnce(token, payload, opts);
    } catch (e) {
      lastError = redactSecrets((e as Error)?.message ?? "network error", token);
      if (attempt < maxRetries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw new TelegramError(`Telegram(${chatId}): ${lastError}`);
    }

    const { status, json, retryAfterHeader } = result;
    if (json?.ok) return;

    const description = json?.description ?? `HTTP ${status}`;
    lastError = redactSecrets(description, token);

    if (status === 429) {
      const waitMs = Math.max(
        ((json?.parameters?.retry_after ?? 0) || retryAfterHeader || 1) * 1000,
        500,
      );
      if (attempt < maxRetries && waitMs <= MAX_RETRY_WAIT_MS) {
        await sleep(waitMs);
        continue;
      }
      throw new TelegramError(`Telegram(${chatId}): rate limited (${lastError})`, 429);
    }
    if (status >= 500 && attempt < maxRetries) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (
      status === 400 &&
      parseMode === "HTML" &&
      /parse entities|unsupported start tag/i.test(description)
    ) {
      // Malformed markup (e.g. a tag split across chunks): resend as plain text once.
      parseMode = null;
      body = htmlToPlainText(body);
      continue;
    }
    throw new TelegramError(`Telegram(${chatId}): ${lastError}`, status);
  }
  throw new TelegramError(`Telegram(${chatId}): ${lastError}`);
}

/**
 * Send `text` (chunked to 4096 chars) to one chat. Returns the number of chunks delivered.
 * Throws TelegramError if any chunk fails permanently.
 */
export async function sendMessage(
  token: string,
  chatId: string | number,
  text: string,
  opts: SendOptions = {},
): Promise<number> {
  const chunks = chunkMessage(text);
  if (!chunks.length) return 0;
  const id = String(chatId);
  const sleep = opts.sleepFn ?? defaultSleep;
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    await sendChunk(token, id, chunks[i], opts, last ? opts.replyMarkup : undefined);
    if (!last) await sleep(250);
  }
  return chunks.length;
}

export interface BroadcastResult {
  /** Recipients that received the whole message. */
  delivered: number;
  failed: number;
  errors: string[];
}

/**
 * Send the same text to every chat sequentially (Telegram rate limits), collecting
 * per-recipient errors instead of aborting the run.
 */
export async function sendToMany(
  token: string,
  chatIds: readonly string[],
  text: string,
  opts: SendOptions & { delayMs?: number } = {},
): Promise<BroadcastResult> {
  const sleep = opts.sleepFn ?? defaultSleep;
  const delayMs = opts.delayMs ?? 250;
  const result: BroadcastResult = { delivered: 0, failed: 0, errors: [] };
  for (let i = 0; i < chatIds.length; i++) {
    try {
      await sendMessage(token, chatIds[i], text, opts);
      result.delivered++;
    } catch (e) {
      result.failed++;
      result.errors.push(redactSecrets((e as Error).message, token));
    }
    if (delayMs > 0 && i < chatIds.length - 1) await sleep(delayMs);
  }
  return result;
}
