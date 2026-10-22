import { pool } from '../src/config/db.js';
import { deleteAccount, planAccountDeletion } from '../src/services/accountDeletion.js';

/**
 * Deletes an account that was created with "Create an account", with all of its data.
 *   npm run account:delete --prefix backend -- someone@example.com          shows what would be deleted, deletes nothing
 *   npm run account:delete --prefix backend -- someone@example.com --yes    really deletes it
 * It refuses the demo patient and any account not made by the sign-up screen. This cannot be undone.
 */
async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--yes');
  const email = args.find((a) => !a.startsWith('--'));
  if (!email) {
    console.error('Usage: npm run account:delete --prefix backend -- <email> [--yes]');
    process.exit(1);
  }

  const plan = await planAccountDeletion(email);
  if (!plan.ok) {
    console.error(
      plan.reason === 'not_found'
        ? `No account with the email ${email}.`
        : `Refused: ${email} was not created with "Create an account" (it is the demo patient, or was made by the seed or an administrator).`,
    );
    process.exit(1);
  }

  console.log(`Account: ${plan.email}`);
  const lines = Object.entries(plan.counts).map(([k, n]) => `  ${n} ${k}`);
  console.log(lines.length ? `It holds:\n${lines.join('\n')}\n  ${plan.files.length} stored file(s)` : 'It holds no records.');

  if (!confirm) {
    console.log('\nNothing was deleted. Add --yes to delete this account and everything above. This cannot be undone.');
    return;
  }
  const { filesRemoved } = await deleteAccount(plan);
  console.log(`\nDeleted ${plan.email} and its data (${filesRemoved} file(s) removed). You can create an account with this email again.`);
}

main()
  .catch((err) => {
    console.error('Could not delete the account:', err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
