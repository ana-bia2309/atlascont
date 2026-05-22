// Brazilian national holidays (fixed + Easter-based)
function getHolidays(year: number): Set<string> {
  const fixed = [
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`,
    `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-12-25`,
  ];
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  const addDays = (dt: Date, n: number) => { const r = new Date(dt); r.setDate(r.getDate() + n); return r; };
  const fmt = (dt: Date) => {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  };
  return new Set([
    ...fixed,
    fmt(addDays(easter, -47)), // Carnaval (terça)
    fmt(addDays(easter, -2)),  // Sexta-feira Santa
    fmt(addDays(easter, 60)),  // Corpus Christi
  ]);
}

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function isBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !getHolidays(date.getFullYear()).has(fmtLocal(date));
}

/**
 * Se a data já for dia útil, retorna ela mesma.
 * Caso contrário, avança até o próximo dia útil.
 */
export function getNextBusinessDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Retorna a próxima data útil prevista para geração automática (08:00 BRT).
 * Se hoje for dia útil e ainda não passou das 08:00 BRT, retorna hoje.
 * Caso contrário, avança até o próximo dia útil.
 */
export function getNextGenerationDate(now: Date = new Date()): Date {
  // Hora em Brasília (UTC-3, sem DST)
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  const brtPassed8 = brtHour >= 8;

  const candidate = new Date(now);
  candidate.setHours(8, 0, 0, 0);

  if (brtPassed8 || !isBusinessDay(candidate)) {
    do {
      candidate.setDate(candidate.getDate() + 1);
    } while (!isBusinessDay(candidate));
  }
  return candidate;
}
