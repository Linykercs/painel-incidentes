// Tradução automática PT → ES via MyMemory (gratuita, sem chave).
// Limite anônimo ~5000 chars/dia; com cache por título no Firestore o consumo
// é de poucos títulos novos por semana. Falha de tradução nunca quebra o sync.

// Glossário do domínio: corrige termos que o tradutor erra. Aplicado sobre o
// resultado, sem case-sensitive.
const GLOSSARY = [
  [/panel de portada/gi, 'panel de cobertura'],
  [/panel de cobertura de portada/gi, 'panel de cobertura'],
  [/cedente/gi, 'transferencista'],
  [/lista de deseos/gi, 'lista de compras'],
];

export function applyGlossary(text) {
  let out = text;
  for (const [re, sub] of GLOSSARY) out = out.replace(re, sub);
  return out;
}

export async function translatePtEs(text) {
  if (!text || !text.trim()) return null;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pt|es`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const out = data?.responseData?.translatedText;
    if (
      data?.responseStatus === 200
      && typeof out === 'string'
      && out.trim().length > 0
      && !out.toUpperCase().includes('MYMEMORY WARNING')
    ) {
      return applyGlossary(out.trim());
    }
    return null;
  } catch {
    return null;
  }
}
