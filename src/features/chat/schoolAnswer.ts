const FALLBACK = '[neutral]想了解更多，歡迎向在場老師查詢。';

// The model sees provenance internally, but it must never reach visitors or
// speech. Fail closed on citation-bearing clauses rather than leaving orphaned
// years/results after removing just a filename.
const provenance = /[^\s，。；：:（）()\[\]<>]*\.(?:pdf|docx?|jsonl?)\b|\bPDF\b|第\s*[\d一二三四五六七八九十百零、,，\s-]+\s*頁|\b(?:pages?\s*\d|p\.?\s*\d+|P2026|A1|A2)\b|(?:資料來源|來源|出處|參考資料|sources?|references?)\s*(?:[:：]|是|為)|(?:學校概覽|二十五周年校慶刊物|25周年校慶刊物)|\b(?:1023-0925|YY-0601|YY2-0604)\b|頁(?:碼|次)?\s*[:：]?\s*[\d一二三四五六七八九十百零]+/i;

export function sanitizeSchoolAnswer(answer: string): string {
  const cleaned = answer
    .replace(/\[(?:\d+(?:\s*[,，-]\s*\d+)*)\]/g, '')
    .replace(/[（(][^（）()\n]*(?:\.pdf|\bPDF\b|第\s*\d+\s*頁|sources?\s*:)[^（）()\n]*[）)]/gi, '')
    .replace(/(?:根據|依據|按照|按|據)[^，,。；\n]{0,60}(?:概覽|刊物|文件|資料)[，,：:]\s*/g, '');
  const safe = cleaned.split(/(?<=[。！？!?])|\n+/u).map(clause => {
    // Preserve the factual answer before a trailing citation label, if present.
    const content = clause.split(/(?:資料來源|引用來源|參考來源|來源|出處|sources?|references?)\s*(?:[:：]|是|為)/i)[0];
    return provenance.test(content.normalize('NFKC')) ? '' : content;
  }).join('\n').replace(/\n{2,}/g, '\n').trim();
  return safe.replace(/\[(?:happy|neutral)\]/g, '').trim() ? safe : FALLBACK;
}
