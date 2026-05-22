/**
 * Normalize a raw phone string to E.164 format.
 * Defaults to Nigeria (+234) for local-format numbers.
 *
 * Examples (NG default):
 *   "08031234567"      -> "+2348031234567"
 *   "8031234567"       -> "+2348031234567"
 *   "2348031234567"    -> "+2348031234567"
 *   "+234 803 123 4567"-> "+2348031234567"
 *   "00254712345678"   -> "+254712345678"
 *
 * Returns null if the input cannot be normalized to a valid E.164 number.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountry: "NG" = "NG"
): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (!s) return null;

  // 00<cc>… international prefix
  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (defaultCountry === "NG") {
    // 0XXXXXXXXXX (11 digits starting with 0) -> +234XXXXXXXXXX
    if (/^0\d{10}$/.test(s)) s = "+234" + s.slice(1);
    // Bare 10-digit local (e.g. 8031234567) -> +234XXXXXXXXXX
    else if (/^[1-9]\d{9}$/.test(s)) s = "+234" + s;
    // 234XXXXXXXXXX missing the +
    else if (/^234\d{10}$/.test(s)) s = "+" + s;
  }

  if (!s.startsWith("+")) s = "+" + s;

  return /^\+\d{8,15}$/.test(s) ? s : null;
}
