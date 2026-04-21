const fs = require('fs');

// Načíst JSON
const data = JSON.parse(fs.readFileSync('public/otazkykluby.json', 'utf8'));

// Přidat subcategory "Medlánky" pro všechny otázky z "Navigace SPL"
let updated = 0;
data.forEach(q => {
  if (q.category === 'Navigace SPL') {
    q.subcategory = 'Medlánky';
    updated++;
  }
});

// Uložit zpět
fs.writeFileSync('public/otazkykluby.json', JSON.stringify(data, null, 2), 'utf8');

console.log(`✅ Přidáno subcategory "Medlánky" pro ${updated} otázek z Navigace SPL`);

// Zobrazit příklad
const example = data.find(q => q.subcategory === 'Medlánky');
if (example) {
  console.log('\nPříklad:');
  console.log(`  Otázka: ${example.question.slice(0, 50)}...`);
  console.log(`  Category: ${example.category}`);
  console.log(`  Subcategory: ${example.subcategory}`);
}
