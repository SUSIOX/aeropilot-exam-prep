
import * as fs from 'fs';
const pdf = require('pdf-parse');

async function checkPdf() {
    let dataBuffer = fs.readFileSync('caa_ppl_lapl_pdfs/8-Obecne-znalosti-o-letadle-letoun.pdf');
    const data = await pdf(dataBuffer);
    console.log('PDF Text Length:', data.text.length);
    // Find patterns like "80001", "80002" etc.
    const questions = data.text.match(/\d{5,}\s/g);
    console.log('Potential Question IDs found:', questions ? questions.length : 0);
    
    // Save first 2000 chars to check structure
    fs.writeFileSync('/tmp/pdf_preview.txt', data.text.substring(0, 5000));
}

checkPdf().catch(console.error);
