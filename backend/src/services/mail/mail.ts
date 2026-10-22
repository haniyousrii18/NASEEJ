import { ENV } from '../../config/env.js';

/**
 * Sending email (account verification, password reset). Three modes, chosen by configuration, never guessed:
 *  - smtp: SMTP_HOST is set, real messages go to real inboxes through that server (nodemailer).
 *  - dev:  no SMTP and not production. Nothing is sent. The message and its link are printed in the API console and kept in
 *          `outbox`, so the whole flow can be tried and tested on one machine.
 *  - off:  no SMTP in production. Sending throws MailNotConfiguredError and the endpoints answer "email is not configured",
 *          so the site never claims it mailed something it did not.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured on this server.');
  }
}

export type MailMode = 'smtp' | 'dev' | 'off';

/** A server with a username but no password is half-configured: that is "not configured", not a mode that fails on every send. */
export const smtpConfigured = () => !!ENV.SMTP_HOST && (!ENV.SMTP_USER || !!ENV.SMTP_PASS);

export function mailMode(): MailMode {
  if (smtpConfigured()) return 'smtp';
  return ENV.NODE_ENV === 'production' ? 'off' : 'dev';
}

/** Messages "sent" in dev mode, newest last. Memory only. Used by the tests and by the console printout. */
export const outbox: Mail[] = [];
export const clearOutbox = () => void (outbox.length = 0);

let transporter: Promise<any> | null = null;
async function smtp() {
  if (!transporter) {
    transporter = import('nodemailer').then((m) => {
      const nm: any = (m as any).default ?? m;
      return nm.createTransport({
        host: ENV.SMTP_HOST,
        port: ENV.SMTP_PORT,
        secure: ENV.SMTP_SECURE,
        auth: ENV.SMTP_USER ? { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS } : undefined,
      });
    });
  }
  return transporter;
}

export async function sendMail(mail: Mail): Promise<void> {
  const mode = mailMode();
  if (mode === 'off') throw new MailNotConfiguredError();
  if (mode === 'dev') {
    outbox.push(mail);
    if (ENV.NODE_ENV !== 'test') console.log(`\n[Mail:dev] To: ${mail.to}\n[Mail:dev] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const t = await smtp();
  await t.sendMail({ from: ENV.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
}

/** Opens the SMTP connection and logs in, without sending anything. Throws with nodemailer's error code on failure. */
export async function verifyMail(): Promise<void> {
  if (mailMode() !== 'smtp') throw new MailNotConfiguredError();
  const t = await smtp();
  await t.verify();
}
