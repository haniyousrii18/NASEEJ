# Accounts: sign-up, email confirmation, forgot password

A person can create their own account with an email address and a password, confirm that address from a mailed link, and reset a
forgotten password the same way. The demo account and any account made by an administrator keep working unchanged.

## Flow

| Step | Screen / address | API |
|---|---|---|
| Create an account | Login card, "Create an account" | `POST /api/auth/register` `{ email, password, fullName, lang }` |
| Confirm the email | link `/#/verify-email/<token>` | `POST /api/auth/verify-email` `{ token }` |
| Mail the confirmation again | "Send it again", or on a sign-in refused with `EMAIL_NOT_VERIFIED` | `POST /api/auth/resend-verification` |
| Forgot password | Login card, "Forgot password?", or `/#/forgot-password` | `POST /api/auth/forgot-password` `{ email, lang }` |
| Choose a new password | link `/#/reset-password/<token>` | `POST /api/auth/reset-password` `{ token, newPassword, lang }` |

Sign-in is refused (`EMAIL_NOT_VERIFIED`) until the address is confirmed. A reset link also proves the address, so it confirms it too.

## Rules that matter

- **No account enumeration.** `register`, `resend-verification` and `forgot-password` answer `202` the same way whether or not the
  address has an account. Someone who registers an address that already has an account changes nothing; the owner gets an email.
- **Links are single-use and expire:** 24 hours to confirm, 1 hour to reset. A newer email cancels the older link. The token is 256
  random bits in the `#fragment` (never in a server log or a Referer header); only its SHA-256 is stored (`auth_tokens`).
- **A reset signs out every other device** (`users.password_changed_at`; `authenticate` rejects older session tokens) and emails
  the owner a notice.
- **Squatting:** an unconfirmed registration is replaced by the latest one for that address, so nobody can hold someone else's email.
- **Rate limits** per address and per client address on every one of these endpoints.
- **Passwords:** at least 8 characters with a letter and a number, at most 72 bytes (what bcrypt reads). One rule, in
  `services/passwordPolicy.ts`, shared by sign-up, reset and the account password change.
- **Profile fields are never invented.** A self-registered patient has no national id, birth date, gender or phone; those columns
  are now optional, and screens show "not recorded" or leave the row out.
- All screens and error messages are in Arabic and English. The server's English `message` is never shown, only its `code`.

## Email

`backend/src/services/mail/mail.ts` decides, by configuration only:

- **smtp**: `SMTP_HOST` is set, so real messages are sent through that server (nodemailer). See `.env.example`.
- **dev**: no SMTP and not production. Nothing is sent. The message and its link are printed in the API console, and the "check
  your email" screen says so.
- **off**: no SMTP in production. Sign-up, resend and forgot answer `503 EMAIL_NOT_CONFIGURED`, and the screen says email is not set
  up. The site never claims it mailed something it did not.

To send real email you must supply an SMTP account. Naseej cannot create one for you.

### Using a Gmail address (quickest for trying it)

1. Open your Google Account > **Security**. Turn on **2-Step Verification** if it is off.
2. In Security, open **App passwords**, create one named "Naseej", and copy the 16 letters Google shows (remove the spaces).
   Your normal Gmail password will NOT work here.
3. Put this in `.env` (the file stays on your machine and is never committed):

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your.address@gmail.com
   SMTP_PASS=the16letterapppassword
   MAIL_FROM="Naseej <your.address@gmail.com>"
   APP_URL=http://localhost:3000
   ```

   `APP_URL` must be the address you open the website at (the port the frontend prints when it starts), because the links in
   the emails point there.
4. Restart the backend, then check it before trying the website:

   ```
   npm run mail:test --prefix backend -- your.address@gmail.com
   ```

   It logs in to the mail server, sends one test message, and explains a wrong password or a blocked port in plain words.
5. Sign up again on the site. The confirmation email usually arrives within seconds; check Spam the first time.

Gmail limits how much one account can send (a few hundred messages a day) and the message comes from that Gmail address. That is fine
for trying the product. For real use, send from your own domain through a transactional-email service or a company mail server and
set the same `SMTP_*` values.

Until this is done the sign-up and forgot-password screens show a notice that email is not switched on, and no real message is sent.

## Deleting an account

The site has no delete button yet. A developer or administrator can remove an account that was created with "Create an account":

```
npm run account:delete --prefix backend -- someone@example.com          # shows what would be deleted, deletes nothing
npm run account:delete --prefix backend -- someone@example.com --yes    # deletes it
```

It removes the account, its profile and everything stored under it (symptoms, record entries, documents and their files, visit summaries,
shares, translations, sign-in links). It **cannot be undone**. It refuses the demo patient and any account not made by the sign-up screen.
Afterwards the same email can register again.

## Before real people use it

Email sign-up stores real email addresses and names. PRODUCT.md still limits the project to synthetic data; a privacy notice, an
account-deletion path and a review of what is logged are needed first.

## Migration

`007_account_access.sql` adds `users.email_verified_at` (default `NOW()`, so every existing and administrator-made account counts as
confirmed), `users.password_changed_at`, `auth_tokens`, and makes `patient_profiles.national_id`, `date_of_birth`, `gender` and `phone`
optional. Its rollback removes email-registered accounts (they cannot exist under the older schema) before restoring those constraints.
