import { formatCOP, parseCOP } from '../src/utils/money';

describe('formatCOP', () => {
  it('formatea con separador de miles', () => {
    expect(formatCOP(1500000)).toBe('$1.500.000');
    expect(formatCOP(950)).toBe('$950');
    expect(formatCOP(0)).toBe('$0');
  });
  it('rechaza decimales', () => {
    expect(() => formatCOP(10.5)).toThrow();
  });
});

describe('parseCOP', () => {
  it('lee enteros con puntos', () => {
    expect(parseCOP('1.500.000')).toBe(1500000);
    expect(parseCOP('$ 2.000.000')).toBe(2000000);
  });
  it('devuelve null si no es entero', () => {
    expect(parseCOP('abc')).toBeNull();
    expect(parseCOP('12,5')).toBeNull();
  });
});
