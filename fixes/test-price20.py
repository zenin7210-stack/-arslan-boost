from pathlib import Path
import sys
r=Path(sys.argv[1] if len(sys.argv)>1 else 'release')
p=r/'tests/p2p.test.mjs'
t=p.read_text()
def one(a,b):
 global t
 if t.count(a)!=1:raise Exception('test anchor count '+str(t.count(a))+': '+a[:70])
 t=t.replace(a,b,1)
one('''  const secondBuyer = await system.api(2, "donat/create", donat); assert.equal(secondBuyer.status, 200); assert.equal((await system.api(2, "invoice/"+secondBuyer.data.invoiceId+"/status",null,"GET")).data.uniqueAmount, 22090);
  assert.equal((await system.api(2, "donat/state")).data.orders.length, 1);''',
'''  const secondBuyer = await system.api(2, "donat/create", donat);
  assert.deepEqual([secondBuyer.status,secondBuyer.data.error],[409,"p2p_amount_unavailable"]);
  assert.equal((await system.api(2, "donat/state")).data.orders.length, 0);''')
start=t.index("test('a busy bank amount selects +100 for the next customer")
end=t.index("test('new orders never reserve below listed price",start)
t=t[:start]+'''test('two buyers see the same fixed price; occupied amount never adds 100',async()=>{
  const sys=app();
  const data={product:'spin_coins',option:'100',detail:'123456',expectedAmount:21990,
    paymentMethod:'uzcard'};
  const one=await sys.api(1,'donat/create',{...data,requestId:'fixed-first'});
  assert.equal(one.status,200);
  assert.equal(sys.db.prepare('SELECT unique_amount FROM invoices WHERE id=?')
    .get(one.data.invoiceId).unique_amount,21990);
  const two=await sys.api(2,'donat/create',{...data,requestId:'fixed-second'});
  assert.deepEqual([two.status,two.data.error],[409,'p2p_amount_unavailable']);
  assert.equal(sys.db.prepare('SELECT COUNT(*) n FROM invoices').get().n,1);
  const paid=await sys.relay({sender:'BankDemo',text:notification(21990,'BANKFIXEDFIRST')});
  assert.equal(paid.data.matched,true);
  assert.equal((await sys.api(1,'invoice/'+one.data.invoiceId+'/status',null,'GET')).data.status,'paid');
  assert.equal((await sys.api(1,'state')).data.balance,0);
});
''' +t[end:]
one('''  const replacement=await system.api(1,'donat/create',{...payload,requestId:'order-after-blocked'});
  assert.equal(replacement.status,200);
  const invoice=system.db.prepare('SELECT * FROM invoices WHERE id=?').get(replacement.data.invoiceId);
  assert.ok(invoice.unique_amount>=21990);''',
'''  const hold=await system.api(1,'donat/create',{...payload,requestId:'order-after-blocked'});
  assert.deepEqual([hold.status,hold.data.error],[409,'p2p_amount_unavailable']);
  system.db.prepare('UPDATE invoices SET created_at=created_at-1201,expires_at=expires_at-1201 WHERE id=?')
    .run(old.data.invoiceId);
  const replacement=await system.api(1,'donat/create',{...payload,requestId:'order-after-blocked'});
  assert.equal(replacement.status,200,JSON.stringify(replacement.data));
  const invoice=system.db.prepare('SELECT * FROM invoices WHERE id=?').get(replacement.data.invoiceId);
  assert.equal(invoice.unique_amount,21990);
  assert.equal((await system.api(1,'invoice/'+invoice.id+'/status',null,'GET')).data.reviewReason,'reused_amount');''')
one('''  const retry=await system.api(1,'donat/create',{...base,requestId:'second-bank-intent'});
  assert.equal(retry.status,200,JSON.stringify(retry.data));
  assert.notEqual(retry.data.invoiceId,first.data.invoiceId);''',
'''  const held=await system.api(1,'donat/create',{...base,requestId:'second-bank-intent'});
  assert.deepEqual([held.status,held.data.error],[409,'p2p_amount_unavailable']);
  system.db.prepare('UPDATE invoices SET created_at=created_at-1201,expires_at=expires_at-1201 WHERE id=?')
    .run(first.data.invoiceId);
  const retry=await system.api(1,'donat/create',{...base,requestId:'second-bank-intent'});
  assert.equal(retry.status,200,JSON.stringify(retry.data));
  assert.notEqual(retry.data.invoiceId,first.data.invoiceId);''')
one("assert.ok(invoice.unique_amount>=11990);","assert.equal(invoice.unique_amount,11990);")
t+='''

test('20 minute quarantine releases an unpaid invoice but recycled amount never auto-credits an unknown payer',async()=>{
  const sys=app();
  const data={product:'gold_rinok',quantity:100,detail:'',expectedAmount:11990,paymentMethod:'uzcard'};
  const first=await sys.api(1,'donat/create',{...data,requestId:'reuse20-a'});
  assert.equal(first.status,200);
  const firstId=first.data.invoiceId;
  assert.equal(sys.db.prepare('SELECT expires_at-created_at AS seconds FROM invoices WHERE id=?').get(firstId).seconds,600);
  sys.db.prepare('UPDATE invoices SET created_at=created_at-1199,expires_at=expires_at-1199 WHERE id=?').run(firstId);
  const held=await sys.api(2,'donat/create',{...data,requestId:'reuse20-b'});
  assert.equal(held.status,409);
  sys.db.prepare('UPDATE invoices SET created_at=created_at-2,expires_at=expires_at-2 WHERE id=?').run(firstId);
  const second=await sys.api(2,'donat/create',{...data,requestId:'reuse20-b'});
  assert.equal(second.status,200,JSON.stringify(second.data));
  const invoice=sys.db.prepare('SELECT * FROM invoices WHERE id=?').get(second.data.invoiceId);
  assert.equal(invoice.unique_amount,11990);
  const checked=(await sys.api(2,'invoice/'+invoice.id+'/status',null,'GET')).data;
  assert.equal(checked.reviewReason,'reused_amount');
  assert.equal(checked.verificationMode,'manual');
  const late=await sys.relay({sender:'BankDemo',eventId:'sms:reused200',
    text:notification(11990,'BANKREUSED200')});
  assert.equal(late.status,200);
  assert.equal(late.data.matched,false);
  assert.equal(sys.db.prepare('SELECT invoice_id FROM p2p_incoming WHERE source_event_id=?')
    .get('sms:reused200').invoice_id,null);
  assert.equal((await sys.api(2,'donat/state')).data.orders[0].status,'pending');
});

test('checked invoice is closed after twenty minutes without false credit',async()=>{
  const sys=app();
  const data={product:'gold_rinok',quantity:100,detail:'',expectedAmount:11990,paymentMethod:'uzcard'};
  const placed=await sys.api(1,'donat/create',{...data,requestId:'checked20-a'});
  assert.equal(placed.status,200);
  const invoiceId=placed.data.invoiceId;
  const marked=await sys.api(1,'invoice/'+invoiceId+'/check',{});
  assert.equal(marked.status,200);
  sys.db.prepare('UPDATE invoices SET created_at=created_at-1201,expires_at=expires_at-1201,checked_at=checked_at-1201 WHERE id=?')
    .run(invoiceId);
  const second=await sys.api(2,'donat/create',{...data,requestId:'checked20-b'});
  assert.equal(second.status,200,JSON.stringify(second.data));
  assert.equal(sys.db.prepare('SELECT status FROM invoices WHERE id=?').get(invoiceId).status,'expired');
  assert.equal(sys.db.prepare('SELECT status FROM payments WHERE id=(SELECT order_payment_id FROM invoices WHERE id=?)')
    .get(invoiceId).status,'cancelled');
  assert.equal((await sys.api(1,'state')).data.balance,0);
});
'''
p.write_text(t)
p=r/'tests/approved-ui.test.mjs';u=p.read_text()
start=u.index("test('Order exact amount allocation tries +100 steps")
end=u.index("\n});",start)+4
u=u[:start]+'''test('No transfer surcharge, twenty-minute quarantine and 24h bank notice audit',()=>{
  assert.match(p2p,/const TRANSFER_STEPS = \[0\]/);
  assert.match(p2p,/const HOLD_SECONDS = 20 \* 60/);
  assert.match(p2p,/BANK_LOOKBACK_SECONDS = 24 \* 60 \* 60/);
  assert.match(p2p,/REUSE_REVIEW_SECONDS = 24 \* 60 \* 60/);
  assert.match(p2p,/json_each/);
  assert.match(store,/requested_amount = \?\)/);
});'''+u[end:]
p.write_text(u)
print('Updated obsolete surcharge tests and added fraud/expiry regressions')
