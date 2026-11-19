import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import worker from "../src/worker.mjs";
import { parseIncoming } from "../src/p2p-notice.mjs";

function mockD1(beforeExactAmounts, beforeOrderGuard) {
  const db = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
    if (file === "0006_exact_transfer_amount.sql") beforeExactAmounts?.(db);
    if (file === "0011_safe_order_flow.sql") beforeOrderGuard?.(db);
    db.exec("BEGIN;\n" + readFileSync(new URL(file, migrations), "utf8") + "\nCOMMIT;");
  }
  function prepare(sql, args = []) {
    const stmt = db.prepare(sql);
    return {
      bind: (...next) => prepare(sql, next),
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({ results: stmt.all(...args) }),
      run: async () => ({ meta: stmt.run(...args) }),
    };
  }
  return { db, prepare, async batch(statements) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const stmt of statements) results.push(await stmt.all());
      db.exec("COMMIT");
      return results;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } };
}

const base = "https://example.workers.dev";
const token = "900000:fixture_token";
const hook = "t".repeat(32);
const key = "s".repeat(32);

function init(userId) {
  const data = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, username: "testuser" }),
  });
  const check = [...data].map(([k,v]) => k + "=" + v).sort().join("\n");
  const derived = createHmac("sha256", "WebAppData").update(token).digest();
  data.set("hash", createHmac("sha256", derived).update(check).digest("hex"));
  return data.toString();
}

function app(envOverrides = {}, beforeOrderGuard) {
  const DB = mockD1(undefined,beforeOrderGuard);
  const env = { DB, BOT_TOKEN: token, WEBHOOK_SECRET: hook, BOT_USERNAME: "arslan_test_bot",
    ADMIN_ID: "40", TELEGRAM_TEST_ENV: "1", ENABLE_PAYMENTS: "1",
    STARS_TOPUP_RATE_UZS: "160", P2P_MODE: "private", P2P_USERS: "1 2 3",
    P2P_UZCARD_SECRET: key, P2P_HUMO_SECRET: key, P2P_CARDXABAR_SECRET: key, P2P_UZCARD_SENDERS: "BankDemo",
    P2P_CARDS: JSON.stringify([
      { id: "u1", method: "uzcard", number: "0000000000000001", holder: "Test Card" },
      { id: "h1", method: "humo", number: "0000000000000002", holder: "Test Card" },
    ]), ...envOverrides };
  const work = [];
  const ctx = { waitUntil(promise) { work.push(promise); } };
  const send = async (path, body, headers, method = "POST") => {
    const file = body instanceof Blob;
    const request = new Request(base + path, {
      method, headers: { "content-type": file ? "application/octet-stream" : "application/json", ...headers },
      ...(method === "POST" ? { body: file ? body : JSON.stringify(body) } : {}),
    });
    const response = await worker.fetch(request, env, ctx);
    const raw = await response.text();
    return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? JSON.parse(raw) : raw };
  };
  return { db: DB.db, env, send, api: (userId, path, data = {}, method) =>
    send("/api/" + path, data, { "X-Telegram-Init-Data": init(userId) }, method),
  webhook: data => send("/telegram", data, { "X-Telegram-Bot-Api-Secret-Token": hook }),
  scheduled: () => worker.scheduled({}, env, ctx),
  relay: (data, secret = key) => send("/relay/uzcard", data, { Authorization: "Bearer " + secret }),
  drain: async () => { while (work.length) await Promise.all(work.splice(0)); } };
}

function notification(amount, ref, stamp = new Date().toISOString()) {
  return `Popolnenie: ${amount}.00 UZS\nCard: ***0001\nRRN: ${ref}\nDate: ${stamp}`;
}

test("parses exact sum, local time, and CardXabar layout without treating balance as a credit", () => {
  const sample = "🟢 Perevod na kartu\n➕ 50 027.00 UZS\n💳 ***0001\n📍 CLICK P2P, UZ\n🕓 14.11.26 00:21\n💵 53 000.50 UZS";
  assert.throws(() => parseIncoming(sample), /p2p_reference_required/);
  assert.deepEqual(parseIncoming(sample + "\nRRN: TEST123456"), {
    amount: 50027, last4: "0001", bankRef: "TEST123456", precision: 60,
    occurredAt: Date.parse("2026-11-13T19:21:00Z") / 1000,
  });
  assert.throws(() => parseIncoming(sample.replace("➕", "➖") + "\nRRN: TEST123456"), /p2p_credit_line_required/);
  assert.throws(() => parseIncoming(sample.replace("027.00", "027.50") + "\nRRN: TEST123456"), /p2p_fractional_amount/);
  const humo = "🎉 To'ldirish\n➕ 14.000,00 UZS\n📍 BANK P2P\n💳 HUMOCARD *0002\n🕓 21:13 14.11.2026\n💰 15.827,84 UZS";
  assert.throws(() => parseIncoming(humo), /p2p_reference_required/);
  assert.deepEqual(parseIncoming(humo + "\nRRN: TEST654321"), {
    amount: 14000, last4: "0002", bankRef: "TEST654321", precision: 60,
    occurredAt: Date.parse("2026-11-14T16:13:00Z") / 1000,
  });
});

test("exact amount migration preserves settled invoices, bank events, balances, and notices", () => {
  const { db } = mockD1(legacy => {
    legacy.exec(`
      INSERT INTO invoices (id, user_id, request_id, base_amount, unique_amount, payment_method,
        card_id, card_number, card_holder, created_at, expires_at, lang)
      VALUES (12, 1, 'existing', 10000, 10027, 'uzcard', 'u1', '0001', 'TEST', 100, 700, 'uz');
      INSERT INTO p2p_incoming (id, card_id, source, source_event_id, bank_ref,
        amount, occurred_at, received_at, invoice_id)
      VALUES (8, 'u1', 'uzcard', 'sms:old', 'BANK123456', 10027, 150, 155, 12);
    `);
  });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.prepare("SELECT status FROM invoices WHERE id = 12").get().status, "paid");
  assert.equal(db.prepare("SELECT unique_amount FROM invoices WHERE id = 12").get().unique_amount, 10027);
  assert.equal(db.prepare("SELECT invoice_id FROM p2p_incoming WHERE id = 8").get().invoice_id, 12);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM p2p_notices WHERE invoice_id = 12").get().count, 1);
  assert.equal(db.prepare("SELECT p2p_balance FROM accounts WHERE user_id = 1").get().p2p_balance, 10000);
});

test("creates exclusive invoices, authenticates status and relay, settles exactly once", async t => {
  const messages = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    messages.push({ method: url.split("/").at(-1), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: { message_id: 10 } });
  });
  const system = app();
  const form = { amount: 50000, method: "uzcard", requestId: "req-001-uz" };
  const first = await system.api(1, "invoice", form);
  assert.equal(first.status, 200);
  assert.equal(first.data.uniqueAmount, 50000);
  assert.equal(first.data.expiresAt - first.data.createdAt, 600);
  assert.equal(first.data.cardNumber, "0000000000000001");
  const retry = await system.api(1, "invoice", form);
  assert.equal(retry.data.id, first.data.id);
  assert.deepEqual((await system.api(2, "invoice/options")).data.methods, ["uzcard", "humo"]);
  const sameAmount = await system.api(2, "invoice", form);
  assert.equal(sameAmount.status, 409);
  assert.equal(sameAmount.data.error, "p2p_amount_unavailable");
  const second = await system.api(2, "invoice", { ...form, amount: 10000, method: "humo" });
  assert.equal(second.status, 200);
  assert.equal(second.data.uniqueAmount, 10000);
  assert.equal(second.data.cardNumber, "0000000000000002");
  assert.equal((await system.api(3, `invoice/${first.data.id}/status`, null, "GET")).status, 404);
  assert.equal((await system.api(77, "invoice/options")).status, 403);
  const event = { sender: "BankDemo", eventId: "sms:1", text: notification(50000, "BANK123456") };
  assert.equal((await system.relay(event, "x".repeat(32))).status, 403);
  assert.equal((await system.relay({ ...event, sender: "other" })).status, 403);
  assert.deepEqual((await system.relay(event)).data, { accepted: true, matched: true, duplicate: false });
  assert.equal((await system.relay({ ...event, eventId: "sms:2" })).data.duplicate, true);
  await system.drain();
  assert.equal(messages.filter(message => message.method === "sendMessage").length, 1);
  const state = (await system.api(1, `invoice/${first.data.id}/status`, null, "GET")).data;
  assert.equal(state.status, "paid");
  assert.equal(state.balance, 50000);
  assert.equal(state.cardNumber, undefined);
  assert.equal((await system.api(1, "state")).data.starsBalance, 0);

  const secondNotice = { eventId: "humo:1",
    text: `Kirim: 10000.00 UZS\nCard: HUMOCARD *0002\nDate: ${new Date().toISOString()}\nRRN: BANK234567` };
  const headers = { Authorization: "Bearer " + key };
  const wrongSource = await system.send("/relay/cardxabar", secondNotice, headers);
  assert.deepEqual([wrongSource.status, wrongSource.data.error], [400, "p2p_card_unknown"]);
  assert.equal((await system.api(2, `invoice/${second.data.id}/status`, null, "GET")).data.balance, 0);
  assert.deepEqual((await system.send("/relay/humo", secondNotice, headers)).data,
    { accepted: true, matched: true, duplicate: false });
  assert.equal((await system.send("/relay/humo", secondNotice, headers)).data.duplicate, true);
  await system.drain();
  const secondState = (await system.api(2, `invoice/${second.data.id}/status`, null, "GET")).data;
  assert.deepEqual([secondState.status, secondState.balance], ["paid", 10000]);
  assert.equal((await system.api(2, "state")).data.starsBalance, 0);
  assert.equal((await system.api(3, "invoice", form)).status, 409);
  system.db.prepare("UPDATE invoices SET created_at = created_at - 601, expires_at = expires_at - 601 WHERE id = ?")
    .run(first.data.id);
  const reused = await system.api(3, "invoice", form);
  assert.equal(reused.status, 200);
  assert.equal(reused.data.uniqueAmount, 50000);
  assert.equal((await system.relay({ ...event, eventId: "sms:4" })).data.duplicate, true);
  assert.equal((await system.api(3, `invoice/${reused.data.id}/status`, null, "GET")).data.balance, 0);
});

test("a delayed bank notice settles the original transfer without a receipt", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ method: url.split("/").at(-1), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: { message_id: 10 } });
  });
  const system = app();
  const form = { amount: 50000, method: "uzcard", requestId: "req-001-uz" };
  const { data: first } = await system.api(1, "invoice", form);
  system.db.prepare("UPDATE invoices SET created_at = created_at - 900, expires_at = expires_at - 900 WHERE id = ?").run(first.id);
  assert.equal((await system.api(2, "invoice", form)).status, 409);
  const { data: second } = await system.api(2, "invoice", { ...form, amount: 10000 });
  assert.equal(second.uniqueAmount, 10000);
  const status = await system.api(1, `invoice/${first.id}/check`, {});
  assert.equal(status.data.status, "expired");
  assert.equal(status.data.receiptLink, undefined);
  assert.equal(status.data.balance, 0);
  const transfer = { sender: "BankDemo", text: notification(first.uniqueAmount, "BANK888888",
    new Date((first.createdAt - 850) * 1000).toISOString()) };
  assert.equal((await system.relay(transfer)).data.matched, true);
  assert.equal((await system.relay(transfer)).data.duplicate, true);
  await system.drain();
  const paid = (await system.api(1, `invoice/${first.id}/status`, null, "GET")).data;
  assert.deepEqual([paid.status, paid.balance], ["paid", 50000]);
  assert.equal((await system.api(2, `invoice/${second.id}/status`, null, "GET")).data.status, "pending");
  assert.equal(calls.filter(call => call.method === "sendMessage").length, 1);
});

test("uploads, manual approval, and a buyer click cannot settle a transfer", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ method: url.split("/").at(-1), body: JSON.parse(options.body) });
    return Response.json({ ok: true, result: true });
  });
  const system = app();
  const { data: invoice } = await system.api(1, "invoice", { amount: 50000, method: "uzcard" });
  const path = `invoice/${invoice.id}`;
  const checked = await system.api(1, path + "/check", { paid: true, bankRef: "FALSE12345" });
  assert.equal(checked.data.status, "pending");
  assert.equal(checked.data.receiptLink, undefined);
  assert.equal((await system.api(1, path + "/receipt", new Blob(["%PDF-1.4\nfixture"]))).status, 404);
  await system.webhook({ message: {
    from: { id: 1 }, chat: { id: 1, type: "private" },
    photo: [{ file_id: "fixture", file_unique_id: "fixture-photo" }],
    reply_to_message: { text: `P2P #${invoice.id}` },
  } });
  await system.webhook({ message: {
    from: { id: 40 }, chat: { id: 40, type: "private" },
    text: `/p2p_confirm ${invoice.id} FALSE12345 50000`,
  } });
  await system.webhook({ callback_query: { id: "old-approval", from: { id: 40 }, data: `p2p_yes:${invoice.id}` } });
  assert.throws(() => system.db.prepare(`
    UPDATE invoices SET status = 'paid', paid_ref = 'FALSE12345', paid_at = unixepoch(), received_amount = 50000
    WHERE id = ?`).run(invoice.id), /p2p_confirmation_required/);
  await system.drain();
  const status = (await system.api(1, path + "/status", null, "GET")).data;
  assert.deepEqual([status.status, status.balance], ["pending", 0]);
  assert.equal(calls.length, 0);
});

test("a previously uploaded receipt can only settle on the original incoming bank event", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result: true }));
  const system = app();
  const { data: invoice } = await system.api(1, "invoice", { amount: 50000, method: "uzcard" });
  system.db.prepare(`
    UPDATE invoices SET status = 'manual_check', receipt_file_id = 'previous-upload'
    WHERE id = ?`).run(invoice.id);
  assert.equal((await system.api(1, `invoice/${invoice.id}/check`)).data.status, "pending");
  const credit = { sender: "BankDemo", text: notification(50000, "BANKLEGACY1234") };
  assert.equal((await system.relay(credit)).data.matched, true);
  assert.equal((await system.relay(credit)).data.duplicate, true);
  await system.drain();
  const paid = (await system.api(1, `invoice/${invoice.id}/status`, null, "GET")).data;
  assert.deepEqual([paid.status, paid.balance], ["paid", 50000]);
});

test("card details are issued only when that method has an automatic source configured", async () => {
  const system = app({ P2P_UZCARD_SECRET: "", P2P_CARDXABAR_SECRET: "" });
  const options = (await system.api(1, "invoice/options")).data;
  assert.deepEqual(options.methods, ["humo"]);
  const attempt = await system.api(1, "invoice", { amount: 50000, method: "uzcard" });
  assert.deepEqual([attempt.status, attempt.data.error], [409, "p2p_method_unavailable"]);
  assert.equal(attempt.data.cardNumber, undefined);
  assert.equal(system.db.prepare("SELECT count(*) AS count FROM invoices").get().count, 0);
});

test("Stars create top-ups and orders debit the funded balance once", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const method = url.split("/").at(-1), body = JSON.parse(init.body);
    calls.push({ method, body });
    return Response.json({ ok: true, result: method === "createInvoiceLink" ? "https://t.me/$fixture" : true });
  });
  const system = app();
  const terms = { paymentMethod: "stars", acceptTerms: true };
  const topup = await system.api(1, "topup", { ...terms, stars: 200, starsRate: 160, requestId: "req-001-topup" });
  assert.equal(topup.data.amount, 32000);
  const form = { product: "spin_coins", option: "100", detail: "123456",
    expectedAmount: 21990, requestId: "req-001-donat" };
  for (const path of ["checkout", "donat/create"]) {
    const direct = await system.api(1, path, { ...form, ...terms, expectedStars: 88 });
    assert.deepEqual([direct.status, direct.data.error], [400, "invalid_payment_method"]);
  }
  async function settle(payment, charge) {
    const valid = { from: { id: 1 }, currency: "XTR", invoice_payload: "ab:" + payment.id, total_amount: payment.stars };
    await system.webhook({ pre_checkout_query: { ...valid, id: charge } });
    assert.equal(calls.at(-1).body.ok, true);
    for (let i=0;i<2;i++) await system.webhook({ message: { from: { id: 1 }, chat: { type: "private" },
      successful_payment: { ...valid, telegram_payment_charge_id: charge } } });
    await system.drain();
  }
  await settle(topup.data, "star-topup");
  const order = await system.api(1, "donat/create", { ...form, paymentMethod: "balance" });
  assert.equal(order.status, 200);
  assert.equal(order.data.status, "paid");
  assert.equal((await system.api(1, "donat/create", { ...form, paymentMethod: "balance" })).data.id, order.data.id);
  await system.drain();
  assert.equal((await system.api(1, "state")).data.starsBalance, 10010);
  assert.equal((await system.api(1, "donat/state")).data.orders[0].status, "paid");
  assert.equal(calls.filter(call => call.method === "createInvoiceLink").length, 1);
  assert.equal(calls.filter(call => call.method === "sendMessage" && call.body.chat_id === 40).length, 1);
});

test("previously reserved Stars charges settle while old order invoices cannot be paid or resumed", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ method: url.split("/").at(-1), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: true });
  });
  const system = app({}, db => db.exec(`
    INSERT INTO donat_orders (id, user_id, product, option_code, option_label, detail, amount,
      method, lang, status, request_key, created_at) VALUES
      (10, 1, 'spin_coins', '100', '100 coins', '1234', 21990, 'stars', 'uz', 'pending', 'old-order', '2000-01-01'),
      (11, 1, 'spin_coins', '100', '100 coins', '1234', 21990, 'stars', 'uz', 'pending', 'old-open', '2000-01-01');
    INSERT INTO payments (id, user_id, donat_order_id, kind, method, amount, stars,
      request_key, created_at, checkout_query_id, checkout_reserved_at) VALUES
      (20, 1, 10, 'donat', 'stars', 21990, 88, 'donat:10', '2000-01-01', 'authorized', unixepoch()),
      (21, 1, 11, 'donat', 'stars', 21990, 88, 'donat:11', '2000-01-01', NULL, NULL);
  `));
  const preCheckout = { id: "request", from: { id: 1 }, currency: "XTR", total_amount: 88, invoice_payload: "ab:21" };
  await system.webhook({ pre_checkout_query: preCheckout });
  assert.equal(calls.at(-1).body.ok, false);
  const status = await system.api(1, "payment/status", { paymentId: 21, resume: true });
  assert.equal(status.data.invoiceLink, undefined);
  await system.webhook({ message: { from: { id: 1 }, chat: { type: "private" }, successful_payment: {
    currency: "XTR", total_amount: 88, invoice_payload: "ab:20", telegram_payment_charge_id: "previously-authorized",
  } } });
  await system.drain();
  assert.equal(system.db.prepare("SELECT status FROM donat_orders WHERE id = 10").get().status, "paid");
  assert.equal(system.db.prepare("SELECT status FROM donat_orders WHERE id = 11").get().status, "pending");
  assert.equal(calls.filter(call => call.method === "createInvoiceLink").length, 0);
});

test("authenticated UZCARD and HUMO notifications settle the linked orders without crediting a balance", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ method: url.split("/").at(-1), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: true });
  });
  const system = app();
  const donat = { product: "spin_coins", option: "100", detail: "123456", expectedAmount: 21990,
    requestId: "transfer-donat-1", paymentMethod: "uzcard" };
  const boost = { fromIndex: 1, toIndex: 2, mode: "wing", gameId: "23456", expectedAmount: 12000,
    requestId: "transfer-boost-1", paymentMethod: "humo" };
  assert.equal((await system.api(77, "donat/create", donat)).status, 403);
  assert.equal((await system.api(1, "donat/create", { ...donat, expectedAmount: 10000 })).status, 409);
  assert.deepEqual((await system.api(1, "state")).data.p2pMethods, ["uzcard", "humo"]);
  const placed = await system.api(1, "donat/create", donat);
  assert.equal(placed.status, 200);
  assert.deepEqual((await system.api(1, "donat/create", donat)).data, placed.data);
  const conflict = await system.api(1, "checkout", boost);
  assert.deepEqual([conflict.status, conflict.data.error], [409, "p2p_invoice_in_progress"]);
  assert.equal((await system.api(1, "state")).data.orders.length, 0);
  assert.equal((await system.api(2, "donat/create", donat)).data.error, "p2p_amount_unavailable");
  assert.equal((await system.api(2, "donat/state")).data.orders.length, 0);

  const first = `invoice/${placed.data.invoiceId}`;
  assert.equal((await system.api(2, first + "/check")).status, 404);
  const checked = (await system.api(1, first + "/check")).data;
  assert.deepEqual([checked.status, checked.purpose, checked.orderId], ["pending", "order", placed.data.id]);
  assert.equal((await system.api(1, "donat/create", { ...donat, paymentMethod: "balance" })).data.error, "request_conflict");
  const wrongAmount = { sender: "BankDemo", text: notification(21991, "BANKINCORRECT") };
  assert.equal((await system.relay(wrongAmount)).data.matched, false);
  const bank = { sender: "BankDemo", text: notification(21990, "BANKDONAT123") };
  assert.equal((await system.relay(bank)).data.matched, true);
  assert.equal((await system.relay(bank)).data.duplicate, true);
  const paid = (await system.api(1, first + "/status", null, "GET")).data;
  assert.equal(paid.status, "paid");
  assert.equal((await system.api(1, "donat/state")).data.orders[0].status, "paid");
  assert.equal((await system.api(1, "state")).data.payments[0].invoice_id, placed.data.invoiceId);

  const blocked = await system.api(1, "checkout", boost);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error, "order_already_active");
  await system.webhook({ callback_query: { id: 'take-donat', from: {id:40},
    data: `work:claim:donat:${placed.data.id}` } });
  await system.webhook({ message: { chat: {id:40,type:'private'}, from: {id:40},
    text: `/delivered donat ${placed.data.id} 1000` } });
  const second = await system.api(1, "checkout", boost);
  assert.equal(second.status, 200);
  assert.equal((await system.api(1, `invoice/${second.data.invoiceId}/check`)).data.status, "pending");
  const event = { eventId: "humo:complete-boost",
    text: `Kirim: 12000.00 UZS\nCard: HUMOCARD *0002\nDate: ${new Date().toISOString()}\nRRN: BANKBOOST123` };
  assert.equal((await system.send("/relay/humo", event, { Authorization: "Bearer " + key })).data.matched, true);
  await system.drain();
  const wallet = (await system.api(1, "state")).data;
  assert.equal(wallet.orders[0].status, "paid");
  assert.equal(wallet.starsBalance, 0);
  assert.equal((await system.api(1, "invoice/options")).data.balance, 0);
  assert.equal(calls.filter(call => call.method === "sendMessage" && call.body.chat_id === 40 && call.body.text?.includes('✅ Заказ оплачен')).length, 2);
  system.env.P2P_MODE = "off";
  assert.deepEqual((await system.api(1, "state")).data.p2pMethods, []);
  assert.equal((await system.api(1, "checkout", { ...boost, requestId: "transfer-disabled-1" })).status, 403);
});

test("the owner sees both card methods and can diagnose configuration before taking payments", async t => {
  const messages = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    messages.push(JSON.parse(init.body));
    return Response.json({ ok: true, result: true });
  });
  const system = app({ P2P_MODE: "off", P2P_USERS: "", P2P_HUMO_SECRET: "" });
  const state = async id => (await system.api(id, "state")).data;
  const status = id => system.webhook({
    message: { from: { id }, chat: { id, type: "private" }, text: "/p2p_status" },
  });
  assert.deepEqual(await state(40).then(data => [data.p2pVisible, data.p2pPrivate, data.p2pMethods]),
    [true, false, []]);
  await status(77);
  assert.equal(messages.length, 0);
  await status(40);
  assert.match(messages.at(-1).text, /P2P_MODE=manual или private/);

  system.env.P2P_MODE = "private";
  assert.deepEqual(await state(40).then(data => [data.p2pPrivate, data.p2pMethods]), [true, ["uzcard"]]);
  assert.equal((await state(77)).p2pVisible, false);
  assert.equal((await system.api(77, "invoice/options")).status, 403);
  await status(40);
  assert.match(messages.at(-1).text, /UZCARD · активных карт — 1\nHUMO · задайте источник уведомлений/);

  system.env.P2P_CARDS = "invalid";
  assert.equal((await system.api(40, "state")).status, 200);
  assert.deepEqual((await state(40)).p2pMethods, []);
  await status(40);
  assert.match(messages.at(-1).text, /Проверьте формат секрета P2P_CARDS/);
});

test("partner earns once after an admin delivers a paid order", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result: true }));
  const system = app();
  const command = (id, text) => system.webhook({
    message: { from: { id }, chat: { id, type: "private" }, text },
  });
  assert.equal((await system.api(1, "referral/apply")).data.status, "pending");
  await system.webhook({ callback_query: { from: { id: 40 }, id: "approve", data: "partner:approve:1" } });
  const partner = (await system.api(1, "referral/me")).data;
  assert.equal(partner.status, "approved");
  const code = new URL(partner.url).searchParams.get("start");
  await command(1, "/start " + code);
  await command(2, "/start " + code);
  system.db.prepare("INSERT INTO accounts(user_id,balance,stars_balance) VALUES(2,100000,100000)").run();
  const { data: order } = await system.api(2, "donat/create", {
    product: "spin_coins", option: "100", detail: "123456", paymentMethod: "balance",
    expectedAmount: 21990, requestId: "req-partner-donat",
  });
  assert.equal(order.status, "paid");
  await command(2, "/delivered donat " + order.id + " 1990");
  assert.equal((await system.api(1, "referral/me")).data.pending, 0);
  await system.webhook({ callback_query: { id:'take', from: {id:40},
    data: `work:claim:donat:${order.id}` } });
  await command(40, "/delivered donat " + order.id + " 1990");
  await command(40, "/delivered donat " + order.id + " 1990");
  const { data } = await system.api(1, "referral/me");
  assert.equal(data.clients, 1);
  assert.equal(data.pending, 10000);
  assert.equal(data.available, 0);
  system.db.exec("UPDATE partner_earnings SET available_at='2000-01-01'");
  const payout = await system.api(1, "referral/withdraw", { amount: 10000, destination: "Test destination" });
  assert.equal(payout.status, 200);
  assert.equal((await system.api(1, "referral/me")).data.available, 0);
  await system.drain();
});

test("both Telegram launch commands open the current shop with payments disabled", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ ok: true, result: true });
  });
  const legacy = "https://example.net/shop/";
  const miniApp = base + "/?v=shop";
  const system = app({ ENABLE_PAYMENTS: "0", LEGACY_MINIAPP_URL: legacy, MINIAPP_URL: miniApp });
  for (const command of ["/start", "/preview", "/id", "/start partner", "/partner"]) {
    const response = await system.webhook({ message: {
      from: { id: 1 }, chat: { id: 1, type: "private" }, text: command,
    } });
    assert.equal(response.status, 200);
  }
  assert.equal(calls[0].reply_markup.inline_keyboard[0][0].web_app.url, miniApp);
  assert.equal(calls[0].reply_markup.inline_keyboard[1][0].web_app.url, miniApp + "&section=wallet");
  assert.equal(calls[1].reply_markup.inline_keyboard[0][0].web_app.url, miniApp);
  assert.equal(calls[2].text, "Telegram ID: 1");
  assert.equal(calls[3].reply_markup.inline_keyboard[0][0].web_app.url, miniApp + "&section=partners");
  assert.equal(calls[4].reply_markup.inline_keyboard[0][0].web_app.url, miniApp + "&section=partners");
});

test("the scheduled deployment updates the default chat button once", async t => {
  const calls = [];
  const miniApp = base + "/?v=shop";
  const replies = {
    getMe: { username: "arslan_test_bot", has_main_web_app: true },
    getChatMenuButton: { type: "web_app", text: "Shop", web_app: { url: "https://example.net/old" } },
    getWebhookInfo: { url: base + "/telegram" },
    setChatMenuButton: true,
  };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const method = url.split("/").at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    assert.ok(Object.hasOwn(replies, method));
    return Response.json({ ok: true, result: replies[method] });
  });
  const system = app({ ADMIN_ID: "", ENABLE_PAYMENTS: "0", MINIAPP_URL: miniApp, SYNC_TELEGRAM_MENU: "1" });
  await system.scheduled();
  await system.drain();
  await system.scheduled();
  await system.drain();
  assert.deepEqual(calls.map(call => call.method), ["getMe", "getChatMenuButton", "getWebhookInfo", "setChatMenuButton"]);
  assert.deepEqual(calls.at(-1).body.menu_button, { type: "web_app", text: "Shop", web_app: { url: miniApp } });
  const {menu_url, webhook_connected, has_main_web_app} = system.db.prepare("SELECT * FROM telegram_entry WHERE id = 1").get();
  assert.deepEqual([menu_url, webhook_connected, has_main_web_app], [miniApp, 1, 1]);
});

test("public Stars waits for the working webhook and preserves existing Telegram subscriptions", async t => {
  const miniApp = base + "/?v=shop";
  const webhookUrl = base + "/telegram";
  const termsUrl = base + "/payment-terms";
  const calls = [];
  let webhook = { url: "https://another.example.net/telegram", allowed_updates: ["message", "message_reaction"] };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const method = url.split("/").at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === "getMe") return Response.json({ ok: true, result: { username: "arslan_test_bot" } });
    if (method === "getWebhookInfo") return Response.json({ ok: true, result: webhook });
    if (method === "setWebhook") return Response.json({ ok: true, result: true });
    if (method === "createInvoiceLink") return Response.json({ ok: true, result: "https://t.me/$fixture" });
    throw new Error("Unexpected Telegram method " + method);
  });
  const system = app({
    TELEGRAM_TEST_ENV: "0", ADMIN_USERNAME: "fixture_admin", ENABLE_PAYMENTS: "1",
    MINIAPP_URL: miniApp, STARS_TERMS_URL: termsUrl, SYNC_TELEGRAM_MENU: "1", P2P_MODE: "off",
  });
  system.db.prepare("INSERT INTO telegram_entry (id, menu_url, webhook_connected, has_main_web_app) VALUES (1, ?, 1, 0)").run(miniApp);
  const form = { stars: 100, starsRate: 160, paymentMethod: "stars", acceptTerms: true, requestId: "live-checkout-1" };
  assert.equal((await system.api(1, "topup", form)).status, 503);

  await system.scheduled();
  await system.drain();
  assert.equal(calls.some(call => call.method === "setWebhook"), false);
  assert.equal((await system.send("/healthz", null, {}, "GET")).data.paymentsEnabled, false);

  webhook = { ...webhook, url: webhookUrl };
  await system.scheduled();
  await system.drain();
  const updated = calls.find(call => call.method === "setWebhook").body;
  assert.equal(updated.url, webhookUrl);
  assert.equal(updated.drop_pending_updates, false);
  assert.deepEqual(updated.allowed_updates, ["message", "message_reaction", "pre_checkout_query", "callback_query"]);
  assert.equal((await system.send("/healthz", null, {}, "GET")).data.paymentsEnabled, true);

  const { data: config } = await system.send("/api/config", null, {}, "GET");
  assert.deepEqual([config.starsRate, config.orderStarsRate, config.termsUrl], [160, 0, termsUrl]);
  const { data: terms } = await system.send("/payment-terms", null, {}, "GET");
  assert.match(terms, /1 ⭐ зачисляется как 160 сум/);
  assert.match(terms, /@fixture_admin/);
  assert.equal((await app().send("/payment-terms", null, {}, "GET")).status, 404);
  const paid = await system.api(1, "topup", form);
  assert.equal(paid.status, 200);
  assert.deepEqual([paid.data.amount, paid.data.stars, paid.data.status], [16000, 100, "pending"]);
  assert.equal(calls.find(call => call.method === "createInvoiceLink").body.currency, "XTR");
});

test("checks both bank chats for the connected admin and keeps Stars subscriptions", async t => {
  const calls = [];
  const events = [];
  const webhookUrl = base + "/telegram";
  let subscriptions = ["message", "pre_checkout_query", "callback_query", "message_reaction"];
  t.mock.method(console, "info", (...event) => events.push(event));
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const method = url.split("/").at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    let result;
    if (method === "getMe") result = { username: "arslan_test_bot" };
    else if (method === "getWebhookInfo") result = { url: webhookUrl, allowed_updates: subscriptions };
    else if (method === "setWebhook") {
      subscriptions = body.allowed_updates;
      result = true;
    } else if (method === "getBusinessConnection") {
      const id = body.business_connection_id;
      result = { id, is_enabled: true, user: { id: id === "owner" ? 40 : 41 } };
    } else throw new Error("Unexpected Telegram method " + method);
    return Response.json({ ok: true, result });
  });

  const system = app({ MINIAPP_URL: base, P2P_CHAT_DIAGNOSTICS: "1", P2P_MODE: "off", ENABLE_PAYMENTS: "0" });
  system.db.prepare(`
    INSERT INTO telegram_entry (id, menu_url, webhook_connected, has_main_web_app, checkout_webhook_url)
    VALUES (1, ?, 1, 0, ?)
  `).run(base, webhookUrl);
  await system.scheduled();
  await system.drain();
  assert.deepEqual(subscriptions, ["message", "pre_checkout_query", "callback_query", "message_reaction", "business_message"]);
  assert.equal(calls.find(call => call.method === "setWebhook").body.drop_pending_updates, false);

  const cardXabar = {
    chat: { id: 55, type: "private" }, from: { id: 55, is_bot: true, username: "CardXabarBot" },
    business_connection_id: "owner", document: { mime_type: "application/pdf", file_id: "sample-check" },
  };
  const humo = {
    chat: { id: 77, type: "private" }, from: { id: 77, is_bot: true, username: "HUMOcardbot" },
    business_connection_id: "owner", text: "➕ 10 000.00 UZS\n💳 HUMOCARD *0002\n🕓 14.11.26 22:12",
  };
  assert.equal((await system.webhook({ business_message: cardXabar })).status, 200);
  assert.equal((await system.webhook({ business_message: humo })).status, 200);
  assert.equal((await system.webhook({ business_message: { ...humo, business_connection_id: "foreign" } })).status, 200);
  assert.equal((await system.webhook({ business_message: { ...humo, from: { ...humo.from, id: 99 } } })).status, 200);
  assert.deepEqual(events, [
    ["ARSLAN BOOST bank chat", "CardXabar", "pdf", "peer=55"],
    ["ARSLAN BOOST bank chat", "HUMO Card", "p2p_reference_required", "peer=77"],
  ]);
  assert.equal(system.db.prepare("SELECT COUNT(*) AS count FROM p2p_incoming").get().count, 0);
});

test("verified CardXabar and HUMO business notifications settle without RRN or an operator", async t => {
  const calls = [];
  const webhookUrl = base + "/telegram";
  const updates = ["message", "pre_checkout_query", "callback_query", "message_reaction"];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const method = url.split("/").at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    let result;
    if (method === "getMe") result = { username: "arslan_test_bot" };
    else if (method === "getWebhookInfo") result = { url: webhookUrl, allowed_updates: updates };
    else if (method === "getBusinessConnection") {
      const id = body.business_connection_id;
      result = { id, is_enabled: id !== "disabled", user: { id: id === "foreign" ? 41 : 40 } };
    } else if (["setWebhook", "sendMessage"].includes(method)) result = true;
    else throw new Error("Unexpected Telegram method " + method);
    return Response.json({ ok: true, result });
  });
  const system = app({ MINIAPP_URL: base, P2P_CARDXABAR_PEER_ID: "55", P2P_HUMO_PEER_ID: "77",
    P2P_UZCARD_SECRET: "", P2P_CARDXABAR_SECRET: "", P2P_HUMO_SECRET: "" });
  await system.scheduled();
  await system.drain();
  assert.deepEqual(calls.find(call => call.method === "setWebhook").body.allowed_updates,
    [...updates, "business_message"]);
  const topup = await system.api(1, "invoice", { amount: 50000, method: "uzcard" });
  const order = await system.api(2, "donat/create", { product: "spin_coins", option: "100", detail: "123456",
    expectedAmount: 21990, requestId: "business-humo", paymentMethod: "humo" });
  assert.equal(topup.status, 200);
  assert.equal(order.status, 200);
  const stamp = new Date().toISOString();
  const cardXabar = {
    message_id: 100, business_connection_id: "owner",
    from: { id: 55, is_bot: true, username: "CardXabarBot" }, chat: { id: 55, type: "private" },
    text: `🟢 Perevod na kartu\n➕ 50 000.00 UZS\n💳 ***0001\n🕓 ${stamp}`,
  };
  const humo = {
    message_id: 101, business_connection_id: "owner",
    from: { id: 77, is_bot: true, username: "HUMOcardbot" }, chat: { id: 77, type: "private" },
    text: `🎉 To‘ldirish\n➕ 21 990.00 UZS\n💳 HUMOCARD *0002\n🕓 ${stamp}`,
  };
  const status = (id, user) => system.api(user, `invoice/${id}/status`, null, "GET").then(r => r.data);
  assert.equal((await system.send("/telegram", { business_message: cardXabar }, {})).status, 403);
  for (const rejected of [
    { ...cardXabar, from: { ...cardXabar.from, id: 56 }, chat: { id: 56, type: "private" } },
    { ...cardXabar, business_connection_id: "foreign" },
    { ...cardXabar, business_connection_id: "disabled" },
    { ...cardXabar, forward_origin: { type: "user" } },
    { ...cardXabar, document: { file_id: "latest-receipt" }, caption: cardXabar.text },
    { ...cardXabar, text: cardXabar.text + "\nRRN: 12" },
    { ...cardXabar, text: cardXabar.text.replace("Perevod na kartu", "Help") },
  ]) {
    assert.equal((await system.webhook({ business_message: rejected })).status, 200);
  }
  assert.equal((await status(topup.data.id, 1)).status, "pending");
  for (const alert of [cardXabar, cardXabar, humo, humo]) {
    assert.equal((await system.webhook({ business_message: alert })).status, 200);
  }
  await system.drain();
  assert.equal((await status(topup.data.id, 1)).balance, 50000);
  assert.equal((await status(order.data.invoiceId, 2)).status, "paid");
  assert.equal((await system.api(2, "donat/state")).data.orders[0].status, "paid");
  const referenceRows = system.db.prepare("SELECT bank_ref FROM p2p_incoming ORDER BY id").all();
  assert.deepEqual(referenceRows.map(row => row.bank_ref), ["tg:55:100", "tg:77:101"]);
  assert.equal(calls.filter(call => call.method === "sendMessage" && call.body.chat_id === 40).length, 1);
});

for (const [name, command, secret, startParameter] of [
  ["CLICK", "/clicktest", "CLICK_TEST_PROVIDER_TOKEN", "click-test"],
  ["Payme", "/paymetest", "PAYME_TEST_PROVIDER_TOKEN", "payme-test"],
]) {
  test(`${name} test invoices are admin-only and never settle a store payment`, async t => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls.push({ method: new URL(url).pathname.split("/").at(-1), body: JSON.parse(options.body) });
      return Response.json({ ok: true, result: true });
    });
    const system = app({ [secret]: "123:TEST:fixture" });
    const message = (id, text = command) => ({ chat: { id, type: "private" }, from: { id }, text });
    await system.webhook({ message: message(1) });
    assert.equal(calls.at(-1).method, "sendMessage");
    assert.match(calls.at(-1).body.text, /доступен с аккаунта администратора/);
    await system.webhook({ message: message(1, "/start " + startParameter) });
    assert.equal(calls.at(-1).method, "sendMessage");
    await system.webhook({ message: message(40) });
    assert.equal(calls.at(-1).method, "sendInvoice");
    await system.webhook({ message: message(40, "/start " + startParameter) });
    assert.equal(calls.at(-1).method, "sendInvoice");
    const invoice = calls.at(-1).body;
    assert.equal(invoice.title, `Тест ${name}`);
    const payment = { invoice_payload: invoice.payload, currency: invoice.currency,
      total_amount: invoice.prices[0].amount };
    const checkout = (id, total = payment.total_amount) => system.webhook({
      pre_checkout_query: { ...payment, id: "checkout", from: { id }, total_amount: total },
    });
    await checkout(1);
    assert.equal(calls.at(-1).body.ok, false);
    await checkout(40, 1);
    assert.equal(calls.at(-1).body.ok, false);
    await checkout(40);
    assert.equal(calls.at(-1).body.ok, true);
    await system.webhook({ message: { ...message(40), successful_payment: payment } });
    assert.match(calls.at(-1).body.text, /подтвердил тестовую оплату/);
    assert.equal(system.db.prepare("SELECT COUNT(*) AS count FROM payments").get().count, 0);
    system.env[secret] = "123:LIVE:fixture";
    await system.webhook({ message: message(40) });
    assert.equal(calls.at(-1).method, "sendMessage");
    await checkout(40);
    assert.equal(calls.at(-1).body.ok, false);
  });
}

test("a rejected Payme invoice replies to the admin without disclosing raw API errors", async t => {
  const replies = [];
  const providerToken = "123:TEST:fixture";
  let description = "Bad Request: PAYMENT_PROVIDER_INVALID";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const method = new URL(url).pathname.split("/").at(-1);
    if (method === "sendInvoice") {
      return Response.json({ ok: false, error_code: 400, description }, { status: 400 });
    }
    assert.equal(method, "sendMessage");
    replies.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: true });
  });
  const system = app({ PAYME_TEST_PROVIDER_TOKEN: providerToken });
  const command = { message: { chat: { id: 40, type: "private" }, from: { id: 40 }, text: "/paymetest" } };

  assert.equal((await system.webhook(command)).status, 200);
  assert.deepEqual(replies[0], {
    chat_id: 40, text: "Не удалось выставить тестовый счёт Payme (PAYMENT_PROVIDER_INVALID).",
  });

  description = "Bad Request: Rejected token " + providerToken;
  assert.equal((await system.webhook(command)).status, 200);
  assert.equal(replies[1].text, "Не удалось выставить тестовый счёт Payme (Telegram 400).");
});

test('manual UZCARD topup requires admin, credits once, and can fund a Donat Shop order', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const call = { method: url.split('/').at(-1), body: JSON.parse(init.body) };
    calls.push(call);
    return Response.json({ ok: true, result: { message_id: 77 } });
  });
  const system = app({ P2P_MODE: 'manual', P2P_UZCARD_SECRET: '', P2P_HUMO_SECRET: '',
    P2P_CARDXABAR_SECRET: '', P2P_UZCARD_SENDERS: '', P2P_USERS: '' });
  const methods = (await system.api(77, 'state')).data;
  assert.deepEqual(methods.p2pMethods, ['uzcard', 'humo']);
  assert.equal(methods.p2pPrivate, true);

  const { data: invoice } = await system.api(77, 'invoice', {
    amount: 50000, method: 'uzcard', requestId: 'manual-topup-77' });
  assert.equal(invoice.status, 'pending');
  assert.equal((await system.relay({ sender: 'BankDemo', text: notification(50000, 'MANUAL1') })).status, 404);
  assert.equal((await system.api(77, `invoice/${invoice.id}/check`)).data.status, 'manual_check');
  await system.drain();
  assert.equal(calls.filter(c => c.method === 'sendMessage' && c.body.chat_id === 40).length, 1);
  assert.match(calls.find(c => c.method === 'sendMessage').body.text, /50.000|50 000/);
  assert.equal(system.db.prepare('SELECT review_message_id FROM invoices WHERE id=?').get(invoice.id).review_message_id, 77);
  await system.api(77, `invoice/${invoice.id}/check`);
  await system.drain();
  assert.equal(calls.filter(c => c.method === 'sendMessage' && c.body.chat_id === 40).length, 1);

  // A buyer or forged callback never credits the account.
  await system.webhook({ callback_query: { id:'forged', from:{ id: 77 },
    data:`manual:approve:${invoice.id}` } });
  assert.equal(system.db.prepare('SELECT balance FROM accounts WHERE user_id = 77').get()?.balance ?? 0, 0);
  assert.throws(() => system.db.prepare(`UPDATE invoices SET status='paid', paid_ref='manual:1',
    paid_at=unixepoch(), received_amount=unique_amount, review_user_id=40 WHERE id=?`).run(invoice.id),
    /p2p_confirmation_required/);
  await system.webhook({ callback_query: { id:'approved', from:{id:40},
    message:{ chat:{id:40}, message_id:77 }, data:`manual:approve:${invoice.id}` } });
  await system.drain();
  assert.equal((await system.api(77, `invoice/${invoice.id}/status`, null, 'GET')).data.status, 'paid');
  assert.deepEqual({...system.db.prepare('SELECT balance, stars_balance, p2p_balance FROM accounts WHERE user_id=77').get()},
    { balance:50000, stars_balance:0, p2p_balance:50000 });
  await system.webhook({ callback_query: { id:'duplicate', from:{id:40},
    data:`manual:approve:${invoice.id}` } });
  assert.equal(system.db.prepare('SELECT balance FROM accounts WHERE user_id=77').get().balance, 50000);
  assert.equal(system.db.prepare('SELECT count(*) as c FROM p2p_manual_reviews WHERE invoice_id=?').get(invoice.id).c, 1);

  const order = await system.api(77, 'donat/create', {
    product:'spin_coins', option:'100', detail:'123456', expectedAmount:21990,
    requestId:'paid-by-manual-card', paymentMethod:'balance', lang:'uz' });
  assert.equal(order.status, 200);
  assert.equal((await system.api(77, 'donat/state')).data.orders[0].status, 'paid');
  assert.deepEqual({...system.db.prepare('SELECT balance, stars_balance, p2p_balance FROM accounts WHERE user_id=77').get()},
    { balance:28010, stars_balance:0, p2p_balance:28010 });
});

test('manual HUMO order can be rejected without any credit or fulfillment', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ method: url.split('/').at(-1), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: { message_id: 15 } });
  });
  const system = app({ P2P_MODE: 'manual', P2P_HUMO_SECRET: '', P2P_UZCARD_SECRET: '', P2P_CARDXABAR_SECRET:'' });
  const order = await system.api(78, 'donat/create', { product:'spin_coins', option:'100', detail:'78392',
    paymentMethod:'humo', expectedAmount:21990, requestId:'manual-humo-reject' });
  assert.equal(order.status, 200);
  const id = order.data.invoiceId;
  assert.equal((await system.api(78, `invoice/${id}/check`)).data.status, 'manual_check');
  await system.drain();
  await system.webhook({ callback_query: { id:'rejected', from:{ id:40 },
    message:{chat:{id:40},message_id:15}, data:`manual:reject:${id}` } });
  await system.drain();
  assert.equal((await system.api(78, `invoice/${id}/status`, null, 'GET')).data.status, 'rejected');
  assert.equal((await system.api(78, 'donat/state')).data.orders[0].status, 'rejected');
  assert.equal((await system.api(78, 'state')).data.payments[0].status, 'rejected');
  assert.equal(system.db.prepare('SELECT balance FROM accounts WHERE user_id=78').get()?.balance ?? 0, 0);
  await system.webhook({ callback_query: { id:'late-approve', from:{id:40}, data:`manual:approve:${id}` } });
  assert.equal(system.db.prepare('SELECT status FROM invoices WHERE id=?').get(id).status, 'rejected');
  assert.equal(calls.filter(c => c.method === 'sendMessage' && c.body.chat_id === 78).length, 1);
});

test('real CardXabar and HUMO card-bot texts parse only incoming credits', () => {
  const cardxabar = `🟢 Перевод на карту\n➕ 145 500.00 UZS\n💳 ***2058\n📍 CASH TO CARD 3 PAYNET, UZ\n🕓 17.11.26 22:38\n💵 169 848.82 UZS`;
  const card = parseIncoming(cardxabar, {source:'cardxabar',eventId:'tg:111111:80'});
  assert.equal(card.amount, 145500);
  assert.equal(card.last4, '2058');
  assert.equal(card.bankRef, 'tg:111111:80');
  assert.equal(card.precision, 60);
  const humo = `🎉 To'ldirish\n➕ 92.000,00 UZS\n📍 PAYME UZCARD2HUMO>Ta\n💳 HUMOCARD *8459\n🕓 21:32 17.11.2026`;
  const credit = parseIncoming(humo, {source:'humo',eventId:'tg:222222:81'});
  assert.equal(credit.amount, 92000);
  assert.equal(credit.last4, '8459');
  assert.equal(credit.bankRef, 'tg:222222:81');
  assert.throws(() => parseIncoming(humo), /p2p_reference_required/);
  const debit = `💸 To'lov\n➖ 91.193,62 UZS\n📍 ASTERIUM TOP WALL OP\n💳 HUMOCARD *8459\n🕓 21:33 17.11.2026`;
  assert.throws(() => parseIncoming(debit, {source:'humo',eventId:'tg:222222:82'}),
    /p2p_credit_line_required/);
});

test('paying only 10000 on a 20000 invoice never credits the 20000 wallet', async t => {
  const events=[];
  t.mock.method(globalThis,'fetch',async(url, options)=>{
    events.push(url);
    return Response.json({ok:true,result:{message_id:44}});
  });
  const system=app();
  const opened=await system.api(1,'invoice', {amount:20000,method:'humo',requestId:'not-enough-20k'});
  assert.equal(opened.status,200);
  assert.equal(opened.data.uniqueAmount,20000);
  const wrong={eventId:'tg:7777:21',text:`🎉 To'ldirish\n➕ 10.000,00 UZS\n📍 PAYME P2P\n💳 HUMOCARD *0002\nDate: ${new Date().toISOString()}\nRRN: HALF111111`};
  const auth={Authorization:'Bearer '+key};
  assert.deepEqual((await system.send('/relay/humo',wrong,auth)).data,
    {accepted:true,matched:false,duplicate:false});
  assert.equal((await system.api(1,`invoice/${opened.data.id}/status`,null,'GET')).data.status,'pending');
  assert.equal((await system.api(1,'state')).data.balance,0);
  const full={eventId:'tg:7777:22',text:wrong.text.replace('10.000,00','20.000,00').replace('HALF111111','FULL111111')};
  assert.deepEqual((await system.send('/relay/humo',full,auth)).data,
    {accepted:true,matched:true,duplicate:false});
  assert.equal((await system.send('/relay/humo',full,auth)).data.duplicate,true);
  assert.equal((await system.api(1,'state')).data.balance,20000);
  await system.drain();
});

test('one open order across BOOST and DONAT until admin fulfillment; no parallel double debit', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (_url, options)=>{
    calls.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:42}});
  });
  const system=app({ADMIN_ID_2:'41'});
  system.db.prepare('INSERT INTO accounts(user_id,balance,p2p_balance) VALUES(1,200000,200000)').run();
  const donat={product:'spin_coins',option:'100',detail:'12345',paymentMethod:'balance',
    expectedAmount:21990,requestId:'first-paid-order'};
  const first=await system.api(1,'donat/create',donat);
  assert.equal(first.status,200);
  assert.equal((await system.api(1,'donat/create',donat)).data.id,first.data.id);
  const balance=system.db.prepare('SELECT balance FROM accounts WHERE user_id=1').get().balance;
  assert.equal(balance,178010);
  const boost={fromIndex:1,toIndex:2,mode:'wing',gameId:'23456',expectedAmount:12000,
    requestId:'second-boost',paymentMethod:'balance'};
  const blocked=await system.api(1,'checkout',boost);
  assert.deepEqual([blocked.status,blocked.data.error],[409,'order_already_active']);
  assert.equal(system.db.prepare('SELECT balance FROM accounts WHERE user_id=1').get().balance,balance);
  await system.drain();
  assert.equal(calls.filter(c=>c.chat_id===40&&c.text?.includes('Заказ оплачен')).length,1);
  assert.equal(calls.filter(c=>c.chat_id===41&&c.text?.includes('Заказ оплачен')).length,1);
  await system.webhook({callback_query:{id:'claim-41',from:{id:41},
    data:`work:claim:donat:${first.data.id}`}});
  await system.webhook({callback_query:{id:'claim-40',from:{id:40},
    data:`work:claim:donat:${first.data.id}`}});
  const owner=system.db.prepare('SELECT admin_id FROM order_claims WHERE kind=? AND order_id=?').get('donat',first.data.id);
  assert.equal(owner.admin_id,41);
  await system.webhook({message:{chat:{type:'private',id:40},from:{id:40},
    text:`/delivered donat ${first.data.id} 1000`}});
  assert.equal((await system.api(1,'donat/state')).data.orders[0].status,'in_progress');
  await system.webhook({message:{chat:{type:'private',id:41},from:{id:41},
    text:`/delivered donat ${first.data.id} 1000`}});
  assert.equal((await system.api(1,'donat/state')).data.orders[0].status,'fulfilled');
  assert.equal((await system.api(1,'checkout',boost)).status,200);
});

test('cancellation before transfer is audited and permits editing; cancelled payment cannot settle', async t => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,result:{message_id:1}}));
  const system=app();
  const first=await system.api(1,'donat/create', {product:'spin_coins',option:'100',detail:'12345',
    expectedAmount:21990,requestId:'change-me',paymentMethod:'uzcard'});
  assert.equal(first.status,200);
  const id=first.data.invoiceId;
  const denied=await system.api(2,`invoice/${id}/cancel`,{});
  assert.equal(denied.status,404);
  const cancelled=await system.api(1,`invoice/${id}/cancel`,{});
  assert.deepEqual([cancelled.status,cancelled.data.status],[200,'cancelled']);
  assert.equal((await system.api(1,`invoice/${id}/cancel`,{})).data.status,'cancelled');
  assert.equal(system.db.prepare('SELECT COUNT(*) AS c FROM p2p_invoice_cancellations').get().c,1);
  assert.equal((await system.api(1,'donat/state')).data.orders[0].status,'cancelled');
  assert.equal((await system.api(1,'state')).data.payments[0].status,'cancelled');
  const late=await system.relay({sender:'BankDemo',eventId:'sms:late-1',
    text:notification(21990,'BANKLATE123')});
  assert.equal(late.data.matched,false);
  assert.equal((await system.api(1,'state')).data.balance,0);
  const next=await system.api(1,'donat/create',{product:'spin_coins',option:'100',detail:'987654',
    expectedAmount:21990,requestId:'changed-id',paymentMethod:'humo'});
  assert.equal(next.status,200);
  assert.equal(next.data.id!==first.data.id,true);
});

test('a claim of payment blocks buyer cancellation even without a matching bank event', async t => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,result:{message_id:1}}));
  const system=app();
  const created=await system.api(1,'invoice',{amount:25000,method:'uzcard',requestId:'claimed-invoice-1'});
  assert.equal(created.status,200);
  const id=created.data.id;
  await system.api(1,`invoice/${id}/check`,{});
  const cancel=await system.api(1,`invoice/${id}/cancel`,{});
  assert.deepEqual([cancel.status,cancel.data.error],[409,'p2p_cannot_cancel']);
  assert.equal((await system.api(1,'state')).data.balance,0);
});

test('amount must match exactly and unmatched overpay cannot purchase or increase wallet',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,result:{message_id:2}}));
  const system=app();
  const opened=await system.api(1,'invoice',{amount:15000,method:'uzcard',requestId:'exact-15000'});
  const id=opened.data.id;
  for (const [sum,ref] of [[14999,'SHORT111111'],[15001,'EXTRA111111']]) {
    const event=await system.relay({sender:'BankDemo',eventId:'sms:'+ref,
      text:notification(sum,ref)});
    assert.equal(event.data.matched,false);
    assert.equal((await system.api(1,`invoice/${id}/status`,null,'GET')).data.status,'pending');
  }
  assert.equal((await system.api(1,'state')).data.balance,0);
});

test('30-minute unpaid order closure enables next order; late bank events stay unmatched',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(_url,opts)=>{
    calls.push(JSON.parse(opts.body));return Response.json({ok:true,result:{message_id:63}});
  });
  const system=app({ADMIN_ID_2:'41'});
  const first=await system.api(1,'donat/create',{
    product:'spin_coins',option:'100',detail:'12345',expectedAmount:21990,
    requestId:'will-expire-1',paymentMethod:'uzcard'});
  assert.equal(first.status,200);
  const id=first.data.invoiceId;
  const old=Math.floor(Date.now()/1000)-1900;
  system.db.prepare('UPDATE invoices SET created_at=?,expires_at=? WHERE id=?')
    .run(old,old+600,id);
  await system.scheduled(); await system.drain();
  assert.equal((await system.api(1,`invoice/${id}/status`,null,'GET')).data.status,'expired');
  assert.equal((await system.api(1,'donat/state')).data.orders[0].status,'cancelled');
  const late=await system.relay({sender:'BankDemo',eventId:'sms:late-event',
    text:notification(21990,'BANKLATEVALID',new Date((old+30)*1000).toISOString())});
  assert.equal(late.status,200);
  assert.equal(late.data.matched,false);
  assert.equal((await system.api(1,'state')).data.balance,0);
  const after=await system.api(1,'donat/create',{
    product:'spin_coins',option:'100',detail:'88888',expectedAmount:21990,
    requestId:'after-expire-new',paymentMethod:'humo'});
  assert.equal(after.status,200);
  await system.scheduled(); await system.drain();
  assert.equal(calls.filter(x=>x.chat_id===40&&x.text?.includes('Неопознанное поступление')).length,1);
  assert.equal(calls.filter(x=>x.chat_id===41&&x.text?.includes('Неопознанное поступление')).length,1);
  await system.scheduled(); await system.drain();
  assert.equal(calls.filter(x=>x.chat_id===40&&x.text?.includes('Неопознанное поступление')).length,1);
});

test('claiming paid without bank evidence triggers only a dispute alert, never credit',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(_url,opts)=>{
    calls.push(JSON.parse(opts.body));return Response.json({ok:true,result:{message_id:63}});
  });
  const system=app({ADMIN_ID_2:'41'});
  const created=await system.api(1,'invoice',{amount:15000,method:'uzcard',requestId:'claimed-unpaid-1'});
  assert.equal(created.status,200);
  await system.api(1,`invoice/${created.data.id}/check`,{});
  system.db.prepare('UPDATE invoices SET checked_at=checked_at - 700 WHERE id=?').run(created.data.id);
  await system.scheduled(); await system.drain();
  assert.equal((await system.api(1,'state')).data.balance,0);
  assert.equal(calls.filter(x=>x.chat_id===40&&x.text?.includes('Оплата не подтверждена')).length,1);
  assert.equal(calls.filter(x=>x.chat_id===41&&x.text?.includes('Оплата не подтверждена')).length,1);
  await system.scheduled();await system.drain();
  assert.equal(calls.filter(x=>x.chat_id===40&&x.text?.includes('Оплата не подтверждена')).length,1);
});

test('paid transfer cannot be cancelled and cannot be credited twice', async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,result:{message_id:2}}));
  const system=app();
  const opened=await system.api(1,'invoice',{amount:18000,method:'uzcard',requestId:'do-not-cancel-paid'});
  const paid=await system.relay({sender:'BankDemo',eventId:'sms:settle-once',
    text:notification(18000,'BANKACCEPT123')});
  assert.equal(paid.data.matched,true);
  const cancel=await system.api(1,`invoice/${opened.data.id}/cancel`,{});
  assert.deepEqual([cancel.status,cancel.data.error],[409,'p2p_cannot_cancel']);
  assert.equal((await system.api(1,'state')).data.balance,18000);
  assert.equal((await system.relay({sender:'BankDemo',eventId:'sms:settle-once',
    text:notification(18000,'BANKACCEPT123')})).data.duplicate,true);
  assert.equal((await system.api(1,'state')).data.balance,18000);
});

test('paid player details may change only before admin claims; edits are audited', async t => {
  const messages = [];
  t.mock.method(globalThis,'fetch', async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return Response.json({ok:true,result:{message_id:77}});
  });
  const system=app({ADMIN_ID_2:'41'});
  system.db.prepare('INSERT INTO accounts(user_id,balance,p2p_balance) VALUES(1,80000,80000)').run();
  const created=await system.api(1,'donat/create',{
    product:'spin_coins',option:'100',detail:'11111',expectedAmount:21990,
    paymentMethod:'balance',requestId:'editable-before-work'});
  assert.equal(created.status,200);
  const orderId=created.data.id;
  const edited=await system.api(1,'order/edit-id',{kind:'donat',orderId,value:'22222'});
  assert.equal(edited.status,200);
  assert.equal(edited.data.value,'22222');
  assert.equal(system.db.prepare('SELECT detail FROM donat_orders WHERE id=?').get(orderId).detail,'22222');
  const changes=system.db.prepare('SELECT previous_value,updated_value FROM order_id_edits WHERE order_id=?').get(orderId);
  assert.deepEqual({...changes},{previous_value:'11111',updated_value:'22222'});
  const wrongUser=await system.api(2,'order/edit-id',{kind:'donat',orderId,value:'44444'});
  assert.equal(wrongUser.status,404);
  await system.drain();
  await system.webhook({callback_query:{id:'admin-claim-1',from:{id:40},data:`work:claim:donat:${orderId}`}});
  const denied=await system.api(1,'order/edit-id',{kind:'donat',orderId,value:'33333'});
  assert.deepEqual([denied.status,denied.data.error],[409,'order_edit_locked']);
  assert.equal(system.db.prepare('SELECT detail FROM donat_orders WHERE id=?').get(orderId).detail,'22222');
  assert.equal(system.db.prepare('SELECT COUNT(*) AS n FROM order_id_edits').get().n,1);
});

test('admin may pause and handoff; original order is exclusively claimable by second admin',async t=>{
  const messages=[];
  t.mock.method(globalThis,'fetch',async (_url,opts)=>{
    messages.push(JSON.parse(opts.body));return Response.json({ok:true,result:{message_id:52}});
  });
  const system=app({ADMIN_ID_2:'41'});
  system.db.prepare('INSERT INTO accounts(user_id,balance,p2p_balance) VALUES(1,80000,80000)').run();
  const placed=await system.api(1,'donat/create',{
    product:'spin_coins',option:'100',detail:'11111',expectedAmount:21990,
    requestId:'handoff-1',paymentMethod:'balance'});
  assert.equal(placed.status,200);
  await system.drain();
  const id=placed.data.id;
  for (const [callback,who] of [['claim',40],['pause',40]]) {
    const response=await system.webhook({callback_query:{id:`${callback}-40`,from:{id:who},data:`work:${callback}:donat:${id}`}});
    assert.equal(response.status,200);
  }
  assert.equal(system.db.prepare('SELECT status FROM donat_orders WHERE id=?').get(id).status,'paused');
  const second=await system.webhook({callback_query:{id:'claim-other',from:{id:41},data:`work:claim:donat:${id}`}});
  assert.equal(second.status,200);
  assert.equal(system.db.prepare('SELECT admin_id FROM order_claims WHERE order_id=?').get(id).admin_id,40);
  const handoff=await system.webhook({callback_query:{id:'handoff-original',from:{id:40},data:`work:handoff:donat:${id}`}});
  assert.equal(handoff.status,200);
  assert.equal(system.db.prepare('SELECT COUNT(*) AS n FROM order_claims WHERE order_id=?').get(id).n,0);
  assert.equal(system.db.prepare('SELECT status FROM donat_orders WHERE id=?').get(id).status,'paid');
  await system.webhook({callback_query:{id:'claim-new',from:{id:41},data:`work:claim:donat:${id}`}});
  assert.equal(system.db.prepare('SELECT admin_id FROM order_claims WHERE order_id=?').get(id).admin_id,41);
});
