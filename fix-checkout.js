const fs = require('fs');
let code = fs.readFileSync('src/app/api/stripe/checkout/route.ts', 'utf8');

code = code.replace(/,\n\s*STRIPE_PRICE_MONTHLY,\n\s*STRIPE_PRICE_YEARLY/g, '');

const subRegex = /\/\/ ——— Subscription plans ———[\s\S]*?return NextResponse\.json\(\{ error: message \}, \{ status: 500 \}\);\n  \}\n\}/g;
code = code.replace(subRegex, 'return NextResponse.json({ error: "Invalid plan" }, { status: 400 });\n}');

fs.writeFileSync('src/app/api/stripe/checkout/route.ts', code);
console.log('checkout route updated');
