import { integer, RequestError } from "./catalog.mjs";

const AMOUNT = /^(?:[0-9]+|[0-9]{1,3}(?:[ ][0-9]{3})+)(?:[.,][0-9]{2})?$/;
const REF = /^[A-Z0-9][A-Z0-9_-]{5,63}$/;
const DATE = /^(\d{2})[./](\d{2})[./](\d{4}|\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const CREDIT = /^(?:[+][ \t]*|(?:пополнение|popolnenie|kirim|to['‘’]ldirish)[ \t]*[:=]?[ \t]*[+]?[ \t]*)([0-9][0-9 .,]*)\s*(?:UZS|сум(?:ов)?|so['‘’]m)(?=$|[\s;])/iu;
const CARD = /^(?:карта|karta|card)\s*[:=]\s*(?:(?:humocard|humo)\s+)?(?:[*•xX -]+\s*)?([0-9]{4})$/iu;
const VERIFIED_CARDXABAR_MASK = /^(?:[*•xX]{2,})\s*([0-9]{4})$/u;
const BANK_REF = /^(?:RRN|ref(?:erence)?|операция|operatsiya|transaction(?: id)?)\s*[:=]\s*([A-Z0-9_-]{6,64})$/iu;
const BANK_DATE = /^(?:дата|время|date|time|sana)\s*[:=]\s*(.+)$/iu;

function parseAmount(text) {
  const normalized = text.trim().replace(/[\u00a0\u202f]/g, " ")
    .replace(/^(\d{1,3}(?:\.\d{3})+),([0-9]{2})$/, (_, whole, tiyin) =>
      whole.replaceAll(".", " ") + "," + tiyin);
  if (!AMOUNT.test(normalized)) throw new RequestError("p2p_amount_invalid");
  const [whole, tiyin] = normalized.split(/[.,]/);
  if (tiyin && tiyin !== "00") throw new RequestError("p2p_fractional_amount");
  return integer(Number(whole.replaceAll(" ", "")), 1, 100000099);
}

function reference(value) {
  const ref = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!REF.test(ref)) throw new RequestError("p2p_reference_required");
  return ref;
}

function parseDate(value) {
  const local = DATE.exec(value.replace(/^(\d{2}:\d{2}(?::\d{2})?)\s+(\d{2}\.\d{2}\.\d{4})$/, "$2 $1"));
  const iso = local
    ? `${local[3].length === 2 ? "20" + local[3] : local[3]}-${local[2]}-${local[1]}T${local[4]}:${local[5]}:${local[6] || "00"}+05:00`
    : value;
  if (!ISO_DATE.test(iso)) throw new RequestError("p2p_bank_time_required");
  const date = Date.parse(iso);
  const wallDate = Date.parse(iso.slice(0, 19) + "Z");
  if (!Number.isFinite(date) || !Number.isFinite(wallDate) ||
      new Date(wallDate).toISOString().slice(0, 19) !== iso.slice(0, 19)) {
    throw new RequestError("p2p_bank_time_required");
  }
  return { occurredAt: Math.floor(date / 1000), precision: local && !local[6] ? 60 : 1 };
}

function singleMatch(lines, regex, code) {
  const matches = lines.map(line => regex.exec(line)).filter(Boolean);
  if (matches.length !== 1) throw new RequestError(code);
  return matches[0][1];
}

export function parseIncoming(text, verifiedTelegramNotice) {
  if (typeof text !== "string" || text.length > 2500 ||
      /(?:\botp\b|код подтверждения|verification code|tasdiqlash kodi|one.time password)/iu.test(text)) {
    throw new RequestError("p2p_notice_unsupported");
  }
  const lines = text.split(/\r?\n/).map(line => line.trim()
    .replace(/[\u00a0\u202f]/g, " ").replace(/\uFE0F/g, "")
    .replace(/^[➕]/u, "+").replace(/^💳\s*/u, "Card: ")
    .replace(/^[🕐-🕧]\s*/u, "Date: "));
  if (lines.some(line => /^(?:🔴\s*)?(?:platezh|платеж|платёж|списание)\s*$/iu.test(line) ||
      /^[-−➖]\s*[0-9]/u.test(line))) throw new RequestError("p2p_credit_line_required");
  const credit = singleMatch(lines, CREDIT, "p2p_credit_line_required");
  // Some authentic CardXabar messages give only ***1234, without a Card: prefix.
  // Accept that shorthand solely for a separately verified CardXabar Telegram event.
  const verifiedCardXabar = verifiedTelegramNotice?.source === "cardxabar" &&
    /^(?:perevod na kartu|перевод на карту)$/iu.test(
      lines[0]?.replace(/^(?:🟢|🎉)\s*/u, "") || "");
  const cardLines = lines.map(line => CARD.exec(line) ||
    (verifiedCardXabar ? VERIFIED_CARDXABAR_MASK.exec(line) : null)).filter(Boolean);
  if (cardLines.length !== 1) throw new RequestError("p2p_card_last4_required");
  const last4 = cardLines[0][1];
  const refs = lines.filter(line => /^(?:RRN|ref(?:erence)?|операция|operatsiya|transaction(?: id)?)\s*[:=]/iu.test(line));
  let bankRef;
  if (!refs.length && verifiedTelegramNotice) {
    const { source, eventId } = verifiedTelegramNotice;
    const title = lines[0]?.replace(/^(?:🟢|🎉)\s*/u, '');
    const expected = source === "cardxabar" ? /^(?:perevod na kartu|перевод на карту)$/iu : /^to['‘’]ldirish$/iu;
    if (expected.test(title)) bankRef = eventId;
  }
  bankRef ??= reference(singleMatch(refs, BANK_REF, "p2p_reference_required"));
  const date = parseDate(singleMatch(lines, BANK_DATE, "p2p_bank_time_required"));
  return { amount: parseAmount(credit), last4, bankRef, ...date };
}
