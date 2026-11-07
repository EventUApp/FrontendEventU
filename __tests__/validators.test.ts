import { validateBudget, validateEventType, validateGuests } from '../src/utils/validators';

describe('validateBudget', () => {
  it('exige valor', () => expect(validateBudget('')).toBe('Ingrese su presupuesto.'));
  it('rechaza fuera de rango', () => {
    expect(validateBudget('500000')).toContain('entre $1.000.000 y $50.000.000');
    expect(validateBudget('60000000')).toContain('entre $1.000.000 y $50.000.000');
  });
  it('acepta un valor válido', () => expect(validateBudget('5.000.000')).toBeNull());
});

describe('validateGuests', () => {
  it('rechaza vacío, decimal y fuera de rango', () => {
    for (const v of ['', '0', '501', '10.5', 'abc']) expect(validateGuests(v)).not.toBeNull();
  });
  it('acepta 1 y 500', () => {
    expect(validateGuests('1')).toBeNull();
    expect(validateGuests('500')).toBeNull();
  });
});

describe('validateEventType', () => {
  it('exige selección', () => {
    expect(validateEventType(null)).toBe('Seleccione el tipo de evento.');
    expect(validateEventType('boda')).toBeNull();
  });
});
