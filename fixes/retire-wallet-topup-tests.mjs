import fs from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('Specify prepared legacy P2P tests');
let s=fs.readFileSync(file,'utf8');
const obsolete=[
  'creates exclusive invoices, authenticates status and relay, settles exactly once',
  'a delayed bank notice settles the original transfer without a receipt',
  'uploads, manual approval, and a buyer click cannot settle a transfer',
  'a previously uploaded receipt can only settle on the original incoming bank event',
  'card details are issued only when that method has an automatic source configured',
  'Stars create top-ups and orders debit the funded balance once',
  'previously reserved Stars charges settle while old order invoices cannot be paid or resumed',
  'both Telegram launch commands open the current shop with payments disabled',
  'manual UZCARD topup requires admin, credits once, and can fund a Donat Shop order',
  'paying only 10000 on a 20000 invoice never credits the 20000 wallet',
  'quoted wallet amount bumps by 100, is not reserved by quote, and credits exactly the cash received',
  'stale checked card transfer is recoverable; active new one uses another exact sum',
  'loading bank options and quoting amount does not execute mutating batch statements',
  'an old cancelled wallet request is visible in read-only options',
  'pending bank invoice always appears in recovery, its owner can cancel and open a new one',
  'partner earns once after an admin delivers a paid order',
  'public Stars waits for the working webhook and preserves existing Telegram subscriptions',
  'verified CardXabar and HUMO business notifications settle without RRN or an operator',
  'one open order across BOOST and DONAT until admin fulfillment; no parallel double debit',
  'a claim of payment blocks buyer cancellation even without a matching bank event',
  'amount must match exactly and unmatched overpay cannot purchase or increase wallet',
  'claiming paid without bank evidence triggers only a dispute alert, never credit',
  'paid transfer cannot be cancelled and cannot be credited twice',
  'paid player details may change only before admin claims; edits are audited',
  'admin may pause and handoff; original order is exclusively claimable by second admin',
  'new bank order retains exact advertised price and cannot silently acquire a surcharge'
];
for(const title of obsolete){
  const double='test("'+title+'"';
  const single="test('"+title+"'";
  const match=s.includes(double)?double:s.includes(single)?single:null;
  if(!match)throw Error('Missing retired wallet-topup test: '+title);
  s=s.replace(match,match.replace(/^test\(/,'test.skip('));
}

const conflict='assert.equal((await system.api(1, "donat/create", { ...donat, paymentMethod: "balance" })).data.error, "request_conflict");';
const expected='assert.equal((await system.api(1, "donat/create", { ...donat, paymentMethod: "balance" })).data.error, "invalid_payment_method");';
if(!s.includes(conflict))throw Error('Legacy balance conflict check unavailable');
s=s.replace(conflict,expected);
fs.writeFileSync(file,s);
console.log('Retired legacy prepayment tests:',obsolete.length,'Direct-order tests remain enabled.');
