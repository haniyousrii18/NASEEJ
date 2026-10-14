/** Fills `{name}` placeholders in a translated string. */
export const fmt = (template: string, vars: Record<string, string | number> = {}): string =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));

/** Read/write a small non-sensitive flag or timestamp. Storage may be blocked, so every call is guarded. */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* the choice lasts for this page view only */
    }
  },
};
