export function toCsv(rows: Array<Record<string, unknown>>): string {
  const keys = Object.keys(rows[0] ?? {});
  if (keys.length === 0) return '';
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = keys.join(',');
  const body = rows.map((r) => keys.map((k) => esc(r[k])).join(','));
  return [header, ...body].join('\n');
}

export async function xlsxBuffer(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Applications');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}