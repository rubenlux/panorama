/**
 * Intelligence — Entity Extraction
 * Pure NER functions for title entity extraction
 * No database or AI dependencies
 */

/**
 * MONITOR_STOPWORDS — Spanish/English articles, prepositions, pronouns, generic topic words
 * Used by extractMonitorEntities to filter out non-entity words from titles
 */
export const MONITOR_STOPWORDS = new Set([
  // Spanish articles and prepositions
  'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Unos', 'Unas',
  'De', 'Del', 'En', 'Al', 'Por', 'Con', 'Sin', 'Para', 'Sobre',
  'Ante', 'Bajo', 'Desde', 'Hacia', 'Hasta', 'Tras', 'Entre', 'Según',
  // Spanish pronouns / interrogatives
  'Que', 'Como', 'Cuando', 'Donde', 'Cual', 'Cuyo', 'Cuya', 'Quien',
  'Cómo', 'Cuándo', 'Dónde', 'Qué', 'Quién', 'Quiénes', 'Cuál', 'Cuáles',
  'Se', 'Su', 'Sus', 'Mi', 'Mis', 'Tu', 'Tus',
  // Spanish demonstratives / adjectives
  'Nuevo', 'Nueva', 'Nuevos', 'Nuevas',
  'Gran', 'Grande', 'Grandes',
  'Este', 'Esta', 'Estos', 'Estas', 'Ese', 'Esa', 'Esos', 'Esas',
  'Otro', 'Otra', 'Otros', 'Otras',
  'Mismo', 'Misma', 'Mismos', 'Mismas',
  'Todo', 'Toda', 'Todos', 'Todas',
  'Muy', 'Más', 'Menos', 'Bien', 'Mal', 'Solo', 'Sólo',
  // Spanish verbs / auxiliaries
  'Hay', 'Era', 'Fue', 'Ser', 'Han', 'Son', 'Está', 'Están', 'Tiene',
  'Puede', 'Debe', 'Hace', 'Dice', 'Sabe', 'Lleva', 'Quiere', 'Viene',
  // Quantifiers that commonly start sentences
  'Pocos', 'Muchos', 'Varios', 'Algunos', 'Ciertas', 'Ciertos',
  // Generic content-type words
  'Video', 'Foto', 'Fotos', 'Imagen', 'Imágenes', 'Galería', 'Audio',
  'Nota', 'Artículo', 'Informe', 'Resumen', 'Agenda', 'Exclusivo',
  // Clickbait adjectives that head titles
  'Impactante', 'Sorprendente', 'Increíble', 'Insólito', 'Viral',
  'Inesperado', 'Urgente', 'Alerta', 'Atención', 'Importante',
  // Generic topic nouns (Horóscopo breaks ALL "Horóscopo X" sequences from Clarín)
  'Horóscopo', 'Horoscopo',
  'Salud', 'Amor', 'Dinero', 'Trabajo', 'Economía',
  'Selección',
  // English stopwords
  'The', 'This', 'That', 'These', 'Those',
  'New', 'Old', 'Big', 'How', 'Why', 'What', 'When', 'Where', 'Who',
  'Its', 'Their', 'Your', 'Our',
]);

/**
 * extractMonitorEntities — Extract capitalized named entities from title
 * Sequence of capitalized words = named entity (e.g., "Juan Pérez", "Copa América")
 * Single capitalized words ≥4 chars or acronyms extracted
 *
 * Returns up to 6 entities, deduplicated
 *
 * @param {string} title — Article title
 * @returns {string[]} — Extracted entities
 *
 * @example
 * extractMonitorEntities("Milei anuncia plan económico en Argentina")
 * // ['Milei', 'Argentina']
 *
 * @example
 * extractMonitorEntities("Copa América 2024: Brasil vs Argentina en la final")
 * // ['Copa América', 'Brasil', 'Argentina']
 */
export function extractMonitorEntities(title) {
  const clean = title.replace(/[¿¡«»:,;!?()[\]{}"']/g, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');

  const results = [];
  let current = [];

  const flush = () => {
    if (current.length >= 2) {
      results.push(current.join(' '));
    } else if (current.length === 1) {
      const w = current[0];
      if (w.length >= 4 || /^[A-ZÁÉÍÓÚÜÑ]{2,}\.?$/.test(w)) {
        results.push(w);
      }
    }
    current = [];
  };

  for (const word of words) {
    if (!word) continue;
    const bare = word.replace(/[.,;:!?'"]+$/, '');
    if (!bare) continue;

    const isCapStart      = /^[A-ZÁÉÍÓÚÜÑ]/.test(bare);
    // Normalize to title-case before stopword check so ALL-CAPS titles
    // ("ESTADOS UNIDOS GANÓ") don't bypass 'De', 'En', 'Al', etc.
    const normalizedBare  = bare[0].toUpperCase() + bare.slice(1).toLowerCase();
    const isNotStopword   = !MONITOR_STOPWORDS.has(normalizedBare);
    const isDigitOrHyphen = current.length > 0 && /^[\d-]/.test(bare) && bare.length <= 4;

    if ((isCapStart && isNotStopword && bare.length >= 2) || isDigitOrHyphen) {
      current.push(bare);
    } else {
      flush();
    }
  }
  flush();

  return [...new Set(results)].slice(0, 6);
}
