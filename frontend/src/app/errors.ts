import type { ApiFailure } from './api.js';
import { fill } from './format.js';
import type { appT } from './i18n/index.js';

type Strings = (typeof appT)['ar'] | (typeof appT)['en'];

/**
 * A validation failure from the server, worded in the page language. The server sends a stable `rule` (and `params`); the
 * English `message` it also sends is for logs and API users and is never shown, so Arabic pages never get English errors.
 */
export function validationMessage(A: Strings, error: ApiFailure): string {
  const V = A.common.validation;
  const rule = typeof error.details?.rule === 'string' ? error.details.rule : '';
  const template = V.rules[rule];
  if (!template) {
    // Account and password errors are identified by their code (and the field they belong to).
    const byField = typeof error.details?.field === 'string' ? V.account[`${error.code}:${error.details.field}`] : undefined;
    return byField ?? V.account[error.code] ?? V.generic;
  }
  const field = typeof error.details?.field === 'string' ? V.fields[error.details.field] ?? error.details.field : '';
  return fill(template, { field, max: error.details?.max ?? '' });
}
