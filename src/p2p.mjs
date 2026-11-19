import { formatAmount, integer, MAX_AMOUNT, requestKey, RequestError } from "./catalog.mjs";
import { adminIds, isAdmin } from "./admins.mjs";
import { parseIncoming } from "./p2p-notice.mjs";
import { orderTables } from "./store.mjs";
import { matchesSecret, telegram, telegramId, username, validSecret } from "./telegram.mjs";

const now = () => Math.floor(Date.now() / 1000);
const HOLD_SECONDS = 86400;
const MIN_AMOUNT = 10000;
const METHOD = /^(humo|uzcard)$/;
const CARD_ID = /^[a-z0-9_-]{2,32}$/;
const EVENT_ID = /^[A-Za-z0-9:_.-]{1,120}$/;
const BANK_CHATS = new Map([
  ["cardxabarbot", { source: "cardxabar", label: "CardXabar" }],
  ["humocardbot", { source: "humo", label: "HUMO Card" }],
]);

function bankPeer(env, source) {
  return telegramId(env["P2P_" + source.toUpperCase() + "_PEER_ID"]);
}

export function bankChatUpdates(env) {
  return env.P2P_CHAT_DIAGNOSTICS === "1" ||
    (env.P2P_MODE === "private" && Boolean(bankPeer(env, "humo") || bankPeer(env, "cardxabar")));
}

function smsSenders(env) {
  return (env.P2P_UZCARD_SENDERS || "").trim().split(/\s*,\s*/).filter(Boolean);
}

function bankSourceConfigured(env, method) {
  if (env.P2P_MODE === "manual") return true;
  if (method === "humo") return Boolean(bankPeer(env, "humo") || validSecret(env.P2P_HUMO_SECRET));
  return Boolean(bankPeer(env, "cardxabar") || validSecret(env.P2P_CARDXABAR_SECRET) ||
    (validSecret(env.P2P_UZCARD_SECRET) && smsSenders(env).length));
}

export function p2pAccess(env, userId) {
  const owners = adminIds(env);
  return owners.length > 0 && (env.P2P_MODE === "manual" ||
    (env.P2P_MODE === "private" && (owners.includes(userId) ||
      Boolean(env.P2P_USERS?.trim().split(/\s+/).includes(String(userId))))));
}

export function p2pVisible(env, userId) {
  return isAdmin(env, userId) || p2pAccess(env, userId);
}

function requireAccess(env, userId) {
  if (!p2pAccess(env, userId)) throw new RequestError("p2p_disabled", 403);
}

function cards(env) {
  let input;
  try { input = JSON.parse(env.P2P_CARDS || "[]"); } catch { input = null; }
  if (!Array.isArray(input) || input.length > 10) throw new RequestError("p2p_cards_invalid", 503);
  const ids = new Set();
  const keys = new Set();
  return input.map(card => {
    const { id, method, number, holder } = card || {};
    const key = method + ":" + number?.slice?.(-4);
    if (typeof id !== "string" || !CARD_ID.test(id) || ids.has(id) || keys.has(key) ||
        typeof method !== "string" || !METHOD.test(method) || typeof number !== "string" ||
        !/^[0-9]{16}$/.test(number) || typeof holder !== "string" ||
        !holder.trim() || holder.length > 64 || /[\p{C}<>]/u.test(holder)) {
      throw new RequestError("p2p_cards_invalid", 503);
    }
    ids.add(id);
    keys.add(key);
    return { id, method, number, holder, enabled: card.enabled !== false };
  });
}

async function availableCards(store, env) {
  const flags = new Map((await store.all("SELECT card_id, enabled FROM p2p_card_flags"))
    .map(row => [row.card_id, Boolean(row.enabled)]));
  return cards(env).filter(card => bankSourceConfigured(env, card.method) && (flags.get(card.id) ?? card.enabled));
}

export async function p2pMethods(store, env) {
  try {
    return [...new Set((await availableCards(store, env)).map(card => card.method))];
  } catch (error) {
    if (error instanceof RequestError && error.message === "p2p_cards_invalid") return [];
    throw error;
  }
}

function expirePending(store, at) {
  return store.stmt(`UPDATE invoices SET status = 'expired'
    WHERE status = 'pending' AND expires_at <= ? AND checked_at IS NULL`, at);
}

export async function expireInvoices(store, at = now(), closeReviewed = true) {
  await store.db.batch([
    expirePending(store, at),
    store.stmt(`UPDATE invoices SET status = 'expired' WHERE status = 'pending'
      AND expires_at <= ? AND (checked_at IS NULL OR ? = 1) AND NOT EXISTS (
      SELECT 1 FROM p2p_incoming incoming WHERE incoming.invoice_id = invoices.id)`, at - 1200, Number(closeReviewed)),
    store.stmt(`UPDATE payments SET status = 'cancelled'
      WHERE status = 'pending' AND method IN ('uzcard','humo') AND EXISTS (
        SELECT 1 FROM invoices i WHERE i.order_payment_id = payments.id
        AND i.expires_at <= ? AND (i.checked_at IS NULL OR ? = 1) AND i.status = 'expired'
        AND NOT EXISTS (SELECT 1 FROM p2p_incoming incoming WHERE incoming.invoice_id = i.id))`, at - 1200, Number(closeReviewed)),
    store.stmt(`UPDATE orders SET status = 'cancelled' WHERE status = 'pending'
      AND EXISTS(SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.status = 'cancelled')`),
    store.stmt(`UPDATE donat_orders SET status = 'cancelled' WHERE status = 'pending'
      AND EXISTS(SELECT 1 FROM payments p WHERE p.donat_order_id = donat_orders.id AND p.status = 'cancelled')`),
  ]);
}

function ownedInvoice(store, id, userId) {
  return store.first("SELECT * FROM invoices WHERE id = ? AND user_id = ?", id, userId);
}

function publicInvoice(env, row) {
  const time = now();
  const awaiting = row.status === "pending" || row.status === "manual_check";
  const status = row.status === "rejected" && row.cancelled_at != null ? "cancelled"
    : awaiting ? (row.checked_at && env.P2P_MODE === "manual" ? "manual_check"
    : row.expires_at <= time ? "expired" : "pending") : row.status;
  const card = status === "pending" ? cards(env).find(item => item.id === row.card_id &&
    item.number.endsWith(row.card_number)) : null;
  return {
    id: row.id, baseAmount: row.requested_amount ?? row.base_amount, uniqueAmount: row.unique_amount,
    method: row.payment_method, status, verificationMode: env.P2P_MODE === 'private' ? 'automatic' : 'manual',
    createdAt: row.created_at, expiresAt: row.expires_at,
    purpose: row.order_payment_id === null ? "topup" : "order",
    serverTime: time, checkedAt: row.checked_at,
    canCancel: status === "pending" && row.checked_at == null && row.expires_at > time,
    ...(card ? { cardNumber: card.number, cardHolder: row.card_holder } : {}),
  };
}

async function invoiceState(store, env, row) {
  const invoice = publicInvoice(env, row);
  if (row.order_payment_id !== null) {
    const payment = await store.first(
      "SELECT order_id, donat_order_id FROM payments WHERE id = ? AND user_id = ?",
      row.order_payment_id, row.user_id);
    return { ...invoice, orderId: payment?.order_id ?? payment?.donat_order_id };
  }
  const account = await store.first("SELECT p2p_balance FROM accounts WHERE user_id = ?", row.user_id);
  return { ...invoice, balance: account?.p2p_balance ?? 0 };
}

// Each reserved transfer has an exact, collision-free amount. For a busy
// bank transfer amount, try +100, +200, ... instead of rejecting the order.
// Never try a smaller amount: that would underpay the advertised order price.
const TRANSFER_STEPS = [0,100,200,300,400,500,600,700,800,900];
function transferAmountQuery(cardsForMethod, amount, time, order) {
  // D1 has a stricter compound-SELECT limit than local SQLite. A series of
  // UNION ALL statements throws SQLITE_ERROR in production; JSON1 uses one
  // virtual table and preserves the same ordered candidate amounts.
  const deltaSql = `json_each('${JSON.stringify(TRANSFER_STEPS)}')`;
  const cardJson = JSON.stringify(Object.fromEntries(cardsForMethod.map(card=>[card.id,{
    last4:card.number.slice(-4), holder:card.holder, enabled:Number(card.enabled)
  }])));
  return {
    sql:`SELECT (? + steps.value) AS exact_amount, available.card_id,
      json_extract(available.metadata, '$.last4') AS last4,
      json_extract(available.metadata, '$.holder') AS holder
      FROM (
        SELECT config.key AS card_id, config.value AS metadata,
          COALESCE((SELECT MAX(created_at) FROM invoices WHERE invoices.card_id = config.key),0) AS last_used
        FROM json_each(?) AS config
        LEFT JOIN p2p_card_flags flag ON flag.card_id = config.key
        WHERE COALESCE(flag.enabled, json_extract(config.value, '$.enabled')) = 1
      ) AS available CROSS JOIN ${deltaSql} AS steps
      WHERE ? + steps.value <= ?
        AND NOT EXISTS(SELECT 1 FROM invoices
          WHERE unique_amount = ? + steps.value AND status = 'pending')
        AND NOT EXISTS(SELECT 1 FROM invoices
          WHERE card_id = available.card_id AND unique_amount = ? + steps.value
          AND (expires_at > ? OR (status <> 'paid' AND created_at >= ?)))
      ORDER BY steps.value ASC, available.last_used ASC, available.card_id ASC LIMIT 1`,
    params: [amount, cardJson, amount, MAX_AMOUNT, amount, amount, time, time - HOLD_SECONDS]
  };
}
function reserveInvoice(store, candidates, { userId, key, amount, method, time, lang, order }) {
  const query=transferAmountQuery(candidates,amount,time,order);
  const newOrderOnly = order
    ? `AND NOT EXISTS (SELECT 1 FROM ${order.table} WHERE user_id = ? AND request_key = ?)`
    : "";
  return store.stmt(`
    WITH candidate AS (${query.sql})
    INSERT INTO invoices (
      user_id, request_id, base_amount, unique_amount, requested_amount, payment_method, card_id,
      card_number, card_holder, status, created_at, expires_at, lang
    )
    SELECT ?, ?, candidate.exact_amount, candidate.exact_amount, ?, ?, candidate.card_id,
      candidate.last4, candidate.holder, 'pending', ?, ?, ?
    FROM candidate
    WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE user_id = ? AND status = 'pending')
      AND NOT EXISTS (SELECT 1 FROM invoices WHERE user_id = ? AND request_id = ?)
      ${newOrderOnly}
    RETURNING *`,
    ...query.params, userId,key,amount,method,time,time+600,lang==='ru'?'ru':'uz',
    userId,userId,key,...(order?[userId,order.key]:[]));
}
async function quoteInvoice(store, env, user, data) {
  const amount=integer(data.amount,MIN_AMOUNT,MAX_AMOUNT);
  // Quotes must not mutate D1; old invoices are reconciled by the scheduled
  // expiry process and again when a new invoice is actually created.
  const method=data.method;
  if(typeof method!=='string'||!METHOD.test(method))throw new RequestError('invalid_payment_method');
  const active=await store.first("SELECT * FROM invoices WHERE user_id=? AND status='pending' AND expires_at>?",user.id,now());
  if(active)return {
    baseAmount:active.requested_amount ?? active.base_amount,
    uniqueAmount:active.unique_amount, method:active.payment_method,
    available:true, existing:true
  };
  const candidates=(await availableCards(store,env)).filter(card=>card.method===method);
  if(!candidates.length)throw new RequestError('p2p_method_unavailable',409);
  const query=transferAmountQuery(candidates,amount,now(),false);
  const selected=await store.first(query.sql,...query.params);
  return {baseAmount:amount,uniqueAmount:selected?.exact_amount ?? null,
    method,available:Boolean(selected),existing:false};
}

async function createInvoice(store, env, user, data) {
  const amount = integer(data.amount, MIN_AMOUNT, MAX_AMOUNT);
  const key = requestKey(data.requestId);
  const method = data.method;
  if (typeof method !== "string" || !METHOD.test(method)) throw new RequestError("invalid_payment_method");
  const retry = "SELECT * FROM invoices WHERE user_id = ? AND request_id = ?";
  const existing = await store.first(retry, user.id, key);
  if (existing) {
    if ((existing.requested_amount ?? existing.base_amount) !== amount || existing.payment_method !== method) {
      throw new RequestError("request_conflict", 409);
    }
    return existing;
  }
  const candidates = (await availableCards(store, env)).filter(card => card.method === method);
  if (!candidates.length) throw new RequestError("p2p_method_unavailable", 409);
  const time = now();
  // Expire old unverified attempts before the unique pending-invoice index is evaluated.
  // Bank notices remain matchable against expired invoices, not rejected/paid ones.
  await expireInvoices(store, time, env.P2P_MODE !== "manual");
  const active = "SELECT * FROM invoices WHERE user_id = ? AND status = 'pending'";
  const [, inserted, open, saved] = await store.db.batch([
    expirePending(store, time),
    reserveInvoice(store, candidates, { userId: user.id, key, amount, method, time, lang: data.lang }),
    store.stmt(active, user.id), store.stmt(retry, user.id, key),
  ]);
  const result = inserted.results[0] || saved.results[0];
  if (result) {
    if ((result.requested_amount ?? result.base_amount) !== amount || result.payment_method !== method) throw new RequestError("request_conflict", 409);
    return result;
  }
  if (open.results[0]?.order_payment_id) throw new RequestError("p2p_invoice_in_progress", 409);
  if (open.results[0]) return open.results[0];
  throw new RequestError("p2p_amount_unavailable", 409);
}

export async function createP2pOrder(store, env, user, kind, data) {
  requireAccess(env, user.id);
  const method = data.paymentMethod;
  const key = requestKey(data.requestId);
  const requestId = `order:${kind}:${key}`;
  const amount = integer(data.expectedAmount, 1, MAX_AMOUNT);
  const time = now();
  const candidates = bankSourceConfigured(env, method)
    ? cards(env).filter(card => card.method === method) : [];
  // Finalize truly expired, unverified order attempts before the active-order
  // constraint is checked. Never close a payment with matching bank evidence.
  await expireInvoices(store, time, env.P2P_MODE !== "manual");
  return store.createOrder(kind, user, { ...data, requestId: key }, {
    requestId,
    expire: expirePending(store, time),
    reserve: reserveInvoice(store, candidates, {
      userId: user.id, key: requestId, amount, method, time, lang: data.lang,
      order: { table: orderTables[kind].table, key },
    }),
  });
}

// Cancel means "I HAVE NOT SENT MONEY". It is never a refund.
// A database transaction protects against a simultaneous genuine bank event.
async function cancelUnpaidInvoice(store, env, userId, invoiceId) {
  const time = now();
  const results = await store.db.batch([
    store.stmt(`UPDATE invoices SET status = 'rejected', cancelled_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
        AND checked_at IS NULL AND expires_at > ?
        AND NOT EXISTS(SELECT 1 FROM p2p_incoming incoming WHERE incoming.invoice_id = invoices.id)
      RETURNING id`, time, invoiceId, userId, time),
    store.stmt(`INSERT INTO p2p_invoice_cancellations(invoice_id,user_id,reason,cancelled_at)
      SELECT id,user_id,'not_sent_change_details',cancelled_at FROM invoices
      WHERE id = ? AND user_id = ? AND cancelled_at = ?
      ON CONFLICT DO NOTHING`, invoiceId, userId, time),
    store.stmt(`UPDATE payments SET status = 'cancelled' WHERE status = 'pending'
      AND id = (SELECT order_payment_id FROM invoices
        WHERE id = ? AND user_id = ? AND cancelled_at = ?)`, invoiceId, userId, time),
    store.stmt(`UPDATE orders SET status = 'cancelled' WHERE status = 'pending'
      AND id = (SELECT p.order_id FROM payments p JOIN invoices i ON i.order_payment_id = p.id
        WHERE i.id = ? AND i.user_id = ? AND i.cancelled_at = ?)`, invoiceId, userId, time),
    store.stmt(`UPDATE donat_orders SET status = 'cancelled' WHERE status = 'pending'
      AND id = (SELECT p.donat_order_id FROM payments p JOIN invoices i ON i.order_payment_id = p.id
        WHERE i.id = ? AND i.user_id = ? AND i.cancelled_at = ?)`, invoiceId, userId, time),
  ]);
  const row = await ownedInvoice(store, invoiceId, userId);
  if (!row) throw new RequestError('payment_not_found', 404);
  if (!results[0].results.length && !(row.status === 'rejected' && row.cancelled_at != null)) {
    throw new RequestError('p2p_cannot_cancel', 409);
  }
  return invoiceState(store, env, row);
}

export async function p2pApi(request, env, store, user, data, path, enqueueReview = () => {}) {
  requireAccess(env, user.id);
  if (path === "invoice/recover" && request.method === "POST") {
    // Emergency read-only recovery works even when options/quote fails.
    // Never mark money paid or cancel an invoice automatically.
    const current = await store.first(`
      SELECT * FROM invoices WHERE user_id = ? AND status = 'pending' AND expires_at > ?
      ORDER BY id DESC LIMIT 1`, user.id, now());
    return { active: current ? publicInvoice(env, current) : null };
  }
  if (path === "invoice/options" && request.method === "POST") {
    // Read-only request. A simple screen load must never depend on the
    // expiry/settlement UPDATE batch, whose failure must not block the wallet.
    // Expired invoices are displayed as expired by publicInvoice.
    let phase = "current";
    try {
      const at = now();
      const current = await store.first(`
        SELECT * FROM invoices WHERE user_id = ? AND status = 'pending' AND expires_at > ?`,
        user.id, at);
      // An unpaid BOOST/DONAT bank invoice may also block wallet top-ups.
      // Show it so its owner can cancel it explicitly before sending money.
      const active = current;
      phase = "latest";
      const latest = active ?? await store.first(`
        SELECT * FROM invoices WHERE user_id = ? AND order_payment_id IS NULL
        ORDER BY id DESC LIMIT 1`, user.id);
      phase = "account";
      const account = await store.first("SELECT p2p_balance FROM accounts WHERE user_id = ?", user.id);
      phase = "methods";
      const methods = await p2pMethods(store, env);
      phase = "format";
      return { balance: account?.p2p_balance ?? 0, minAmount: MIN_AMOUNT, maxAmount: MAX_AMOUNT,
        methods, active: active ? publicInvoice(env, active) : null,
        latest: latest ? publicInvoice(env, latest) : null };
    } catch (error) {
      if (error instanceof RequestError) throw error;
      console.error("ARSLAN BOOST invoice options failed at:", phase);
      // Diagnosable and free of payment data, SQL and personal information.
      throw new RequestError("p2p_options_" + phase + "_failed", 503);
    }
  }
  if ((path === "invoice/quote" || path === "invoice") && request.method === "POST") {
    // New prepaid wallet invoices disabled. Order-linked P2P invoices use
    // createP2pOrder, not these endpoints; old invoice status and cancellation
    // remain accessible to the owner.
    throw new RequestError("topup_disabled", 409);
  }
  const match = /^invoice\/([0-9]{1,16})\/(status|check|cancel)$/.exec(path);
  if (!match || (match[2] === "status" ? request.method !== "GET" : request.method !== "POST")) {
    throw new RequestError("endpoint_missing", 404);
  }
  const id = integer(match[1]);
  if (match[2] === "cancel") return cancelUnpaidInvoice(store, env, user.id, id);
  if (match[2] === "check") {
    await store.stmt(`
      UPDATE invoices SET checked_at = COALESCE(checked_at, ?)
      WHERE id = ? AND user_id = ? AND status IN ('pending', 'expired', 'manual_check')`, now(), id, user.id).run();
    if (env.P2P_MODE === "manual") {
      await store.stmt(`INSERT INTO p2p_manual_queue (invoice_id)
        SELECT id FROM invoices WHERE id = ? AND user_id = ? AND checked_at IS NOT NULL
          AND status IN ('pending', 'expired') ON CONFLICT DO NOTHING`, id, user.id).run();
      enqueueReview(id);
    }
  }
  const row = await ownedInvoice(store, id, user.id);
  if (!row) throw new RequestError("payment_not_found", 404);
  return invoiceState(store, env, row);
}

export function authorizeRelay(request, env, method) {
  if (env.P2P_MODE !== "private" || request.method !== "POST" || !/^(humo|uzcard|cardxabar)$/.test(method)) {
    throw new RequestError("endpoint_missing", 404);
  }
  const key = env["P2P_" + method.toUpperCase() + "_SECRET"];
  const authorization = request.headers.get("Authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!validSecret(key) || !matchesSecret(supplied, key)) throw new RequestError("forbidden", 403);
}

export async function receiveBankChat(env, store, admin, message) {
  const { business_connection_id: id, chat, from, document, text, forward_origin, message_id } = message;
  if (!admin || typeof id !== "string" || !id || chat?.type !== "private" ||
      from?.is_bot !== true || !telegramId(from.id) || from.id !== chat.id ||
      forward_origin || message.via_bot || message.sender_business_bot || message.is_automatic_forward) return;
  const bank = BANK_CHATS.get(username(from.username).toLowerCase());
  if (!bank) return;
  const diagnose = env.P2P_CHAT_DIAGNOSTICS === "1";
  const verified = env.P2P_MODE === "private" && bankPeer(env, bank.source) === from.id && telegramId(message_id);
  const textOnly = typeof text === "string" && !document && !message.photo && !message.caption;
  if (!diagnose && !(verified && textOnly)) return;

  const connection = await telegram(env, "getBusinessConnection", { business_connection_id: id }).catch(error => {
    if (error.telegramCode === 400 || error.telegramCode === 403) return null;
    throw error;
  });
  if (connection?.id !== id || connection.is_enabled !== true || connection.user?.id !== admin) return;

  let result = document?.mime_type === "application/pdf" ? "pdf" : "other";
  if (textOnly) {
    try {
      if (verified) {
        const event = await receiveIncoming(store, env, bank.source, { eventId: `tg:${from.id}:${message_id}`, text });
        if (diagnose) console.info("ARSLAN BOOST bank chat", bank.label, event.matched ? "matched" : "unmatched", `peer=${from.id}`);
        return event;
      }
      parseIncoming(text);
      result = "transfer_with_reference";
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      result = error.message;
    }
  }
  if (diagnose) console.info("ARSLAN BOOST bank chat", bank.label, result, `peer=${from.id}`);
}

export async function receiveIncoming(store, env, method, data) {
  if (method === "uzcard" && !smsSenders(env).includes(data.sender)) {
    throw new RequestError("p2p_sender_invalid", 403);
  }
  const telegramEvent = method !== "uzcard" && typeof data.eventId === "string"
    ? /^tg:([1-9]\d{0,15}):[1-9]\d{0,15}$/.exec(data.eventId) : null;
  const verifiedMessage = telegramEvent && Number(telegramEvent[1]) === bankPeer(env, method)
    ? { source: method, eventId: data.eventId } : undefined;
  const notice = parseIncoming(data.text, verifiedMessage);
  const notifiedMethod = method === "cardxabar" ? "uzcard" : method;
  const matchingCards = cards(env).filter(item => item.method === notifiedMethod &&
    item.number.endsWith(notice.last4));
  if (matchingCards.length !== 1) throw new RequestError("p2p_card_unknown");
  const [card] = matchingCards;
  const eventId = data.eventId ?? `ref:${card.id}:${notice.bankRef}`;
  if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) throw new RequestError("p2p_event_invalid");
  const received = now();
  if (notice.occurredAt > received + 30 || notice.occurredAt < received - HOLD_SECONDS) {
    throw new RequestError("p2p_event_time_invalid");
  }
  const minimum = notice.occurredAt;
  const maximum = minimum + notice.precision - 1;
  const recorded = await store.first(`
    INSERT INTO p2p_incoming (card_id, source, source_event_id, bank_ref, amount, occurred_at, received_at, invoice_id)
    SELECT ?, ?, ?, ?, ?, ?, ?,
      (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(id) END FROM invoices
       WHERE card_id = ? AND unique_amount = ? AND created_at <= ? AND expires_at > ?
         AND status IN ('pending', 'expired', 'manual_check')
         AND (order_payment_id IS NULL OR EXISTS (
           SELECT 1 FROM payments p WHERE p.id = invoices.order_payment_id AND p.status = 'pending'))
         AND NOT EXISTS (SELECT 1 FROM invoices paid WHERE paid.card_id = ? AND paid.paid_ref = ?))
    ON CONFLICT DO NOTHING RETURNING invoice_id`,
    card.id, method, eventId, notice.bankRef, notice.amount, minimum, received, card.id, notice.amount,
    minimum, maximum, card.id, notice.bankRef);
  return { matched: Boolean(recorded?.invoice_id), invoiceId: recorded?.invoice_id ?? null,
    duplicate: !recorded };
}

export async function sendP2pNotice(store, env, id) {
  const time = now();
  const claim = await store.first(`
    UPDATE p2p_notices SET lease_until = ? WHERE invoice_id = ? AND lease_until <= ?
    RETURNING lease_until`, time + 60, id, time);
  if (!claim) return;
  const row = await store.first("SELECT * FROM invoices WHERE id = ?", id);
  const isOrder = row.order_payment_id !== null;
  const label = row.lang === "ru"
    ? (isOrder ? "✅ Заказ оплачен" : "✅ Пополнение подтверждено")
    : (isOrder ? "✅ Buyurtma to‘landi" : "✅ Balans to‘ldirildi");
  if (!isOrder) await telegram(env, "sendMessage", {
    chat_id: row.user_id, text: `${label} · #${id}\n+${formatAmount(row.base_amount)} UZS`,
  }).catch(error => { if (error.telegramCode !== 403) throw error; });
  await store.stmt("DELETE FROM p2p_notices WHERE invoice_id = ? AND lease_until = ?", id, claim.lease_until).run();
}

// Only the verified Telegram admin callback may settle a card transfer.
export async function manualReviewCallback(env, store, config, query) {
  const match = typeof query.data === "string" &&
    /^manual:(approve|reject):([1-9][0-9]{0,15})$/.exec(query.data);
  if (!match) return false;
  const respond = text => telegram(env, "answerCallbackQuery", { callback_query_id: query.id, text });
  if (env.P2P_MODE !== "manual" || !isAdmin(env, query.from?.id)) {
    await respond("Недостаточно прав");
    return true;
  }
  const [_, decision, rawId] = match;
  const id = integer(rawId);
  const row = await store.first("SELECT * FROM invoices WHERE id = ?", id);
  if (!row || !row.checked_at || !["pending", "expired"].includes(row.status)) {
    await respond(row?.status === "paid" ? "Уже подтверждено" : "Заявка уже закрыта или не найдена");
    return true;
  }
  const reviewed = now();
  const reviewer = telegramId(query.from?.id);
  const action = decision === "approve" ? "approved" : "rejected";
  const writes = [
    store.stmt(`INSERT INTO p2p_manual_reviews (invoice_id, admin_id, decision, reviewed_at)
      SELECT id, ?, ?, ? FROM invoices WHERE id = ? AND checked_at IS NOT NULL
        AND status IN ('pending', 'expired') AND NOT EXISTS
        (SELECT 1 FROM p2p_manual_reviews WHERE invoice_id = ?)
      ON CONFLICT DO NOTHING`, reviewer, action, reviewed, id, id),
    store.stmt(`UPDATE invoices SET status = ?, review_user_id = ?,
      paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END,
      paid_ref = CASE WHEN ? = 'paid' THEN 'manual:' || id ELSE paid_ref END,
      received_amount = CASE WHEN ? = 'paid' THEN unique_amount ELSE received_amount END
      WHERE id = ? AND status IN ('pending', 'expired') AND checked_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM p2p_manual_reviews
          WHERE invoice_id = id AND admin_id = ? AND decision = ? AND reviewed_at = ?)
      RETURNING id, user_id, lang, order_payment_id`,
      decision === "approve" ? "paid" : "rejected", reviewer,
      decision === "approve" ? "paid" : "rejected", reviewed,
      decision === "approve" ? "paid" : "rejected",
      decision === "approve" ? "paid" : "rejected",
      id, reviewer, action, reviewed),
  ];
  if (decision === "reject") {
    writes.push(store.stmt(`UPDATE payments SET status = 'rejected'
      WHERE id = (SELECT order_payment_id FROM invoices WHERE id = ? AND status = 'rejected')
        AND status = 'pending'`, id));
    writes.push(store.stmt(`UPDATE orders SET status = 'rejected'
      WHERE id = (SELECT order_id FROM payments
        WHERE id = (SELECT order_payment_id FROM invoices WHERE id = ? AND status = 'rejected'))
        AND status = 'pending'`, id));
    writes.push(store.stmt(`UPDATE donat_orders SET status = 'rejected'
      WHERE id = (SELECT donat_order_id FROM payments
        WHERE id = (SELECT order_payment_id FROM invoices WHERE id = ? AND status = 'rejected'))
        AND status = 'pending'`, id));
  }
  const results = await store.db.batch(writes);
  const settled = results[1].results?.[0];
  if (!settled) {
    await respond("Заявка уже обработана");
    return true;
  }
  const approved = decision === "approve";
  await respond(approved ? "Оплата подтверждена" : "Заявка отклонена");
  if (query.message?.chat?.id && query.message?.message_id) {
    await telegram(env, "editMessageReplyMarkup", {
      chat_id: query.message.chat.id, message_id: query.message.message_id,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => {});
  }
  if (approved) {
    await sendP2pNotice(store, env, id).catch(() => {});
  } else {
    await telegram(env, "sendMessage", { chat_id: settled.user_id,
      text: settled.lang === "ru"
        ? `❌ Заявка #${id} отклонена. Если перевод поступил, свяжитесь с поддержкой.`
        : `❌ #${id} ariza rad etildi. Pul o'tkazilgan bo'lsa, qo'llab-quvvatlashga yozing.`,
    }).catch(() => {});
  }
  return true;
}

export async function sendManualReview(store, env, id) {
  if (env.P2P_MODE !== "manual") return;
  const admin = telegramId(env.ADMIN_ID);
  if (!admin) return;
  const time = now();
  const claim = await store.first(`UPDATE p2p_manual_queue SET lease_until = ?
    WHERE invoice_id = ? AND notified_at IS NULL AND lease_until <= ?
    AND EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND checked_at IS NOT NULL
      AND status IN ('pending', 'expired')) RETURNING invoice_id`, time + 60, id, time);
  if (!claim) return;
  const row = await store.first("SELECT * FROM invoices WHERE id = ?", id);
  if (!row) return;
  const label = row.order_payment_id ? "Оплата заказа" : "Пополнение баланса";
  const message = await telegram(env, "sendMessage", {
    chat_id: admin,
    text: `💳 ${label} · #${id}\n${row.payment_method.toUpperCase()} ••••${row.card_number}`
      + `\nСумма: ${formatAmount(row.unique_amount)} UZS\nКлиент: ${row.user_id}`
      + `\nПроверьте реальное поступление в банке. Нажатие «Подтвердить» начисляет деньги.`,
    reply_markup: { inline_keyboard: [[
      { text: "✅ Tasdiqlash", callback_data: `manual:approve:${id}` },
      { text: "❌ Rad etish", callback_data: `manual:reject:${id}` },
    ]] },
  });
  await store.db.batch([
    store.stmt("UPDATE invoices SET review_message_id = ? WHERE id = ?", message?.message_id ?? null, id),
    store.stmt("UPDATE p2p_manual_queue SET notified_at = ?, lease_until = 0 WHERE invoice_id = ?", now(), id),
  ]);
}

export async function p2pCommand(env, store, config, message, command, args) {
  if (command === "/p2p_confirm" || (command === "/start" && /^p2p_[0-9]+$/.test(args[0] || ""))) {
    return true;
  }
  if (command !== "/p2p_card" && command !== "/p2p_status") return false;
  if (!isAdmin(env, message.from.id)) return true;
  const say = text => telegram(env, "sendMessage", { chat_id: message.chat.id, text });

  if (command === "/p2p_status") {
    const isPrivate = env.P2P_MODE === "private";
    const lines = [env.P2P_MODE === "manual" ? "Ручное подтверждение UZCARD/HUMO включено."
      : isPrivate ? "Переводы включены для владельца и списка P2P_USERS."
      : "Переводы выключены. Установите P2P_MODE=manual или private."];
    try {
      const active = await availableCards(store, env);
      for (const method of ["uzcard", "humo"]) {
        const count = active.filter(card => card.method === method).length;
        const status = !bankSourceConfigured(env, method) ? "задайте источник уведомлений"
          : count === 0 ? "добавьте карту в P2P_CARDS или включите её через /p2p_card on" : `активных карт — ${count}`;
        lines.push(`${method.toUpperCase()} · ${status}`);
      }
    } catch (error) {
      if (!(error instanceof RequestError) || error.message !== "p2p_cards_invalid") throw error;
      lines.push("Проверьте формат секрета P2P_CARDS в Cloudflare.");
    }
    await say(lines.join("\n"));
    return true;
  }
  if (!["private", "manual"].includes(env.P2P_MODE)) return true;

  const [action, id] = args;
  if (action === "list") {
    const active = new Set((await availableCards(store, env)).map(card => card.id));
    await say(cards(env).map(card => `${card.id} · ${card.method.toUpperCase()} ••••${card.number.slice(-4)} · ${active.has(card.id) ? "on" : "off"}`).join("\n") || "Карты пока не добавлены.");
    return true;
  }
  if (!["on", "off"].includes(action) || !cards(env).some(card => card.id === id)) {
    await say("/p2p_card list\n/p2p_card on ID\n/p2p_card off ID");
    return true;
  }
  await store.stmt(`INSERT INTO p2p_card_flags VALUES (?, ?)
    ON CONFLICT (card_id) DO UPDATE SET enabled = excluded.enabled`, id, Number(action === "on")).run();
  await say(`Карта ${id} · ${action}`);
  return true;
}

// Only a bank event can settle a payment. Dispute alerts never credit a wallet.
async function alertP2pDisputes(store, env) {
  const admins = adminIds(env);
  if (!admins.length) return;
  const time = now();
  const checked = await store.all(`SELECT id, user_id, payment_method AS method,
    card_number AS last4, unique_amount AS amount FROM invoices
    WHERE checked_at IS NOT NULL AND checked_at <= ? AND status IN ('pending','expired')
      AND NOT EXISTS (SELECT 1 FROM p2p_incoming incoming WHERE incoming.invoice_id = invoices.id)
    ORDER BY checked_at LIMIT 10`, time - 600);
  const unmatched = await store.all(`SELECT incoming.id, incoming.amount, incoming.card_id,
    incoming.source, incoming.received_at FROM p2p_incoming incoming
    WHERE incoming.invoice_id IS NULL AND incoming.received_at >= ?
    ORDER BY incoming.id DESC LIMIT 10`, time - 86400);
  for (const record of [
    ...checked.map(r => ({...r,kind:'invoice'})),
    ...unmatched.map(r => ({...r,kind:'incoming'})),
  ]) {
    const text = record.kind === 'invoice'
      ? `⚠️ Оплата не подтверждена · заявка #${record.id}\nКлиент: ${record.user_id}`
        + `\n${record.method.toUpperCase()} ••••${record.last4}\nТочная сумма: ${formatAmount(record.amount)} UZS`
        + `\nКлиент нажал «Я оплатил», но подтверждённого поступления нет. Проверить в банке; НЕ зачислять по нажатию или чеку.`
      : `⚠️ Неопознанное поступление #${record.id}\nКарта: ${record.card_id}`
        + `\nИсточник: ${record.source}\nФактически пришло: ${formatAmount(record.amount)} UZS`
        + `\nНет точного совпадения с действующей заявкой. Не зачислено. Нужна сверка с банком.`;
    for (const admin of admins) {
      await store.stmt(`INSERT INTO p2p_review_alerts(kind,reference_id,admin_id)
        VALUES(?,?,?) ON CONFLICT DO NOTHING`,record.kind,record.id,admin).run();
      const lease = await store.first(`UPDATE p2p_review_alerts SET lease_until = ?
        WHERE kind=? AND reference_id=? AND admin_id=?
          AND delivered_at IS NULL AND lease_until <= ? RETURNING reference_id`,
        time + 90,record.kind,record.id,admin,time);
      if (!lease) continue;
      try {
        await telegram(env,'sendMessage',{chat_id:admin,text});
        await store.stmt(`UPDATE p2p_review_alerts SET delivered_at=?,lease_until=0
          WHERE kind=? AND reference_id=? AND admin_id=? AND lease_until=?`,
          now(),record.kind,record.id,admin,time+90).run();
      } catch (error) {
        console.error('ARSLAN BOOST dispute alert deferred');
      }
    }
  }
}

export async function p2pCron(store, env) {
  await expireInvoices(store, now(), env.P2P_MODE !== 'manual');
  if (env.P2P_MODE === 'private') await alertP2pDisputes(store, env);
  const queue = await store.all("SELECT invoice_id FROM p2p_notices WHERE lease_until <= ? ORDER BY lease_until LIMIT 6", now());
  await Promise.allSettled(queue.map(row => sendP2pNotice(store, env, row.invoice_id)));
  if (env.P2P_MODE === "manual") {
    const pending = await store.all(`SELECT invoice_id FROM p2p_manual_queue
      WHERE notified_at IS NULL AND lease_until <= ? ORDER BY invoice_id LIMIT 6`, now());
    await Promise.allSettled(pending.map(row => sendManualReview(store, env, row.invoice_id)));
  }
}
