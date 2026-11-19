import { integer, RequestError } from "./catalog.mjs";

const tokenPattern = /^[0-9]+:[A-Za-z0-9_-]+$/;
const secretPattern = /^[A-Za-z0-9_-]{32,256}$/;
const encoder = new TextEncoder();
const publicInvoiceErrors = new Set([
  "PAYMENT_PROVIDER_INVALID",
  "PAYMENT_PROVIDER_DISABLED",
  "PROVIDER_TOKEN_INVALID",
  "CURRENCY_INVALID",
  "CURRENCY_TOTAL_AMOUNT_INVALID",
  "INVOICE_PAYLOAD_INVALID",
]);

export const botToken = env => env.BOT_TOKEN?.trim() || "";
export const validToken = value => tokenPattern.test(value);
export const validSecret = value => typeof value === "string" && secretPattern.test(value);
export const isTest = env => env.TELEGRAM_TEST_ENV === "1";

export function matchesSecret(actual, expected) {
  if (!validSecret(actual) || !validSecret(expected) || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function username(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{5,32}$/.test(value) ? value : "";
}

export function telegramId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function telegram(env, method, body = {}) {
  const token = botToken(env);
  if (!validToken(token)) throw new RequestError("bot_not_configured", 503);
  const path = isTest(env) ? "/test/" : "/";
  const upload = body instanceof FormData;
  let response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + path + method, {
      method: "POST",
      ...(upload ? { body } : {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      signal: AbortSignal.timeout(upload ? 20000 : method === "answerPreCheckoutQuery" ? 4000 : 8000),
    });
  } catch {
    throw new RequestError("telegram_unavailable", 502);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    const error = new RequestError("telegram_unavailable", 502);
    error.telegramCode = data?.error_code ?? response.status;
    if (method === "sendInvoice" && typeof data?.description === "string") {
      const reason = data.description.replace(/^Bad Request:\s*/, "").trim();
      if (publicInvoiceErrors.has(reason)) error.invoiceError = reason;
    }
    throw error;
  }
  return data.result;
}

export async function authenticate(request, env) {
  const raw = request.headers.get("X-Telegram-Init-Data");
  const token = botToken(env);
  if (!raw || raw.length > 16000 || !validToken(token)) throw new RequestError("unauthorized", 401);
  const params = new URLSearchParams(raw);
  const fields = new Map();
  for (const [key, value] of params) {
    if (fields.has(key)) throw new RequestError("unauthorized", 401);
    fields.set(key, value);
  }
  const hash = fields.get("hash") || "";
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new RequestError("unauthorized", 401);
  fields.delete("hash");
  const message = [...fields.keys()].sort().map(key => key + "=" + fields.get(key)).join("\n");
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const salt = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), algorithm, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", salt, encoder.encode(token));
  const key = await crypto.subtle.importKey("raw", derived, algorithm, false, ["verify"]);
  const supplied = Uint8Array.from(hash.match(/../g), pair => parseInt(pair, 16));
  if (!await crypto.subtle.verify("HMAC", key, supplied, encoder.encode(message))) {
    throw new RequestError("unauthorized", 401);
  }
  const authDate = Number(fields.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate < now - 86400 || authDate > now + 30) {
    throw new RequestError("session_expired", 401);
  }
  let user;
  try {
    user = JSON.parse(fields.get("user"));
    const id = integer(user?.id);
    return { id, username: username(user.username) };
  } catch {
    throw new RequestError("unauthorized", 401);
  }
}
