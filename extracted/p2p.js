(function () {
  'use strict';
  const strings = {
    ru: {
      wallet: 'Пополнение картой', balance: 'Баланс переводов', amount: 'Сумма пополнения',
      method: 'Способ оплаты', next: 'Продолжить', back: 'Назад', copied: 'Скопировано',
      copy: 'Копировать', selectCopy: 'Выделите и скопируйте текст', exact: 'Точная сумма перевода',
      card: 'Карта получателя', methodNote: 'Перевод на карту',
      expires: 'Время для перевода', rules1: 'Не меняйте сумму ни на 1 сум.',
      rules2: 'Оплатите в течение 10 минут.', transfer: 'Я оплатил', checking: 'Проверяем платёж',
      checkingNote: 'Администратор проверяет фактическое поступление на карту.',
      checkingAuto: 'Ожидаем подтверждение поступления от банковского источника. Повторно не переводите.',
      waitingAuto: 'Ожидаем банковское подтверждение. Если деньги уже отправлены, не платите повторно.',
      manualReview: 'Ожидает подтверждения администратора',
      manualWait: 'После проверки вы получите уведомление в Telegram. Чек не обязателен.',
      paid: 'Баланс пополнен', orderPaid: 'Заказ оплачен', order: 'Заказ', toOrders: 'К заказам',
      expired: 'Время перевода истекло',
      rejected: 'Заявка отклонена', cancelled: 'Заявка отменена',
      cancel: 'Отменить до оплаты', cancelTitle: 'Деньги ещё не отправлены?',
      cancelNote: 'Нельзя отменять заявку, если вы уже перевели деньги. После отмены старую сумму оплачивать нельзя.',
      cancelConfirm: 'Да, отменить заявку', cancelBack: 'Вернуться к оплате',
      cancelDenied: 'Нельзя отменить: срок истёк или платёж уже проверяется.',
      absent: 'Платёж пока не найден',
      waiting: 'Администратор проверит оплату. Не создавайте повторный перевод.',
      retry: 'Проверить ещё раз', new: 'К сумме и способу оплаты',
      help: 'Сумма, которую зачислим', unavailable: 'Способ временно недоступен.',
      error: 'Не удалось обновить данные. Попробуйте ещё раз.',
      amountUnavailable: 'Эта сумма сейчас занята. Выберите другую сумму или повторите позже.',
      inProgress: 'Сначала завершите текущий перевод.',
      noCard: 'Реквизиты изменились. Если вы уже перевели деньги, откройте проверку.',
      history: 'Последняя заявка', noExtra: 'Без дополнительных сумм', loading: 'Загружаем способы оплаты…',
    },
    uz: {
      wallet: 'Karta orqali to‘ldirish', balance: 'O‘tkazmalar balansi', amount: 'To‘ldirish summasi',
      method: 'To‘lov usuli', next: 'Davom etish', back: 'Orqaga', copied: 'Nusxalandi',
      copy: 'Nusxalash', selectCopy: 'Matnni belgilab nusxalang', exact: 'O‘tkaziladigan aniq summa',
      card: 'Qabul qiluvchi karta', methodNote: 'Kartaga o‘tkazma',
      expires: 'O‘tkazma uchun vaqt', rules1: 'Summani 1 so‘mga ham o‘zgartirmang.',
      rules2: '10 daqiqa ichida to‘lang.', transfer: 'To‘ladim', checking: 'To‘lov tekshirilmoqda',
      checkingNote: 'Administrator kartaga pul tushganini tekshiradi.',
      checkingAuto: 'Bank xabari orqali tushum tasdig‘ini kutyapmiz. Pulni qayta yubormang.',
      waitingAuto: 'Bank tasdig‘i kutilmoqda. Pul jo‘natgan bo‘lsangiz, qayta to‘lamang.',
      manualReview: 'Administrator tasdig‘i kutilmoqda',
      manualWait: 'Tekshiruvdan keyin Telegram orqali xabar olasiz. Chek majburiy emas.',
      paid: 'Balans to‘ldirildi', orderPaid: 'Buyurtma to‘landi', order: 'Buyurtma', toOrders: 'Buyurtmalarga qaytish',
      expired: 'O‘tkazma vaqti tugadi',
      rejected: 'Ariza rad etildi', cancelled: 'Ariza bekor qilindi',
      cancel: 'To‘lovdan oldin bekor qilish', cancelTitle: 'Pul hali yuborilmadimi?',
      cancelNote: 'Pul o‘tkazgan bo‘lsangiz bekor qilmang. Bekor qilingan arizaning summasiga pul yubormang.',
      cancelConfirm: 'Ha, arizani bekor qilish', cancelBack: 'To‘lovga qaytish',
      cancelDenied: 'Bekor qilib bo‘lmaydi: muddat tugagan yoki to‘lov tekshirilmoqda.',
      absent: 'To‘lov hozircha topilmadi',
      waiting: 'Administrator to‘lovni tekshiradi. Pulni qayta yubormang.',
      retry: 'Qayta tekshirish', new: 'Summa va usulga qaytish',
      help: 'Balansga tushadigan summa', unavailable: 'Usul vaqtincha mavjud emas.',
      error: 'Ma’lumot yangilanmadi. Qayta urinib ko‘ring.',
      amountUnavailable: 'Bu summa hozir band. Boshqa summani tanlang yoki keyinroq urinib ko‘ring.',
      inProgress: 'Avval joriy o‘tkazmani yakunlang.',
      noCard: 'Rekvizitlar o‘zgargan. Pul yuborgan bo‘lsangiz, tekshiruvni oching.',
      history: 'So‘nggi ariza', noExtra: 'Qo‘shimcha so‘m qo‘shilmaydi', loading: 'To‘lov usullari yuklanmoqda…',
    },
  };

  window.ArsLanP2P = function (ui) {
    let options, invoice, method = '', amount = '50000', key;
    let returnTo = ui.back;
    let deadline = 0, tick, polling, generation = 0, refreshing;
    const t = name => strings[ui.lang()][name];
    const e = ui.escape;
    const within = selector => ui.body.querySelector(selector);
    const money = value => ui.money(value) + (ui.lang() === 'ru' ? ' сум' : ' so‘m');

    function stop() {
      generation++;
      clearInterval(tick);
      clearTimeout(polling);
    }

    function show(html, title = t('wallet')) {
      ui.show('<div class="p2p-stack">' + html + '</div>', title);
      return generation;
    }

    function active(version) {
      return generation === version && ui.active();
    }

    function warning(error) {
      const text = {
        p2p_method_unavailable: 'unavailable', p2p_amount_unavailable: 'amountUnavailable',
        p2p_disabled: 'unavailable', p2p_invoice_in_progress: 'inProgress',
      }[error?.message] || 'error';
      const target = within('.p2p-feedback');
      if (target) target.textContent = t(text);
      else ui.toast(t(text));
    }

    function copy(button, text) {
      button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          ui.toast(t('copied'));
        } catch {
          let field = within('.p2p-copy-field');
          if (!field) {
            field = document.createElement('input');
            field.className = 'p2p-copy-field';
            field.readOnly = true;
            field.setAttribute('aria-label', t('copy'));
            button.closest('.p2p-stack').append(field);
          }
          field.value = text;
          field.focus();
          field.select();
          ui.toast(t('selectCopy'));
        }
      };
    }

    function validAmount() {
      const digits=amount.replace(/[\s\u00A0\u202F]/gu,'');
      return /^[0-9]{1,9}$/.test(digits) && Number(digits) >= options.minAmount &&
        Number(digits) <= options.maxAmount;
    }

    function renderForm() {
      const version = show(`
        <div class="p2p-amount"><div><span>${e(t('balance'))}</span><strong>${e(money(options.balance))}</strong></div></div>
        <div><label for="p2p-value">${e(t('amount'))}</label>
        <div data-keyboard-inline><input id="p2p-value" inputmode="numeric" enterkeyhint="done"
          maxlength="9" autocomplete="off" value="${e(amount)}"></div></div>
        <div class="p2p-presets">${[10000, 50000, 100000].map(n =>
          `<button class="p2p-chip" type="button" data-p2p-amount="${n}">${e(ui.money(n))}</button>`).join('')}</div>
        <fieldset><legend>${e(t('method'))}</legend><div class="p2p-methods">
          ${options.methods.map(id => `<button class="p2p-method" type="button" data-p2p-method="${e(id)}">
            <img src="assets/${e(id)}.svg" alt=""><strong>${e(id.toUpperCase())}</strong>
            <span>${e(t('methodNote'))}</span></button>`).join('')}
        </div>${options.methods.length ? '' : `<p class="p2p-muted">${e(t('unavailable'))}</p>`}</fieldset>
        <p class="p2p-feedback" role="status"></p>
        <button class="p2p-action" type="button" id="p2p-next">${e(t('next'))}</button>
        ${options.latest && !options.active ? `<button class="secondary" type="button" id="p2p-latest">${e(t('history'))} #${options.latest.id}</button>` : ''}
        <button class="secondary" type="button" id="p2p-back">${e(t('back'))}</button>`);
      const field = within('#p2p-value'), next = within('#p2p-next');
      const update = () => {
        next.disabled = !validAmount() || !method;
        ui.body.querySelectorAll('[data-p2p-amount]').forEach(button =>
          button.setAttribute('aria-pressed', String(button.dataset.p2pAmount === amount)));
        ui.body.querySelectorAll('[data-p2p-method]').forEach(button =>
          button.setAttribute('aria-pressed', String(button.dataset.p2pMethod === method)));
      };
      const change = value => {
        if (value !== amount) {
          key = null;
          within('.p2p-feedback').textContent = '';
        }
        amount = value;
        update();
      };
      field.oninput = () => change(field.value);
      ui.body.querySelectorAll('[data-p2p-amount]').forEach(button => button.onclick = () => {
        ui.dismissKeyboard();
        field.value = button.dataset.p2pAmount;
        change(field.value);
      });
      ui.body.querySelectorAll('[data-p2p-method]').forEach(button => button.onclick = () => {
        if (method !== button.dataset.p2pMethod) key = null;
        method = button.dataset.p2pMethod;
        ui.dismissKeyboard();
        update();
      });
      next.onclick = async () => {
        if (next.disabled) return;
        next.disabled = true;
        const controls = [...ui.body.querySelectorAll('input, [data-p2p-amount], [data-p2p-method]')];
        controls.forEach(control => { control.disabled = true; });
        ui.dismissKeyboard();
        key ||= ui.requestKey();
        try {
          const result = await ui.api('invoice', { amount: amount.replace(/[\s\u00A0\u202F]/gu,''), method, requestId: key, lang: ui.lang() });
          if (!active(version)) return;
          invoice = result;
          deadline = 0;
          renderInvoice();
        } catch (error) {
          if (active(version)) {
            controls.forEach(control => { control.disabled = false; });
            update();
            warning(error);
          }
        }
      };
      within('#p2p-back').onclick = ui.back;
      const latest = within('#p2p-latest');
      if (latest) latest.onclick = () => {
        invoice = options.latest;
        deadline = 0;
        renderInvoice();
      };
      update();
    }

    function remainingClock(seconds) {
      return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    }

    function renderInvoice() {
      if (invoice.status !== 'pending' || invoice.checkedAt) return renderCheck();
      const card = invoice.cardNumber;
      const version = show(`
        <div class="p2p-amount"><div><span>${e(t('exact'))}</span><strong>${e(money(invoice.uniqueAmount))}</strong><small class="p2p-no-extra">${e(t('noExtra'))}</small></div>
          <button type="button" class="p2p-copy" id="p2p-copy-sum">${e(t('copy'))}</button></div>
        ${invoice.baseAmount !== invoice.uniqueAmount
          ? `<p class="p2p-muted">${e(t('help'))} · ${e(money(invoice.baseAmount))}</p>` : ''}
        <div class="p2p-progress"><div><span>${e(t('expires'))}</span><time id="p2p-clock">10:00</time></div>
          <progress id="p2p-progress" max="600" value="600" aria-label="${e(t('expires'))}"></progress></div>
        ${card ? `<div class="p2p-card">
          <span class="p2p-card-label">${e(t('card'))}</span>
          <strong>${e(card.replace(/(.{4})(?=.)/g, '$1 '))}</strong>
          <div class="p2p-recipient"><img src="assets/${e(invoice.method)}.svg" alt="">
            <span>${e(invoice.cardHolder)}</span></div>
          <button type="button" class="p2p-copy" id="p2p-copy-card">${e(t('copy'))}</button></div>` :
          `<p class="p2p-muted">${e(t('noCard'))}</p>`}
        <ul class="p2p-rules"><li>${e(t('rules1'))}</li><li>${e(t('rules2'))}</li></ul>
        <p class="p2p-feedback" role="status"></p>
        <button type="button" class="p2p-action" id="p2p-paid">${e(t('transfer'))}</button>
        ${invoice.canCancel ? `<button type="button" class="secondary" id="p2p-cancel">${e(t('cancel'))}</button>` : ''}
        <button type="button" class="secondary" id="p2p-return">${e(t('back'))}</button>`,
      invoice.method.toUpperCase());
      copy(within('#p2p-copy-sum'), String(invoice.uniqueAmount));
      if (card) copy(within('#p2p-copy-card'), card);
      within('#p2p-paid').onclick = () => startCheck(version);
      const cancel = within('#p2p-cancel');
      if (cancel) cancel.onclick = renderCancel;
      within('#p2p-return').onclick = returnTo;
      const end = Date.now() + Math.max(0, invoice.expiresAt - invoice.serverTime) * 1000;
      const refreshClock = () => {
        if (!active(version)) return;
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        within('#p2p-clock').textContent = remainingClock(remaining);
        within('#p2p-progress').value = remaining;
        if (!remaining) {
          clearInterval(tick);
          const cardCopy = within('#p2p-copy-card');
          cardCopy?.closest('.p2p-card').remove();
          const sumCopy = within('#p2p-copy-sum');
          if (sumCopy) sumCopy.disabled = true;
          within('.p2p-copy-field')?.remove();
          within('.p2p-feedback').textContent = t('expired');
        }
      };
      tick = setInterval(refreshClock, 500);
      refreshClock();
      // Do not require the buyer to press "Paid" for the verified bank event
      // to appear. This endpoint is read-only; it never marks an invoice paid.
      const queueInvoicePoll = () => {
        if (!active(version) || !within('#p2p-clock')) return;
        clearTimeout(polling);
        polling = setTimeout(async () => {
          if (!active(version) || refreshing === version) return;
          refreshing = version;
          try {
            if (document.visibilityState !== 'hidden') {
              const current = await ui.api(`invoice/${invoice.id}/status`, null, 'GET');
              if (!active(version)) return;
              invoice = current;
              if (current.status !== 'pending' || current.checkedAt) {
                deadline = 0;
                renderCheck();
                return;
              }
            }
          } catch {
            // A temporary network failure must not claim payment success.
          } finally {
            if (refreshing === version) refreshing = undefined;
            if (active(version)) queueInvoicePoll();
          }
        }, 5000);
      };
      queueInvoicePoll();
    }

    function renderCancel() {
      const version = show(`<div class="p2p-check"><h3>${e(t('cancelTitle'))}</h3>
        <p class="p2p-muted">${e(t('cancelNote'))}</p></div>
        <p class="p2p-feedback" role="status"></p>
        <button type="button" class="p2p-action" id="p2p-cancel-yes">${e(t('cancelConfirm'))}</button>
        <button type="button" class="secondary" id="p2p-cancel-back">${e(t('cancelBack'))}</button>`);
      const yes = within('#p2p-cancel-yes');
      yes.onclick = async () => {
        if (yes.disabled) return;
        yes.disabled = true;
        try {
          const result = await ui.api(`invoice/${invoice.id}/cancel`, {});
          if (!active(version)) return;
          invoice = result;
          key = null;
          if (options) options.active = null;
          ui.sync();
          renderCheck();
        } catch (error) {
          if (active(version)) {
            yes.disabled = false;
            within('.p2p-feedback').textContent = t('cancelDenied');
          }
        }
      };
      within('#p2p-cancel-back').onclick = renderInvoice;
    }

    async function startCheck(version) {
      const button = within('#p2p-paid') || within('#p2p-retry');
      if (button) button.disabled = true;
      try {
        const result = await ui.api(`invoice/${invoice.id}/check`, {});
        if (!active(version)) return;
        invoice = result;
        deadline = 0;
        renderCheck();
      } catch (error) {
        if (active(version)) {
          if (button) button.disabled = false;
          warning(error);
        }
      }
    }

    function renderCheck() {
      if (!deadline && invoice.checkedAt) {
        deadline = Date.now() + Math.max(0, invoice.checkedAt + 60 - invoice.serverTime) * 1000;
      }
      const order = invoice.purpose === 'order';
      const paid = invoice.status === 'paid';
      const running = invoice.status === 'pending' && deadline > Date.now();
      const manual = invoice.status === 'manual_check';
      if (paid) {
        if (!order && options) options.balance = invoice.balance ?? options.balance;
        ui.sync();
      }
      const heading = paid ? (order ? 'orderPaid' : 'paid')
        : invoice.status === 'cancelled' ? 'cancelled'
        : invoice.status === 'rejected' ? 'rejected' : manual ? 'manualReview'
          : invoice.status === 'expired' ? 'expired' : running ? 'checking' : 'absent';
      const reference = order && invoice.orderId
        ? t('order') + ' #' + invoice.orderId : '#' + invoice.id;
      const detail = paid && !order ? money(invoice.balance ?? options?.balance ?? 0)
        : manual ? t('manualWait') : running ? t(invoice.verificationMode === 'automatic' ? 'checkingAuto' : 'checkingNote')
          : invoice.status === 'pending' ? t(invoice.verificationMode === 'automatic' ? 'waitingAuto' : 'waiting') : reference;
      const backLabel = order ? (paid ? 'toOrders' : 'back')
        : ['pending', 'manual_check'].includes(invoice.status) ? 'back' : 'new';
      const version = show(`
        <div class="p2p-check">${running ? '<div class="p2p-ring" aria-hidden="true"><time>60</time></div>' : ''}
          <h3>${e(t(heading))}</h3>
          <p class="p2p-muted">${e(detail)}</p>
        </div>
        <p class="p2p-feedback" role="status"></p>
        ${['pending','expired'].includes(invoice.status) && !running ?
          `<button type="button" class="p2p-action" id="p2p-retry">${e(t('retry'))}</button>` : ''}
        <button type="button" class="secondary" id="p2p-return">${e(t(backLabel))}</button>`,
      invoice.method.toUpperCase());
      const retry = within('#p2p-retry');
      if (retry) retry.onclick = () => invoice.checkedAt ? refresh(version) : startCheck(version);
      within('#p2p-return').onclick = order && paid ? ui.orders
        : order || ['pending', 'manual_check'].includes(invoice.status) ? returnTo : open;
      if (running) {
        const ring = within('.p2p-ring');
        const draw = () => {
          const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          ring.style.setProperty('--angle', seconds * 6 + 'deg');
          ring.querySelector('time').textContent = String(seconds);
        };
        tick = setInterval(draw, 250);
        draw();
      }
      queuePoll(version);
    }

    function queuePoll(version) {
      if (!active(version)) return;
      const checking = invoice.checkedAt && (invoice.status === 'manual_check' || invoice.status === 'pending' ||
        (invoice.status === 'expired' && invoice.serverTime < invoice.expiresAt + 120));
      if (!checking) return;
      clearTimeout(polling);
      const untilReview = deadline - Date.now();
      polling = setTimeout(() => refresh(version), untilReview > 0 ? Math.min(3000, untilReview) : 5000);
    }

    async function refresh(version) {
      if (!active(version) || refreshing === version) return;
      refreshing = version;
      clearTimeout(polling);
      try {
        const result = await ui.api(`invoice/${invoice.id}/status`, null, 'GET');
        if (!active(version)) return;
        const checking = result.status === 'pending' && deadline > Date.now();
        const unchanged = invoice.status === result.status && invoice.checkedAt === result.checkedAt &&
          Boolean(within('.p2p-ring')) === checking;
        invoice = result;
        if (!unchanged) renderCheck();
      } catch (error) {
        if (!active(version)) return;
        warning(error);
      } finally {
        if (refreshing === version) refreshing = undefined;
        if (active(version)) queuePoll(version);
      }
    }

    function showLoading() {
      const version = show(`<p class="p2p-loading" role="status">${e(t('loading'))}</p>
        <p class="p2p-feedback" role="status"></p>
        <button type="button" class="secondary" id="p2p-load-back">${e(t('back'))}</button>`);
      within('#p2p-load-back').onclick = returnTo;
      return version;
    }

    async function resume(id, back) {
      returnTo = back;
      const version = showLoading();
      try {
        const result = await ui.api(`invoice/${id}/status`, null, 'GET');
        if (!active(version)) return;
        invoice = result;
        deadline = 0;
        renderInvoice();
      } catch (error) {
        if (active(version)) warning(error);
      }
    }

    async function open(preferredMethod) {
      returnTo = ui.back;
      const version = showLoading();
      try {
        options = await ui.api('invoice/options', {});
        if (!active(version)) return;
        invoice = options.active;
        deadline = 0;
        method = options.methods.includes(preferredMethod) ? preferredMethod
          : options.methods.includes(method) ? method : options.methods[0] || '';
        if (invoice && !invoice.checkedAt) renderInvoice();
        else if (invoice) renderCheck();
        else {
          key = null;
          renderForm();
        }
      } catch (error) {
        if (active(version)) warning(error);
      }
    }

    async function start(selectedAmount, selectedMethod, back) {
      returnTo = typeof back === 'function' ? back : ui.back;
      const version = showLoading();
      try {
        options = await ui.api('invoice/options', {});
        if (!active(version)) return;
        if (!options.methods.includes(selectedMethod)) throw new Error('p2p_method_unavailable');
        if (!Number.isSafeInteger(selectedAmount) || selectedAmount < options.minAmount || selectedAmount > options.maxAmount)
          throw new Error('p2p_amount_unavailable');
        method = selectedMethod;
        amount = String(selectedAmount);
        if (options.active) {
          invoice = options.active;
        } else {
          const nonce = ui.requestKey();
          invoice = await ui.api('invoice', {amount, method, requestId:nonce, lang:ui.lang()});
        }
        if (!active(version)) return;
        deadline = 0;
        renderInvoice();
      } catch (error) {
        if (active(version)) {
          warning(error);
          const retry = within('#p2p-load-back');
          if (retry) retry.textContent = t('back');
        }
      }
    }

    return { open, resume, start, stop };
  };
})();
