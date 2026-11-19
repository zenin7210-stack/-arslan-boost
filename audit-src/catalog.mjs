import catalog from "../public/assets/donat/catalog.json" with { type: "json" };

export { catalog };
export const PRICES = [0, 3000, 4000, 6000, 9000, 13000, 18000, 25000, 35000, 50000];
export const CALIBRATION_LEGEND_PRICE = 90000;
export const MODE_SURCHARGE = 1000;
export const MIN_BOOST_PRICE = 12000;
export const MAX_AMOUNT = 100000000;
export const MAX_STARS = 100000;
export const RANKS = ["Калибровка", "Bronza", "Silver", "Gold", "Phoenix", "Ranger",
  "Champion", "Master", "Elite", "The Legend"];
export const MODES = new Map([
  ["wing", "Напарники"], ["comp", "Соревновательный"], ["duel", "Дуэль"],
]);

const products = new Map(catalog.items.map(product => [product.id, product]));
const rankAliases = new Map([
  ["Calibration", 0], ["Kalibrovka", 0], ["Kalibrlash", 0], ["Bronze", 1],
  ["Fenix", 4], ["Elita", 8],
  ...RANKS.map((rank, index) => [rank, index]),
]);

export class RequestError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

export function integer(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RequestError("invalid_number");
  }
  return number;
}

export function requestKey(value) {
  const key = value ?? crypto.randomUUID();
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new RequestError("invalid_request");
  }
  return key;
}

export function formatAmount(amount) {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function playerName(value) {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > 32 ||
      /[\p{C}<>\u2028\u2029]/u.test(value.trim())) {
    throw new RequestError("invalid_game_id");
  }
  return value.trim();
}

export function normalizeBoost(data) {
  const from = data.fromIndex ?? rankAliases.get(data.from);
  const to = data.toIndex ?? rankAliases.get(data.to);
  const start = integer(from, 0, PRICES.length - 1);
  const end = integer(to, 0, PRICES.length - 1);
  if (end <= start || !MODES.has(data.mode)) throw new RequestError("invalid_rank");
  const base = start === 0 && end === PRICES.length - 1
    ? CALIBRATION_LEGEND_PRICE
    : PRICES.slice(start + 1, end + 1).reduce((sum, price) => sum + price, 0);
  return {
    current_rank: start, target_rank: end, mode: data.mode,
    game_id: playerName(data.gameId),
    amount: Math.max(base, MIN_BOOST_PRICE) + (data.mode === "wing" ? 0 : MODE_SURCHARGE),
  };
}

export function productTitle(id) {
  return products.get(id)?.title || id;
}

function quantityPrice(options, quantity) {
  const upperIndex = options.findIndex(([size]) => quantity <= Number(size));
  const [upper, , price] = options[upperIndex];
  if (quantity === Number(upper)) return price;
  const [lower, , previous] = options[upperIndex - 1];
  return previous + Math.ceil((quantity - Number(lower)) * (price - previous) /
    (Number(upper) - Number(lower)));
}

export function validatedDonatDetail(productId, value) {
  const item = products.get(productId);
  if (!item) throw new RequestError('invalid_product');
  const detail = typeof value === 'string' ? value.trim() : '';
  if ([...detail].length > 64 || /[\p{C}<>\u2028\u2029]/u.test(detail) ||
      (item.input === 'game_id' && !/^[A-Za-z0-9_#-]{4,40}$/.test(detail)) ||
      (item.input === 'username' && !/^@?[A-Za-z0-9_.]{3,32}$/.test(detail))) {
    throw new RequestError('invalid_detail');
  }
  return detail;
}

export function normalizeDonat(data, existing) {
  const item = products.get(data.product);
  if (!item) throw new RequestError("invalid_product");
  const packs = integer(data.packs ?? 1, 1, item.max_packs ?? 1);
  const isQuantity = item.kind === "quantity";
  const size = isQuantity ? integer(
    data.quantity ?? (item.id === "telegram_stars" ? data.option : undefined),
    item.min, item.max,
  ) : null;
  const selected = String(size ?? data.option ?? "");
  if (item.max_packs && !/^[0-9]+$/.test(selected)) throw new RequestError("invalid_option");
  const optionCode = packs === 1 ? selected : selected + "x" + packs;

  const detail = validatedDonatDetail(item.id, data.detail);
  let label;
  let amount;
  if (existing?.product === item.id && existing.option_code === optionCode) {
    label = existing.option_label;
    amount = existing.amount;
  } else if (isQuantity) {
    label = formatAmount(size) + " " + item.unit;
    amount = quantityPrice(item.options, size);
  } else {
    const option = item.options.find(([code]) => code === selected);
    if (!option) throw new RequestError("invalid_option");
    label = packs === 1 ? option[1] : packs + " × " + option[1];
    amount = option[2] * packs;
  }
  return { product: item.id, option_code: optionCode, option_label: label, detail, amount };
}
