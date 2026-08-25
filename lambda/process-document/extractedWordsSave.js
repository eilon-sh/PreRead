// מנרמל מילה להשוואה
export const wordKey = (text) =>
  String(text || '')
    .trim()
    .toLowerCase();

// מדלג על מילים ריקות וכפילויות בבאץ' מול מה שכבר קיים
export function prepareExtractedWordsForSave(words, existingKeys = new Set()) {
  const seen = new Set(existingKeys);
  const prepared = [];

  for (const entry of words) {
    const key = wordKey(entry?.word);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    prepared.push(entry);
  }

  return prepared;
}
