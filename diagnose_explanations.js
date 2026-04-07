// Diagnostika explanations v prohlížeči - spusť v DevTools console
(function diagnoseExplanations() {
  console.log('=== DIAGNOSTIKA EXPLANATIONS ===\n');
  
  // 1. localStorage explanations
  const allKeys = Object.keys(localStorage);
  const expKeys = allKeys.filter(k => k.startsWith('ai_explanation_'));
  
  console.log(`1. LOCALSTORAGE EXPLANATIONS:`);
  console.log(`   Celkem klíčů: ${expKeys.length}`);
  
  const byProvider = {};
  const byQuestion = {};
  
  expKeys.forEach(key => {
    const parts = key.replace('ai_explanation_', '').split('_');
    const provider = parts[parts.length - 2];
    const model = parts[parts.length - 1];
    const qid = parts.slice(0, -2).join('_');
    
    byProvider[provider] = (byProvider[provider] || 0) + 1;
    byQuestion[qid] = (byQuestion[qid] || 0) + 1;
    
    try {
      const data = JSON.parse(localStorage.getItem(key));
      console.log(`   ${key}:`, {
        length: data.explanation?.length,
        created: data.createdAt,
        hasDetailed: !!data.detailedExplanation
      });
    } catch(e) {
      console.log(`   ${key}: (parse error)`);
    }
  });
  
  console.log('\n   Podle providera:', byProvider);
  console.log(`   Unikátních otázek: ${Object.keys(byQuestion).length}`);
  
  // 2. Check ai_explanations (starý formát)
  const oldFormat = localStorage.getItem('ai_explanations');
  if (oldFormat) {
    try {
      const parsed = JSON.parse(oldFormat);
      const keys = Object.keys(parsed);
      console.log(`\n2. STARÝ FORMÁT (ai_explanations): ${keys.length} záznamů`);
      keys.slice(0, 5).forEach(k => console.log(`   - ${k}`));
    } catch(e) {
      console.log('\n2. STARÝ FORMÁT: chyba při parsování');
    }
  } else {
    console.log('\n2. STARÝ FORMÁT: nenalezen');
  }
  
  // 3. Výpis všech klíčů localStorage
  console.log('\n3. VŠECHNY LOCALSTORAGE KLÍČE:');
  allKeys.forEach(k => console.log(`   - ${k}`));
  
  return {
    newFormat: expKeys.length,
    oldFormat: oldFormat ? Object.keys(JSON.parse(oldFormat)).length : 0,
    byProvider,
    uniqueQuestions: Object.keys(byQuestion).length
  };
})();
