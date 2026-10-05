// Porting di pipeline/src/celho_pipeline/names.py: norm() deve dare lo stesso risultato.
// Vettori condivisi: pipeline/tests/fixtures/norm_vectors.json.

const LIGATURES: Record<string, string> = { 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe' };

export function norm(name: string | null | undefined): string {
  let s = String(name ?? '').replace(/[æÆœŒ]/g, (c) => LIGATURES[c]);
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[’‘`´ʼ]/g, "'");
  return s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/ß/g, 'ss');
}

/** "A // B" -> ["A", "B"]; accetta anche la barra singola tra spazi. */
export function splitFaces(name: string): string[] {
  return name.split(/\s*\/\/\s*|\s+\/\s+/).map((x) => x.trim()).filter(Boolean);
}
