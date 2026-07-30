const SENTENCE_BREAK = /[.!?](\s|$)/g;

function lastBreakIndex(window: string): number {
  const paragraphBreak = window.lastIndexOf("\n\n");
  if (paragraphBreak > 0) return paragraphBreak + 2;

  const lineBreak = window.lastIndexOf("\n");
  if (lineBreak > 0) return lineBreak + 1;

  let sentenceBreak = -1;
  for (const match of window.matchAll(SENTENCE_BREAK)) {
    sentenceBreak = match.index + match[0].length;
  }
  if (sentenceBreak > 0) return sentenceBreak;

  const spaceBreak = window.lastIndexOf(" ");
  if (spaceBreak > 0) return spaceBreak + 1;

  return -1;
}

export function chunkForWhatsapp(text: string, limit = 3900): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const breakIndex = lastBreakIndex(window);
    const cut = breakIndex > 0 ? breakIndex : limit;

    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut);
  }

  const last = remaining.trim();
  if (last) chunks.push(last);

  return chunks;
}
