#!/usr/bin/env python3
"""V8: administrator late-bank notice context and compact 2-tab history.
This patch deliberately does not change paid settlement, fees, invoices, reservations or catalog.
"""
from pathlib import Path
import re, json, sqlite3

base = Path(".")
p2p_file = base / "src/p2p.mjs"
app_file = base / "public/app.js"
html_file = base / "public/index.html"
config_file = base / "wrangler.production.jsonc"

p2p = p2p_file.read_text()
app = app_file.read_text()
html = html_file.read_text()

late_sql = """
SELECT i.id, i.user_id, i.order_payment_id, i.payment_method, i.card_number,
       p.order_id, p.donat_order_id, COALESCE(i.cancelled_at, i.expires_at) AS closed_at
FROM invoices i
LEFT JOIN payments p ON p.id = i.order_payment_id
WHERE i.card_id = ? AND i.unique_amount = ?
  AND i.status IN ('expired','rejected')
  AND ? >= COALESCE(i.cancelled_at, i.expires_at)
  AND ? < COALESCE(i.cancelled_at, i.expires_at) + 600
  AND ? >= i.created_at - 59
  AND ? < COALESCE(i.cancelled_at, i.expires_at) + 600
ORDER BY i.id DESC LIMIT 5
"""

# Prove the same candidate-query predicate works, avoids stale invoices and
# does not treat a bank event as confirmed payment.
db=sqlite3.connect(":memory:")
db.execute("CREATE TABLE invoices (id INTEGER, user_id INTEGER, order_payment_id INTEGER, card_id TEXT, unique_amount INTEGER, status TEXT, created_at INTEGER, expires_at INTEGER, cancelled_at INTEGER, payment_method TEXT, card_number TEXT)")
db.execute("CREATE TABLE payments (id INTEGER, order_id INTEGER, donat_order_id INTEGER)")
db.execute("INSERT INTO payments VALUES (1,NULL,27)")
db.execute("INSERT INTO invoices VALUES (101,777,1,'u1',11990,'expired',1000,1420,NULL,'uzcard','2058')")
db.execute("INSERT INTO invoices VALUES (102,778,NULL,'u1',11990,'paid',900,1390,NULL,'uzcard','2058')")
def late_candidates(received,occurred,amount=11990):
    return db.execute(late_sql,("u1",amount,received,received,occurred,occurred)).fetchall()
assert len(late_candidates(1460,1400))==1
assert not late_candidates(2050,1400)
assert not late_candidates(1460,1400,12000)
assert not late_candidates(1460,700)

# One alert per bank event/admin is already guaranteed by p2p_review_alerts.
# A late event is never auto-linked to an expired/cancelled order.
head = p2p.index("async function alertP2pDisputes(store, env)")
unmatched_start = p2p.index("  const unmatched = await store.all(", head)
unmatched_end = p2p.index(";\n  for (const record of [", unmatched_start) + 1
current_unmatched = p2p[unmatched_start:unmatched_end]
assert "WHERE incoming.invoice_id IS NULL" in current_unmatched
assert "ORDER BY incoming.id DESC LIMIT 10" in current_unmatched
assert "incoming.received_at" in current_unmatched
enriched = """
  // Late bank notifications are linked to possible recently closed orders
  // ONLY in the admin message. They are not settlement evidence by themselves.
  for (const incoming of unmatched) {
    incoming.lateCandidates = await store.all(
      %s,
      incoming.card_id, incoming.amount, incoming.received_at, incoming.received_at,
      incoming.occurred_at, incoming.occurred_at);
  }
""" % json.dumps(late_sql,ensure_ascii=False)
p2p = p2p[:unmatched_end] + enriched + p2p[unmatched_end:]

start = p2p.index("      : " + chr(96) + "⚠️ <b>НЕОПОЗНАННЫЙ ПЕРЕВОД", head)
end = p2p.index("    for (const admin of admins) {", start)
assert "Нет однозначного соответствия" in p2p[start:end]
p2p = p2p[:start] + "      : formatUnmatchedAlert(record);\n" + p2p[end:]

helper = r"""
// Unmatched bank transfers that arrive <=10min after closure are surfaced to
// the admin alongside plausible orders. No guessing and no automatic credit.
function formatUnmatchedAlert(record) {
  const candidates = record.lateCandidates || [];
  const amount = formatAmount(record.amount);
  const method = safeHtml(record.source);
  const card = safeHtml(record.card_id);
  if (candidates.length) {
    const possibilities = candidates.map(row => {
      const name = row.donat_order_id != null ? 'DONAT #' + row.donat_order_id
        : row.order_id != null ? 'BOOST #' + row.order_id : 'Счёт #' + row.id;
      const afterMinutes = Math.max(0, Math.ceil((record.received_at - row.closed_at) / 60));
      return '• ' + safeHtml(name) + ' · invoice #' + row.id +
        ' · <a href="tg://user?id=' + row.user_id + '">Клиент</a>' +
        ' · ' + afterMinutes + ' мин после закрытия';
    }).join('\n');
    return '⏰ <b>ПОЗДНИЙ БАНКОВСКИЙ ПЕРЕВОД · событие #' + record.id + '</b>\n\n' +
      '💰 <b>' + amount + ' UZS</b>\n' +
      '💳 Карта: <code>' + card + '</code> · ' + method + '\n\n' +
      '<b>Возможные закрытые заявки:</b>\n' + possibilities + '\n\n' +
      'Поступление замечено в течение 10 минут после закрытия. ' +
      '<b>Сверьте сумму, время и отправителя в банке.</b> ' +
      'Нельзя автоматически зачислять или выполнять заказ только по совпадению суммы.';
  }
  return '⚠️ <b>НЕОПОЗНАННЫЙ ПЕРЕВОД · #' + record.id + '</b>\n\n' +
    '💰 <b>' + amount + ' UZS</b>\n' +
    '💳 Карта: <code>' + card + '</code>\n' +
    'Источник: ' + method + '\n\n' +
    'Нет однозначного соответствия заказу. Нужна банковская сверка.';
}

"""
anchor = "// Only a bank event can settle a payment. Dispute alerts never credit a wallet.\n"
assert p2p.count(anchor) == 1
p2p=p2p.replace(anchor,helper+anchor)

old_btn = """        if(record.kind==='invoice') {
          buttons.push([{text:'💬 Написать клиенту',callback_data:\x60support:contact:\x24{record.user_id}\x60}]);
        }
"""
# Source action is untouched for invoices; add a safe customer link for
# ONE possible late order only.
button_anchor = "        await adminBankNotice(env,admin,text,buttons);"
assert p2p.count(button_anchor) == 1
p2p = p2p.replace(button_anchor,
    """        if(record.kind === 'incoming' && record.lateCandidates?.length === 1) {
          buttons.push([{text:'💬 Написать клиенту',
            callback_data:'support:contact:' + record.lateCandidates[0].user_id}]);
        }
""" + button_anchor)

assert p2p.count("formatUnmatchedAlert(record)") == 2
assert "incoming.occurred_at, incoming.occurred_at" in p2p
p2p_file.write_text(p2p)

# Keep only two top-level tabs, no nested status-category chips.
a = html.index('      <div class="filters history-filters" id="filters"')
b = html.index('      <div id="history-content"', a)
assert "data-history-filter" in html[a:b] and "aria-label" in html[a:b]
html = html[:a] + html[b:]
assert 'data-history="orders"' in html and 'data-history="payments"' in html
assert 'data-history-filter' not in html

a=app.index("  function renderHistory()")
b=app.index("    const counts = { all:allEntries.length",a)
c=app.index("    all('[data-history]').forEach(button => {",b)
assert "button.dataset.historyFilter" in app[b:c]
app=app[:b]+app[c:]
before="    const entries=state.filter==='all' ? allEntries : allEntries.filter(item=>group(item)===state.filter);"
assert app.count(before)==1
app=app.replace(before,"    const entries=allEntries;")
oldstatus="""      const status=item.kind==='boost'&&item.status==='paid'
        ? t('historyOrderPaidWaiting') : statusName(item.status);"""
assert app.count(oldstatus)==1
newstatus="""      const status=item.status==='expired'
        ? (state.lang==='ru'?'Время оплаты истекло':'To‘lov muddati tugagan')
        : item.status==='cancelled'
          ? (state.lang==='ru'?'Отменено':'Bekor qilingan')
          : item.kind==='boost'&&item.status==='paid'
            ? t('historyOrderPaidWaiting') : statusName(item.status);"""
app=app.replace(oldstatus,newstatus)
assert "const entries=allEntries;" in app
assert "const filters = $('#filters')" not in app
assert "function openHistoryEntry(" in app
app_file.write_text(app)

# Bust Telegram's cached Mini App HTML/JS; do not change catalog assets.
matches=re.findall(r'src="(app\.js(?:\?[^"]*)?)"',html)
assert len(matches)==1, matches
oldjs=matches[0]
newjs=oldjs.split("?")[0]+'?v=20261120-history-v8'
html=html.replace('src="'+oldjs+'"','src="'+newjs+'"')
html_file.write_text(html)
config=json.loads(config_file.read_text())
live=config['vars']['MINIAPP_URL']
assert live.startswith("https://arslan-boost-bot.zenin7210.workers.dev"),live
config['vars']['MINIAPP_URL']=live.split('?')[0]+'?v=20261120-history-v8'
config_file.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')

print("PASS V8: late bank events within 600s show possible closed orders to admins")
print("PASS V8: no automatic settling of expired invoices, existing event dedup retained")
print("PASS V8: history only has Buyurtmalar / To‘lovlar, no status chips")
print("PASS V8: checkout and catalog code preserved, Mini App cache key refreshed")
