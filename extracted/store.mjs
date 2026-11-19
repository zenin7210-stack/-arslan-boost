import {
  integer, MAX_AMOUNT, MAX_STARS, normalizeBoost, normalizeDonat, playerName,
  requestKey, RequestError,
} from "./catalog.mjs";

const RESERVATION_SECONDS = 180;
const NOTICE_LEASE_SECONDS = 60;
const epoch = () => Math.floor(Date.now() / 1000);
export const utc = () => new Date().toISOString();

export const orderTables = {
  order: { table: "orders", column: "order_id", method: "card",
    fields: ["mode", "current_rank", "target_rank", "game_id"] },
  donat: { table: "donat_orders", column: "donat_order_id", method: "method",
    fields: ["product", "option_code", "detail"] },
};

function checkOrder(existing, info, method, definition) {
  if (existing[definition.method] !== method ||
      definition.fields.some(key => existing[key] !== info[key])) {
    throw new RequestError("request_conflict", 409);
  }
}

function checkOrderQuote(data, amount) {
  if (integer(data.expectedAmount, 1, MAX_AMOUNT) !== amount) {
    throw new RequestError("order_quote_changed", 409);
  }
}

export function processing(payment) {
  return payment.status === "pending" && payment.checkout_reserved_at !== null &&
    epoch() - payment.checkout_reserved_at < RESERVATION_SECONDS;
}

export class Store {
  constructor(db) {
    this.db = db;
  }

  stmt(sql, ...params) {
    return this.db.prepare(sql).bind(...params);
  }

  first(sql, ...params) {
    return this.stmt(sql, ...params).first();
  }

  async all(sql, ...params) {
    return (await this.stmt(sql, ...params).all()).results;
  }

  async eta() {
    const row = await this.first("SELECT min_hours, max_hours FROM boost_schedule WHERE id = 1");
    return [row?.min_hours ?? null, row?.max_hours ?? null];
  }

  async profile(userId, data) {
    const gameId = data.gameId == null ? null : playerName(data.gameId);
    const lang = data.lang ?? null;
    if (lang !== null && !["uz", "ru"].includes(lang)) throw new RequestError("invalid_language");
    return this.first(`
      INSERT INTO accounts (user_id, game_id, lang) VALUES (?, COALESCE(?, ''), COALESCE(?, 'uz'))
      ON CONFLICT (user_id) DO UPDATE SET game_id = COALESCE(?, game_id), lang = COALESCE(?, lang)
      RETURNING user_id, balance, stars_balance, game_id, lang`,
      userId, gameId, lang, gameId, lang);
  }

  async state(userId) {
    const [account, orders, payments] = await this.db.batch([
      this.stmt("SELECT balance, stars_balance, game_id, lang FROM accounts WHERE user_id = ?", userId),
      this.stmt(`SELECT id, mode, current_rank, target_rank, game_id, amount, card, status,
                        created_at, eta_min_hours, eta_max_hours
                 FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100`, userId),
      this.stmt(`SELECT payment.id, order_id, donat_order_id, kind, method, payment.amount, stars,
                        payment.status, payment.created_at, invoice.id AS invoice_id
                 FROM payments AS payment
                 LEFT JOIN invoices AS invoice ON invoice.order_payment_id = payment.id
                 WHERE payment.user_id = ? ORDER BY payment.id DESC LIMIT 100`, userId),
    ]);
    const user = account.results[0];
    return {
      balance: user?.balance ?? 0, starsBalance: user?.stars_balance ?? 0,
      gameId: user?.game_id ?? "", lang: user?.lang ?? "uz",
      orders: orders.results, payments: payments.results, uzcardTest: false,
    };
  }

  async donatState(userId) {
    return this.all(`SELECT id, product, option_label, detail, amount, method, status, created_at
                     FROM donat_orders WHERE user_id = ? ORDER BY id DESC LIMIT 100`, userId);
  }

  async createOrder(kind, user, data, transfer, starsRate = 0) {
    const definition = orderTables[kind];
    const { table, column } = definition;
    const method = data.paymentMethod;
    const key = requestKey(data.requestId);
    const byKey = `FROM ${table} WHERE user_id = ? AND request_key = ?`;
    const selectOrder = `SELECT * ${byKey}`;
    const relatedPayment = `FROM payments WHERE ${column} = (SELECT id ${byKey})`;
    const selectPayment = `SELECT * ${relatedPayment}`;
    const selectInvoice = `SELECT id FROM invoices WHERE order_payment_id = (SELECT id ${relatedPayment})`;
    const saved = await this.first(selectOrder, user.id, key);
    const info = kind === "order" ? normalizeBoost(data) : normalizeDonat(data, saved);
    if (saved) {
      checkOrder(saved, info, method, definition);
      const payment = await this.first(selectPayment, user.id, key);
      if (!payment) throw new RequestError("payment_not_found", 409);
      checkOrderQuote(data, saved.amount);
      const invoice = transfer ? await this.first(selectInvoice, user.id, key) : null;
      if (transfer && !invoice) throw new RequestError("payment_not_found", 409);
      return { order: saved, payment, invoice };
    }
    checkOrderQuote(data, info.amount);
    const stars = method === "stars" ? Math.ceil(info.amount / starsRate) : 0;
    if (method === "stars" && (!Number.isSafeInteger(starsRate) ||
        starsRate <= 0 || !Number.isSafeInteger(stars) || stars < 1 || stars > MAX_STARS)) {
      throw new RequestError("stars_not_configured", 503);
    }
    const lang = data.lang === "ru" ? "ru" : "uz";
    const status = method === "balance" ? "paid" : "pending";
    const created = utc();
    const invoiceRequired = transfer
      ? `WHERE EXISTS (SELECT 1 FROM invoices WHERE user_id = ? AND request_id = ?
                         AND payment_method = ? AND base_amount = ?)`
      : "";
    const invoiceArgs = transfer ? [user.id, transfer.requestId, method, info.amount] : [];
    const insert = kind === "order"
      ? this.stmt(`
          INSERT INTO orders (user_id, username, mode, current_rank, target_rank, game_id,
              amount, card, status, created_at, request_key, lang, eta_min_hours, eta_max_hours)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              (SELECT min_hours FROM boost_schedule WHERE id = 1),
              (SELECT max_hours FROM boost_schedule WHERE id = 1)
          ${invoiceRequired}
          ON CONFLICT (user_id, request_key) DO NOTHING`,
          user.id, user.username, info.mode, info.current_rank, info.target_rank, info.game_id,
          info.amount, method, status, created, key, lang, ...invoiceArgs)
      : this.stmt(`
          INSERT INTO donat_orders (user_id, username, product, option_code, option_label, detail,
              amount, method, lang, status, request_key, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          ${invoiceRequired}
          ON CONFLICT (user_id, request_key) DO NOTHING`,
          user.id, user.username, info.product, info.option_code, info.option_label, info.detail,
          info.amount, method, lang, status, key, created, ...invoiceArgs);
    try {
      // Reserve the transfer and link its payment in the same transaction as the order.
      const writes = [
        ...(transfer ? [transfer.expire, transfer.reserve] : []),
        insert,
        this.stmt(`
          INSERT INTO payments (user_id, ${column}, kind, method, amount, stars, status,
              request_key, created_at, admin_notice_pending)
          SELECT user_id, id, ?, ?, amount, ?, status, ? || id, created_at, ? ${byKey}
          AND ${definition.method} = ? AND status = ? AND amount = ?
          ON CONFLICT (${column}) DO NOTHING`,
          kind, method, stars, kind + ":", Number(status === "paid"),
          user.id, key, method, status, info.amount),
      ];
      if (transfer) {
        writes.push(this.stmt(`
          UPDATE invoices SET order_payment_id = (SELECT id ${relatedPayment})
          WHERE user_id = ? AND request_id = ? AND order_payment_id IS NULL`,
          user.id, key, user.id, transfer.requestId));
      }
      const results = await this.db.batch([
        ...writes,
        this.stmt(selectOrder, user.id, key),
        this.stmt(selectPayment, user.id, key),
        ...(transfer ? [this.stmt(selectInvoice, user.id, key)] : []),
      ]);
      const [orders, payments, invoices] = results.slice(writes.length);
      const order = orders.results[0];
      const payment = payments.results[0];
      const invoice = invoices?.results[0];
      if (!order && transfer) {
        const active = await this.first(
          "SELECT id FROM invoices WHERE user_id = ? AND status = 'pending'", user.id);
        throw new RequestError(active ? "p2p_invoice_in_progress" : "p2p_amount_unavailable", 409);
      }
      checkOrder(order, info, method, definition);
      if (!payment || (transfer && !invoice)) throw new RequestError("payment_not_found", 409);
      checkOrderQuote(data, order.amount);
      return { order, payment, invoice };
    } catch (error) {
      if (String(error.message).includes("insufficient_balance")) {
        throw new RequestError("insufficient_balance", 409);
      }
      if (String(error.message).includes("order_already_active")) {
        throw new RequestError("order_already_active", 409);
      }
      throw error;
    }
  }

  async createTopup(userId, data, rate) {
    const stars = integer(data.stars, 1, MAX_STARS);
    const submittedRate = integer(data.starsRate, 1, 1000000);
    const amount = integer(stars * submittedRate, 1, MAX_AMOUNT);
    const key = requestKey(data.requestId);
    const select = "SELECT * FROM payments WHERE user_id = ? AND request_key = ?";
    let payment = await this.first(select, userId, key);
    if (!payment) {
      if (submittedRate !== rate) throw new RequestError("stars_quote_changed", 409);
      payment = await this.first(`
        INSERT INTO payments (user_id, kind, method, amount, stars, request_key, created_at)
        VALUES (?, 'topup', 'stars', ?, ?, ?, ?)
        ON CONFLICT (user_id, request_key) DO NOTHING RETURNING *`,
        userId, amount, stars, key, utc());
      payment ??= await this.first(select, userId, key);
    }
    if (payment.kind !== "topup" || payment.method !== "stars" ||
        payment.stars !== stars || payment.amount !== amount) {
      throw new RequestError("request_conflict", 409);
    }
    return payment;
  }

  async userPayment(id, userId) {
    const payment = await this.first(`
      SELECT * FROM payments WHERE id = ? AND user_id = ? AND method = 'stars'`, id, userId);
    if (!payment) throw new RequestError("payment_not_found", 404);
    return payment;
  }

  async paymentOrder(payment) {
    if (payment.kind === "topup") return null;
    const { table, column } = orderTables[payment.kind];
    return this.first(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`,
      payment[column], payment.user_id);
  }

  reserveCheckout(id, userId, stars, queryId) {
    const now = epoch();
    return this.first(`
      UPDATE payments SET checkout_query_id = ?, checkout_reserved_at = ?
      WHERE id = ? AND user_id = ? AND kind IN ('order','donat') AND method = 'stars' AND stars = ? AND status = 'pending'
      AND (checkout_query_id IS NULL OR checkout_query_id = ? OR checkout_reserved_at <= ?)
      RETURNING id`,
      queryId, now, id, userId, stars, queryId, now - RESERVATION_SECONDS);
  }

  async settle(id, userId, successful) {
    const chargeId = successful.telegram_payment_charge_id;
    const total = successful.total_amount;
    let payment;
    if (id && successful.currency === "XTR") {
      try {
        payment = await this.first(`
          UPDATE payments SET status = 'paid', telegram_charge_id = ?, checkout_reserved_at = NULL,
              admin_notice_pending = CASE WHEN kind = 'topup' THEN 0 ELSE 1 END
          WHERE id = ? AND user_id = ? AND method = 'stars' AND stars = ? AND status = 'pending'
          AND (kind = 'topup' OR checkout_query_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM payments WHERE telegram_charge_id = ?)
          RETURNING *`, chargeId, id, userId, total, chargeId);
      } catch (error) {
        if (!String(error.message).includes("invalid_order_status")) throw error;
      }
      if (payment) return { payment, changed: true };
      payment = await this.first(`
        SELECT * FROM payments WHERE id = ? AND user_id = ? AND method = 'stars'
          AND stars = ? AND status = 'paid' AND telegram_charge_id = ?`, id, userId, total, chargeId);
      if (payment) return { payment, changed: false };
    }
    await this.stmt(`
      INSERT INTO payment_exceptions (charge_id, payment_id, user_id, currency, total_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (charge_id) DO NOTHING`,
      chargeId, id, userId, successful.currency, total, utc()).run();
    return null;
  }

  dueNotices() {
    return this.all(`
      SELECT id FROM payments WHERE admin_notice_pending = 1 AND notice_lease_until <= ?
      ORDER BY notice_lease_until, id LIMIT 8`, epoch());
  }

  claimNotice(id) {
    const now = epoch();
    return this.first(`
      UPDATE payments SET notice_lease_until = ?
      WHERE id = ? AND status = 'paid' AND admin_notice_pending = 1 AND notice_lease_until <= ?
      RETURNING *`, now + NOTICE_LEASE_SECONDS, id, now);
  }

  async markNotified(payment) {
    await this.stmt(`
      UPDATE payments SET admin_notice_pending = 0, notice_lease_until = 0
      WHERE id = ? AND notice_lease_until = ?`, payment.id, payment.notice_lease_until).run();
  }
}
