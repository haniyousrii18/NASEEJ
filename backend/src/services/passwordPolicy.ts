/** One rule for every place a password is chosen: sign-up, reset and change. */
export const BCRYPT_MAX_BYTES = 72; // bcrypt ignores anything past this, so a longer password would not really be checked

export function isStrongPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES &&
    /[A-Za-z\u0600-\u06FF]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/** A practical check, not a full RFC parser: the real test of an address is that the mailed link gets opened. */
export function isEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>()[\]\,;:"]+@[^\s@<>()[\]\,;:"]+\.[^\s@<>()[\]\,;:"]{2,}$/.test(value);
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
