import type { ApiFailure } from './api.js';
import { fill } from './format.js';
import type { appT } from './i18n/index.js';
import type { AppStrings } from './useMsg.js';

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

/**
 * The usual outcome of a failed save, as a message that is worded when it is shown (see useMsg): offline, a rejected field,
 * or the screen's own fallback. Pass `validation: false` where the server never sends field rules.
 */
export const failureMsg =
  (error: ApiFailure, fallback: (A: AppStrings) => string = (A) => A.health.common.failed, validation = true) =>
  (A: AppStrings): string =>
    error.status === 0 ? A.health.common.offline : validation && error.status === 400 ? validationMessage(A, error) : fallback(A);
