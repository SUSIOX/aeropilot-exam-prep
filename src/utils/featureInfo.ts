import { LogIn, BarChart3, Target, Sparkles, ShieldCheck } from 'lucide-react';

export type AuthFeature = 'stats' | 'errors' | 'ai' | 'admin';

export function getFeatureInfo(feature: AuthFeature) {
  const commonBenefits = [
    'Grafy a vizualizace',
    'Historie odpovědí', 
    'Srovnání výkonu',
    'Dlouhodobý postup',
    'Podrobné vysvětlení',
    'Interaktivní učení',
    'AI vysvětlení témat',
    'AI generátor otázek',
    'Automatické překlady'
  ];

  switch (feature) {
    case 'stats':
      return {
        icon: BarChart3,
        title: 'Statistiky a postup',
        description: 'Sledujte své pokroky, zobrazte detailní statistiky a sledujte vývoj vaší úspěšnosti.',
        benefits: commonBenefits
      };
    case 'errors':
      return {
        icon: Target,
        title: 'Procvičování chyb',
        description: 'Zaměřte se na otázky, které vám dělají problémy, a zlepšete své slabiny.',
        benefits: commonBenefits
      };
    case 'ai':
      return {
        icon: Sparkles,
        title: 'AI vysvětlení',
        description: 'Získejte podrobná AI vysvětlení otázek a učte se efektivněji.',
        benefits: commonBenefits
      };
    case 'admin':
      return {
        icon: ShieldCheck,
        title: 'Admin funkce',
        description: 'Spravujte obsah, přidávejte otázky a monitorujte systém.',
        benefits: commonBenefits
      };
    default:
      return {
        icon: LogIn,
        title: 'Pokročilé funkce',
        description: 'Odemkněte všechny funkce aplikace pro lepší výsledky.',
        benefits: commonBenefits
      };
  }
}
