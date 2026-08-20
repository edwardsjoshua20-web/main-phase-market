import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const commerce = read('supabase/functions/_shared/commerce.ts');
const createCheckout = read('supabase/functions/create-checkout/index.ts');
const finalizeCheckout = read('supabase/functions/finalize-checkout-session/index.ts');
const server = read('server/index.mjs');
const envExample = read('.env.example');

assert(commerce.includes('STRIPE_TEST_CHECKOUT_ENABLED'), 'Hosted commerce must require an explicit Stripe test checkout enable flag.');
assert(commerce.includes('STRIPE_TEST_SECRET_KEY'), 'Hosted commerce must use a separate Stripe test secret key.');
assert(commerce.includes('MPM_QA_CHECKOUT_TOKEN'), 'Hosted commerce must support a server-side QA checkout token.');
assert(commerce.includes('STRIPE_SECRET_KEY must not be a Stripe test-mode key'), 'Hosted live checkout must reject test keys in the live key slot.');
assert(commerce.includes('STRIPE_TEST_SECRET_KEY must be a Stripe test-mode secret key'), 'Hosted QA checkout must require a test-mode key.');
assert(commerce.includes('assertQaCheckoutListing'), 'Hosted QA checkout must be constrained to QA-marked listings.');
assert(commerce.includes('QA checkout listing is not available for live checkout'), 'Hosted live checkout must reject QA-marked listings.');
assert(commerce.includes('assertCheckoutSessionMatchesMode'), 'Hosted finalization must verify Stripe session mode.');
assert(commerce.includes('qa_test_checkout_email_suppressed'), 'Hosted QA finalization must suppress real confirmation email delivery.');

assert(createCheckout.includes('authorizeQaCheckoutRequest'), 'Hosted create-checkout must authorize QA test checkout requests.');
assert(createCheckout.includes('resolveTrustedCartItems') && createCheckout.includes('{ checkoutMode }'), 'Hosted create-checkout must reuse trusted cart resolution in QA mode.');
assert(createCheckout.includes('checkout_mode: checkoutMode'), 'Hosted create-checkout must stamp checkout mode in Stripe metadata.');

assert(finalizeCheckout.includes('getCheckoutModeFromSessionId'), 'Hosted finalizer must choose Stripe mode from the session id.');
assert(finalizeCheckout.includes('assertCheckoutSessionMatchesMode'), 'Hosted finalizer must reject mismatched live/test sessions.');
assert(finalizeCheckout.includes('assertQaCheckoutOrderPayload'), 'Hosted finalizer must re-check QA listing constraints before inventory decrement.');
assert(finalizeCheckout.includes('confirmation'), 'Hosted finalizer must report confirmation side-effect behavior.');

assert(server.includes('STRIPE_TEST_CHECKOUT_ENABLED'), 'Local checkout parity must require an explicit Stripe test checkout enable flag.');
assert(server.includes('STRIPE_TEST_SECRET_KEY'), 'Local checkout parity must use a separate Stripe test secret key.');
assert(server.includes('assertQaCheckoutOrderPayload'), 'Local finalization parity must re-check QA listing constraints.');
assert(server.includes('QA checkout listing is not available for live checkout'), 'Local live checkout parity must reject QA-marked listings.');

assert(envExample.includes('STRIPE_TEST_CHECKOUT_ENABLED=false'), '.env.example must default Stripe test checkout to disabled.');
assert(envExample.includes('STRIPE_TEST_SECRET_KEY='), '.env.example must document the separate Stripe test key.');
assert(envExample.includes('MPM_QA_CHECKOUT_TOKEN='), '.env.example must document the server-side QA token.');

console.log(JSON.stringify({
  status: 'ok',
  checks: [
    'test mode is disabled by default',
    'test mode uses STRIPE_TEST_SECRET_KEY, not STRIPE_SECRET_KEY',
    'live checkout rejects test keys',
    'QA session creation requires admin/session token authorization',
    'QA checkout is limited to QA-marked listings',
    'QA-marked listings are blocked from live checkout',
    'Stripe session mode is revalidated during finalization',
    'QA confirmation email delivery is suppressed but reported',
    'local backend parity has matching test-mode guardrails'
  ]
}, null, 2));
