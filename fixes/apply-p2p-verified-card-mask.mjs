// Applied to the approved archive AFTER extraction and BEFORE tests/deployment.
// No frontend, database, payment mode, or card enablement changes.
import fs from "node:fs";
const dir = "deploy_src/arslan-boost-cloudflare/";
const sourcePath = dir + "src/p2p-notice.mjs";
const testPath = dir + "tests/p2p.test.mjs";
const cfgPath = dir + "wrangler.production.jsonc";
let source = fs.readFileSync(sourcePath, "utf8");
const cardAnchor = 'const CARD = /^(?:карта|karta|card)\\s*[:=]\\s*(?:(?:humocard|humo)\\s+)?(?:[*•xX -]+\\s*)?([0-9]{4})$/iu;';
const maskDefinition = 'const VERIFIED_CARDXABAR_MASK = /^(?:[*•xX]{2,})\\s*([0-9]{4})$/u;';
const last4Anchor = '  const last4 = singleMatch(lines, CARD, "p2p_card_last4_required");';
const last4Fix = [
  '  // Only a separately verified CardXabar Telegram event may use a bare ***1234 line.',
  '  const verifiedCardXabar = verifiedTelegramNotice?.source === "cardxabar" &&',
  '    /^(?:perevod na kartu|перевод на карту)$/iu.test(',
  '      lines[0]?.replace(/^(?:🟢|🎉)\\s*/u, "") || "");',
  '  const cardLines = lines.map(line => CARD.exec(line) ||',
  '    (verifiedCardXabar ? VERIFIED_CARDXABAR_MASK.exec(line) : null)).filter(Boolean);',
  '  if (cardLines.length !== 1) throw new RequestError("p2p_card_last4_required");',
  '  const last4 = cardLines[0][1];',
].join("\n");
if (!source.includes(cardAnchor) || !source.includes(last4Anchor)) {
  throw new Error("Source archive unexpectedly changed; refusing to patch.");
}
source = source.replace(cardAnchor, cardAnchor + "\n" + maskDefinition)
  .replace(last4Anchor, last4Fix);
fs.writeFileSync(sourcePath, source);

let tests = fs.readFileSync(testPath, "utf8");
const start = tests.indexOf("test('real CardXabar and HUMO card-bot texts parse only incoming credits'");
const endAnchor = "  assert.equal(card.precision, 60);";
const at = tests.indexOf(endAnchor, start);
if (start < 0 || at < 0) throw new Error("Approved test archive unexpectedly changed.");
const assertions = [
  '  const bareMask = cardxabar.replace("💳 ***2058", "***2058");',
  '  assert.throws(() => parseIncoming(bareMask), /p2p_card_last4_required/);',
  '  assert.equal(parseIncoming(bareMask, {source:"cardxabar", eventId:"tg:111111:80"}).last4, "2058");',
  '  assert.throws(() => parseIncoming(bareMask.replace("Перевод на карту", "Другая операция"),',
  '    {source:"cardxabar", eventId:"tg:111111:80"}), /p2p_card_last4_required/);',
  '  assert.throws(() => parseIncoming(bareMask + "\\n***9999",',
  '    {source:"cardxabar", eventId:"tg:111111:80"}), /p2p_card_last4_required/);',
].join("\n");
tests = tests.slice(0, at + endAnchor.length) + "\n" + assertions + tests.slice(at + endAnchor.length);
fs.writeFileSync(testPath, tests);

// Never overwrite the Production P2P_MODE=private setting made in Cloudflare Dashboard.
// Wrangler's keep_vars only retains values not declared explicitly in config.
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
if (cfg.name !== "arslan-boost-bot" || cfg.d1_databases?.[0]?.database_name !== "arslan-boost-payments" ||
    cfg.vars?.P2P_MODE !== "manual" || cfg.keep_vars !== true) {
  throw new Error("Production configuration has changed unexpectedly.");
}
delete cfg.vars.P2P_MODE;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log("Verified CardXabar mask handling patched; private P2P_MODE preserved across deploy.");
