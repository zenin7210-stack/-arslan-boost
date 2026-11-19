'use strict';

window.initArslanShop = function ({
  config, lang, api, connected, openSheet, closeSheet, sheetBody, syncState,
  paymentMethodTiles, paymentReady, paymentTermsHtml, startCardOrder, onStarsOrder,
  openTelegram, telegramUrl, toast, escape, money, glyph, showHistory
}) {
  const translations = {
    uz: {
      sub: 'O‘yin valyutalari va xizmatlar', search: 'Qidirish…', clear: 'Qidiruvni tozalash',
      all: 'Hammasi', games: 'O‘yinlar', services: 'Servislar', filters: 'Do‘kon filtrlari',
      other: 'Boshqa o‘yinlar', showAll: 'Barchasi', noResults: 'Mahsulot topilmadi',
      loading: 'Mahsulotlar yuklanmoqda…', loadError: 'Katalogni yuklab bo‘lmadi', retry: 'Qayta urinish',
      quantity: 'Nechta Gold kerak?', starsQuantity: 'Nechta Stars kerak?', select: 'Paketni tanlang', game: 'O‘yin ID',
      addPack: 'Paket qo‘shish', removePack: 'Bitta paketni olib tashlash',
      username: 'Username', optional: 'Nick yoki izoh (ixtiyoriy)', example: 'Masalan, 12345678',
      price: 'Jami', next: 'Davom etish', back: 'Orqaga', pay: 'To‘lov usuli',
      confirm: 'Buyurtma berish', copy: 'Xabarni nusxalash', contact: 'Administratorga yozish',
      market: 'Skinni qo‘yishdan oldin narxni admin bilan kelishing. Skinni aynan shu narxda qo‘ying.',
      created: 'Buyurtma yaratildi', draft: 'Buyurtma matni tayyor', sendBot: 'Botga yuborish',
      draftHint: 'Buyurtmani rasmiylashtirish uchun xabarni administratorga yuboring.',
      delivery: 'Admin to‘lovni tekshiradi va buyurtmani bajaradi.',
      error: 'Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.', copied: 'Nusxalandi',
      copyHint: 'Matnni belgilang va nusxalang', done: 'Tayyor', terminal: 'Bankomat',
      partners: 'Hamkorlar', partner: 'Hamkorlik dasturi', apply: 'Ariza yuborish',
      waiting: 'Arizangiz ko‘rib chiqilmoqda', rejected: 'Ariza rad etildi. Qayta yuborishingiz mumkin.',
      disabled: 'Hamkorlik vaqtincha to‘xtatilgan', clients: 'Taklif qilingan mijozlar', available: 'Yechish mumkin',
      pending: 'Hisoblanishi kutilmoqda', link: 'Taklif havolangiz', copyLink: 'Nusxalash', shareLink: 'Ulashish',
      partnerCabinet: 'Hamkor kabineti', partnerLoading: 'Kabinet yuklanmoqda…',
      withdrawal: 'Pul yechish', withdrawalAmount: 'Yechish summasi',
      withdrawalDetails: 'Karta yoki telefon raqami', withdrawalSent: 'So‘rov yuborildi',
      insufficient: 'Mablag‘ yetarli emas', invalid: 'Ma’lumotlarni tekshiring', commissions: 'Hisoblangan daromad',
      intro: 'Havolangiz orqali kelgan mijozlarning bajarilgan buyurtmalaridan daromad oling.',
      shareOfProfit: 'sof foydadan', minimum: '{amount} dan yechish', delay: '24 soatdan keyin', openBot: 'Telegram botini ochish',
      waitingCommission: 'Kutilmoqda', availableCommission: 'Hisoblandi', reversedCommission: 'Bekor qilindi',
      payouts: 'Yechib olingan mablag‘lar', payoutRequest: 'So‘rov', payoutPaid: 'To‘landi',
      payoutPending: 'Yechish so‘rovingiz ko‘rib chiqilmoqda', payoutRejected: 'Rad etildi',
      emptyCommissions: 'Hozircha hisoblangan daromad yo‘q', withdrawAction: 'Yechishni so‘rash',
      balance: 'Mavjud balans', topup: 'Hamyonni to‘ldirish',
      payBalance: 'Balansdan to‘lash', paid: 'To‘langan buyurtma adminga yuborildi', walletShort: 'Balansda mablag‘ yetarli emas',
      quoteChanged: 'Narx yangilandi. Buyurtmani qayta oching.',
      buy: 'Sotib olish', verify: 'Tekshirish', formatValid: 'Format to‘g‘ri.',
      formatInvalid: 'Kiritilgan ma’lumot formatini tekshiring.', chooseProduct: 'Mahsulotni tanlang',
      fastUc: 'UC tezkor', bundles: 'To‘plamlar', global: 'Global', login: 'Akkauntga kirib',
      gems: 'Gems', brawlPass: 'Brawl Pass',
      customStars: 'Ixtiyoriy miqdor', starsPrice: 'Narx', from: 'Kamida', to: 'Ko‘pi bilan'
    },
    ru: {
      sub: 'Игровая валюта и услуги', search: 'Поиск…', clear: 'Очистить поиск',
      all: 'Все', games: 'Игры', services: 'Услуги', filters: 'Фильтры магазина',
      other: 'Другие игры', showAll: 'Все игры', noResults: 'Ничего не найдено',
      loading: 'Загружаем товары…', loadError: 'Не удалось загрузить каталог', retry: 'Повторить',
      quantity: 'Сколько нужно Gold?', starsQuantity: 'Сколько нужно Stars?', select: 'Выберите пакет', game: 'Игровой ID',
      addPack: 'Добавить пакет', removePack: 'Убрать один пакет',
      username: 'Имя пользователя', optional: 'Ник или комментарий (необязательно)', example: 'Например, 12345678',
      price: 'Итого', next: 'Продолжить', back: 'Назад', pay: 'Способ оплаты',
      confirm: 'Оформить заказ', copy: 'Скопировать сообщение', contact: 'Написать администратору',
      market: 'Согласуйте цену скина с администратором и выставьте его ровно по этой цене.',
      created: 'Заказ создан', draft: 'Текст заказа готов', sendBot: 'Отправить боту',
      draftHint: 'Отправьте сообщение администратору, чтобы оформить заказ.',
      delivery: 'Администратор проверит оплату и выполнит заказ.',
      error: 'Не удалось связаться с ботом. Попробуйте ещё раз.', copied: 'Скопировано',
      copyHint: 'Выделите и скопируйте текст', done: 'Готово', terminal: 'Банкомат',
      partners: 'Партнёры', partner: 'Партнёрская программа', apply: 'Подать заявку',
      waiting: 'Заявка на рассмотрении', rejected: 'Заявка отклонена. Её можно подать снова.',
      disabled: 'Партнёрство приостановлено', clients: 'Приглашённые клиенты', available: 'Доступно к выводу',
      pending: 'Ожидает начисления', link: 'Ваша реферальная ссылка', copyLink: 'Скопировать', shareLink: 'Поделиться',
      partnerCabinet: 'Кабинет партнёра', partnerLoading: 'Загружаем кабинет…',
      withdrawal: 'Вывод средств', withdrawalAmount: 'Сумма вывода',
      withdrawalDetails: 'Номер карты или телефона', withdrawalSent: 'Заявка отправлена',
      insufficient: 'Недостаточно средств', invalid: 'Проверьте введённые данные', commissions: 'История начислений',
      intro: 'Получайте вознаграждение за выполненные заказы клиентов, пришедших по вашей ссылке.',
      shareOfProfit: 'от чистой прибыли', minimum: 'Вывод от {amount}', delay: 'Доступно через 24 часа', openBot: 'Открыть Telegram-бота',
      waitingCommission: 'Ожидает', availableCommission: 'Начислено', reversedCommission: 'Отменено',
      payouts: 'История выплат', payoutRequest: 'Заявка', payoutPaid: 'Выплачено',
      payoutPending: 'Ваша заявка на вывод на рассмотрении', payoutRejected: 'Отклонено',
      emptyCommissions: 'Начислений пока нет', withdrawAction: 'Запросить вывод',
      balance: 'Доступный баланс', topup: 'Пополнить баланс',
      payBalance: 'Оплатить с баланса', paid: 'Оплаченный заказ передан администратору', walletShort: 'На балансе недостаточно средств',
      quoteChanged: 'Цена обновилась. Откройте заказ заново.',
      buy: 'Купить', verify: 'Проверить', formatValid: 'Формат верный.',
      formatInvalid: 'Проверьте формат введённых данных.', chooseProduct: 'Выберите товар',
      fastUc: 'Быстрые UC', bundles: 'Наборы', global: 'Global', login: 'Со входом в аккаунт',
      gems: 'Гемы', brawlPass: 'Brawl Pass',
      customStars: 'Своё количество', starsPrice: 'Цена', from: 'Минимум', to: 'Максимум'
    }
  };
  const translatedSubtitles = {
    gold_rinok: 'Gold через рынок',
    gold_id: 'Gold по игровому ID',
    spin_coins: 'Валюта для Spin',
    telegram_premium: '1 / 3 / 6 / 12 мес.'
  };
  const cardStyles = {
    gold_rinok: 'gold', gold_id: 'id', gold_pass: 'pass', spin_coins: 'coins'
  };
  const goldTitles = { gold_rinok: 'Gold через рынок', gold_id: 'Gold по ID' };
  const gameOrder = new Map(['pubg_mobile', 'roblox', 'mobile_legends', 'brawl_stars']
    .map((id, index) => [id, index]));
  const storefrontArt = new Set([...Object.keys(cardStyles), 'telegram_premium', 'telegram_stars', ...gameOrder.keys()]);
  const widgetCovers = {
    mobile_legends: 'mobile-legends', pubg_mobile: 'pubg', telegram_premium: 'premium', telegram_stars: 'stars', brawl_stars: 'brawl'
  };
  const widgetIds = new Set(Object.keys(widgetCovers));
  const genericCovers = {
    roblox:'assets/donat/cover-roblox.webp', mobile_legends:'assets/donat/cover-mobile-legends.webp',
    gold_id:'assets/donat/cover-gold-id.webp',gold_rinok:'assets/donat/cover-gold-rinok.webp',
    gold_pass:'assets/donat/cover-gold-pass.webp',spin_coins:'assets/donat/cover-spin-coins.webp'
  };
  const quickUc = ['60', '325', '660', '1800', '3850', '8100'];
  const premiumGifts = ['3', '6', '12gift'];
  const brawlPasses = ['pass', 'passplus', 'propass'];
  const brawlPacks = ['30', '80', '170', '360', '950', '2000', ...brawlPasses];

  const shopPage = document.querySelector('#donat');
  const content = document.querySelector('#shop-content');
  const search = document.querySelector('#shop-search');
  const clear = document.querySelector('#clear-search');
  const filters = [...document.querySelectorAll('#shop-filters button')];
  const state = { items: [], loading: false, failed: false, category: 'all' };

  const t = key => translations[lang()][key];
  const amount = value => money(value) + ' UZS';
  const optionLabel = value => lang() === 'ru'
    ? value.replace(' oy', ' мес.').replace('(kirishsiz)', '(подарок)')
    : value;
  const subtitle = item => (lang() === 'ru' && translatedSubtitles[item.id]) || item.subtitle;
  const cover = item => storefrontArt.has(item.id) ? `assets/donat/catalog/${item.id}.webp` : item.image;
  const botLink = start => {
    const link = telegramUrl(config.botUrl);
    if (!link) return null;
    link.search = '';
    link.searchParams.set('start', start);
    return link.href;
  };

  function card(item) {
    const cardStyle = cardStyles[item.id] || 'telegram';
    const goldTitle = goldTitles[item.id];
    const price = goldTitle ? item.options[0][2] : null;
    return `
      <button class="product-card ${cardStyle}" data-product="${escape(item.id)}" type="button">
        <img class="card-art" src="${escape(cover(item))}" alt="" width="318" height="201" decoding="async">
        <strong class="card-name">${escape(goldTitle || item.title)}</strong>
        <span class="card-desc">${goldTitle ? '100 Gold' : escape(subtitle(item))}</span>
        ${price === null ? '' : `<span class="card-price">${amount(price)}</span>`}
      </button>`;
  }

  function render() {
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === state.category)));
    if (state.loading) {
      content.innerHTML = `<p class="shop-empty">${t('loading')}</p>`;
      return;
    }
    if (state.failed) {
      content.innerHTML = `<div class="shop-empty">${t('loadError')}<br><button class="show-all" type="button" id="retry-shop">${t('retry')}</button></div>`;
      return;
    }

    const query = search.value.trim().toLowerCase();
    const items = state.items.filter(item => {
      const groupMatches = state.category === 'all' || (state.category === 'games') === (item.group === 'games');
      const title = [item.title, item.subtitle, subtitle(item), goldTitles[item.id]].join(' ').toLowerCase();
      return groupMatches && query.split(/\s+/).every(word => title.includes(word));
    });
    const services = items.filter(item => item.group !== 'games');
    const games = items.filter(item => item.group === 'games')
      .sort((a, b) => (gameOrder.get(a.id) ?? gameOrder.size) - (gameOrder.get(b.id) ?? gameOrder.size));
    if (!items.length) {
      content.innerHTML = `<p class="shop-empty">${t('noResults')}</p>`;
      return;
    }

    const gamesMarkup = games.map(item => `
      <button class="game-card" type="button" data-product="${escape(item.id)}">
        <img class="game-art" src="${escape(cover(item))}" alt="" width="248" height="177" decoding="async">
        <span class="game-name">${escape(item.title)}</span>
      </button>`).join('');
    content.innerHTML = `
      ${services.length ? `<div class="product-grid">${services.map(card).join('')}</div>` : ''}
      ${games.length ? `<h2 class="section-title">${glyph('shop')} ${t('other')}
        ${state.category === 'all' && !query ? `<button type="button" class="show-all" data-category="games">${t('showAll')} →</button>` : ''}
      </h2><div class="game-grid">${gamesMarkup}</div>` : ''}`;
  }

  async function loadCatalog(refresh = false) {
    state.loading = true;
    state.failed = false;
    render();
    try {
      const response = await fetch('assets/donat/catalog.json?v=20261110-uc-packs',refresh?{cache:'reload'}:undefined);
      if (!response.ok) throw new Error('Catalog unavailable');
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Invalid catalog');
      state.items = data.items;
    } catch {
      state.failed = true;
    } finally {
      state.loading = false;
      render();
    }
  }

  function applyLanguage() {
    document.querySelectorAll('[data-shop-text]').forEach(element => {
      element.textContent = t(element.dataset.shopText);
    });
    search.placeholder = t('search');
    search.setAttribute('aria-label', t('search'));
    clear.setAttribute('aria-label', t('clear'));
    document.querySelector('#shop-filters').setAttribute('aria-label', t('filters'));
    render();
  }

  function quantityValid(order) {
    return Number.isSafeInteger(order.quantity) && order.quantity >= order.item.min && order.quantity <= order.item.max;
  }

  function selectedOption(order) {
    return order.item.options.find(([id]) => id === order.option);
  }

  function total(order) {
    if (order.item.kind !== 'quantity') return selectedOption(order)[2] * order.packs;
    const { options } = order.item;
    const upperIndex = options.findIndex(([id]) => order.quantity <= Number(id));
    const [upperQuantity, , upperAmount] = options[upperIndex];
    if (order.quantity === Number(upperQuantity)) return upperAmount;
    const [lowerQuantity, , lowerAmount] = options[upperIndex - 1];
    // The server uses the same adjacent preset prices and whole-sum rounding.
    const span = Number(upperQuantity) - Number(lowerQuantity);
    const difference = (order.quantity - Number(lowerQuantity)) * (upperAmount - lowerAmount);
    return lowerAmount + Math.ceil(difference / span);
  }

  function packageName(order) {
    if (order.item.kind === 'quantity') return money(order.quantity) + ' ' + order.item.unit;
    const label = optionLabel(selectedOption(order)[1]);
    return order.packs > 1 ? order.packs + ' × ' + label : label;
  }

  function detailValid(order) {
    if (order.item.id === 'mobile_legends') return /^\d{5,20}-\d{3,8}$/.test(order.detail);
    if (order.item.input === 'game_id') return /^[A-Za-z0-9_#-]{4,40}$/.test(order.detail);
    if (order.item.input === 'username') return /^@?[A-Za-z0-9_.]{3,32}$/.test(order.detail);
    return order.detail.length <= 64 && !/[<>\x00-\x1f]/.test(order.detail);
  }

  function priceSummary(value, units = '', label = t('price')) {
    const detail = units ? `<small id="selected-units">${escape(units)}</small>` : '';
    return `<div class="price-summary"><span>${label}${detail}</span><strong id="selected-price" aria-live="polite">${value === null ? '—' : amount(value)}</strong></div>`;
  }

  function packArt(item, id) {
    let index = -1;
    if (item.id === 'pubg_mobile') index = Math.max(0, quickUc.findLastIndex(tier => Number(tier) <= Number(id)));
    else if (item.id === 'brawl_stars') index = brawlPacks.indexOf(id);
    else if (premiumGifts.includes(id)) index = quickUc.length + premiumGifts.indexOf(id);
    if (index < 0) {
      const image = item.id === 'telegram_premium' ? 'assets/donat/widget-telegram_premium.webp' : item.image;
      return `<img class="widget-pack-art" src="${escape(image)}" alt="">`;
    }
    const x = index % 3 * 50;
    const y = Math.floor(index / 3) * (item.id === 'pubg_mobile' ? 100 : 50);
    return `<span class="widget-pack-art" style="--art-x:${x}%;--art-y:${y}%" aria-hidden="true"></span>`;
  }

  function packageChoices(item, options = item.options, widget = false) {
    return `${widget ? '' : `<label id="package-label">${t('select')}</label>`}
      <div class="variant-list${item.kind === 'quantity' ? ' quantity-options' : ''}" role="group" aria-labelledby="package-label">${options.map(([id, name, price]) => {
        const label = escape(optionLabel(widget ? name.replace(' (kirishsiz)', '') : name));
        const text = `<span>${label}</span><strong>${amount(price)}</strong>`;
        const choice = `<button type="button" class="${item.max_packs ? 'pack-select' : 'variant'}" data-option="${escape(id)}" aria-pressed="false">
          ${widget ? `${packArt(item, id)}<span class="widget-pack-text">${text}</span>` : text}
        </button>`;
        if (!item.max_packs) return choice;
        return `<div class="variant pack-option${widget ? ' widget-pack-option' : ''}" data-pack="${escape(id)}">
          ${choice}
          <div class="pack-controls">
            <button type="button" class="pack-minus" data-pack-step="-1" aria-label="${escape(t('removePack'))}">−</button>
            <span class="pack-count"></span>
            <button type="button" class="pack-plus" data-pack-step="1" aria-label="${escape(t('addPack'))} · ${label}">+</button>
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  function widgetMarkup(order, detailInput, tabs) {
    const { item } = order;
    const stars = item.id === 'telegram_stars';
    const recipientLabel = item.id === 'pubg_mobile' ? 'Player ID' : item.input === 'game_id' ? t('game') : '@username';
    const starsQuantity = Number.isSafeInteger(order.quantity) ? order.quantity : '';
    return `<div class="widget-scroll" data-widget-product="${escape(item.id)}">
      <div class="widget-cover">
        <img src="assets/donat/cover-${widgetCovers[item.id]}.webp" width="960" height="540" alt="${escape(item.title)} · ARSLAN SHOP" decoding="async">
      </div>
      <div class="widget-panel widget-recipient">
        <label for="product-detail">${recipientLabel}</label>
        <div class="widget-field-row">${detailInput}<button id="verify-product-detail" type="button">${t('verify')}</button></div>
        ${item.id === 'mobile_legends' ? `<div class="widget-server-field"><label for="product-server-id">Server ID</label><input id="product-server-id" inputmode="numeric" maxlength="8" placeholder="Masalan, 1234" value="${escape(order.serverId || '')}"></div>` : ''}
        <p id="widget-detail-status" role="status" hidden></p>
      </div>
      ${stars ? `<h3 class="widget-label">${t('customStars')}</h3>
        <div class="widget-panel widget-amount">
          <label for="product-quantity">${t('starsQuantity')}</label>
          <div class="widget-quantity">
            <input id="product-quantity" type="number" inputmode="numeric" min="${item.min}" max="${item.max}" step="1" autocomplete="off" placeholder="0" value="${starsQuantity}">
            <svg class="widget-star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.1 6.3 7 .9-5.1 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5.1-5 7-.9z"/></svg>
          </div>
          ${priceSummary(null, '', t('starsPrice'))}
          <p class="widget-stars-range"><span>${t('from')} <b>${money(item.min)} ⭐</b></span><span>${t('to')} <b>${money(item.max)} ⭐</b></span></p>
        </div>` : `<h3 class="widget-label" id="package-label">${t('chooseProduct')}</h3>
        <div class="widget-tabs" role="group" aria-labelledby="package-label">${tabs.map(([label], index) =>
          `<button type="button" data-widget-tab="${index}" aria-pressed="${index === order.tab}">${t(label)}</button>`).join('')}</div>
        ${tabs.map(([, options], index) => `<div data-widget-group="${index}"${index === order.tab ? '' : ' hidden'}>${packageChoices(item, options, true)}</div>`).join('')}`}
      </div>
      <div class="widget-footer"><button class="action" type="button" id="product-next" disabled>${t('buy')}</button></div>`;
  }

  function productSheet(order) {
    const item = order.item;
    const widget = widgetIds.has(item.id);
    const pubg = item.id === 'pubg_mobile';
    const isQuantity = item.kind === 'quantity';
    const quantityInput = isQuantity && !widget
      ? `<label for="product-quantity">${t(item.unit === 'Stars' ? 'starsQuantity' : 'quantity')} (${money(item.min)}–${money(item.max)})</label>
        <div class="qty">
          <button type="button" data-qty="-${item.step}" aria-label="−${item.step} ${item.unit}">−</button>
          <input id="product-quantity" type="number" min="${item.min}" max="${item.max}" step="1" inputmode="numeric" value="${order.quantity}">
          <button type="button" data-qty="${item.step}" aria-label="+${item.step} ${item.unit}">+</button>
        </div>`
      : '';
    const selectedUnits = () => money(Number(order.option) * order.packs) + ' ' + item.unit;
    const label = t({ game_id: 'game', username: 'username', optional: 'optional' }[item.input]);
    const example = item.input === 'username' ? (item.id === 'roblox' ? 'Username' : '@username') : t('example');
    const detailInput = `<input id="product-detail" maxlength="64" placeholder="${escape(pubg ? 'Player ID' : example)}" value="${escape(item.id==='mobile_legends'&&order.detail.includes('-')?order.detail.split('-')[0]:order.detail)}" autocomplete="off"${widget ? ` autocapitalize="none" spellcheck="false"${pubg ? ' inputmode="numeric"' : ''}` : ''}>`;
    let tabs = [];
    if (pubg) tabs = [
      ['fastUc', item.options.filter(([id]) => quickUc.includes(id))],
      ['bundles', item.options.filter(([id]) => !quickUc.includes(id))]
    ];
    if (item.id === 'telegram_premium') tabs = [
      ['global', item.options.filter(([id]) => premiumGifts.includes(id))],
      ['login', item.options.filter(([id]) => !premiumGifts.includes(id))]
    ];
    if (item.id === 'mobile_legends') tabs = [
      ['global', item.options.filter(([id])=>!id.startsWith('double'))],
      ['bundles', item.options.filter(([id])=>id.startsWith('double'))]
    ];
    if (item.id === 'brawl_stars') tabs = [
      ['gems', item.options.filter(([id]) => !brawlPasses.includes(id))],
      ['brawlPass', item.options.filter(([id]) => brawlPasses.includes(id))]
    ];
    order.tab ??= 0;
    const artwork = genericCovers[item.id] || item.image;
    const genericMarkup = `<div class="widget-scroll enhanced-product" data-widget-product="${escape(item.id)}">
      <div class="widget-cover"><img src="${escape(artwork)}" width="960" height="540" alt="${escape(item.title)} · ARSLAN SHOP" decoding="async"></div>
      <div class="widget-panel widget-recipient">
        <label for="product-detail">${escape(label)}</label>
        <div class="widget-field-row">${detailInput}<button id="verify-product-detail" type="button">${t('verify')}</button></div>
        <p id="widget-detail-status" role="status" hidden></p>
      </div>
      <h3 class="widget-label" id="package-label">${escape(item.kind==='quantity'?t('quantity'):t('chooseProduct'))}</h3>
      ${item.kind==='quantity' ? quantityInput : packageChoices(item,item.options,true)}
      ${priceSummary(widget ? null : total(order),item.max_packs&&!widget?selectedUnits():'')}
      ${item.id === 'gold_rinok' ? `<p class="notice">${t('market')}</p>` : ''}
      </div><div class="widget-footer"><button class="action" type="button" id="product-next" disabled>${t('next')} →</button></div>`;
    openSheet(item.title, widget ? widgetMarkup(order, detailInput, tabs) : genericMarkup, true);

    const quantity = sheetBody.querySelector('#product-quantity');
    const detail = sheetBody.querySelector('#product-detail');
    const serverIdField = sheetBody.querySelector('#product-server-id');
    const price = sheetBody.querySelector('#selected-price');
    const units = sheetBody.querySelector('#selected-units');
    const next = sheetBody.querySelector('#product-next');
    const options = [...sheetBody.querySelectorAll('[data-option]')];
    const tiles = [...sheetBody.querySelectorAll('[data-pack]')];
    const detailStatus = sheetBody.querySelector('#widget-detail-status');
    const update = () => {
      if (quantity) order.quantity = quantity.valueAsNumber;
      order.detail = serverIdField ? `${detail.value.trim()}-${serverIdField.value.trim()}` : detail.value.trim();
      if (serverIdField) order.serverId = serverIdField.value.trim();
      const validSelection = isQuantity ? quantityValid(order) : Boolean(selectedOption(order));
      if (price) price.textContent = validSelection ? amount(total(order)) : '—';
      if (units) units.textContent = selectedUnits();
      next.disabled = !validSelection || !detailValid(order);
      const selected = quantity ? String(order.quantity) : order.option;
      options.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === selected)));
      tiles.forEach(tile => {
        const active = tile.dataset.pack === selected;
        tile.classList.toggle('selected', active);
        tile.querySelector('.pack-count').textContent = active ? order.packs : '';
        tile.querySelector('.pack-minus').disabled = order.packs === 1 || (pubg && !active);
        tile.querySelector('.pack-plus').disabled = active && order.packs === item.max_packs;
        if (pubg) {
          const [id, , packPrice] = item.options.find(([id]) => id === tile.dataset.pack);
          const packs = active ? order.packs : 1;
          tile.querySelector('.widget-pack-text span').textContent = money(Number(id) * packs) + ' ' + item.unit;
          tile.querySelector('.widget-pack-text strong').textContent = amount(packPrice * packs);
        }
      });
    };

    quantity?.addEventListener('input', update);
    serverIdField?.addEventListener('input', () => {if (detailStatus) detailStatus.hidden=true;update();});
    detail.addEventListener('input', () => {
      if (detailStatus) detailStatus.hidden = true;
      update();
    });
    if (widget || genericCovers[item.id]) {
      sheetBody.querySelector('#verify-product-detail').onclick = () => {
        detail.blur();
        const valid = detailValid(order);
        detailStatus.textContent = t(valid ? 'formatValid' : 'formatInvalid');
        detailStatus.dataset.valid = String(valid);
        detailStatus.hidden = false;
      };
      const tabButtons = [...sheetBody.querySelectorAll('[data-widget-tab]')];
      const groups = [...sheetBody.querySelectorAll('[data-widget-group]')];
      tabButtons.forEach((button, index) => {
        button.onclick = () => {
          if (order.tab === index) return;
          order.tab = index;
          order.option = '';
          order.packs = 1;
          tabButtons.forEach((tab, i) => tab.setAttribute('aria-pressed', String(i === index)));
          groups.forEach((group, i) => { group.hidden = i !== index; });
          update();
        };
      });
    }
    options.forEach(button => {
      button.onclick = () => {
        const option = button.dataset.option;
        if (quantity) quantity.value = option;
        else if (order.option !== option) {
          order.option = option;
          order.packs = 1;
        }
        update();
      };
    });
    sheetBody.querySelectorAll('[data-pack-step]').forEach(button => {
      button.onclick = () => {
        const option = button.closest('[data-pack]').dataset.pack;
        const step = Number(button.dataset.packStep);
        if (order.option === option) {
          order.packs = Math.max(1, Math.min(item.max_packs, order.packs + step));
        } else {
          order.option = option;
          order.packs = pubg && step === 1 ? Math.min(item.max_packs, 2) : 1;
        }
        update();
      };
    });
    sheetBody.querySelectorAll('[data-qty]').forEach(button => {
      button.onclick = () => {
        const current = quantity.valueAsNumber || item.min;
        quantity.value = Math.max(item.min, Math.min(item.max, current + Number(button.dataset.qty)));
        update();
      };
    });
    next.onclick = () => { if (!next.disabled) paymentSheet(order); };
    update();
  }

  function paymentSheet(order) {
    const available = method => method !== 'stars' && connected() && paymentReady(method);
    const method=order.paymentMethod && available(order.paymentMethod) ? order.paymentMethod
      : ['uzcard','humo'].find(available) || 'uzcard';
    order.paymentMethod=method;
    const terms='';
    openSheet(t('pay'),`
      <p><strong>${escape(order.item.title)}</strong> · ${escape(packageName(order))}</p>
      ${priceSummary(total(order))}
      <div class="donat-payment-picker">${paymentMethodTiles(method,true,available)}</div>
      ${terms}
      <p class="donat-payment-note">${escape(lang()==='ru'
        ? 'Заказ передаётся после подтверждения оплаты.'
        : 'To‘lov tasdiqlangach buyurtma bajarishga yuboriladi.')}</p>
      <button class="action" type="button" id="submit-donat-payment" disabled>${escape(t('next'))}</button>
      <button class="secondary" type="button" id="back-product">← ${t('back')}</button>`);
    const submit=sheetBody.querySelector('#submit-donat-payment');
    const accept=sheetBody.querySelector('#accept-payment-terms');
    let submitting=false;
    const update=()=>{submit.disabled=submitting||!available(order.paymentMethod)||
      (order.paymentMethod==='stars'&&!accept?.checked);};
    sheetBody.querySelectorAll('[data-payment-choice]').forEach(button=>{
      button.onclick=()=>{
        if(submitting||button.disabled)return;
        order.paymentMethod=button.dataset.paymentChoice;
        paymentSheet(order);
      };
    });
    accept?.addEventListener('change',update);
    sheetBody.querySelector('#back-product').onclick=()=>productSheet(order);
    submit.onclick=async()=>{
      if(submit.disabled||submitting)return;
      const method=order.paymentMethod;
      const payload={...orderPayload(order,method),expectedAmount:total(order)};
      if(method==='uzcard'||method==='humo'){
        // The shared card checkout disables its own button at the start.
        // Never pre-disable it here or requestTransfer will silently abort.
        submitting=true;
        try{await startCardOrder(payload,submit,()=>loadCatalog(true));}
        finally {submitting=false;if(submit.isConnected)update();}
        return;
      }
      submitting=true;update();
      try {
        const response=await api('donat/create',{...payload,acceptTerms:true});
        if(!response.payment || response.payment.method!=='stars' ||
          (response.payment.status==='pending'&&!response.payment.processing&&!response.payment.invoiceLink))
          throw new Error('connection_error');
        onStarsOrder(response.payment,()=>paymentSheet(order));
        await syncState();
      } catch(error){
        if(error.message==='order_quote_changed'){
          closeSheet();await loadCatalog(true);toast(t('quoteChanged'));
        } else toast(t('error'));
      } finally{
        submitting=false;
        if(submit.isConnected)update();
      }
    };
    update();
  }

  function orderPayload(order, paymentMethod = 'stars') {
    const fields = {
      product: order.item.id,
      quantity: order.item.kind === 'quantity' ? order.quantity : undefined,
      option: order.item.kind === 'options' ? order.option : undefined,
      packs: order.item.max_packs ? order.packs : undefined,
      detail: order.detail
    };
    const key = JSON.stringify({...fields,paymentMethod});
    if (!order.requests.has(key)) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      order.requests.set(key, Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''));
    }
    return { ...fields, paymentMethod, lang: lang(), requestId: order.requests.get(key) };
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      toast(t('copied'));
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.readOnly = true;
      field.setAttribute('aria-label', t('copy'));
      sheetBody.append(field);
      field.focus();
      field.select();
      toast(t('copyHint'));
    }
  }

  function partnerPanel(html, heading = t('partner')) {
    openSheet(heading, `<div class="partner-dashboard">${html}</div>`, 'partners');
  }

  function partnerIntro(minimum = 10000) {
    return `<div class="partner-hero">
      <div class="partner-hero-top"><div><strong class="partner-figure">50%</strong>
        <span>${t('shareOfProfit')}</span></div>${glyph('partners')}</div>
      <p>${t('intro')}</p>
      <div class="partner-facts"><span>${t('delay')}</span>
        <span>${t('minimum').replace('{amount}', amount(minimum))}</span></div>
    </div>`;
  }

  function partnerNotice(key) {
    return `<p class="partner-notice" role="status">${t(key)}</p>`;
  }

  function partnerActivity(title, rows, empty = '') {
    const items = rows.map(row => `<li>
      <div><strong>${escape(row.title)}</strong><small class="partner-status" data-status="${escape(row.state)}">${escape(row.status)}</small></div>
      <strong class="partner-entry-amount">${escape(row.amount)}</strong>
    </li>`).join('');
    return `<section class="partner-card"><h3>${t(title)}</h3>
      ${items ? `<ul class="partner-activity">${items}</ul>` : `<p class="partner-muted">${t(empty)}</p>`}</section>`;
  }

  function partnerStats(data) {
    const minimum = Number(data.minWithdraw) || 10000;
    const available = Number(data.available) || 0;
    const withdrawals = data.withdrawals || [];
    const pendingPayout = withdrawals.some(row => row.status === 'pending');
    const commissions = { pending: 'waitingCommission', available: 'availableCommission', reversed: 'reversedCommission' };
    const payouts = { pending: 'waitingCommission', paid: 'payoutPaid', rejected: 'payoutRejected' };
    const history = (data.history || []).map(row => ({
      title: (row.kind === 'donat' ? 'Donat Shop' : 'Boost') + ' #' + row.orderId,
      state: row.status, status: t(commissions[row.status]) || row.status, amount: '+' + amount(row.commission)
    }));
    const payoutHistory = withdrawals.map(row => ({
      title: t('payoutRequest') + ' #' + row.id, state: row.status,
      status: t(payouts[row.status]) || row.status, amount: amount(row.amount)
    }));
    return `
      <div class="partner-hero"><div class="partner-hero-top"><div>
        <span>${t('available')}</span><strong class="partner-figure">${escape(money(available))} <small>UZS</small></strong>
      </div>${glyph('wallet')}</div></div>
      <div class="partner-metrics">
        <div class="partner-card"><span>${t('clients')}</span><strong>${money(data.clients ?? 0)}</strong></div>
        <div class="partner-card"><span>${t('pending')}</span><strong>${amount(data.pending ?? 0)}</strong></div>
      </div>
      ${data.url ? `<section class="partner-card partner-link-card">
        <label for="partner-link">${t('link')}</label>
        <input id="partner-link" type="url" value="${escape(data.url)}" readonly>
        <div class="partner-link-actions">
          <button id="partner-copy" class="action" type="button">${t('copyLink')}</button>
          <button id="partner-share" class="secondary" type="button">${t('shareLink')}</button>
        </div>
      </section>` : ''}
      <details class="partner-card partner-withdrawal">
        <summary><span>${t('withdrawal')}</span><small>${t('minimum').replace('{amount}', amount(minimum))}</small></summary>
        ${pendingPayout ? partnerNotice('payoutPending') : available < minimum ? partnerNotice('insufficient') : `
          <form id="partner-withdraw-form">
            <label for="partner-amount">${t('withdrawalAmount')}</label>
            <input id="partner-amount" type="number" min="${minimum}" max="${available}" step="1"
              inputmode="numeric" placeholder="${minimum}" required>
            <label for="partner-destination">${t('withdrawalDetails')}</label>
            <input id="partner-destination" minlength="5" maxlength="120" inputmode="tel" autocomplete="off" required>
            <button class="action" id="partner-withdraw" type="submit">${t('withdrawAction')}</button>
          </form>`}
      </details>
      ${partnerActivity('commissions', history, 'emptyCommissions')}
      ${payoutHistory.length ? partnerActivity('payouts', payoutHistory) : ''}`;
  }

  function showPartnerDashboard(data) {
    partnerPanel(partnerStats(data), t('partnerCabinet'));
    const copyLink = sheetBody.querySelector('#partner-copy');
    if (copyLink) {
      copyLink.onclick = () => copy(data.url);
      sheetBody.querySelector('#partner-share').onclick = () =>
        openTelegram('https://t.me/share/url?url=' + encodeURIComponent(data.url));
    }
    const form = sheetBody.querySelector('#partner-withdraw-form');
    if (form) form.onsubmit = event => {
      event.preventDefault();
      const amount = form.querySelector('#partner-amount').valueAsNumber;
      const destination = form.querySelector('#partner-destination').value.trim();
      if (destination.length < 5) {
        toast(t('invalid'));
        return;
      }
      partnerRequest(form.querySelector('#partner-withdraw'), 'referral/withdraw', { amount, destination });
    };
  }

  async function openPartners() {
    const openInBot = () => {
      const link = botLink('partner');
      partnerPanel(partnerIntro() + `<button class="action" type="button" id="partner-openbot"${link ? '' : ' disabled'}>${t('openBot')}</button>`);
      sheetBody.querySelector('#partner-openbot').onclick = () => openTelegram(link);
    };
    if (!connected()) {
      openInBot();
      return;
    }

    partnerPanel(partnerIntro() + `<p class="partner-notice" id="partner-loading" role="status">${t('partnerLoading')}</p>`);
    const loading = sheetBody.querySelector('#partner-loading');
    try {
      const data = await api('referral/me');
      if (!loading.isConnected) return;
      const intro = partnerIntro(data.minWithdraw);
      if (data.status === 'approved') {
        showPartnerDashboard(data);
      } else if (['none', 'rejected'].includes(data.status)) {
        partnerPanel(intro + (data.status === 'rejected' ? partnerNotice('rejected') : '') +
          `<button class="action" type="button" id="partner-apply">${t('apply')}</button>`);
        const apply = sheetBody.querySelector('#partner-apply');
        apply.onclick = () => partnerRequest(apply, 'referral/apply', {});
      } else {
        partnerPanel(intro + partnerNotice(data.status === 'pending' ? 'waiting' : 'disabled'));
      }
    } catch (error) {
      if (!loading.isConnected) return;
      if (error.message === 'endpoint_missing') openInBot();
      else {
        partnerPanel(partnerIntro() + partnerNotice('error') +
          `<button class="secondary" type="button" id="partner-retry">${t('retry')}</button>`);
        sheetBody.querySelector('#partner-retry').onclick = openPartners;
      }
    }
  }

  async function partnerRequest(button, path, fields) {
    button.disabled = true;
    try {
      await api(path, fields);
      if (button.isConnected) {
        if (path === 'referral/withdraw') toast(t('withdrawalSent'));
        await openPartners();
      }
    } catch (error) {
      if (button.isConnected) {
        toast(t(error.message === 'insufficient_referral_balance' ? 'insufficient' : 'error'));
        button.disabled = false;
      }
    }
  }

  shopPage.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.category) {
      state.category = button.dataset.category;
      render();
      if (!button.isConnected) filters.find(filter => filter.dataset.category === state.category)?.focus();
    }
    if (button.dataset.product) {
      const item = state.items.find(product => product.id === button.dataset.product);
      if (item) productSheet({
        item, quantity: widgetIds.has(item.id) ? undefined : item.min,
        option: widgetIds.has(item.id) ? '' : item.options[0][0], packs: 1,
        detail: '', requests: new Map()
      });
    }
    if (button.id === 'retry-shop') loadCatalog();
  });
  search.addEventListener('input', () => {
    clear.hidden = !search.value;
    render();
  });
  clear.onclick = () => {
    search.value = '';
    clear.hidden = true;
    search.focus();
    render();
  };
  loadCatalog();

  return {
    applyLanguage,
    openPartners,
    optionLabel,
    productTitle: id => state.items.find(product => product.id === id)?.title || id
  };
};
