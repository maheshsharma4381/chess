export interface RawOpening {
  eco: string;
  name: string;
  pgn: string;
}

const ECO_CODE = /^[A-E]\d{2}$/;

/** Parses a Lichess chess-openings TSV (`eco\tname\tpgn`), skipping headers and malformed rows. */
export function parseTsv(text: string): RawOpening[] {
  const rows: RawOpening[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [eco, name, pgn] = line.split('\t').map((col) => col.trim());
    if (!eco || !name || !pgn || !ECO_CODE.test(eco)) continue;
    rows.push({ eco, name, pgn });
  }
  return rows;
}
