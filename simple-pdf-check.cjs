const fs = require('fs');

// Jednoduchý přístup - použijeme shell command pro PDF text extraction
async function extractPDFText(pdfPath) {
    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        
        // Zkusí různé metody extrakce textu
        const commands = [
            `pdftotext "${pdfPath}" -`,
            `strings "${pdfPath}"`,
            `cat "${pdfPath}" | strings`
        ];
        
        let commandIndex = 0;
        
        function tryNextCommand() {
            if (commandIndex >= commands.length) {
                reject(new Error('Žádná metoda extrakce textu nefunguje'));
                return;
            }
            
            const cmd = commands[commandIndex];
            commandIndex++;
            
            exec(cmd, { encoding: 'utf8' }, (error, stdout, stderr) => {
                if (error) {
                    console.log(`   ❌ Command failed: ${cmd}`);
                    tryNextCommand();
                    return;
                }
                
                if (stdout && stdout.trim().length > 100) {
                    console.log(`   ✅ Úspěšná extrakce pomocí: ${cmd}`);
                    resolve(stdout);
                } else {
                    console.log(`   ⚠️  Malý výstup, zkouším další metodu`);
                    tryNextCommand();
                }
            });
        }
        
        tryNextCommand();
    });
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\sěščřžýáíéúůťďľň]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findQuestionInPDF(question, pdfText) {
    const normalizedQuestion = normalizeText(question);
    const normalizedPdfText = normalizeText(pdfText);
    
    // Rozdělíme otázku na klíčová slova
    const words = normalizedQuestion.split(' ').filter(w => w.length > 3);
    
    for (let i = 0; i < words.length; i++) {
        const phrase = words.slice(i, Math.min(i + 4, words.length)).join(' ');
        if (normalizedPdfText.includes(phrase)) {
            return {
                found: true,
                confidence: (i + 4) / words.length,
                phrase: phrase,
                wordsUsed: words.slice(i, Math.min(i + 4, words.length))
            };
        }
    }
    
    return { found: false };
}

async function checkPDFs() {
    console.log('=== Jednoduchá kontrola PDF souborů ===\n');
    
    const mapping = {
        'subject_6.json': ['caa_ppl_lapl_pdfs/6-Provozni-postupy-vrtulnik.pdf'],
        'subject_7.json': [
            'caa_ppl_lapl_pdfs/7-Provedeni-a-planovani-letu-–-vrtulnik-opr.1.pdf',
            'caa_ppl_lapl_pdfs/7-Vykonnost-a-planovani-letu-letoun.pdf'
        ],
        'subject_8.json': [
            'caa_ppl_lapl_pdfs/8-Obecne-znalosti-o-letadle-letoun.pdf',
            'caa_ppl_lapl_pdfs/8-Obecne-znalosti-o-letadle-vrtulnik.pdf'
        ]
    };
    
    for (const [jsonFile, pdfFiles] of Object.entries(mapping)) {
        console.log(`\n🔍 ${jsonFile}:`);
        
        // Načtení otázek
        let questions;
        try {
            const content = fs.readFileSync(jsonFile, 'utf-8');
            questions = JSON.parse(content);
            console.log(`   📂 ${questions.length} otázek`);
        } catch (error) {
            console.log(`   ❌ Chyba JSON: ${error.message}`);
            continue;
        }
        
        // Pro každé PDF
        for (const pdfFile of pdfFiles) {
            console.log(`\n   📄 ${pdfFile}:`);
            
            let pdfText;
            try {
                pdfText = await extractPDFText(pdfFile);
                console.log(`      📝 Text extrahován (${pdfText.length} znaků)`);
            } catch (error) {
                console.log(`      ❌ Chyba extrakce: ${error.message}`);
                continue;
            }
            
            // Hledání otázek
            let found = 0;
            let notFound = 0;
            const sampleResults = [];
            
            for (let i = 0; i < Math.min(questions.length, 20); i++) { // Jen prvních 20 pro test
                const q = questions[i];
                const result = findQuestionInPDF(q.question, pdfText);
                
                if (result.found) {
                    found++;
                    if (sampleResults.length < 5) {
                        sampleResults.push({
                            id: q.id,
                            question: q.question.substring(0, 50) + '...',
                            found: true,
                            phrase: result.phrase
                        });
                    }
                } else {
                    notFound++;
                    if (sampleResults.length < 5) {
                        sampleResults.push({
                            id: q.id,
                            question: q.question.substring(0, 50) + '...',
                            found: false
                        });
                    }
                }
            }
            
            console.log(`      📊 Výsledky (prvních 20 otázek):`);
            console.log(`         ✅ Nalezeno: ${found}/20 (${Math.round(found/20*100)}%)`);
            console.log(`         ❌ Nenalezeno: ${notFound}/20 (${Math.round(notFound/20*100)}%)`);
            
            console.log(`      📋 Ukázky:`);
            sampleResults.forEach(r => {
                if (r.found) {
                    console.log(`         ✅ #${r.id}: "${r.phrase}"`);
                } else {
                    console.log(`         ❌ #${r.id}: nenalezeno`);
                }
            });
        }
    }
    
    console.log('\n✅ Kontrola dokončena!');
}

checkPDFs().catch(console.error);
