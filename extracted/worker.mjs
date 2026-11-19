import {
  catalog, CALIBRATION_LEGEND_PRICE, formatAmount, integer, MAX_AMOUNT, MAX_STARS,
  MIN_BOOST_PRICE, MODE_SURCHARGE, MODES, PRICES, productTitle, RANKS, RequestError,
  playerName, validatedDonatDetail,
} from "./catalog.mjs";
import { processing, Store } from "./store.mjs";
import { adminIds, isAdmin } from "./admins.mjs";
import { paymentTerms } from "./payment-terms.mjs";
import { bindPartner, fulfillOrder, partnerApi, partnerCallback } from "./partners.mjs";
import { authorizeRelay, bankChatUpdates, createP2pOrder, p2pAccess, p2pApi, p2pCommand, p2pCron,
  p2pMethods, p2pVisible, receiveBankChat, receiveIncoming, sendP2pNotice,
  manualReviewCallback, sendManualReview } from "./p2p.mjs";
import {
  authenticate, botToken, isTest, matchesSecret, telegram, telegramId, username, validSecret, validToken,
} from "./telegram.mjs";

const paymentUpdates = ["message", "pre_checkout_query", "callback_query"];
const testInvoiceAmount = 5000000; // 50,000 UZS in tiyin
const testProviders = [
  { command: "/clicktest", prefix: "click-test", label: "CLICK", secret: "CLICK_TEST_PROVIDER_TOKEN" },
  { command: "/paymetest", prefix: "payme-test", label: "Payme", secret: "PAYME_TEST_PROVIDER_TOKEN" },
];

function testProviderToken(env, provider) {
  const token = env[provider.secret]?.trim();
  return token && /^\d+:TEST:[A-Za-z0-9_-]+$/.test(token) ? token : "";
}

function testProviderFor(payment) {
  if (typeof payment?.invoice_payload !== "string") return undefined;
  return testProviders.find(provider => payment.invoice_payload.startsWith(provider.prefix + ":"));
}

function validTestPayment(payment, sender, config, provider) {
  return Boolean(config.admin && telegramId(sender?.id) === config.admin &&
    payment.currency === "UZS" && payment.total_amount === testInvoiceAmount &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(
      payment.invoice_payload.slice(provider.prefix.length + 1)));
}

function requiredTelegramUpdates(env) {
  return bankChatUpdates(env) ? [...paymentUpdates, "business_message"] : paymentUpdates;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function rate(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 0;
}

function settings(env, requestUrl) {
  const app = httpsUrl(env.MINIAPP_URL || requestUrl?.origin);
  const test = isTest(env);
  const terms = httpsUrl(env.STARS_TERMS_URL) || (test && app ? new URL("/test-terms", app).href : "");
  const admin = telegramId(env.ADMIN_ID);
  const admins = adminIds(env);
  const name = username(env.BOT_USERNAME?.replace(/^@/, ""));
  const support = username(env.ADMIN_USERNAME?.replace(/^@/, ""));
  const webhookReady = ["0", "1"].includes(env.TELEGRAM_TEST_ENV) &&
    Boolean(name && app && validSecret(env.WEBHOOK_SECRET) && validToken(botToken(env)));
  const enabled = env.ENABLE_PAYMENTS === "1" && webhookReady && Boolean(terms && admin);
  return {
    app, test, terms, admin, admins, name, support, webhookReady, enabled,
    topupRate: enabled ? rate(env.STARS_TOPUP_RATE_UZS) : 0,
  };
}

function webhookAddress(config) {
  return new URL("/telegram", config.app).href;
}

async function checkoutSettings(store, config) {
  if (!config.enabled || config.test) return config;
  const row = await store.first("SELECT checkout_webhook_url FROM telegram_entry WHERE id = 1");
  if (row?.checkout_webhook_url === webhookAddress(config)) return config;
  return { ...config, enabled: false, topupRate: 0 };
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function requireStars(data, configuredRate) {
  if (data.paymentMethod !== "stars") throw new RequestError("invalid_payment_method");
  if (!configuredRate) throw new RequestError("stars_not_configured", 503);
  if (data.acceptTerms !== true) throw new RequestError("terms_required");
}

async function readObject(request) {
  if (Number(request.headers.get("Content-Length")) > 16000) {
    throw new RequestError("invalid_request", 413);
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("invalid_json");
  return body;
}

function langText(lang, ru, uz) {
  return lang === "ru" ? ru : uz;
}

function background(ctx, work) {
  ctx.waitUntil(work.catch(() => console.error("ARSLAN BOOST background task failed")));
}

async function sendNotice(env, store, id) {
  const admins = adminIds(env);
  if (!admins.length) return;
  const payment = await store.claimNotice(id);
  if (!payment) return;
  const order = await store.paymentOrder(payment);
  if (!order) throw new Error("Order missing");
  const title = payment.kind === "order"
    ? `Boost #${order.id} · ${MODES.get(order.mode)}\n${RANKS[order.current_rank]} → ${RANKS[order.target_rank]}\nID: ${order.game_id}`
    : `Donat Shop #${order.id}\n${productTitle(order.product)} · ${order.option_label}\nДанные: ${order.detail || "—"}`;
  const method = payment.method === "stars" ? `${formatAmount(payment.stars)} ⭐`
    : payment.method === "balance" ? "Баланс" : payment.method.toUpperCase();
  const kind = payment.kind === "order" ? "order" : "donat";
  for (const admin of admins) {
    const sent = await store.first(
      "SELECT 1 FROM order_admin_notices WHERE payment_id = ? AND admin_id = ?", id, admin);
    if (sent) continue;
    const params = {
      chat_id: admin,
      text: `✅ Заказ оплачен\n\n${title}\n💰 ${formatAmount(payment.amount)} UZS · ${method}`
        + `\n👤 Telegram ID: ${payment.user_id}${order.username ? " · @" + order.username : ""}\nПлатёж #${id}`,
      reply_markup: { inline_keyboard: [[
        { text: "▶ Принять", callback_data: `work:claim:${kind}:${order.id}` },
      ]] },
    };
    const message = await telegram(env, "sendMessage", params);
    await store.stmt(`INSERT INTO order_admin_notices(payment_id,admin_id,message_id,sent_at)
      VALUES (?,?,?,?) ON CONFLICT DO NOTHING`, id, admin, message?.message_id ?? null,
      Math.floor(Date.now()/1000)).run();
  }
  await store.markNotified(payment);
}

function notifyTransfer(env, ctx, store, event) {
  if (!event?.invoiceId) return;
  background(ctx, sendP2pNotice(store, env, event.invoiceId));
  background(ctx, (async () => {
    const invoice = await store.first("SELECT order_payment_id FROM invoices WHERE id = ?", event.invoiceId);
    if (invoice?.order_payment_id) await sendNotice(env, store, invoice.order_payment_id);
  })());
}

async function paymentDetails(env, payment, { invoice = false, lang = "uz" } = {}) {
  const result = {
    id: payment.id, amount: payment.amount, stars: payment.stars, kind: payment.kind,
    method: payment.method, status: payment.status, orderId: payment.order_id ?? payment.donat_order_id,
    processing: processing(payment),
  };
  if (!invoice || !["topup","order"].includes(payment.kind) || payment.method !== "stars" || result.status !== "pending" || result.processing) return result;
  result.invoiceLink = await telegram(env, "createInvoiceLink", {
    title: "ARSLAN BOOST", description: payment.kind === "order"
      ? langText(lang, "Оплата заказа BOOST", "BOOST buyurtmasi uchun to‘lov")
      : langText(lang, "Пополнение баланса", "Balansni to‘ldirish"),
    payload: "ab:" + payment.id, provider_token: "", currency: "XTR",
    prices: [{ label: langText(lang, "Сумма", "Summa"), amount: payment.stars }],
  });
  return result;
}

async function publicConfig(store, config) {
  return {
    arslanBoostApi: true,
    botUrl: config.name ? "https://t.me/" + config.name : null,
    supportUrl: config.support ? "https://t.me/" + config.support : null,
    termsUrl: config.terms, starsRate: config.topupRate, orderStarsRate: config.topupRate,
    orderStarsMax: config.topupRate ? Math.min(MAX_STARS, Math.floor(MAX_AMOUNT / config.topupRate)) : 0,
    starsMax: config.topupRate ? Math.min(MAX_STARS, Math.floor(MAX_AMOUNT / config.topupRate)) : 0,
    prices: PRICES, calibrationLegendPrice: CALIBRATION_LEGEND_PRICE,
    boostModeSurcharge: MODE_SURCHARGE, minBoostPrice: MIN_BOOST_PRICE, boostEta: await store.eta(),
  };
}

async function handleApi(request, env, ctx, store, config, path) {
  if (path === "invoice" || path.startsWith("invoice/")) {
    if (/^invoice\/[0-9]{1,16}\/receipt$/.test(path)) return json({ error: "endpoint_missing" }, 404);
    const user = await authenticate(request, env);
    const data = request.method === "POST" ? await readObject(request) : {};
    return json(await p2pApi(request, env, store, user, data, path,
      id => background(ctx, sendManualReview(store, env, id))));
  }
  if (request.method === "GET") {
    if (path === "config") return json(await publicConfig(store, config));
    if (path === "donat/catalog") return json(catalog);
    return json({ error: "endpoint_missing" }, 404);
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await authenticate(request, env);
  const data = await readObject(request);
  switch (path) {
    case "referral/me":
    case "referral/apply":
    case "referral/withdraw":
      return json(await partnerApi(env, ctx, store, config, path, user, data));
    case "state": {
      const p2pPrivate = p2pAccess(env, user.id);
      return json({ ...await store.state(user.id), p2pPrivate, p2pVisible: p2pVisible(env, user.id),
        p2pAdmin: config.admins.includes(user.id), p2pMethods: p2pPrivate ? await p2pMethods(store, env) : [] });
    }
    case "donat/state":
      return json({ orders: await store.donatState(user.id) });
    case "profile":
      return json(await store.profile(user.id, data));
    case "topup": {
      requireStars(data, config.topupRate);
      const payment = await store.createTopup(user.id, data, config.topupRate);
      return json(await paymentDetails(env, payment, { invoice: true, lang: data.lang }));
    }
    case "payment/status": {
      const payment = await store.userPayment(integer(data.paymentId), user.id);
      return json(await paymentDetails(env, payment, {
        invoice: Boolean(config.topupRate && data.resume === true), lang: data.lang,
      }));
    }
    case "checkout":
    case "donat/create": {
      const kind = path === "checkout" ? "order" : "donat";
      const byCard = data.paymentMethod === "uzcard" || data.paymentMethod === "humo";
      const byStars = kind === "order" && data.paymentMethod === "stars";
      if (!byCard && !byStars && data.paymentMethod !== "balance") throw new RequestError("invalid_payment_method");
      if (byStars) requireStars(data, config.topupRate);
      if (!byCard && !config.enabled) throw new RequestError("stars_not_configured", 503);
      const { order, payment, invoice } = byCard ? await createP2pOrder(store, env, user, kind, data)
        : await store.createOrder(kind, user, data, undefined, byStars ? config.topupRate : 0);
      const result = { id: order.id, amount: order.amount, status: order.status };
      if (kind === "order") result.boostEta = [order.eta_min_hours, order.eta_max_hours];
      if (invoice) result.invoiceId = invoice.id;
      if (byStars) result.payment = await paymentDetails(env, payment, { invoice: true, lang: data.lang });
      if (payment.admin_notice_pending) background(ctx, sendNotice(env, store, payment.id));
      return json(result);
    }
    case "order/edit-id": {
      const kind = data.kind === 'boost' ? 'order' : data.kind;
      if (kind !== 'order' && kind !== 'donat') throw new RequestError('invalid_kind');
      const id = integer(data.orderId);
      const table = kind === 'order' ? 'orders' : 'donat_orders';
      const column = kind === 'order' ? 'game_id' : 'detail';
      const current = await store.first(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`,id,user.id);
      if (!current) throw new RequestError('order_not_found',404);
      const value = kind === 'order' ? playerName(data.value)
        : validatedDonatDetail(current.product,data.value);
      if (value === current[column]) return json({id,kind,value,changed:false});
      const stamp = Math.floor(Date.now()/1000);
      const [audit, updated] = await store.db.batch([
        store.stmt(`INSERT INTO order_id_edits(kind,order_id,user_id,previous_value,updated_value,changed_at)
          SELECT ?,id,user_id,${column},?,? FROM ${table} WHERE id=? AND user_id=?
          AND status='paid' AND ${column}<>? AND NOT EXISTS(
            SELECT 1 FROM order_claims c WHERE c.kind=? AND c.order_id=${table}.id)`,
            kind,value,stamp,id,user.id,value,kind),
        store.stmt(`UPDATE ${table} SET ${column}=? WHERE id=? AND user_id=? AND status='paid'
          AND NOT EXISTS(SELECT 1 FROM order_claims c WHERE c.kind=? AND c.order_id=${table}.id)
          RETURNING id,${column} AS value`,value,id,user.id,kind),
      ]);
      const result = updated.results[0];
      if (!result) throw new RequestError('order_edit_locked',409);
      background(ctx,Promise.all(adminIds(env).map(admin=>telegram(env,'sendMessage',{
        chat_id:admin,text:`✏️ Клиент изменил ${kind==='order'?'игровой ID BOOST':'данные DONAT'} заказа #${id}\nНовые данные: ${result.value}`,
      }).catch(()=>{}))));
      return json({id,kind,value:result.value,changed:true});
    }
    case "order-help":
      throw new RequestError("automatic_payment_only");
    default:
      return json({ error: "endpoint_missing" }, 404);
  }
}

function paymentId(payload) {
  const match = typeof payload === "string" && /^ab:([0-9]{1,16})$/.exec(payload);
  return match ? telegramId(match[1]) || null : null;
}

async function handlePreCheckout(env, store, config, query) {
  const id = paymentId(query.invoice_payload);
  const buyer = telegramId(query.from?.id);
  let reserved = false;
  if (config.enabled && id && buyer && typeof query.id === "string" &&
      query.currency === "XTR" && Number.isSafeInteger(query.total_amount) &&
      query.total_amount > 0 && query.total_amount <= MAX_STARS) {
    try {
      reserved = Boolean(await store.reserveCheckout(id, buyer, query.total_amount, query.id));
    } catch {
      console.error("ARSLAN BOOST checkout reservation failed");
    }
  }
  await telegram(env, "answerPreCheckoutQuery", {
    pre_checkout_query_id: query.id, ok: reserved,
    ...(reserved ? {} : { error_message: langText(query.from?.language_code,
      "Откройте новый счёт и повторите оплату.",
      "Yangi hisob ochib to‘lovni qayta urinib ko‘ring.") }),
  });
}

async function handlePaid(env, ctx, store, message) {
  const payment = message.successful_payment;
  const buyer = telegramId(message.from?.id);
  if (!buyer || typeof payment.currency !== "string" || !/^[A-Z]{3}$/.test(payment.currency) ||
      typeof payment.telegram_payment_charge_id !== "string" ||
      !payment.telegram_payment_charge_id || payment.telegram_payment_charge_id.length > 512 ||
      !Number.isSafeInteger(payment.total_amount) || payment.total_amount < 1) {
    console.error("ARSLAN BOOST invalid payment update");
    return;
  }
  const result = await store.settle(paymentId(payment.invoice_payload), buyer, payment);
  if (!result) {
    console.error("ARSLAN BOOST payment requires reconciliation");
    return;
  }
  if (result.payment.admin_notice_pending) background(ctx, sendNotice(env, store, result.payment.id));
  if (result.changed && result.payment.kind === "topup") {
    const lang = message.from?.language_code;
    background(ctx, telegram(env, "sendMessage", { chat_id: buyer,
      text: langText(lang, "✅ Баланс пополнен на ", "✅ Balansga qo‘shildi: ")
        + formatAmount(result.payment.amount) + " UZS" }));
  }
}

function miniAppSection(app, section) {
  const url = new URL(app);
  url.searchParams.set("section", section);
  return url.href;
}

async function handleCommand(env, store, config, message) {
  const [raw, ...args] = (message.text || "").trim().split(/\s+/);
  const parsedCommand = raw.split("@", 1)[0];
  const command = parsedCommand === "/start" && args[0] === "partner" ? "/partner" : parsedCommand;
  const chatId = message.chat.id;
  const lang = message.from?.language_code;
  const say = (text, extra) => telegram(env, "sendMessage", { chat_id: chatId, text, ...extra });
  if (await p2pCommand(env, store, config, message, command, args)) return;
  const testProvider = testProviders.find(provider =>
    provider.command === command || (command === "/start" && args[0] === provider.prefix));
  if (testProvider) {
    if (!isAdmin(env, message.from?.id)) {
      return say("Тестовый счёт доступен с аккаунта администратора ARSLAN BOOST.");
    }
    const token = testProviderToken(env, testProvider);
    if (!token) return say(`Добавьте тестовый токен из BotFather в секрет ${testProvider.secret}.`);
    try {
      return await telegram(env, "sendInvoice", {
        chat_id: chatId,
        title: `Тест ${testProvider.label}`,
        description: "Проверка оплаты. Без заказа и начисления баланса.",
        payload: testProvider.prefix + ":" + crypto.randomUUID(),
        provider_token: token,
        currency: "UZS",
        prices: [{ label: "Тестовый счёт", amount: testInvoiceAmount }],
        start_parameter: testProvider.prefix,
      });
    } catch (error) {
      if (!(error instanceof RequestError) || error.message !== "telegram_unavailable") throw error;
      const reason = error.invoiceError || (Number.isInteger(error.telegramCode)
        ? `Telegram ${error.telegramCode}`
        : "Telegram не ответил");
      return say(`Не удалось выставить тестовый счёт ${testProvider.label} (${reason}).`);
    }
  }
  switch (command) {
    case "/start":
    case "/preview": {
      const preview = command === "/preview";
      const url = config.app;
      if (!url) throw new RequestError("miniapp_url_required", 503);
      if (!preview) await bindPartner(store, message.from.id, args[0]);
      const greeting = preview
        ? langText(lang, "Открой обновлённый ARSLAN BOOST.", "Yangilangan ARSLAN BOOST’ni oching.")
        : langText(lang, "Добро пожаловать в ARSLAN BOOST!", "ARSLAN BOOST’ga xush kelibsiz!");
      const inline_keyboard = [[{ text: langText(lang, "🚀 Открыть Mini App", "🚀 Mini App’ni ochish"),
        web_app: { url } }]];
      if (p2pVisible(env, message.from.id)) {
        inline_keyboard.push([{ text: "UZCARD / HUMO", web_app: { url: miniAppSection(url, "wallet") } }]);
      }
      return say(greeting + (config.test ? "\n\n🧪 ID: " + message.from.id : ""), {
        reply_markup: { inline_keyboard },
      });
    }
    case "/balance": {
      const user = await store.first("SELECT stars_balance FROM accounts WHERE user_id = ?", message.from.id);
      return say(langText(lang, "Баланс: ", "Balans: ") + formatAmount(user?.stars_balance ?? 0) + " UZS");
    }
    case "/id":
      return say("Telegram ID: " + message.from.id);
    case "/terms":
      return say(config.terms || langText(lang, "Условия оплаты доступны у поддержки.", "To‘lov shartlari uchun yordam xizmatiga yozing."));
    case "/support":
    case "/paysupport":
      return say(langText(lang, "Укажите номер заказа или платежа.", "Buyurtma yoki to‘lov raqamini yozing.")
        + (config.support ? " https://t.me/" + config.support : ""));
    case "/admin":
      if (isAdmin(env, message.from.id)) {
        return say("ARSLAN BOOST\n/delivered donat 123 9000 — выдать заказ, указав себестоимость\n/delivered boost 123 9000 — завершить буст\n/boost_eta 24 48 — сроки буста\n/p2p_status — состояние UZCARD и HUMO\n/p2p_card list — карты");
      }
      return;
    case "/partner": {
      const text = langText(lang, "Партнёрская программа ARSLAN BOOST", "ARSLAN BOOST hamkorlik dasturi");
      if (!config.app) return say(text);
      return say(text, { reply_markup: { inline_keyboard: [[{
        text: langText(lang, "Открыть раздел «Партнёры»", "«Hamkorlar» bo‘limini ochish"),
        web_app: { url: miniAppSection(config.app, "partners") },
      }]] } });
    }
    case "/delivered": {
      if (!isAdmin(env, message.from.id)) return;
      let order;
      try {
        if (args.length !== 3) throw new RequestError("invalid_request");
        const kind = args[0] === 'boost' ? 'order' : args[0];
        const id = integer(args[1]);
        const admin = message.from.id;
        const claim = await store.first(`SELECT admin_id FROM order_claims
          WHERE kind=? AND order_id=? AND status IN ('accepted','paused')`, kind, id);
        if (!claim || claim.admin_id !== admin) return say('Сначала нажмите «Принять» у оплаченного заказа.');
        order = await fulfillOrder(store, args[0], id, integer(args[2], 0, 100000000000));
        if (order) await store.stmt(`UPDATE order_claims SET status='done', updated_at=unixepoch()
          WHERE kind=? AND order_id=? AND admin_id=?`,kind,id,admin).run();
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        return say("/delivered donat 123 9000 или /delivered boost 123 9000");
      }
      if (!order) return say("Оплаченный заказ не найден или уже выполнен.");
      return say(`✅ Заказ #${order.id} выполнен. Клиент увидит статус в Mini App.`);
    }
    case "/boost_eta":
      if (!isAdmin(env, message.from.id)) return;
      try {
        if (args[0] === "off" && args.length === 1) {
          await store.stmt("DELETE FROM boost_schedule WHERE id = 1").run();
          return say("Срок скрыт.");
        }
        if (args.length < 1 || args.length > 2) throw new RequestError("invalid_number");
        const low = integer(args[0], 1, 720);
        const high = integer(args.at(-1), low, 720);
        await store.stmt(`
          INSERT INTO boost_schedule VALUES (1, ?, ?)
          ON CONFLICT (id) DO UPDATE SET min_hours = excluded.min_hours, max_hours = excluded.max_hours`,
          low, high).run();
        return say(`Срок буста: ${low === high ? low : low + "–" + high} ч после оплаты.`);
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        return say("/boost_eta 24 48 или /boost_eta off");
      }
    default:
      return;
  }
}

async function handleCallback(env, store, config, query) {
  if (await manualReviewCallback(env, store, config, query)) {
    const match = /^manual:approve:([0-9]+)$/.exec(query.data || "");
    if (match) {
      const invoice = await store.first("SELECT order_payment_id FROM invoices WHERE id = ? AND status = 'paid'", integer(match[1]));
      if (invoice?.order_payment_id) await sendNotice(env, store, invoice.order_payment_id).catch(() => {});
    }
    return;
  }
  if (await partnerCallback(env, store, config, query)) return;
  const work = typeof query.data === "string" &&
    /^work:(claim|pause|resume|handoff):(order|donat):([0-9]{1,16})$/.exec(query.data);
  if (!work) return;
  let text = "Нет доступа";
  if (isAdmin(env, query.from?.id)) {
    const [, action, kind, rawId] = work;
    const id = integer(rawId);
    const admin = telegramId(query.from.id);
    const table = kind === 'order' ? 'orders' : 'donat_orders';
    if (action === 'claim') {
      const claim = await store.first(`INSERT INTO order_claims(kind,order_id,admin_id,status,created_at,updated_at)
        SELECT ?,id,?,'accepted',unixepoch(),unixepoch() FROM ${table}
        WHERE id = ? AND status = 'paid' ON CONFLICT DO NOTHING RETURNING admin_id`,
        kind,admin,id);
      if (claim) {
        await store.stmt(`UPDATE ${table} SET status = 'in_progress' WHERE id = ? AND status = 'paid'`, id).run();
        text = "Заказ закреплён за вами";
        await telegram(env,'sendMessage',{chat_id:admin,
          text:`Заказ #${id}: управление выполнением. По завершении используйте /delivered ${kind==='order'?'boost':'donat'} ${id} <себестоимость в сумах>.`,
          reply_markup:{inline_keyboard:[[
            {text:'⏸ Пауза',callback_data:`work:pause:${kind}:${id}`},
            {text:'⇄ Передать',callback_data:`work:handoff:${kind}:${id}`},
          ]]}});
      } else {
        const owner = await store.first("SELECT admin_id FROM order_claims WHERE kind=? AND order_id=?",kind,id);
        text = owner ? (owner.admin_id === admin ? "Заказ уже у вас" : "Заказ уже принят другим админом")
          : "Заказ недоступен";
      }
    } else if (action === 'handoff') {
      // Release a claim only while still in progress or paused. The other admin
      // already has the original "Accept" button; never create a duplicate order.
      const released = await store.first(`DELETE FROM order_claims
        WHERE kind=? AND order_id=? AND admin_id=? AND status IN ('accepted','paused')
        RETURNING order_id`,kind,id,admin);
      if (released) {
        await store.stmt(`UPDATE ${table} SET status='paid'
          WHERE id=? AND status IN ('in_progress','paused')`,id).run();
      }
      text = released ? 'Заказ возвращён в очередь: второй админ может его принять' :
        'Передача недоступна: заказ принят другим админом или уже завершён';
    } else {
      const from = action === 'pause' ? 'accepted' : 'paused';
      const to = action === 'pause' ? 'paused' : 'accepted';
      const changed = await store.first(`UPDATE order_claims SET status=?,updated_at=unixepoch()
        WHERE kind=? AND order_id=? AND admin_id=? AND status=? RETURNING order_id`,
        to,kind,id,admin,from);
      if (changed) {
        await store.stmt(`UPDATE ${table} SET status=? WHERE id=? AND status=?`,
          action === 'pause' ? 'paused' : 'in_progress',id,
          action === 'pause' ? 'in_progress' : 'paused').run();
      }
      text = changed ? (action === 'pause' ? 'Заказ на паузе' : 'Заказ возобновлён')
        : 'Не удалось изменить статус';
      if (changed) await telegram(env,'sendMessage',{chat_id:admin,
        text:action==='pause'?`Заказ #${id} на паузе`:`Заказ #${id} снова в работе`,
        reply_markup:{inline_keyboard:[[
          {text:action==='pause'?'▶ Продолжить':'⏸ Пауза',
            callback_data:`work:${action==='pause'?'resume':'pause'}:${kind}:${id}`},
          {text:'⇄ Передать',callback_data:`work:handoff:${kind}:${id}`},
        ]]}});

    }
  }
  await telegram(env, "answerCallbackQuery", { callback_query_id: query.id, text });
}

async function handleWebhook(request, env, ctx, store, config) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!matchesSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) {
    return json({ error: "forbidden" }, 403);
  }
  const update = await readObject(request);
  const query = update.pre_checkout_query;
  const payment = update.message?.successful_payment;
  const testQueryProvider = testProviderFor(query);
  const testPaymentProvider = testProviderFor(payment);
  if (testQueryProvider) {
    const ok = Boolean(testProviderToken(env, testQueryProvider) &&
      validTestPayment(query, query.from, config, testQueryProvider));
    await telegram(env, "answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id, ok,
      ...(ok ? {} : { error_message: "Этот тестовый счёт недоступен." }),
    });
  } else if (testPaymentProvider) {
    const message = update.message;
    if (message.chat?.type === "private" && validTestPayment(payment, message.from, config, testPaymentProvider)) {
      await telegram(env, "sendMessage", {
        chat_id: message.chat.id,
        text: `✅ Telegram подтвердил тестовую оплату ${testPaymentProvider.label}.`,
      });
    }
  } else if (query) {
    await handlePreCheckout(env, store, await checkoutSettings(store, config), update.pre_checkout_query);
  } else if (update.message?.successful_payment && update.message.chat?.type === "private") {
    await handlePaid(env, ctx, store, update.message);
  } else if (update.callback_query) {
    await handleCallback(env, store, config, update.callback_query);
  } else if (update.business_message && bankChatUpdates(env)) {
    const event = await receiveBankChat(env, store, config.admin, update.business_message);
    notifyTransfer(env, ctx, store, event);
  } else if (update.message?.chat?.type === "private" && update.message.from?.id && update.message.text) {
    await handleCommand(env, store, config, update.message);
  }
  return new Response("OK");
}

function setupPage(content, status = 200) {
  return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ARSLAN BOOST · Подключение Telegram</title>
    <main><h1>Подключение Telegram</h1>${content}</main></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function receivesRequiredUpdates(webhook, env) {
  const subscribed = webhook.allowed_updates;
  return !Array.isArray(subscribed) || !subscribed.length ||
    requiredTelegramUpdates(env).every(update => subscribed.includes(update));
}

function registerWebhook(env, url, existing) {
  const subscribed = existing.allowed_updates;
  const required = requiredTelegramUpdates(env);
  const updates = existing.url
    ? (subscribed?.length ? [...new Set([...subscribed, ...required])] : [])
    : required;
  return telegram(env, "setWebhook", {
    url, secret_token: env.WEBHOOK_SECRET, drop_pending_updates: false,
    allowed_updates: updates,
  });
}

async function saveTelegramEntry(store, bot, menuUrl, checkoutUrl) {
  await store.stmt(`
    INSERT INTO telegram_entry (id, menu_url, webhook_connected, has_main_web_app, checkout_webhook_url)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      menu_url = COALESCE(NULLIF(excluded.menu_url, ''), telegram_entry.menu_url),
      webhook_connected = excluded.webhook_connected, has_main_web_app = excluded.has_main_web_app,
      checkout_webhook_url = excluded.checkout_webhook_url
  `, menuUrl, Number(Boolean(checkoutUrl)), Number(bot.has_main_web_app === true), checkoutUrl).run();
}

async function setup(request, env, config, store) {
  if (!config.webhookReady) {
    return setupPage("<p>В настройках Worker задай BOT_USERNAME, BOT_TOKEN и WEBHOOK_SECRET.</p>", 503);
  }
  if (request.method === "GET") {
    return setupPage(`<p>Режим: ${config.test ? "тестовая сеть" : "рабочая сеть"}. Бот @${config.name}.</p>
      <form method="post" action="/setup"><label>WEBHOOK_SECRET
      <input name="secret" type="password" maxlength="256" autocomplete="off" required></label>
      <button type="submit">Подключить Telegram</button></form>`);
  }
  if (request.method !== "POST") return setupPage("<p>Неверный метод.</p>", 405);
  const form = await request.formData().catch(() => null);
  if (!matchesSecret(form?.get("secret"), env.WEBHOOK_SECRET)) {
    return setupPage("<p>Код не совпал. <a href=\"/setup\">Повторить</a></p>", 403);
  }
  const webhook = webhookAddress(config);
  const bot = await telegram(env, "getMe");
  if (bot.username?.toLowerCase() !== config.name.toLowerCase()) {
    return setupPage("<p>BOT_TOKEN принадлежит другому боту. Проверь BOT_USERNAME и сеть Telegram.</p>", 400);
  }
  const existing = await telegram(env, "getWebhookInfo");
  if (existing.url && existing.url !== webhook) {
    return setupPage("<p>У бота подключён webhook на другом адресе. Проверь адрес Worker в MINIAPP_URL.</p>", 409);
  }
  await store.eta();
  if (await registerWebhook(env, webhook, existing) !== true) {
    throw new RequestError("telegram_webhook_not_configured", 502);
  }
  await saveTelegramEntry(store, bot, "", webhook);
  return setupPage(`<p>Webhook подключён. Открой <a href="https://t.me/${config.name}">@${config.name}</a> и нажми Start.</p>`);
}

async function syncTelegramEntry(env, store, config) {
  const webhookUrl = webhookAddress(config);
  const saved = await store.first("SELECT menu_url, checkout_webhook_url FROM telegram_entry WHERE id = 1");
  const syncMenu = env.SYNC_TELEGRAM_MENU === "1" && saved?.menu_url !== config.app;
  if (!syncMenu && saved?.checkout_webhook_url === webhookUrl && !bankChatUpdates(env)) return;

  const bot = await telegram(env, "getMe");
  if (bot.username?.toLowerCase() !== config.name.toLowerCase()) {
    throw new RequestError("wrong_bot_for_telegram_sync", 503);
  }
  const [menu, webhook] = await Promise.all([
    syncMenu ? telegram(env, "getChatMenuButton") : null,
    telegram(env, "getWebhookInfo"),
  ]);
  let webhookConnected = webhook.url === webhookUrl;
  if (!webhook.url || (webhookConnected && !receivesRequiredUpdates(webhook, env))) {
    webhookConnected = await registerWebhook(env, webhookUrl, webhook) === true;
    if (!webhookConnected) throw new Error("Telegram webhook was not configured");
  }
  if (menu && (menu.type !== "web_app" || menu.web_app?.url !== config.app)) {
    const updated = await telegram(env, "setChatMenuButton", {
      menu_button: { type: "web_app", text: menu.text || "Mini App", web_app: { url: config.app } },
    });
    if (updated !== true) throw new Error("Telegram menu was not updated");
  }
  await saveTelegramEntry(store, bot, syncMenu ? config.app : "", webhookConnected ? webhookUrl : null);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = new Store(env.DB);
    const config = settings(env, url);
    try {
      if (/^\/relay\/(humo|uzcard|cardxabar)$/.test(path)) {
        const method = path.slice("/relay/".length);
        authorizeRelay(request, env, method);
        const event = await receiveIncoming(store, env, method, await readObject(request));
        notifyTransfer(env, ctx, store, event);
        return json({ accepted: true, matched: event.matched, duplicate: event.duplicate });
      }
      if (path.startsWith("/api/")) {
        return await handleApi(request, env, ctx, store, await checkoutSettings(store, config), path.slice(5));
      }
      if (path === "/telegram") return await handleWebhook(request, env, ctx, store, config);
      if (path === "/setup") return await setup(request, env, config, store);
      if (path === "/healthz" && request.method === "GET") {
        await store.eta();
        const checkout = await checkoutSettings(store, config);
        return json({ ok: true, telegramTest: config.test, paymentsEnabled: Boolean(checkout.topupRate) });
      }
      if (path === "/payment-terms" && request.method === "GET") {
        const approvedUrl = config.app ? new URL(path, config.app).href : "";
        if (!config.terms || config.terms !== approvedUrl || !config.name) return json({ error: "terms_not_published" }, 404);
        return paymentTerms(config, rate(env.STARS_TOPUP_RATE_UZS));
      }
      if (path === "/test-terms" && config.test && request.method === "GET") {
        return new Response("ARSLAN BOOST · Sinov to‘lovi\nТестовая оплата в тестовой сети Telegram.");
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof RequestError) {
        if (path === "/setup") return setupPage("<p>Ошибка подключения. Проверь токен и сеть бота.</p>", error.status);
        if (path === "/telegram" && error.telegramCode === 403) return new Response("OK");
        return json({ error: error.message }, error.status);
      }
      console.error("ARSLAN BOOST Worker failed");
      return json({ error: "service_unavailable" }, 503);
    }
  },

  async scheduled(_controller, env, ctx) {
    const store = new Store(env.DB);
    const config = settings(env);
    if (config.webhookReady && (env.SYNC_TELEGRAM_MENU === "1" || config.enabled || bankChatUpdates(env))) {
      background(ctx, syncTelegramEntry(env, store, config));
    }
    if (!telegramId(env.ADMIN_ID)) return;
    if (["private", "manual"].includes(env.P2P_MODE)) background(ctx, p2pCron(store, env));
    background(ctx, (async () => {
      for (const row of await store.dueNotices()) {
        await sendNotice(env, store, row.id).catch(() => console.error("ARSLAN BOOST admin notice retry failed"));
      }
    })());
  },
};
