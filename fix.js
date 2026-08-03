const fs = require('fs');
let code = fs.readFileSync('src/components/wardrobe/outfit-stage.tsx', 'utf8');

// Append user?.avatarFaceBox to lockFaceIdentity calls
code = code.replace(/lockFaceIdentity\(\s*(.*?),\s*(.*?),\s*"(strong|soft)"\s*\)/g, 'lockFaceIdentity($1, $2, "$3", user?.avatarFaceBox)');

// Remove giant loading overlay
code = code.replace(/<AnimatePresence>[\s\S]*?<motion\.div[\s\S]*?className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink via-ink\/85 to-transparent p-6 pt-20"[\s\S]*?<\/motion\.div>\s*<\/AnimatePresence>/, '');

fs.writeFileSync('src/components/wardrobe/outfit-stage.tsx', code);
console.log('Done!');
