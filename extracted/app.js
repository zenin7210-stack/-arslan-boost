'use strict';
(() => {
  const tg = window.Telegram?.WebApp;
  document.documentElement.classList.toggle('telegram-webapp', Boolean(tg?.initData));
  try { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#06101e'); tg?.setBackgroundColor?.('#06101e'); } catch {}
  const $ = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const storage = {get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k,v) { try { localStorage.setItem(k,v); } catch {} }};
  const config = {...window.ARSLAN_CONFIG};
  const ranks = ['Calibration','Bronze','Silver','Gold','Phoenix','Ranger','Champion','Master','Elite','The Legend'];
  let prices = [...(config.prices || [0,3000,4000,6000,9000,13000,18000,25000,35000,50000])];
  let calibrationLegendPrice = config.calibrationLegendPrice ?? 90000;
  let boostModeSurcharge = config.boostModeSurcharge ?? 1000;
  let minBoostPrice = config.minBoostPrice ?? 12000;
  let boostEta = [];
  const rankCenters = [null,[214,174],[380,174],[546,174],[723,174],[723,317],[723,460],[905,174],[905,317],[1095,174]];
  const dictionaries = {
    ru: {
      miniApp:'мини-приложение',balance:'Баланс',promo:'Промокод',support:'Поддержка',chooseMode:'Выберите режим',
      currentRank:'Текущий ранг',targetRank:'Желаемый ранг',gameId:'Игровой ID или ник',orderPrice:'Стоимость заказа',order:'Заказать',
      history:'История',orders:'Заказы',payments:'Платежи',all:'Все',completed:'Оплачено',pending:'Ожидают',cancelled:'Отклонено',
      emptyHistory:'Пока нет операций',appUser:'Пользователь Mini App',balanceCaption:'БАЛАНС',cashback:'КЕШБЭК',settings:'Настройки',language:'ЯЗЫК',settingsCaption:'НАСТРОЙКИ',
      profile:'Данные профиля',profileDesc:'Ваш профиль и личные данные',orderHistory:'История заказов',historyDesc:'Все заказы и их статусы',
      promoCodes:'Промокоды',promoDesc:'Промокоды и бонусы',supportDesc:'Помощь с заказами и оплатой',animations:'Анимации',motionDesc:'Уменьшить анимации приложения',
      security:'Безопасность',securityDesc:'Не отправляйте пароль от аккаунта боту',about:'О приложении',aboutDesc:'Arslan Boost · повышение ранга Standoff 2',home:'Главная',skip:'Пропустить',
      priceNote:'Способ оплаты выбирается при заказе.',boostMinimum:'Минимальный заказ — {price}',
      selectedMode:'Выбранный режим',wing:'Напарники',comp:'Сорев',duel:'Дуэль',calibration:'Калибровка',currency:'сум',steps:'ступеней',idPlaceholder:'Например: 12345678 или Player',
      invalidId:'Введите игровой ID или ник',choosePayment:'Способ оплаты',topup:'Пополнить баланс',topupAmount:'Сумма пополнения, сум',amountPlaceholder:'Например: 30000',
      invalidAmount:'Введите сумму пополнения от 1 до 100 000 000 сум',method_humo:'HUMO',method_uzcard:'UZCARD',method_terminal:'Банкомат / терминал',method_stars:'Telegram Stars',method_balance:'С баланса',
      manualHint:'Заявка администратору с расчётом суммы',starsHint:'Счёт в Telegram Stars',balanceHint:'Доступно: {amount}',notEnough:'На балансе недостаточно средств',
      admin:'Перейти к администратору',copy:'Скопировать сообщение',copied:'Сообщение скопировано',copyHint:'Выделите и скопируйте сообщение ниже',back:'К способам оплаты',close:'Закрыть',keyboardDone:'Готово',
      payment:'Оплата',total:'Итого',calculation:'Расчёт',paymentMethod:'Способ оплаты',topupRequest:'Заявка на пополнение баланса',orderRequest:'Заявка на буст Standoff 2',
      adminMissing:'Администратор пока не подключён. Сообщение с расчётом можно скопировать.',botMissing:'Бот для оплаты Stars пока не подключён.',
      starsNotConfigured:'Стоимость в Stars ещё не задана владельцем.',openBot:'Открыть счёт в боте',payStars:'Оплатить {stars} ⭐',confirming:'Проверяем подтверждение платежа…',paid:'Оплата подтверждена',
      invoiceClosed:'Оплата не завершена',pendingStatus:'Ожидает оплаты',paidStatus:'Оплачено',rejectedStatus:'Отклонено',unknownStatus:'На проверке',orderNumber:'Заказ',paymentNumber:'Платёж',
      processing:'Подождите…',submitted:'Заявка сохранена',connectionError:'Не удалось связаться с ботом. Попробуйте ещё раз.',sessionExpired:'Откройте Mini App заново через Telegram',
      profileText:'Профиль загружается из Telegram.',securityText:'Не вводите пароль от игры и SMS-коды в Mini App. Детали буста согласуйте с администратором.',
      aboutText:'Arslan Boost — буст Standoff 2 и магазин игровой валюты.',promoText:'Введите промокод, чтобы уточнить условия у администратора.',promoPlaceholder:'Промокод',promoAction:'Уточнить промокод',
      supportText:'Вопросы по заказу, балансу и оплате можно отправить администратору.',noAutoCredit:'Пополнение появится на балансе после подтверждения оплаты.',
      orderSent:'Оплаченный заказ передан администратору.',paymentConfirmedText:'Оплата подтверждена сервером.',selectRank:'Выберите ранг',userId:'Telegram ID',receiptText:'Хочу оформить заказ. Подскажите реквизиты и условия оплаты.',
      topupText:'Хочу пополнить баланс. Подскажите реквизиты и условия оплаты.',requestId:'Заявка',draftHint:'Текст откроется в чате администратора. Отправьте его, чтобы оформить заявку.'
    },
    uz: {
      miniApp:'mini-ilova',balance:'Balans',promo:'Promo kod',support:'Texnik yordam',chooseMode:'Rejimni tanlang',currentRank:'Hozirgi rankingiz',targetRank:'Maqsad rank',gameId:'O‘yin ID yoki nick',
      orderPrice:'Buyurtma narxi',order:'Buyurtma berish',history:'Tarix',orders:'Buyurtmalar',payments:'To‘lovlar',all:'Barchasi',completed:'To‘langan',pending:'Kutilmoqda',cancelled:'Rad etilgan',
      emptyHistory:'Hozircha operatsiyalar yo‘q',appUser:'Mini App foydalanuvchisi',balanceCaption:'BALANS',cashback:'KESHBEK',settings:'Sozlamalar',language:'TIL',settingsCaption:'SOZLAMALAR',
      profile:'Profil ma’lumotlari',profileDesc:'Profilingiz va shaxsiy ma’lumotlar',orderHistory:'Buyurtmalar tarixi',historyDesc:'Barcha buyurtmalar va ularning holati',promoCodes:'Promo kodlar',
      promoDesc:'Promo kodlar va bonuslar',supportDesc:'Buyurtma va to‘lov bo‘yicha yordam',animations:'Animatsiyalar',motionDesc:'Ilova animatsiyalarini kamaytirish',security:'Xavfsizlik',
      securityDesc:'Akkaunt parolini botga yubormang',about:'Ilova haqida',aboutDesc:'Arslan Boost · Standoff 2 rank boost',home:'Bosh sahifa',skip:'O‘tkazish',
      priceNote:'To‘lov usulini buyurtma paytida tanlang.',boostMinimum:'Eng kam buyurtma — {price}',
      selectedMode:'Tanlangan rejim',wing:'Naparnik',comp:'Сорев',duel:'Duel',calibration:'Kalibrovka',currency:'so‘m',steps:'ta bosqich',idPlaceholder:'Masalan: 12345678 yoki Player',
      invalidId:'O‘yin ID yoki nickni kiriting',choosePayment:'To‘lov usuli',topup:'Balansni to‘ldirish',topupAmount:'To‘ldirish summasi, so‘m',amountPlaceholder:'Masalan: 30000',
      invalidAmount:'1 dan 100 000 000 so‘mgacha summa kiriting',method_humo:'HUMO',method_uzcard:'UZCARD',method_terminal:'Bankomat / terminal',method_stars:'Telegram Stars',method_balance:'Balansdan',
      manualHint:'Administratorga summa hisobi bilan murojaat',starsHint:'Telegram Stars orqali hisob',balanceHint:'Mavjud: {amount}',notEnough:'Balansda mablag‘ yetarli emas',
      admin:'Administratorga o‘tish',copy:'Xabarni nusxalash',copied:'Xabar nusxalandi',copyHint:'Quyidagi xabarni belgilang va nusxalang',back:'To‘lov usullariga',close:'Yopish',keyboardDone:'Tayyor',
      payment:'To‘lov',total:'Jami',calculation:'Hisob',paymentMethod:'To‘lov usuli',topupRequest:'Balansni to‘ldirish uchun ariza',orderRequest:'Standoff 2 boost buyurtmasi',
      adminMissing:'Administrator hali ulanmagan. Hisoblangan xabarni nusxalashingiz mumkin.',botMissing:'Stars uchun to‘lov boti hali ulanmagan.',starsNotConfigured:'Stars narxi hali belgilanmagan.',
      openBot:'Hisobni botda ochish',payStars:'{stars} ⭐ to‘lash',confirming:'To‘lov tasdig‘i tekshirilmoqda…',paid:'To‘lov tasdiqlandi',invoiceClosed:'To‘lov yakunlanmadi',
      pendingStatus:'To‘lov kutilmoqda',paidStatus:'To‘langan',rejectedStatus:'Rad etilgan',unknownStatus:'Tekshirilmoqda',orderNumber:'Buyurtma',paymentNumber:'To‘lov',processing:'Kuting…',submitted:'Ariza saqlandi',
      connectionError:'Botga ulanish amalga oshmadi. Qayta urinib ko‘ring.',sessionExpired:'Mini App’ni Telegram orqali qayta oching',profileText:'Profil Telegram orqali yuklanadi.',
      securityText:'O‘yin paroli va SMS-kodlarni Mini App’ga kiritmang. Boost tafsilotlarini administrator bilan kelishing.',aboutText:'Arslan Boost — Standoff 2 rank oshirish va o‘yin valyutalari do‘koni.',
      promoText:'Shartlarni administratordan bilish uchun promo kodni kiriting.',promoPlaceholder:'Promo kod',promoAction:'Promo kodni tekshirish',supportText:'Buyurtma, balans va to‘lov bo‘yicha administratorga yozing.',
      noAutoCredit:'Mablag‘ to‘lov tasdiqlanganidan keyin balansda ko‘rinadi.',orderSent:'To‘langan buyurtma administratorga yuborildi.',paymentConfirmedText:'To‘lov server orqali tasdiqlandi.',
      selectRank:'Rankni tanlang',userId:'Telegram ID',receiptText:'Buyurtma bermoqchiman. Rekvizit va to‘lov shartlarini yuboring.',topupText:'Balansni to‘ldirmoqchiman. Rekvizit va to‘lov shartlarini yuboring.',requestId:'Ariza',
      draftHint:'Xabar administrator chatida ochiladi. Arizani rasmiylashtirish uchun uni yuboring.'
    }
  };
  Object.assign(dictionaries.ru,{pay_uzcard:'✅ Оплачу на UZCARD',pay_humo:'✅ Оплачу на HUMO',pay_terminal:'✅ Оплачу через терминал',pay_stars:'✅ Оплачу в Telegram Stars',cardNumber:'Номер карты',cardHolder:'Получатель',copyCard:'Нажмите, чтобы скопировать номер'});
  Object.assign(dictionaries.uz,{pay_uzcard:'✅ UZCARD orqali to‘layman',pay_humo:'✅ HUMO orqali to‘layman',pay_terminal:'✅ Terminal orqali to‘layman',pay_stars:'✅ Telegram Stars orqali to‘layman',cardNumber:'Karta raqami',cardHolder:'Karta egasi',copyCard:'Nusxalash uchun karta raqamiga bosing'});

  Object.assign(dictionaries.uz,{wing:'Naparnik',comp:'Сорев',manualHint:'Kartaga o‘tkazma',method_terminal:'Bankomat',introSubtitle:'Rank oshirish xizmati',walletTitle:'Hamyonni to‘ldirish',yourBalance:'Balansingiz',continue:'Davom etish',help:'Yordam',helpDesc:'Operator bilan bog‘lanish',commission:'Komissiya 3%',topup:'Hamyonni to‘ldirish',requestSent:'Xabar yuborilgach, administrator tasdig‘ini kuting.',manualNotice:'To‘lovni administrator tasdiqlaydi.'});
  Object.assign(dictionaries.ru,{wing:'Напарник',comp:'Сорев',manualHint:'Перевод на карту',method_terminal:'Банкомат',introSubtitle:'Повышение ранга',walletTitle:'Пополнение кошелька',yourBalance:'Ваш баланс',continue:'Продолжить',help:'Помощь',helpDesc:'Связаться с оператором',commission:'Комиссия 3%',requestSent:'После отправки сообщения ожидайте подтверждения администратора.',manualNotice:'Оплату подтверждает администратор.'});
  const glyph = name => `<img class="ui-icon" src="assets/icons/${name}.svg" alt="" aria-hidden="true" width="32" height="32">`;
  all('[data-ui-icon]').forEach(node=>node.innerHTML=glyph(node.dataset.uiIcon));

  Object.assign(dictionaries.ru, {
    mainServices: 'Разделы', navigation: 'Главное меню', goBack: 'Назад', menu: 'Меню',
    terms: 'Принимаю условия', paymentConflict: 'Для заказа уже есть платёж. Откройте его в истории.',
    payStars: 'Оплатить в Stars', invoiceReady: 'Счёт готов', termsRequired: 'Прими условия оплаты',
    starsPayHint: 'Оплати счёт в окне Telegram.', starsCheckingHint: 'Ждём подтверждения от Telegram.',
    orderPaid: 'Заказ оплачен', paidOrderHint: 'За выполнением заказа можно следить в истории.',
    toOrders: 'К заказам', toBalance: 'К балансу',
    boostEta: 'Примерный срок после оплаты — {hours} ч', inProgress: 'В работе',
    repeatBoost: 'Повторить заказ', orderDetails: 'Детали заказа',
    reviewedStatus: 'На проверке', fulfilledStatus: 'Выполнено', parties: 'Партнёрская программа',
    unavailableHistory: 'История заказов доступна при подключении сервера бота.',
    payBalance: 'Оплатить с баланса', starsQuantity: 'Количество Stars', topupCredit: 'Зачислится на баланс',
    rateChanged: 'Курс обновился. Проверьте сумму.',
    orderQuoteChanged: 'Цена обновилась. Откройте заказ заново.',
    checkPayment: 'Проверить оплату', balanceCredited: 'Баланс пополнен', legacyBalance: 'Другие средства: {amount} · поддержка'
  });
  Object.assign(dictionaries.uz, {
    mainServices: 'Xizmatlar', navigation: 'Asosiy menyu', goBack: 'Orqaga', menu: 'Menyu',
    terms: 'Shartlarga roziman', paymentConflict: 'Buyurtma uchun to‘lov mavjud. Uni tarixdan oching.',
    payStars: 'Stars orqali to‘lash', invoiceReady: 'Hisob tayyor', termsRequired: 'To‘lov shartlarini qabul qiling',
    starsPayHint: 'Hisobni Telegram oynasida to‘lang.', starsCheckingHint: 'Telegram tasdig‘ini kutyapmiz.',
    orderPaid: 'Buyurtma to‘landi', paidOrderHint: 'Buyurtma holatini tarixdan kuzatishingiz mumkin.',
    toOrders: 'Buyurtmalarga', toBalance: 'Balansga',
    boostEta: 'To‘lovdan keyin taxminan {hours} soat', inProgress: 'Bajarilmoqda',
    repeatBoost: 'Qayta buyurtma berish', orderDetails: 'Buyurtma tafsilotlari',
    reviewedStatus: 'Tekshirilmoqda', fulfilledStatus: 'Bajarildi', parties: 'Hamkorlik dasturi',
    unavailableHistory: 'Buyurtmalar tarixi bot serveri ulanganda ko‘rinadi.',
    payBalance: 'Balansdan to‘lash', starsQuantity: 'Stars soni', topupCredit: 'Hisobga tushadi',
    rateChanged: 'Kurs yangilandi. Summani tekshiring.',
    orderQuoteChanged: 'Narx yangilandi. Buyurtmani qayta oching.',
    checkPayment: 'To‘lovni tekshirish', balanceCredited: 'Balans to‘ldirildi', legacyBalance: 'Boshqa mablag‘: {amount} · yordam'
  });
  Object.assign(dictionaries.ru, {
    selectService:'Выберите услугу', selectServiceHint:'Выберите раздел, чтобы продолжить',
    serviceBoost:'Повышение ранга', serviceDonat:'Купить донат', serviceDonatHint:'Игровая валюта и услуги',
    transferPay:'Перевод на карту',
    transferOpen:'Открыть платёж', transferInProgress:'Сначала завершите текущий перевод.',
    transferBusy:'Сейчас эту сумму нельзя зарезервировать. Повторите позже.',
    transferUnavailable:'Перевод на карту сейчас недоступен.',
    transferTimed:'10 минут на перевод', transferDisabled:'Недоступно',
    transferSetup:'Проверь подключение командой /p2p_status в боте.'
  });
  Object.assign(dictionaries.uz, {
    selectService:'Xizmatni tanlang', selectServiceHint:'Davom etish uchun bo‘limni tanlang',
    serviceBoost:'Rank ko‘tarish', serviceDonat:'Donat sotib olish', serviceDonatHint:'O‘yin valyutalari va xizmatlar',
    transferPay:'Kartaga o‘tkazma',
    transferOpen:'To‘lovni ochish', transferInProgress:'Avval joriy o‘tkazmani yakunlang.',
    transferBusy:'Bu summani hozir band qilib bo‘lmaydi. Keyinroq urinib ko‘ring.',
    transferUnavailable:'Hozir kartaga o‘tkazma mavjud emas.',
    transferTimed:'O‘tkazma uchun 10 daqiqa', transferDisabled:'Mavjud emas',
    transferSetup:'Ulanishni botdagi /p2p_status buyrug‘i orqali tekshiring.'
  });
  Object.assign(dictionaries.uz, {
    paymentSelect:'To‘lov usulini tanlang', cardExact:'Aniq summani tanlang', cardCustom:'Boshqa summa (so‘m)',
    starsInputHint:'Stars soni', methodBalance:'Balans', cardCheck:'Kartaga o‘tkazma',
    cardNotReady:'Hozir kartaga o‘tkazma vaqtincha mavjud emas.', boostPaidNotice:'Buyurtma to‘lov tasdig‘idan keyin adminga yuboriladi.'
  });
  Object.assign(dictionaries.ru, {
    paymentSelect:'Выберите способ оплаты', cardExact:'Выберите точную сумму', cardCustom:'Другая сумма (сум)',
    starsInputHint:'Количество Stars', methodBalance:'Баланс', cardCheck:'Перевод на карту',
    cardNotReady:'Перевод на карту временно недоступен.', boostPaidNotice:'Заказ будет передан администратору после подтверждения платежа.'
  });
  const paymentMethodTiles = (selected, forOrder = false) => `<div class="arslan-payment-grid" role="group" aria-label="${escape(t('paymentSelect'))}">
    ${['uzcard','humo','stars'].map(method => {
      const last=method==='balance'||method==='stars';
      const icon=last ? `<span class="arslan-payment-symbol ${method}">${method==='stars'?'★':'◈'}</span>`
        : `<img src="assets/${method}.svg" alt="" width="36" height="36">`;
      return `<button class="arslan-payment-tile${selected===method?' selected':''}" type="button" data-payment-choice="${method}" aria-pressed="${String(selected===method)}">
         ${icon}<strong>${last ? method==='stars'?'Telegram Stars':escape(t('methodBalance')) : method.toUpperCase()}</strong>
         <small>${method==='stars'?'Stars':method==='balance'?escape(t('balance')):escape(t('cardCheck'))}</small></button>`;
    }).join('')}</div>`;
  const cardMethods = ['uzcard', 'humo'];
  const launchSection = new URLSearchParams(location.search).get('section');
  let mainPage = launchSection === 'services' ? 'services' : 'donat';
  const state = {
    lang: storage.get('ab-lang') === 'ru' ? 'ru' : 'uz',
    mode: 'wing', balance: 0, legacyBalance: 0, orders: [], donatOrders: [], payments: [],
    historyTab: 'orders', filter: 'all', historyLoaded: false,
    sheet: null, context: null, service: false, p2pMethods: [],
    p2pVisible: false, p2pAdmin: false, busy: false
  };
  const t = (key, values={}) => Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',v),dictionaries[state.lang][key] ?? key);
  const money = n => new Intl.NumberFormat('ru-RU').format(n).replace(/\u00a0/g,' ');
  const sum = n => money(n)+' '+t('currency');
  function etaText(eta) {
    const [low, high] = Array.isArray(eta) ? eta : [];
    if (!Number.isSafeInteger(low) || low < 1 || !Number.isSafeInteger(high) || high < low) return '';
    return t('boostEta', {hours: low === high ? String(low) : low + '–' + high});
  }
  const escape = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rankName = index => +index === 0 ? t('calibration') : state.lang==='uz'?(['Kalibrovka','Bronza','Silver','Gold','Phoenix','Ranger','Champion','Master','Elite','The Legend'][+index]):ranks[+index];
  const from=$('#from-rank'), to=$('#to-rank'), gameId=$('#game-id'), orderBtn=$('#order-btn');
  ranks.forEach((r,i)=>{if(i<ranks.length-1)from.add(new Option(r,i));if(i>0)to.add(new Option(r,i));});
  from.value='0';to.value='3';
  const overlay=$('#overlay'),title=$('#sheet-title'),body=$('#sheet-body');
  const p2p = window.ArsLanP2P({
    body, lang: () => state.lang, money, escape, api, toast, dismissKeyboard,
    requestKey: () => crypto.randomUUID(),
    show: (html, heading) => showSheet('p2p', html, heading),
    active: () => state.sheet === 'p2p',
    sync: syncState, orders: showOrderHistory,
    back: () => renderTopup()
  });
  const keyboardDone = $('#keyboard-done');
  const keyboardFields = 'input:is(:not([type]), [type=text], [type=search], [type=number], [type=tel], [type=email], [type=url]), textarea';
  let returnFocus=null,toastTimer;
  function activeTextField() {
    const field = document.activeElement;
    return field?.matches(keyboardFields) && !field.readOnly && !field.disabled ? field : null;
  }
  function updateKeyboardControls() {
    const field = activeTextField();
    const viewport = window.visualViewport;
    const inset = viewport ? Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height) : 0;
    const inline = field?.closest('[data-keyboard-inline]');
    const container = inline || field?.closest('.sheet') || document.body;
    keyboardDone.hidden = !field;
    keyboardDone.classList.toggle('in-field', Boolean(inline));
    if (keyboardDone.parentElement !== container) container.append(keyboardDone);
    keyboardDone.style.setProperty('--keyboard-inset', inset + 'px');
    overlay.style.setProperty('--product-keyboard-inset', inset + 'px');
    document.body.classList.toggle('keyboard-open', Boolean(field) || inset > 140);
  }
  function dismissKeyboard() {
    const field = activeTextField();
    if (!field) return false;
    field.blur();
    updateKeyboardControls();
    return true;
  }
  function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
  function icon(index){if(+index===0)return '<span class="rank-icon rank-icon-calibration" aria-hidden="true"></span>';const center=rankCenters[+index];return center?`<span class="rank-icon" aria-hidden="true" style="background-position:${19-center[0]*.24}px ${19-center[1]*.24}px"></span>`:'<span aria-hidden="true">♢</span>';}
  function boostQuote(start, end, mode) {
    const steps = start === 0 && end === ranks.length - 1 && calibrationLegendPrice
      ? [calibrationLegendPrice] : prices.slice(start + 1, end + 1);
    const minimumApplied = steps.reduce((total, price) => total + price, 0) < minBoostPrice;
    const terms = minimumApplied ? [minBoostPrice] : steps;
    if (mode !== 'wing' && boostModeSurcharge) terms.push(boostModeSurcharge);
    return {terms, minimumApplied, amount: terms.reduce((total, price) => total + price, 0)};
  }
  function calculation(order) {
    const {terms, minimumApplied} = boostQuote(order.fromIndex, order.toIndex, order.mode);
    if (minimumApplied) {
      const minimum = t('boostMinimum', {price: sum(minBoostPrice)});
      return terms.length === 1 ? minimum : minimum + ' · +' + sum(terms[1]);
    }
    return terms.length === 1
      ? rankName(order.fromIndex) + ' → ' + rankName(order.toIndex)
      : terms.map(money).join(' + ') + ' = ' + sum(order.amount);
  }
  function currentOrder() {
    const fromIndex = Number(from.value), toIndex = Number(to.value);
    return {type:'boost_order', mode:state.mode, fromIndex, toIndex, gameId:gameId.value.trim(), lang:state.lang,
      amount:from.value === '' || to.value === '' ? 0 : boostQuote(fromIndex, toIndex, state.mode).amount};
  }
  function validId(){const value=gameId.value.trim();return [...value].length>0&&[...value].length<=32&&!/[\p{C}\p{Zl}\p{Zp}<>]/u.test(value);}
  function updatePrice(){
    const a=+from.value;
    [...to.options].forEach(option=>option.disabled=+option.value<=a);
    if(to.value!==''&&+to.value<=a)to.value=String(a+1);
    const order=currentOrder();
    $('#amount').textContent=order.amount ? sum(order.amount) : '—';$('#formula').textContent=order.amount ? calculation(order) : '';const count=order.amount ? order.toIndex-order.fromIndex : 0;const ending=state.lang==='uz'?'ta bosqich':count%100>=11&&count%100<=14?'ступеней':count%10===1?'ступень':count%10>=2&&count%10<=4?'ступени':'ступеней';$('#steps').textContent=count+' '+ending;
    [from, to].forEach(select => {
      select.closest('.field').querySelector('.rank-mark').innerHTML = select.value === '' ? '' : icon(select.value);
      const trigger = $('#' + select.id + '-trigger');
      const name = select.value === '' ? t('selectRank') : rankName(select.value);
      trigger.textContent = name;
      trigger.setAttribute('aria-label', t(select === from ? 'currentRank' : 'targetRank') + ', ' + name);
      [...select.options].forEach(option => { option.textContent = rankName(option.value); });
    });
    const minimum = $('#boost-minimum');
    const minimumApplied = order.amount > 0 && boostQuote(order.fromIndex, order.toIndex, order.mode).minimumApplied;
    minimum.hidden = minBoostPrice === 0 || minimumApplied;
    minimum.textContent = t('boostMinimum', {price: sum(minBoostPrice)});
    const estimate = $('#boost-eta');
    estimate.textContent = etaText(boostEta);
    estimate.hidden = !estimate.textContent;
    orderBtn.disabled=!validId()||order.amount<=0;orderBtn.setAttribute('aria-disabled',String(orderBtn.disabled));
  }
  function nav(page, switchService = false) {
    if (switchService) mainPage = page;
    const current = page === 'home' && !switchService ? mainPage : page;
    const isMain = current === 'home' || current === 'donat';
    closeSheet();
    all('.page').forEach(section => section.classList.toggle('active', section.id === current));
    all('[data-service]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.service === mainPage));
    });
    $('#service-switch').hidden = !isMain;
    $('.tg-icon.left').hidden = current === 'services';
    $('#bottom-nav').hidden = current === 'services';
    all('[data-page]').forEach(button => {
      const active = button.dataset.page === (isMain ? 'home' : current);
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    if (page === 'history' || page === 'settings') syncState();
  }
  function showSheet(name,html,heading){
    p2p.stop();
    if(!overlay.classList.contains('open'))returnFocus=activeTextField()?null:document.activeElement;
    dismissKeyboard();
    state.sheet=name;
    const topup=['topup','topup-status'].includes(name),wallet=topup||name==='checkout'||name==='p2p',sheet=$('.sheet');
    sheet.classList.toggle('p2p-sheet', name === 'p2p');
    const product = name === 'donat-product', partners = name === 'partners', close = $('#close-sheet');
    sheet.classList.toggle('donat-sheet', name === 'donat' || product);
    sheet.classList.toggle('product-sheet', product);
    sheet.classList.toggle('partner-sheet', partners);
    close.textContent = product ? '‹ ' + t('goBack') : '×';
    close.setAttribute('aria-label', t(product ? 'goBack' : 'close'));
    sheet.classList.toggle('payment-sheet',wallet);title.innerHTML=wallet?glyph('wallet')+'<span>'+escape(heading)+'</span>':escape(heading);
    if (partners) title.innerHTML = glyph('partners') + '<span>' + escape(heading) + '</span>';
    if(topup)title.innerHTML=`<img class="wallet-brand" src="assets/intro-emblem.webp" width="36" height="36" alt="ARSLAN BOOST"><span>${escape(heading)}</span>`;
    $('#wallet-history')?.remove();
    if(wallet){const button=document.createElement('button');button.type='button';button.id='wallet-history';button.className='wallet-history';button.setAttribute('aria-label',t('history'));button.innerHTML=glyph('book');button.onclick=()=>{state.historyTab='payments';all('[data-history]').forEach(b=>b.classList.toggle('active',b.dataset.history==='payments'));nav('history');renderHistory();};$('#close-sheet').before(button);}
    body.innerHTML=html;
    body.querySelectorAll(keyboardFields).forEach(field => {
      if (field.tagName === 'INPUT' && !field.readOnly) field.setAttribute('enterkeyhint', 'done');
    });
    overlay.classList.add('open');sheet.focus({preventScroll:true});
    if (partners) sheet.scrollTop = 0;
  }
  function closeSheet() {
    if (!overlay.classList.contains('open')) return;
    p2p.stop();
    dismissKeyboard();
    overlay.classList.remove('open');
    state.sheet = null;
    body.replaceChildren();
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }
  function openRanks(which){const select=which==='from'?from:to;const choices=ranks.map((_,i)=>i).filter(i=>which==='from'?i<ranks.length-1:i>+from.value);showSheet('rank:'+which,`<div class="rank-options" role="listbox" aria-label="${escape(t('selectRank'))}">${choices.map(i=>`<button class="rank-option" role="option" aria-selected="${+select.value===i}" data-rank="${i}">${icon(i)}<span>${escape(rankName(i))}</span></button>`).join('')}</div>`,t(which==='from'?'currentRank':'targetRank'));all('[data-rank]').forEach(button=>button.onclick=()=>{select.value=button.dataset.rank;updatePrice();closeSheet();});}
  function statusName(status) {
    const labels = {
      paid: 'paidStatus', approved: 'paidStatus', rejected: 'rejectedStatus',
      pending: 'pendingStatus', review: 'reviewedStatus', in_progress: 'inProgress', fulfilled: 'fulfilledStatus', refunded:'rejectedStatus'
    };
    return t(labels[status] || 'unknownStatus');
  }

  function renderHistory() {
    const isOrder = state.historyTab === 'orders';
    $('#filters').style.display = isOrder ? 'flex' : 'none';
    const orders = [
      ...state.orders.map(item => ({ ...item, kind: 'boost' })),
      ...state.donatOrders.map(item => ({ ...item, kind: 'donat' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const statuses = {
      completed: ['paid', 'approved', 'fulfilled'], cancelled: ['rejected', 'refunded'], pending: ['pending', 'review', 'in_progress']
    };
    const entries = isOrder
      ? orders.filter(item => {
          if (state.filter === 'all') return true;
          if (item.kind === 'boost' && item.status === 'paid') return state.filter === 'pending';
          return statuses[state.filter].includes(item.status);
        })
      : state.payments;
    $('#history-content').innerHTML = entries.length ? entries.map(item => {
      const service = item.kind === 'donat' ? 'Donat Shop' : 'Boost';
      const method = t('method_' + item.method);
      const description = !isOrder ? method : item.kind === 'donat'
        ? shop.productTitle(item.product) + ' · ' + shop.optionLabel(item.option_label)
        : rankName(item.current_rank) + ' → ' + rankName(item.target_rank);
      const date = new Date(item.created_at).toLocaleString(state.lang === 'ru' ? 'ru-RU' : 'uz-UZ');
      return `<button type="button" class="txn order-row" data-history-kind="${isOrder ? item.kind : 'payment'}" data-history-id="${escape(item.id)}">
        <div class="txn-icon">${glyph(isOrder ? 'receipt' : 'wallet')}</div>
        <div>${escape(isOrder ? service : t('paymentNumber'))} #${escape(item.id)}
          <small>${escape(description)}</small><small>${escape(statusName(item.status))} · ${escape(date)}</small>
        </div><strong>${escape(sum(item.amount))}</strong>
      </button>`;
    }).join('') : `<div class="empty">${escape(t(state.historyLoaded ? 'emptyHistory' : 'unavailableHistory'))}</div>`;
  }
  function openHistoryEntry(kind, id) {
    const entries = kind === 'boost' ? state.orders : kind === 'donat' ? state.donatOrders : state.payments;
    const item = entries.find(order => String(order.id) === id);
    if (!item) return;
    const description = kind === 'boost' ? rankName(item.current_rank) + ' → ' + rankName(item.target_rank)
      : kind === 'donat' ? shop.productTitle(item.product) + ' · ' + shop.optionLabel(item.option_label)
      : t('method_' + item.method);
    const eta = kind === 'boost' ? etaText([item.eta_min_hours, item.eta_max_hours]) : '';
    const transfer = state.p2pPrivate && state.payments.find(payment =>
      payment.invoice_id && cardMethods.includes(payment.method) && payment.status === 'pending'
      && (kind === 'payment' ? payment.id === item.id : kind === 'boost' ? payment.order_id === item.id : payment.donat_order_id === item.id));
    const stars = kind === 'payment' && typeof tg?.openInvoice === 'function' &&
      item.kind === 'topup' && item.method === 'stars' && item.status === 'pending';
    showSheet('history-entry', `<div class="checkout-summary">
      <div><strong>${escape(description)}</strong></div>
      ${kind === 'boost' && item.game_id ? '<div>ID: ' + escape(item.game_id) + '</div>' : ''}
      <div>${escape(statusName(item.status))} · ${escape(sum(item.amount))}</div>
      ${eta ? '<div>' + escape(eta) + '</div>' : ''}
      </div>${transfer ? '<button type="button" class="action" id="resume-transfer">' + escape(t('transferOpen')) + '</button>' : ''}
      ${stars ? '<button type="button" class="action" id="resume-stars">' + escape(t('payStars')) + '</button>' : ''}
      ${(kind === 'boost' || kind === 'donat') && item.status === 'paid' ? '<button type="button" class="secondary" id="edit-order-id">' + (state.lang === 'ru' ? 'Исправить игровой ID' : 'O‘yin ID ni o‘zgartirish') + '</button>' : ''}
      ${kind === 'boost' && !transfer && !stars ? '<button type="button" class="action" id="repeat-boost">' + escape(t('repeatBoost')) + '</button>' : ''}`,
      t('orderDetails') + ' #' + id);
    $('#edit-order-id')?.addEventListener('click', () => {
      const value = kind === 'boost' ? item.game_id : item.detail;
      showSheet('order-edit', `<label for="order-edit-value">${escape(state.lang==='ru'?'Новые данные заказа':'Buyurtmaning yangi ma’lumotlari')}</label>
        <input id="order-edit-value" maxlength="64" value="${escape(value || '')}" autocomplete="off">
        <button type="button" class="action" id="order-edit-save">${escape(state.lang==='ru'?'Сохранить':'Saqlash')}</button>
        <button type="button" class="secondary" id="order-edit-back">${escape(t('back'))}</button>`,
        state.lang==='ru'?'Изменить ID':'ID ni o‘zgartirish');
      $('#order-edit-back').onclick=()=>openHistoryEntry(kind,id);
      $('#order-edit-save').onclick=async event=>{
        const button=event.currentTarget;button.disabled=true;
        try {
          await api('order/edit-id',{kind:kind==='boost'?'order':'donat',orderId:Number(id),
            value:$('#order-edit-value').value});
          await syncState();
          openHistoryEntry(kind,id);
        } catch(error){toast(errorMessage(error));if(button.isConnected)button.disabled=false;}
      };
    });
    $('#resume-transfer')?.addEventListener('click', () => p2p.resume(transfer.invoice_id, () => openHistoryEntry(kind,id)));
    $('#resume-stars')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const payment = await api('payment/status',{paymentId:item.id,resume:true,lang:state.lang});
        if (button.isConnected) showStarsPayment({payment, back: () => openHistoryEntry(kind,id)});
      } catch (error) {
        toast(errorMessage(error));
      } finally {
        button.disabled = false;
      }
    });
    $('#repeat-boost')?.addEventListener('click', () => {
      gameId.value = item.game_id || '';
      storage.set('ab-game-id', gameId.value);
      from.value = '';
      to.value = '';
      nav('home', true);
      selectMode(item.mode);
    });
  }

  function showOrderHistory() {
    state.historyTab = 'orders';
    state.filter = 'all';
    all('[data-history]').forEach(button => button.classList.toggle('active', button.dataset.history === 'orders'));
    all('#filters .chip').forEach((button, index) => button.classList.toggle('active', index === 0));
    nav('history');
    renderHistory();
  }

  function applyLanguage(){
    document.documentElement.lang=state.lang;all('[data-i18n]').forEach(x=>x.textContent=t(x.dataset.i18n));all('[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===state.lang));
    gameId.placeholder=t('idPlaceholder');gameId.setAttribute('aria-label',t('gameId'));$('#close-sheet').setAttribute('aria-label',t('close'));
    $('#service-switch').setAttribute('aria-label', t('mainServices'));
    $('#bottom-nav').setAttribute('aria-label', t('navigation'));
    $('.tg-icon.left').setAttribute('aria-label', t('goBack'));
    $('.tg-icon.right').setAttribute('aria-label', t('menu'));
    shop.applyLanguage();
    const banner=config.banners?.[state.lang];if(banner){try{const url=new URL(banner,document.baseURI);if(['https:','http:'].includes(url.protocol))$('.hero').style.backgroundImage=`url(${JSON.stringify(url.href)})`;}catch{}}
    all('[data-mode]').forEach(button=>button.textContent=t(button.dataset.mode));$('#mode-label').textContent=t('selectedMode')+': '+t(state.mode);
    $('#quick-balance').textContent=sum(state.balance);$('#setting-balance').textContent=sum(state.balance);updatePrice();renderHistory();
    const sheet=state.sheet;
    if(sheet?.startsWith('rank:'))openRanks(sheet.split(':')[1]);
    else if(sheet==='checkout')renderPayments();
    else if(sheet==='topup')renderTopup();
    else if(sheet==='topup-status')renderTopupStatus(state.context);
    else if(sheet==='partners')shop.openPartners();
    else if(sheet)openInfo(sheet);
  }
  function starsEnabled(rate, max) {
    return state.service && Number.isSafeInteger(rate) && rate > 0
      && Number.isSafeInteger(max) && max > 0
      && /^https:\/\/[^\s<>]+$/.test(config.termsUrl || '') && typeof tg?.openInvoice === 'function';
  }
  function paymentTerms(enabled) {
    return enabled
      ? `<label class="terms-choice"><input type="checkbox" id="accept-payment-terms"><a href="${escape(config.termsUrl)}" target="_blank" rel="noopener noreferrer">${escape(t('terms'))}</a></label>`
      : `<p class="notice">${escape(t('starsNotConfigured'))}</p>`;
  }
  function orderSummary(context){
    const order=context.order;return `<div class="checkout-summary"><div>${glyph('receipt')} <strong>${escape(t(order.mode))}</strong></div><div>${escape(rankName(order.fromIndex))} → ${escape(rankName(order.toIndex))}</div><div>ID: ${escape(order.gameId)}</div><strong>${escape(t('total'))}: ${escape(sum(order.amount))}</strong>${etaText(context.eta ?? boostEta) ? '<div>' + escape(etaText(context.eta ?? boostEta)) + '</div>' : ''}</div>`;
  }
  function showStarsPayment(context) {
    const payment = context.payment;
    state.context = context;
    context.awaiting = payment.processing === true;
    if (payment.invoiceLink && !context.awaiting) openTopupInvoice(context);
    else {
      renderTopupStatus(context);
      if (context.awaiting) confirmTopup(context);
      else if (payment.status === 'paid') syncState();
    }
  }
  function renderPayments() {
    const c=state.context;
    const orderData = () => ({...c.order, lang:state.lang,
      expectedAmount:c.order.amount, requestId:requestId(c,'checkout')});
    c.method ||= 'uzcard';
    const available = method => method === 'stars'
      ? starsEnabled(config.orderStarsRate, config.orderStarsMax)
      : state.p2pMethods.includes(method);
    showSheet('checkout', orderSummary(c)+`
      <h3 class="arslan-payment-subhead">${escape(t('paymentSelect'))}</h3>
      ${paymentMethodTiles(c.method, true)}
      ${c.method==='stars'?paymentTerms(available('stars')):''}
      <p class="arslan-wallet-hint">${escape(t('balanceHint',{amount:sum(state.balance)}))}</p>
      <p class="arslan-wallet-hint">${escape(t('boostPaidNotice'))}</p>
      <button class="wallet-continue" type="button" id="payment-continue">${escape(t('continue'))}</button>
      <button class="secondary" type="button" id="order-topup">${escape(t('walletTitle'))}</button>`,t('choosePayment'));
    const back = () => {state.context=c;renderPayments();};
    body.querySelectorAll('[data-payment-choice]').forEach(button => {
      button.onclick = () => { c.method=button.dataset.paymentChoice; renderPayments(); };
    });
    $('#order-topup').onclick=()=>openTopup(back);
    const button=$('#payment-continue');
    const accept=body.querySelector('#accept-payment-terms');
    const update=()=>{button.disabled=state.busy||!state.service||!available(c.method)
      ||(c.method==='stars'&&!accept?.checked);};
    accept?.addEventListener('change',update);
    update();
    button.onclick=async()=>{
      if(button.disabled)return;
      if(c.method==='uzcard'||c.method==='humo') {
        await requestTransfer('checkout', {...orderData(), paymentMethod:c.method}, button, loadConfig);
        return;
      }
      state.busy=true;
      button.disabled=true;
      try {
        const result=await api('checkout',{...orderData(),paymentMethod:'stars',acceptTerms:true});
        if(!result.payment||(result.payment.status==='pending'&&!result.payment.processing&&!result.payment.invoiceLink))
          throw new Error('connection_error');
        showStarsPayment({kind:'order',payment:result.payment,back});
        await syncState();
      } catch(error) {
        if(error.message==='order_quote_changed'&&button.isConnected) {
          closeSheet();await loadConfig();
        }
        toast(errorMessage(error));
      } finally {state.busy=false;if(button.isConnected)update();}
    };
  }
  function openTopup(back) {
    state.context={kind:'topup',starsInput:'100',sumInput:'10000',method:state.p2pMethods.includes('uzcard')?'uzcard':'stars',back};
    renderTopup();
  }
  function renderTopup() {
    const context=state.context;
    const rate=config.starsRate,max=config.starsMax,enabled=starsEnabled(rate,max);
    const isStars=context.method==='stars';
    const methods = state.p2pMethods || [];
    showSheet('topup',`
      <div class="wallet-balance"><div>${glyph('wallet')} ${escape(t('yourBalance'))}</div><strong id="topup-balance">${escape(sum(state.balance))}</strong></div>
      ${state.legacyBalance?`<button class="secondary" id="legacy-balance" type="button">${escape(t('legacyBalance',{amount:sum(state.legacyBalance)}))}</button>`:''}
      <h3 class="arslan-payment-subhead">${escape(t('paymentSelect'))}</h3>
      ${paymentMethodTiles(context.method)}
      ${isStars ? `
        <label for="topup-stars">${escape(t('starsQuantity'))}</label>
        <div class="topup-input-row" data-keyboard-inline><input id="topup-stars" inputmode="numeric" autocomplete="off" maxlength="6" value="${escape(context.starsInput)}" ${enabled?'':'disabled'}></div>
        ${enabled?`<p class="topup-rate">1–${escape(money(max))} ⭐ · 1 ⭐ = ${escape(sum(rate))}</p>`:''}
        <div class="checkout-summary topup-quote"><span>${escape(t('topupCredit'))}</span><strong id="topup-quote" aria-live="polite"></strong></div>
      ` : `
        <label for="card-topup-amount">${escape(t('cardExact'))}</label>
        <div class="arslan-card-presets">${[10000,50000,100000].map(n=>`<button type="button" data-card-amount="${n}" aria-pressed="false">${escape(sum(n))}</button>`).join('')}</div>
        <label for="card-topup-amount">${escape(t('cardCustom'))}</label>
        <div class="topup-input-row" data-keyboard-inline><input id="card-topup-amount" inputmode="numeric" autocomplete="off" maxlength="9" value="${escape(context.sumInput)}"></div>
        ${!methods.includes(context.method)?`<p class="notice" role="status">${escape(t('cardNotReady'))}</p>`:''}
      `}
      ${paymentTerms(isStars?enabled:true)}
      <button class="wallet-continue" type="button" id="topup-continue" disabled>${escape(t('continue'))}</button>
      ${context.back?`<button class="secondary" type="button" id="topup-back">${escape(t('goBack'))}</button>`:''}`,t('walletTitle'));
    body.querySelectorAll('[data-payment-choice]').forEach(button=>{
      button.onclick=()=>{ context.method=button.dataset.paymentChoice; dismissKeyboard(); renderTopup(); };
    });
    $('#legacy-balance')?.addEventListener('click',()=>openInfo('support'));
    $('#topup-back')?.addEventListener('click',context.back);
    const pay=$('#topup-continue'),accept=$('#accept-payment-terms');
    if(!isStars){
      const input=$('#card-topup-amount'),presets=[...body.querySelectorAll('[data-card-amount]')];
      const amount=()=>{const digits=input.value.replace(/[\s\u00A0\u202F]/gu,'');return /^\d{1,9}$/.test(digits)?Number(digits):0;};
      const update=()=>{
        context.sumInput=input.value;
        const n=amount();
        presets.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.cardAmount)===n)));
        pay.disabled=state.busy||!methods.includes(context.method)||!accept?.checked||n<10000||n>100_000_000;
      };
      input.oninput=update;
      presets.forEach(b=>b.onclick=()=>{input.value=b.dataset.cardAmount;dismissKeyboard();update();});
      accept?.addEventListener('change',update);
      pay.onclick=async()=>{
        if(pay.disabled)return;
        state.busy=true;update();
        try { await p2p.start(amount(),context.method,()=>{state.context=context;renderTopup();}); }
        catch(error) {toast(errorMessage(error));}
        finally {state.busy=false;if(pay.isConnected)update();}
      };
      update();return;
    }
    const input=$('#topup-stars'),quote=$('#topup-quote');
    const update=()=>{
      context.starsInput=input.value;
      const stars=/^\d+$/.test(input.value)?Number(input.value):0;
      const valid=enabled&&Number.isSafeInteger(stars)&&stars>=1&&stars<=max;
      quote.textContent=valid?sum(stars*rate):'—';
      pay.disabled=state.busy||!accept?.checked||!valid;
    };
    input.addEventListener('input',update);
    accept?.addEventListener('change',update);
    pay.onclick=async()=>{
      if(pay.disabled)return;
      dismissKeyboard();state.busy=true;input.disabled=accept.disabled=true;update();
      try {
        const stars=Number(context.starsInput);
        const result=await api('topup',{stars,starsRate:rate,lang:state.lang,paymentMethod:'stars',
          acceptTerms:true,requestId:requestId(context,`${stars}:${rate}`)});
        if(!pay.isConnected||state.context!==context)return;
        context.payment=result;showStarsPayment(context);
      } catch(error) {
        if(error.message==='stars_quote_changed') { await loadConfig(); if(pay.isConnected){state.busy=false;renderTopup();} }
        toast(errorMessage(error));
      } finally {
        state.busy=false;
        if(pay.isConnected){input.disabled=accept.disabled=false;update();}
      }
    };
    update();
  }
  function transferCards() {
    if (!state.p2pVisible) return '';
    return `<section class="transfer-choices">
      <div class="transfer-choices-heading"><strong>${escape(t('transferPay'))}</strong>
        ${state.p2pMethods.length ? `<small>${escape(t('transferTimed'))}</small>` : ''}</div>
      <div class="p2p-methods">${cardMethods.map(method => {
        const active = state.p2pMethods.includes(method);
        return `<button class="p2p-method transfer-choice" type="button" data-transfer-method="${method}" ${active ? '' : 'disabled'}>
          <img src="assets/${method}.svg" alt="" width="35" height="35">
          <strong>${method.toUpperCase()}</strong>
          ${active ? '<span class="transfer-choice-arrow" aria-hidden="true">›</span>' : `<span class="transfer-choice-state">${escape(t('transferDisabled'))}</span>`}
        </button>`;
      }).join('')}</div>
      ${state.p2pAdmin && state.p2pMethods.length < cardMethods.length
        ? `<p class="transfer-setup">${escape(t('transferSetup'))}</p>` : ''}
    </section>`;
  }

  function transferChoices(kind) {
    return `<div data-transfer-choices="${kind}">${transferCards()}</div>`;
  }

  const transferOrderChoices = () => transferChoices('order');

  function bindTransferOrder(path, payload, refreshPrices) {
    body.querySelector('[data-transfer-choices="order"]').onclick = event => {
      const button = event.target.closest('[data-transfer-method]:not(:disabled)');
      if (button) requestTransfer(path, payload(button.dataset.transferMethod), button, refreshPrices);
    };
  }

  async function requestTransfer(path, data, button, refreshPrices = loadConfig) {
    if (button.disabled) return;
    dismissKeyboard();
    const panel = button.closest('[data-transfer-choices]');
    panel?.setAttribute('aria-busy', 'true');
    const controls = [...body.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')];
    controls.forEach(control => control.disabled = true);
    try {
      const result = await api(path, data);
      if (!button.isConnected) return;
      if (!result.invoiceId) throw new Error('connection_error');
      await p2p.resume(result.invoiceId, showOrderHistory);
      await syncState();
    } catch (error) {
      if (button.isConnected) {
        if (error.message === 'order_quote_changed') {
          closeSheet();
          await refreshPrices();
        }
        toast(errorMessage(error));
      }
    } finally {
      controls.forEach(control => control.disabled = false);
      panel?.removeAttribute('aria-busy');
      if (panel?.isConnected) panel.innerHTML = transferCards();
    }
  }

  async function runProviderTest(context, method, buttons) {
    const status = $('#provider-test-status');
    const ru = state.lang === 'ru';
    const awaiting = context.testAwaiting ??= new Set();
    const data = {method, lang: state.lang, requestId: requestId(context, `test:${method}`)};
    const check = async () => {
      const result = await api('payment-test', {...data, action:'status'});
      status.textContent = result.status === 'paid'
        ? (ru ? 'Тестовый платёж подтверждён сервером.' : 'Sinov to‘lovi serverda tasdiqlandi.')
        : (ru ? 'Ожидается подтверждение. Нажми кнопку TEST ещё раз.' : 'Tasdiq kutilmoqda. TEST tugmasini yana bosing.');
    };
    buttons.forEach(button => button.disabled = true);
    try {
      if (awaiting.has(method)) {
        await check();
        return;
      }
      if (typeof tg?.openInvoice !== 'function') throw new Error('connection_error');
      const result = await api('payment-test', {...data, action:'create'});
      if (!status.isConnected) return;
      if (result.invoiceLink) {
        const invoiceStatus = await new Promise(resolve => tg.openInvoice(result.invoiceLink, resolve));
        if (invoiceStatus !== 'paid' && invoiceStatus !== 'pending') {
          status.textContent = ru ? 'Тестовый счёт закрыт.' : 'Sinov hisobi yopildi.';
          return;
        }
        awaiting.add(method);
      }
      await check();
    } catch {
      status.textContent = ru ? 'Не удалось проверить счёт. Попробуй ещё раз.' : 'Hisobni tekshirib bo‘lmadi. Qayta urinib ko‘ring.';
    } finally {
      buttons.forEach(button => button.disabled = false);
    }
  }
  function validTelegramUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='t.me'&&/^\/[A-Za-z0-9_]{3,32}\/?$/.test(u.pathname)?u:null;}catch{return null;}}
  function adminUrl(text){
    const url=validTelegramUrl(config.supportUrl);if(!url)return null;
    // URLSearchParams encodes spaces as '+', which Telegram iOS can display literally.
    return url.origin+url.pathname+(text?'?text='+encodeURIComponent(text):'');
  }
  function openTelegram(url){if(!url)return;try{if(tg?.initData&&tg.openTelegramLink)tg.openTelegramLink(url);else window.location.assign(url);}catch{toast(t('connectionError'));}}
  function requestId(context,key) {
    const requests=context.requests??=new Map();
    if(!requests.has(key)) {
      const bytes=crypto.getRandomValues(new Uint8Array(16));
      requests.set(key,Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(''));
    }
    return requests.get(key);
  }
  function renderTopupStatus(context) {
    const payment=context.payment,paid=payment.status==='paid';
    const topup=payment.kind==='topup';
    const title = paid ? (topup ? 'balanceCredited' : 'orderPaid') : context.awaiting ? 'confirming' : 'invoiceReady';
    const hint = paid ? (topup ? 'paymentConfirmedText' : 'paidOrderHint')
      : context.awaiting ? 'starsCheckingHint' : 'starsPayHint';
    const reference = payment.orderId ? t('orderNumber') + ' #' + payment.orderId : t('paymentNumber') + ' #' + payment.id;
    const action = paid ? '' : context.awaiting ? 'checkPayment' : payment.invoiceLink ? 'payStars' : '';
    const backLabel = paid && !topup ? 'toOrders' : paid && !context.back ? 'toBalance' : 'goBack';
    showSheet('topup-status',`
      <div class="wallet-balance stars-amount">
        <div><span>Telegram Stars</span><small>${escape(reference)}</small></div>
        <strong>${escape(money(payment.stars))} ⭐</strong>
        <small>${escape(sum(payment.amount))}</small>
      </div>
      <div class="transfer-review stars-review${paid ? ' stars-review-paid' : ''}" role="status">
        <div class="transfer-review-ring" aria-hidden="true">${paid ? '✓' : glyph(context.awaiting ? 'shield' : 'receipt')}</div>
        <h2>${escape(t(title))}</h2>
        <p>${escape(t(hint))}</p>
      </div>
      ${action?`<button class="wallet-continue" type="button" id="topup-status-action" ${context.checking||context.invoiceOpen?'disabled':''}>${escape(t(action))}</button>`:''}
      <button class="${paid ? 'wallet-continue' : 'secondary'}" type="button" id="topup-status-back">${escape(t(backLabel))}</button>`,t(topup?'walletTitle':'payment'));
    $('#topup-status-action')?.addEventListener('click',()=>context.awaiting?confirmTopup(context):openTopupInvoice(context));
    $('#topup-status-back').onclick=()=>{
      if(paid && !topup) showOrderHistory();
      else if(context.back) context.back();
      else if(paid) openTopup();
      else if(topup) renderTopup();
      else closeSheet();
    };
  }
  function openTopupInvoice(context) {
    if(context.invoiceOpen||!context.payment.invoiceLink)return;
    context.invoiceOpen=true;
    renderTopupStatus(context);
    try {
      tg.openInvoice(context.payment.invoiceLink,status=>{
        context.invoiceOpen=false;
        if(status==='paid'||status==='pending') {
          context.awaiting=true;
          confirmTopup(context);
        } else if(state.context===context&&state.sheet==='topup-status') {
          renderTopupStatus(context);
          toast(t('invoiceClosed'));
        }
      });
    } catch {
      context.invoiceOpen=false;
      renderTopupStatus(context);
      toast(t('connectionError'));
    }
  }
  function apiUrl(path){return config.apiBaseUrl?config.apiBaseUrl.replace(/\/$/,'')+'/api/'+path:new URL('api/'+path,document.baseURI).href;}
  async function api(path,data,method='POST'){
    const response=await fetch(apiUrl(path),{method,headers:{
      'Content-Type':'application/json','X-Telegram-Init-Data':tg?.initData||''},
      ...(method==='POST'?{body:JSON.stringify(data||{})}:{}),signal:AbortSignal.timeout(15000)});
    let result;try{result=await response.json();}catch{throw new Error('connection_error');}if(!response.ok)throw new Error(result?.error||'connection_error');if(!result||typeof result!=='object')throw new Error('connection_error');return result;
  }
  let syncVersion = 0;
  async function syncState() {
    if (!state.service || !tg?.initData) return null;
    const version = ++syncVersion;
    const [boost, donat] = await Promise.allSettled([api('state'), api('donat/state')]);
    const boostData = boost.status === 'fulfilled' ? boost.value : null;
    if (version !== syncVersion) return boostData;
    if (boostData) {
      const previousCards = [state.p2pVisible, state.p2pAdmin, ...state.p2pMethods].join(',');
      state.p2pPrivate = boostData.p2pPrivate === true;
      state.p2pVisible = boostData.p2pVisible === true || state.p2pPrivate;
      state.p2pAdmin = boostData.p2pAdmin === true;
      state.p2pMethods = state.p2pPrivate && Array.isArray(boostData.p2pMethods)
        ? boostData.p2pMethods.filter(method => cardMethods.includes(method)) : [];
      const starsAmount = Number(boostData.starsBalance) || 0;
      const totalAmount = Number(boostData.balance) || 0;
      // Private card testing: show the spendable wallet including confirmed P2P.
      // Public users continue to see the Stars-only balance.
      state.balance = state.p2pPrivate ? totalAmount : starsAmount;
      state.legacyBalance = state.p2pPrivate ? 0 : Math.max(0, totalAmount - starsAmount);
      state.orders = Array.isArray(boostData.orders) ? boostData.orders : [];
      state.payments = Array.isArray(boostData.payments) ? boostData.payments : [];
      state.testProviders = Array.isArray(boostData.testProviders)
        ? boostData.testProviders.filter(method => method === 'click' || method === 'payme') : [];
      if (!gameId.value && boostData.gameId) {
        gameId.value = boostData.gameId;
        updatePrice();
      }
      $('#quick-balance').textContent = sum(state.balance);
      $('#setting-balance').textContent = sum(state.balance);
      const topupBalance=$('#topup-balance');
      if(topupBalance)topupBalance.textContent=sum(state.balance);
      if (previousCards !== [state.p2pVisible, state.p2pAdmin, ...state.p2pMethods].join(',')) {
        const panel = body.querySelector('[data-transfer-choices]:not([aria-busy])');
        if (panel) panel.innerHTML = transferCards();
      }
    }
    if (donat.status === 'fulfilled' && Array.isArray(donat.value.orders)) {
      state.donatOrders = donat.value.orders;
    }
    state.historyLoaded ||= Boolean(boostData) || donat.status === 'fulfilled';
    renderHistory();
    return boostData;
  }
  async function confirmTopup(context) {
    if(context.checking||context.payment.status!=='pending')return;
    context.checking=true;
    const visible=()=>state.context===context&&state.sheet==='topup-status';
    const canPoll=()=>visible()&&document.visibilityState!=='hidden';
    if(visible())renderTopupStatus(context);
    try {
      for(const wait of [0, 1000, 2000, 3000, 5000, 7000, 10000, 12000]) {
        if(wait) {
          if(!canPoll())break;
          await new Promise(resolve=>setTimeout(resolve,wait));
          if(!canPoll())break;
        }
        const payment=await api('payment/status',{paymentId:context.payment.id});
        if(payment.status==='paid') {
          context.payment=payment;
          await syncState();
          if(visible())toast(t(payment.kind==='topup'?'balanceCredited':'orderPaid'));
          break;
        }
      }
    } catch (error) {
      if (visible()) toast(errorMessage(error));
    } finally {
      context.checking=false;
      if(visible())renderTopupStatus(context);
    }
  }
  function errorMessage(error){const mapping={invalid_game_id:'invalidId',insufficient_balance:'notEnough',stars_not_configured:'starsNotConfigured',stars_quote_changed:'rateChanged',order_quote_changed:'orderQuoteChanged',request_conflict:'paymentConflict',terms_required:'termsRequired',unauthorized:'sessionExpired',session_expired:'sessionExpired',p2p_invoice_in_progress:'transferInProgress',p2p_amount_unavailable:'transferBusy',p2p_disabled:'transferUnavailable',p2p_method_unavailable:'transferUnavailable'};if(error.message==='order_already_active')return state.lang==='ru'?'Завершите текущий заказ или отмените неоплаченную заявку, прежде чем создавать новый.':'Yangi buyurtma uchun avval joriy buyurtma tugatilishi yoki to‘lanmagan ariza bekor qilinishi kerak.';if(error.message==='order_edit_locked')return state.lang==='ru'?'Изменение уже недоступно: администратор начал выполнение.':'Buyurtma ustida ish boshlangan, o‘zgartirish mumkin emas.';return t(mapping[error.message]||'connectionError');}
  function openInfo(name){
    if(name==='balance'){openTopup();return;}
    const textKey={support:'supportText',profile:'profileText',security:'securityText',about:'aboutText',promo:'promoText'}[name]||'aboutText';
    const user=tg?.initDataUnsafe?.user;
    let html=`<p>${escape(t(textKey))}</p>`;
    if(name==='profile')html+=`<div class="checkout-summary">${escape([user?.first_name,user?.last_name].filter(Boolean).join(' ')||t('appUser'))}${user?.id?'<br>ID: '+escape(user.id):''}</div>`;
    if(name==='promo')html+=`<input id="promo-input" maxlength="64" placeholder="${escape(t('promoPlaceholder'))}"><button class="action" id="promo-submit">${escape(t('promoAction'))}</button>`;
    if(name==='support'){html+=`<button class="action" id="support-contact" ${adminUrl()?'':'disabled'}>${escape(t('admin'))}</button>`;if(!adminUrl())html+=`<p class="notice">${escape(t('adminMissing'))}</p>`;}
    showSheet(name,html,t(name));
    $('#support-contact')?.addEventListener('click',()=>openTelegram(adminUrl()));$('#promo-submit')?.addEventListener('click',()=>{const code=$('#promo-input').value.trim();if(!code){$('#promo-input').focus();return;}const message=t('promo')+': '+code;const link=adminUrl(message);if(link)openTelegram(link);else toast(t('adminMissing'));});
  }
  const shop = window.initArslanShop({
    config,
    openTopup, transferOrderChoices, bindTransferOrder,
    syncState, walletBalance: () => state.balance,
    lang: () => state.lang,
    api,
    connected: () => state.service && Boolean(tg?.initData),
    openSheet: (heading, html, view) => showSheet(view === 'partners' ? 'partners' : view ? 'donat-product' : 'donat', html, heading),
    closeSheet,
    sheetBody: body,
    openTelegram,
    telegramUrl: validTelegramUrl,
    toast,
    escape,
    money,
    glyph,
    showHistory: showOrderHistory
  });
  function openMenu() {
    showSheet('menu', `
      <button class="action" type="button" id="menu-partners">${escape(t('parties'))}</button>
      <button class="secondary" type="button" id="menu-support">${escape(t('support'))}</button>
      <button class="secondary" type="button" id="menu-about">${escape(t('about'))}</button>`, t('menu'));
    $('#menu-partners').onclick = () => shop.openPartners();
    $('#menu-support').onclick = () => openInfo('support');
    $('#menu-about').onclick = () => openInfo('about');
  }
  all('[data-page]').forEach(button => button.onclick = () => nav(button.dataset.page));
  all('[data-service]').forEach(button => button.onclick = () => nav(button.dataset.service, true));
  all('[data-nav]').forEach(button => button.onclick = () => nav(button.dataset.nav));
  all('[data-sheet]').forEach(button => button.onclick = () => openInfo(button.dataset.sheet));
  $('[data-partners]').onclick = () => shop.openPartners();
  function selectMode(mode) {
    state.mode = ['wing','comp','duel'].includes(mode) ? mode : 'wing';
    all('.mode').forEach(button => {
      const selected = button.dataset.mode === state.mode;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#mode-label').textContent = t('selectedMode') + ': ' + t(state.mode);
    updatePrice();
  }
  all('.mode').forEach(button => button.onclick = () => selectMode(button.dataset.mode));
  $('#history-content').addEventListener('click', event => {
    const button = event.target.closest('[data-history-kind]');
    if (button) openHistoryEntry(button.dataset.historyKind, button.dataset.historyId);
  });
  $('#from-rank-trigger').onclick=()=>openRanks('from');$('#to-rank-trigger').onclick=()=>openRanks('to');from.onchange=updatePrice;to.onchange=updatePrice;let profileTimer;gameId.value=storage.get('ab-game-id')||'';gameId.addEventListener('input',()=>{updatePrice();clearTimeout(profileTimer);storage.set('ab-game-id',gameId.value);if(validId()&&state.service&&tg?.initData)profileTimer=setTimeout(()=>api('profile',{gameId:gameId.value.trim(),lang:state.lang}).catch(()=>{}),500);});
  orderBtn.onclick=()=>{if(!validId()||orderBtn.disabled){gameId.focus();toast(t('invalidId'));return;}gameId.blur();state.context={kind:'order',order:currentOrder()};renderPayments();};
  $('#close-sheet').onclick = closeSheet;
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay && activeTextField()) event.preventDefault();
  });
  overlay.onclick = event => {
    if (event.target === overlay && !dismissKeyboard()) closeSheet();
  };
  document.addEventListener('keydown', event => {
    if (!event.isComposing && (event.key === 'Escape' || (event.key === 'Enter' && activeTextField()?.tagName === 'INPUT'))) {
      if (dismissKeyboard()) {
        event.preventDefault();
        return;
      }
    }
    if (!overlay.classList.contains('open')) return;
    if (event.key === 'Escape') closeSheet();
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not([disabled]),input,textarea,[tabindex="0"]')]
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        last?.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first?.focus();
        event.preventDefault();
      }
    }
  });
  all('[data-lang]').forEach(button=>button.onclick=()=>{state.lang=button.dataset.lang;storage.set('ab-lang',state.lang);applyLanguage();if(state.service&&tg?.initData)api('profile',{lang:state.lang}).catch(()=>{});});
  all('[data-history]').forEach(button=>button.onclick=()=>{state.historyTab=button.dataset.history;all('[data-history]').forEach(b=>b.classList.toggle('active',b===button));renderHistory();syncState();});
  all('#filters .chip').forEach((button,i)=>{button.onclick=()=>{state.filter=['all','completed','pending','cancelled'][i];all('#filters .chip').forEach(b=>b.classList.toggle('active',b===button));renderHistory();};});
  function setMotion(reduced){document.body.classList.toggle('reduce-motion',reduced);$('#motion-toggle').classList.toggle('on',reduced);storage.set('ab-reduced-motion',String(reduced));}
  $('#setting-balance-card')?.addEventListener('click',()=>openInfo('balance'));$('#motion-row').onclick=()=>setMotion(!document.body.classList.contains('reduce-motion'));if(storage.get('ab-reduced-motion')==='true')setMotion(true);
  const user=tg?.initDataUnsafe?.user;if(user){$('#username').textContent=[user.first_name,user.last_name].filter(Boolean).join(' ')||t('appUser');$('#telegram-id').textContent=user.username?'@'+user.username:'ID: '+user.id;const avatar=$('.avatar'),initial=(user.first_name||'A').slice(0,1);avatar.textContent=initial;if(user.photo_url){try{const photo=new URL(user.photo_url);if(photo.protocol==='https:'){const img=new Image();img.alt='';img.width=54;img.height=54;img.decoding='async';img.referrerPolicy='no-referrer';img.onload=()=>avatar.replaceChildren(img);img.onerror=()=>{avatar.textContent=initial;};img.src=photo.href;}}catch{}}}
  $('.tg-icon.left').onclick=()=>{if(overlay.classList.contains('open'))closeSheet();else nav('services',true);};$('.tg-icon.right').onclick=openMenu;
  keyboardDone.addEventListener('pointerdown', event => event.preventDefault());
  keyboardDone.onclick = dismissKeyboard;
  document.addEventListener('focusin', updateKeyboardControls);
  document.addEventListener('focusout', () => requestAnimationFrame(updateKeyboardControls));
  document.addEventListener('click', event => {
    if (!event.target.closest('input, textarea, label, button, a')) dismissKeyboard();
  });
  window.visualViewport?.addEventListener('resize', updateKeyboardControls);
  window.visualViewport?.addEventListener('scroll', updateKeyboardControls);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    if(state.sheet==='topup-status'&&state.context.awaiting&&state.context.payment.status==='pending')confirmTopup(state.context);
    else syncState();
  });
  // Lock accidental WebView pinch/double-tap zoom, retain normal one-finger scrolling.
  const stopZoom=e=>{if(e.cancelable)e.preventDefault();};
  ['gesturestart','gesturechange','gestureend'].forEach(name=>document.addEventListener(name,stopZoom,{passive:false}));
  document.addEventListener('touchmove',e=>{if(e.touches.length>1)stopZoom(e);},{passive:false});
  let lastTap=0,lastPoint=null;document.addEventListener('touchend',e=>{if(e.target.closest('[data-pack-step], [data-qty]'))return;const p=e.changedTouches[0],now=Date.now();if(p&&lastPoint&&now-lastTap<300&&Math.hypot(p.clientX-lastPoint.x,p.clientY-lastPoint.y)<25)stopZoom(e);lastTap=now;lastPoint=p?{x:p.clientX,y:p.clientY}:null;},{passive:false});
  document.addEventListener('wheel',e=>{if(e.ctrlKey)stopZoom(e);},{passive:false});
  applyLanguage();
  nav(mainPage, true);
  async function loadConfig(){if(!tg?.initData)return;try{const response=await fetch(apiUrl('config'),{signal:AbortSignal.timeout(5000)});if(!response.ok)return;const server=await response.json();if(!server.arslanBoostApi)return;if(server.botUrl)config.botUrl=server.botUrl;for(const key of ['termsUrl','starsRate','starsMax'])config[key]=server[key];if(Array.isArray(server.prices)&&server.prices.length===prices.length&&server.prices.every(p=>Number.isSafeInteger(p)&&p>=0)){
      prices=server.prices;
      calibrationLegendPrice=Number.isSafeInteger(server.calibrationLegendPrice)?server.calibrationLegendPrice:0;
      boostModeSurcharge=Number.isSafeInteger(server.boostModeSurcharge)?server.boostModeSurcharge:0;
      minBoostPrice=Number.isSafeInteger(server.minBoostPrice)&&server.minBoostPrice>0?server.minBoostPrice:0;
    }boostEta=server.boostEta;state.service=true;updatePrice();await syncState();if(state.sheet==='topup'&&!state.busy)renderTopup();else if(state.sheet==='checkout')renderPayments();}catch{}}
  loadConfig().then(() => {
    if (state.sheet) return;
    if (launchSection === 'wallet') openTopup();
    if (launchSection === 'partners') shop.openPartners();
  });
  const intro=$('#intro');let introTimeout;function finishIntro(){clearTimeout(introTimeout);intro.classList.remove('show');intro.setAttribute('aria-hidden','true');}
  if(storage.get('ab-reduced-motion')!=='true'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const duration=Math.min(1000,Math.max(400,config.introDuration||800));intro.style.setProperty('--intro-duration',duration+'ms');intro.classList.add('show');intro.setAttribute('aria-hidden','false');introTimeout=setTimeout(finishIntro,duration);}
})();
