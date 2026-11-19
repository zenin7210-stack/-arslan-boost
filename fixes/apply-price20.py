from pathlib import Path
import sys
r=Path(sys.argv[1] if len(sys.argv)>1 else 'release')
def one(file,a,b):
 p=r/file; t=p.read_text(); n=t.count(a)
 if n!=1: raise Exception(f'{file}: anchor {n}: {a[:50]}')
 p.write_text(t.replace(a,b,1))
def two(file,a,b):
 p=r/file; t=p.read_text()
 if t.count(a)!=2: raise Exception(file+': two anchors missing')
 p.write_text(t.replace(a,b))
one('src/p2p.mjs','const HOLD_SECONDS = 86400;',"""// Displayed payment is valid for 10 minutes, with 10 more minutes to
// quarantine the amount. Older bank notices remain eligible for audit.
const HOLD_SECONDS = 20 * 60;
const BANK_LOOKBACK_SECONDS = 24 * 60 * 60;
const REUSE_REVIEW_SECONDS = 24 * 60 * 60;""")
two('src/p2p.mjs','at - 1200, Number(closeReviewed)),','at - 600, Number(closeReviewed)),')
one('src/p2p.mjs','const TRANSFER_STEPS = [0,100,200,300,400,500,600,700,800,900];',
    'const TRANSFER_STEPS = [0]; // Never raise the advertised price')
one('src/p2p.mjs',"WHERE unique_amount = ? + steps.value AND status = 'pending')",
    "WHERE unique_amount = ? + steps.value AND status = 'pending' AND created_at > ?)")
one('src/p2p.mjs',"AND (expires_at > ? OR (status <> 'paid' AND created_at >= ?)))",
    "AND created_at > ?)")
one('src/p2p.mjs','params: [amount, cardJson, amount, MAX_AMOUNT, amount, amount, time, time - HOLD_SECONDS]',
    'params: [amount, cardJson, amount, MAX_AMOUNT, amount, time - HOLD_SECONDS, amount, time - HOLD_SECONDS]')
one('src/p2p.mjs','notice.occurredAt < received - HOLD_SECONDS',
    'notice.occurredAt < received - BANK_LOOKBACK_SECONDS')
one('src/p2p.mjs','AND NOT EXISTS (SELECT 1 FROM invoices paid WHERE paid.card_id = ? AND paid.paid_ref = ?))',
    """AND NOT EXISTS (SELECT 1 FROM invoices paid WHERE paid.card_id = ? AND paid.paid_ref = ?)
         AND NOT EXISTS (SELECT 1 FROM invoices previous
           WHERE previous.card_id = invoices.card_id
             AND previous.unique_amount = invoices.unique_amount
             AND previous.created_at < invoices.created_at
             AND previous.created_at >= invoices.created_at - ?))""")
one('src/p2p.mjs','minimum, maximum, card.id, notice.bankRef);',
    'minimum, maximum, card.id, notice.bankRef, REUSE_REVIEW_SECONDS);')
one('src/p2p.mjs',"""async function invoiceState(store, env, row) {
  const invoice = publicInvoice(env, row);""",
"""async function invoiceState(store, env, row) {
  const invoice = publicInvoice(env, row);
  if (env.P2P_MODE === 'private') {
    const prior = await store.first(
      "SELECT id FROM invoices WHERE card_id=? AND unique_amount=? AND created_at<? AND created_at>=? LIMIT 1",
      row.card_id, row.unique_amount, row.created_at, row.created_at-REUSE_REVIEW_SECONDS);
    if (prior) {
      invoice.verificationMode = 'manual';
      invoice.reviewReason = 'reused_amount';
    }
  }""")
one('src/p2p.mjs','active: current ? publicInvoice(env, current) : null',
    'active: current ? await invoiceState(store, env, current) : null')
one('src/p2p.mjs',"""methods, active: active ? publicInvoice(env, active) : null,
        latest: latest ? publicInvoice(env, latest) : null""",
"""methods, active: active ? await invoiceState(store, env, active) : null,
        latest: latest ? await invoiceState(store, env, latest) : null""")
one('public/app.js',"transferBusy:'Сейчас эту сумму нельзя зарезервировать. Повторите позже.'",
    "transferBusy:'Цена фиксирована. Сумма временно занята (до 20 минут). Попробуйте позже или выберите другой способ оплаты.'")
one('public/app.js',"transferBusy:'Bu summani hozir band qilib bo‘lmaydi. Keyinroq urinib ko‘ring.'",
    "transferBusy:'Narx o‘zgarmaydi. Summa vaqtincha band (20 daqiqagacha). Boshqa usulni tanlang yoki keyinroq urinib ko‘ring.'")
one('public/assets/p2p.js',"amountUnavailable: 'Эта сумма сейчас занята. Выберите другую сумму или повторите позже.'",
    "amountUnavailable: 'Цена фиксирована. Эта сумма занята (до 20 минут). Выберите другой способ оплаты или повторите позже.'")
one('public/assets/p2p.js',"amountUnavailable: 'Bu summa hozir band. Boshqa summani tanlang yoki keyinroq urinib ko‘ring.'",
    "amountUnavailable: 'Narx o‘zgarmaydi. Summa 20 daqiqagacha band. Boshqa usulni tanlang yoki keyinroq urinib ko‘ring.'")
one('public/assets/p2p.js',"quoteHint:'Если сумма занята, система предложит ближайшую свободную. Уточните сумму на следующем экране.'",
    "quoteHint:'Точная сумма не повышается. Если она занята, выберите другой способ оплаты или повторите позже.'")
one('public/assets/p2p.js',"quoteHint:'Summa band bo‘lsa, tizim yaqin bo‘sh summani tanlaydi. Aniq summa keyingi oynada tasdiqlanadi.'",
    "quoteHint:'Narx oshmaydi. Summa band bo‘lsa, boshqa usulni tanlang yoki keyinroq urinib ko‘ring.'")
one('public/assets/p2p.js',"errorCode:'Код ошибки', orderTransferDifference:",
    "reusedReview:'Сумма использовалась ранее. Плательщика нельзя определить по сумме; требуется проверка поддержки.', errorCode:'Код ошибки', orderTransferDifference:")
one('public/assets/p2p.js',"errorCode:'Xato kodi', orderTransferDifference:",
    "reusedReview:'Summa oldin ishlatilgan. To‘lovchi faqat summa orqali aniqlanmaydi; tekshiruv kerak.', errorCode:'Xato kodi', orderTransferDifference:")
one('public/assets/p2p.js',"""        ${invoice.purpose==='order' && invoice.baseAmount !== invoice.uniqueAmount""",
"""        ${invoice.reviewReason==='reused_amount' ? '<p class="p2p-muted" role="status">'+e(t('reusedReview'))+'</p>' : ''}
        ${invoice.purpose==='order' && invoice.baseAmount !== invoice.uniqueAmount""")
one('public/index.html','assets/p2p.js?v=20261119-exacts4','assets/p2p.js?v=20261120-exact20min')
one('public/index.html','app.js?v=20261119-multi5','app.js?v=20261120-exact20min')
print('Fixed-price/20-minute patch applied')
