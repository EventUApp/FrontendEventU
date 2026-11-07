/** Formatea COP entero con separador de miles: 1500000 -> '$1.500.000' (RN-04). */
export function formatCOP(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error('Los importes en COP deben ser enteros.');
  }
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${digits}`;
}

/** Convierte lo escrito por el usuario ('1.500.000') en entero, o null si no es un entero. */
export function parseCOP(text: string): number | null {
  const cleaned = text.replace(/[.\s$]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}
