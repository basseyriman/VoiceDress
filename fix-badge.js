const fs = require('fs');
let code = fs.readFileSync('src/app/(app)/billing/billing-client.tsx', 'utf8');

code = code.replace(/pack\.badge/g, "(pack as any).badge");

fs.writeFileSync('src/app/(app)/billing/billing-client.tsx', code);
console.log('badge fixed');
