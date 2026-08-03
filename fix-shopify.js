const fs = require('fs');
let code = fs.readFileSync('src/components/wardrobe/wardrobe-fill-panel.tsx', 'utf8');

// Remove Shopify import/logic
code = code.replace(/const markShopifyConnected = useAetherStore\(\(s\) => s\.markShopifyConnected\);/g, '');
code = code.replace(/const disconnectStore = useAetherStore\(\(s\) => s\.disconnectStore\);/g, '');
code = code.replace(/const \[shopDomain, setShopDomain\] = useState\(""\);/g, '');

const useEffectRegex = /useEffect\(\(\) => \{[\s\S]*?\}, \[searchParams, addGarments, markShopifyConnected\]\);/g;
code = code.replace(useEffectRegex, '');

const connectShopifyRegex = /const connectShopify = \(\) => \{[\s\S]*?window\.location\.href = `\/api\/commerce\/shopify\/auth\?\$\{params\.toString\(\)\}`;[\s\S]*?\};/g;
code = code.replace(connectShopifyRegex, '');

const shopifyUiBlockRegex = /<div className="glass shine-border rounded-3xl p-6">[\s\S]*?<h2 className="font-display text-2xl text-ivory">Shopify<\/h2>[\s\S]*?<\/div>\s*<\/div>/g;
code = code.replace(shopifyUiBlockRegex, '</div>');

fs.writeFileSync('src/components/wardrobe/wardrobe-fill-panel.tsx', code);
console.log('Shopify logic removed');
