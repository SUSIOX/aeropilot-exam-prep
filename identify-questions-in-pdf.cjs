const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Mapování JSON souborů na PDF soubory
const jsonToPdfMapping = {
    'subject_6.json': [
        'caa_ppl_lapl_pdfs/6-Provozni-postupy-vrtulnik.pdf'
    ],
    'subject_7.json': [
        'caa_ppl_lapl_pdfs/7-Provedeni-a-planovani-letu-–-vrtulnik-opr.1.pdf',
        'caa_ppl_lapl_pdfs/7-Vykonnost-a-planovani-letu-letoun.pdf'
    ],
    'subject_8.json': [
        'caa_ppl_lapl_pdfs/8-Obecne-znalosti-o-letadle-letoun.pdf',
        'caa_ppl_lapl_pdfs/8-Obecne-znalosti-o-letadle-vrtulnik.pdf'
    ]
};

async function extractTextFromPDF(pdfPath) {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const pdfParser = new PDFParse();
        const data = await pdfParser.parseBuffer(dataBuffer);
        return data.text;
    } catch (error) {
        throw new Error(`PDF Parse Error: ${error.message}`);
    }
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findQuestionInPDF(question, pdfText, pdfPath) {
    const normalizedQuestion = normalizeText(question);
    const normalizedPdfText = normalizeText(pdfText);
    
    // Hledáme přesnou shodu nebo část otázky
    const words = normalizedQuestion.split(' ').filter(w => w.length > 3);
    
    for (let i = 0; i < words.length; i++) {
        const phrase = words.slice(i, Math.min(i + 5, words.length)).join(' ');
        if (normalizedPdfText.includes(phrase)) {
            return {
                found: true,
                confidence: (i + 5) / words.length,
                phrase: phrase,
                context: extractContext(normalizedPdfText, phrase)
            };
        }
    }
    
    return { found: false };
}

function extractContext(text, phrase, contextLength = 100) {
    const index = text.indexOf(phrase);
    if (index === -1) return '';
    
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + phrase.length + contextLength);
    
    return text.substring(start, end);
}

async function identifyQuestions() {
    console.log('=== Identifikace otázek v PDF souborech ===\n');
    
    for (const [jsonFile, pdfFiles] of Object.entries(jsonToPdfMapping)) {
        console.log(`\n🔍 Zpracovávám ${jsonFile}:`);
        
        // Načtení JSON souboru
        let questions;
        try {
            const jsonContent = fs.readFileSync(jsonFile, 'utf-8');
            questions = JSON.parse(jsonContent);
            console.log(`   📂 Načteno ${questions.length} otázek`);
        } catch (error) {
            console.log(`   ❌ Chyba při načítání ${jsonFile}: ${error.message}`);
            continue;
        }
        
        // Pro každé PDF najdeme otázky
        for (const pdfFile of pdfFiles) {
            console.log(`\n   📄 Prohledávám ${pdfFile}:`);
            
            let pdfText;
            try {
                pdfText = await extractTextFromPDF(pdfFile);
                console.log(`      ✅ PDF načteno (${pdfText.length} znaků)`);
            } catch (error) {
                console.log(`      ❌ Chyba při načítání PDF: ${error.message}`);
                continue;
            }
            
            let foundCount = 0;
            let notFoundCount = 0;
            const results = [];
            
            for (const question of questions) {
                const result = findQuestionInPDF(question.question, pdfText, pdfFile);
                
                if (result.found) {
                    foundCount++;
                    results.push({
                        id: question.id,
                        question: question.question,
                        found: true,
                        confidence: result.confidence,
                        phrase: result.phrase,
                        context: result.context
                    });
                } else {
                    notFoundCount++;
                    results.push({
                        id: question.id,
                        question: question.question,
                        found: false
                    });
                }
            }
            
            console.log(`      📊 Výsledky:`);
            console.log(`         ✅ Nalezeno: ${foundCount}/${questions.length} (${Math.round(foundCount/questions.length*100)}%)`);
            console.log(`         ❌ Nenalezeno: ${notFoundCount}/${questions.length} (${Math.round(notFoundCount/questions.length*100)}%)`);
            
            // Uložíme detailní výsledky
            const reportFile = jsonFile.replace('.json', `_${pdfFile.split('/').pop().replace('.pdf', '')}_report.json`);
            fs.writeFileSync(reportFile, JSON.stringify({
                jsonFile,
                pdfFile,
                totalQuestions: questions.length,
                foundCount,
                notFoundCount,
                timestamp: new Date().toISOString(),
                results: results
            }, null, 2));
            
            console.log(`      💾 Report uložen: ${reportFile}`);
        }
    }
    
    console.log('\n✅ Identifikace dokončena!');
}

// Spuštění
identifyQuestions().catch(console.error);
