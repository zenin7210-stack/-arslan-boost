import { telegramId } from "./telegram.mjs";
// One owner and at most one co-owner. All permissions use immutable Telegram IDs.
export function adminIds(env) {
  const values = [env.ADMIN_ID, env.ADMIN_ID_2, ...(env.ADMIN_IDS || "").split(/[\s,;]+/u)];
  return [...new Set(values.map(telegramId).filter(Boolean))].slice(0, 2);
}
export function isAdmin(env, value) { return adminIds(env).includes(telegramId(value)); }
