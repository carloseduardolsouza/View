/** Turns decoder/loader failures into a short Portuguese message; unknown errors keep their original text. */
export function describeLoadError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : e == null ? "" : JSON.stringify(e);
  const syntax = /(\d+(?:\.\d+){4,})/.exec(raw)?.[1];
  if (/transfer ?syntax|no decoder|unsupported|not supported|codec|jpeg|j2k|jp2|rle|wasm/i.test(raw))
    return `Formato de compressão não suportado${syntax ? ` (Transfer Syntax ${syntax})` : ""}. Reexporte o estudo sem compressão ou em JPEG/JPEG 2000 padrão.`;
  if (/decod|corrupt|invalid|malformed|truncated/i.test(raw)) return "Não foi possível decodificar a imagem: o arquivo parece corrompido ou incompleto.";
  if (/\b(401|403|404|5\d\d)\b|network|fetch|failed to load/i.test(raw)) return "Falha ao baixar a imagem do servidor. Verifique a conexão e tente novamente.";
  return raw ? `Falha ao carregar a imagem: ${raw}` : "Falha ao carregar a imagem.";
}
