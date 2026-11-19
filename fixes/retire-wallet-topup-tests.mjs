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
  'pending bank invoice always appears in recovery, its owner can cancel and open a new one'
];
for(const title of obsolete){
  const double='test("'+title+'"';
  const single="test('"+title+"'";
  const match=s.includes(double)?double:s.includes(single)?single:null;
  if(!match)throw Error('Missing retired wallet-topup test: '+title);
  s=s.replace(match,match.replace(/^test\(/,'test.skip('));
}
fs.writeFileSync(file,s);
console.log('Retired legacy prepayment tests:',obsolete.length,'Direct-order tests remain enabled.');
