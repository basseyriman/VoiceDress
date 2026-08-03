const fs = require('fs');
let code = fs.readFileSync('src/app/api/stripe/checkout/route.ts', 'utf8');

const subRegex = /\/\/ ——— Subscription plans ———[\s\S]*?return NextResponse\.json\(\{ error: message \}, \{ status: 500 \}\);\n\}/g;
code = code.replace(subRegex, 'return NextResponse.json({ error: "Invalid plan" }, { status: 400 });\n}');

// Actually I should just remove lines 117 to 158.
code = code.substring(0, code.indexOf('// ——— Subscription plans'));
code += 'return NextResponse.json({ error: "Invalid plan" }, { status: 400 });\n}';

fs.writeFileSync('src/app/api/stripe/checkout/route.ts', code);
console.log('checkout fixed');
