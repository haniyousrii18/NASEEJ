import { ENV } from '../../config/env.js';
import type { Mail } from './mail.js';

/**
 * The emails Naseej sends, in Arabic and in English (the language the person was using when they asked). Each has a plain-text
 * and a simple HTML body. Links carry their token in the #fragment, so it never appears in a server log or a Referer header.
 * No health information is ever put in an email.
 */
export type MailLang = 'ar' | 'en';
export const mailLang = (v: unknown): MailLang => (v === 'en' ? 'en' : 'ar');

export const verifyLink = (token: string) => `${ENV.APP_URL}/#/verify-email/${token}`;
export const resetLink = (token: string) => `${ENV.APP_URL}/#/reset-password/${token}`;
export const loginLink = () => `${ENV.APP_URL}/#/forgot-password`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Copy {
  subject: string;
  hello: (name: string) => string;
  lines: string[];
  button: string;
  link: string;
  footer: string;
}

function build(to: string, lang: MailLang, c: Copy, name: string): Mail {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const text = [c.hello(name), '', ...c.lines, '', c.link, '', c.footer].join('\n');
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;padding:24px;background:#fbf6f1;font-family:Arial,Helvetica,sans-serif;color:#2b1d14">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #ead9c9">
<p style="margin:0 0 16px;font-size:18px;font-weight:bold">${esc(c.hello(name))}</p>
${c.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.6">${esc(l)}</p>`).join('\n')}
<p style="margin:20px 0"><a href="${esc(c.link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#8a5a3b;color:#ffffff;text-decoration:none;font-weight:bold">${esc(c.button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b5a4d;word-break:break-all">${esc(c.link)}</p>
<p style="margin:16px 0 0;font-size:13px;color:#6b5a4d;line-height:1.6">${esc(c.footer)}</p>
</div></body></html>`;
  return { to, subject: c.subject, text, html };
}

export function verifyEmailMail(to: string, lang: MailLang, name: string, token: string): Mail {
  const ar: Copy = {
    subject: 'فعّل بريدك الإلكتروني في نسيج',
    hello: (n) => `مرحباً ${n}،`,
    lines: ['شكراً لإنشاء حسابك في نسيج. اضغط على الزر لتأكيد أن هذا بريدك الإلكتروني وتفعيل الحساب.', 'ينتهي هذا الرابط بعد 24 ساعة.'],
    button: 'تأكيد البريد الإلكتروني',
    link: verifyLink(token),
    footer: 'إذا لم تنشئ حساباً في نسيج فتجاهل هذه الرسالة، ولن يحدث شيء.',
  };
  const en: Copy = {
    subject: 'Confirm your email for Naseej',
    hello: (n) => `Hello ${n},`,
    lines: ['Thanks for creating your Naseej account. Press the button to confirm this is your email address and activate the account.', 'This link expires in 24 hours.'],
    button: 'Confirm my email',
    link: verifyLink(token),
    footer: 'If you did not create a Naseej account, ignore this message and nothing will happen.',
  };
  return build(to, lang, lang === 'ar' ? ar : en, name);
}

export function resetPasswordMail(to: string, lang: MailLang, name: string, token: string): Mail {
  const ar: Copy = {
    subject: 'إعادة تعيين كلمة المرور في نسيج',
    hello: (n) => `مرحباً ${n}،`,
    lines: ['وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في نسيج. اضغط على الزر لاختيار كلمة مرور جديدة.', 'ينتهي هذا الرابط بعد ساعة واحدة ويعمل مرة واحدة فقط.'],
    button: 'اختيار كلمة مرور جديدة',
    link: resetLink(token),
    footer: 'إذا لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة مرورك كما هي.',
  };
  const en: Copy = {
    subject: 'Reset your Naseej password',
    hello: (n) => `Hello ${n},`,
    lines: ['We received a request to reset the password of your Naseej account. Press the button to choose a new password.', 'This link expires in one hour and works once.'],
    button: 'Choose a new password',
    link: resetLink(token),
    footer: 'If you did not ask for this, ignore this message and your password stays as it is.',
  };
  return build(to, lang, lang === 'ar' ? ar : en, name);
}

/** Sent when someone tries to register an address that already has a verified account. No token, no way in: only a pointer. */
export function alreadyRegisteredMail(to: string, lang: MailLang): Mail {
  const ar: Copy = {
    subject: 'لديك حساب في نسيج بالفعل',
    hello: () => 'مرحباً،',
    lines: ['حاول أحدهم إنشاء حساب في نسيج بهذا البريد الإلكتروني، لكن لديك حساب بالفعل.', 'إذا كنت أنت وتذكّر كلمة مرورك فسجّل الدخول. وإذا نسيتها فيمكنك إعادة تعيينها من الرابط.'],
    button: 'نسيت كلمة المرور',
    link: loginLink(),
    footer: 'إذا لم تكن أنت فلا حاجة لأي إجراء، فلم يتغير شيء في حسابك.',
  };
  const en: Copy = {
    subject: 'You already have a Naseej account',
    hello: () => 'Hello,',
    lines: ['Someone tried to create a Naseej account with this email address, but you already have one.', 'If that was you and you remember your password, just sign in. If you forgot it, you can reset it with the link.'],
    button: 'Forgot my password',
    link: loginLink(),
    footer: 'If it was not you, no action is needed: nothing changed in your account.',
  };
  return build(to, lang, lang === 'ar' ? ar : en, '');
}

export function passwordChangedMail(to: string, lang: MailLang, name: string): Mail {
  const ar: Copy = {
    subject: 'تم تغيير كلمة مرور حسابك في نسيج',
    hello: (n) => `مرحباً ${n}،`,
    lines: ['تم تغيير كلمة مرور حسابك في نسيج للتو، وتم تسجيل خروجك من الأجهزة الأخرى.', 'إذا لم تكن أنت من فعل ذلك فأعد تعيين كلمة المرور فوراً.'],
    button: 'إعادة تعيين كلمة المرور',
    link: loginLink(),
    footer: 'هذه رسالة تنبيه أمني ولا تتطلب ردّاً إذا كنت أنت من غيّر كلمة المرور.',
  };
  const en: Copy = {
    subject: 'Your Naseej password was changed',
    hello: (n) => `Hello ${n},`,
    lines: ['The password of your Naseej account was just changed, and every other device was signed out.', 'If this was not you, reset your password right away.'],
    button: 'Reset my password',
    link: loginLink(),
    footer: 'This is a security notice. If you changed the password yourself, no reply is needed.',
  };
  return build(to, lang, lang === 'ar' ? ar : en, name);
}
