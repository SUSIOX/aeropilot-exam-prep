function parseExplanation(text) {
  // Check if text starts with objective identification
  const objectiveMatch = text.match(/^Pravděpodobně se jedná o objective\s+([^-]+)-\s*([^.]+)\.\s*(.+)/);
  
  if (objectiveMatch) {
    const objective = `${objectiveMatch[1].trim()} - ${objectiveMatch[2].trim()}`;
    const explanation = objectiveMatch[3]?.trim() || "Vysvětlení se nepodařilo vygenerovat.";
    
    return {
      objective,
      explanation
    };
  }
  
  // For existing LOs, extract LO ID from the response
  const loMatch = text.match(/^([0-9]{3}\.[0-9]{2}\.[0-9]{2}\.[0-9]{2}):\s*(.+)/);
  if (loMatch) {
    return {
      explanation: text
    };
  }
  
  return {
    explanation: text
  };
}

// Test cases
const test1 = "Pravděpodobně se jedná o objective 010.01 - Flight Planning and Monitoring Procedures. QNH je barometrické nastavení výškoměru, které udává tlak na hladině moře redukovaný ze staničního tlaku podle standardní atmosféry ISA.";

const test2 = "062.01.01.01: QNH je barometrické nastavení výškoměru, které udává tlak na hladině moře redukovaný ze staničního tlaku podle standardní atmosféry ISA.";

const test3 = "QNH je barometrické nastavení výškoměru, které udává tlak na hladině moře redukovaný ze staničního tlaku podle standardní atmosféry ISA.";

console.log('Test 1:', parseExplanation(test1));
console.log('Test 2:', parseExplanation(test2));
console.log('Test 3:', parseExplanation(test3));
