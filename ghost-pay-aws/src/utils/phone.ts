/**
 * Normalize Nigerian phone numbers to E.164 format (+234XXXXXXXXXX).
 * Accepts: 08031234567, 234803..., +234803..., 0803-123-4567, etc.
 */
export const normalizeNigerianPhone = (raw: string): string | null => {
  const digits = raw.replace(/[\s\-().+]/g, "");

  let normalized: string;
  if (digits.startsWith("234") && digits.length === 13) {
    normalized = `+${digits}`;
  } else if (digits.startsWith("0") && digits.length === 11) {
    normalized = `+234${digits.slice(1)}`;
  } else if (digits.length === 10 && /^[789]/.test(digits)) {
    normalized = `+234${digits}`;
  } else {
    return null;
  }

  return /^\+234[789]\d{9}$/.test(normalized) ? normalized : null;
};
