import { ENV } from '../src/config/env.js';
import { mailMode, sendMail, smtpConfigured, verifyMail } from '../src/services/mail/mail.js';

/**
 * Checks that Naseej can really send email, and sends one test message.
 *   npm run mail:test -- you@example.com
 * It opens the SMTP connection first (so a wrong username or password is reported on its own), then sends the message.
 * Nothing is printed that contains the password.
 */
const to = process.argv[2];

function explain(err: any): string {
  const code = String(err?.code ?? '');
  const text = String(err?.message ?? err);
  if (code === 'EAUTH' || /535|Username and Password not accepted|Invalid login/i.test(text)) {
    return [
      'The mail server rejected the username or password.',
      '  - Gmail does not accept your normal password here. Turn on 2-Step Verification, then create an "App password"',
      '    (Google Account > Security > App passwords) and put those 16 letters in SMTP_PASS (no spaces).',
      '  - SMTP_USER must be the full address of that same account.',
    ].join('\n');
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(text)) {
    return [
      `Could not reach ${ENV.SMTP_HOST}:${ENV.SMTP_PORT}.`,
      '  - Check SMTP_HOST and SMTP_PORT. Gmail: smtp.gmail.com with port 465 and SMTP_SECURE=true (or port 587 with SMTP_SECURE=false).',
      '  - Check the internet connection, and that a firewall or antivirus is not blocking outgoing mail.',
    ].join('\n');
  }
  if (/wrong version number|SSL|TLS/i.test(text)) {
    return 'The secure-connection setting does not match the port. Port 465 needs SMTP_SECURE=true; port 587 needs SMTP_SECURE=false.';
  }
  return text;
}

async function main() {
  console.log(`[Mail] mode: ${mailMode()}  (host: ${ENV.SMTP_HOST || '(none)'}, port: ${ENV.SMTP_PORT}, secure: ${ENV.SMTP_SECURE}, user: ${ENV.SMTP_USER || '(none)'})`);
  if (!smtpConfigured()) {
    console.error(
      ['', 'Email is NOT set up, so Naseej cannot send real email. In .env set:', '  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM', 'See docs/accounts.md for the Gmail steps.', ENV.SMTP_USER && !ENV.SMTP_PASS ? '\nSMTP_USER is set but SMTP_PASS is empty.' : ''].join('\n'),
    );
    process.exit(1);
  }
  try {
    await verifyMail();
    console.log('[Mail] connected and logged in to the mail server.');
  } catch (err) {
    console.error(`\n[Mail] could not log in.\n${explain(err)}`);
    process.exit(1);
  }
  if (!to) {
    console.log('[Mail] connection is fine. Add an address to send a test message:  npm run mail:test -- you@example.com');
    return;
  }
  try {
    await sendMail({
      to,
      subject: 'Naseej test email',
      text: 'If you can read this, Naseej can send email. Sign-up confirmation and password-reset links will reach you.',
      html: '<p>If you can read this, Naseej can send email. Sign-up confirmation and password-reset links will reach you.</p>',
    });
    console.log(`[Mail] sent a test message to ${to}. Check the inbox (and the spam folder).`);
  } catch (err) {
    console.error(`\n[Mail] the server accepted the login but the message was refused.\n${explain(err)}`);
    process.exit(1);
  }
}

void main();
