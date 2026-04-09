const fs = require('fs');
let content = fs.readFileSync('.agent-responses-001.json', 'utf8');
// Fix broken words that were split with newlines in the middle
// Pattern: lowercase letter(s), newline, lowercase letter(s) - merge them
content = content.replace(/([a-z])\n([a-z])/g, '$1$2');
// Also try the specific broken word pattern
content = content.replace(/psychofyziolo\n+gická/g, 'psychofyziologická');
content = content.replace(/psychofyziologic\n+ká/g, 'psychofyziologická');
fs.writeFileSync('.agent-responses-001.json', content, 'utf8');
console.log('Fixed word breaks');

// Verify JSON is valid
try {
  JSON.parse(fs.readFileSync('.agent-responses-001.json', 'utf8'));
  console.log('✅ JSON is now valid');
} catch (e) {
  console.log('❌ JSON still invalid:', e.message);
}
