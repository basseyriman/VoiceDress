const fs = require('fs');
let code = fs.readFileSync('src/store/aether-store.ts', 'utf8');

code = code.replace(/markShopifyConnected: \(shop: string, itemCount\?: number\) => void;\n/g, '');

const markShopifyConnectedImplRegex = /markShopifyConnected: \(shop, itemCount = 0\) => \{[\s\S]*?\},(?=\n\s*disconnectStore)/g;
code = code.replace(markShopifyConnectedImplRegex, '');

fs.writeFileSync('src/store/aether-store.ts', code);
console.log('markShopifyConnected removed');
