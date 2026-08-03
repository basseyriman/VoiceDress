const fs = require('fs');
let code = fs.readFileSync('src/lib/stripe.ts', 'utf8');

const plansRegex = /export const PLANS = \[[\s\S]*?\];/;
code = code.replace(plansRegex, '');

code = code.replace(/export const STRIPE_PRICE_MONTHLY =[\s\S]*?_yearly";/g, '');
code = code.replace(/export const LIST_PRICE_MONTHLY_GBP = 19;/g, '');
code = code.replace(/export const LIST_PRICE_YEARLY_GBP = 149;/g, '');

fs.writeFileSync('src/lib/stripe.ts', code);
console.log('stripe.ts updated');
