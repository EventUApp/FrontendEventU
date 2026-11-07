import { BUDGET_MAX_COP, BUDGET_MIN_COP, GUESTS_MAX, GUESTS_MIN } from '../src/config/limits';
import { validateBudget, validateEventType, validateGuests } from '../src/utils/validators';

describe('validateBudget (RN-19, criterios 3.1 y 3.2)', () => {
  it.each(['', '   ', '\t'])('exige valor cuando está vacío (%j)', (input) => {
    expect(validateBudget(input)).toBe('Ingrese su presupuesto.');
  });

  it.each([
    ['0', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['500000', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['999.999', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    [String(BUDGET_MIN_COP - 1), 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['50.000.001', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    [String(BUDGET_MAX_COP + 1), 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['60000000', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['-2000000', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['1500000,50', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
    ['abc', 'El presupuesto debe estar entre $1.000.000 y $50.000.000.'],
  ])('rechaza valor fuera de rango o no entero (%s)', (input, expectedMessage) => {
    expect(validateBudget(input)).toBe(expectedMessage);
  });

  it.each([
    '1000000',
    '1.000.000',
    '$ 1.000.000',
    String(BUDGET_MIN_COP),
    '5.000.000',
    '25000000',
    '50.000.000',
    String(BUDGET_MAX_COP),
  ])('acepta valor válido dentro del rango (%s)', (input) => {
    expect(validateBudget(input)).toBeNull();
  });
});

describe('validateGuests (RN-19, criterio 3.4)', () => {
  const EXPECTED_MSG = 'Ingrese un número de invitados entre 1 y 500.';

  it.each([
    '',
    '   ',
    '0',
    String(GUESTS_MIN - 1),
    '501',
    String(GUESTS_MAX + 1),
    '-10',
    '10.5',
    '10,5',
    'abc',
    '100 personas',
  ])('rechaza vacío, no entero o fuera de rango (%j)', (input) => {
    expect(validateGuests(input)).toBe(EXPECTED_MSG);
  });

  it.each([
    '1',
    String(GUESTS_MIN),
    '50',
    '120',
    '500',
    String(GUESTS_MAX),
    ' 250 ',
  ])('acepta enteros válidos entre 1 y 500 (%j)', (input) => {
    expect(validateGuests(input)).toBeNull();
  });
});

describe('validateEventType (RN-19, criterio 3.3)', () => {
  it('exige selección cuando es null', () => {
    expect(validateEventType(null)).toBe('Seleccione el tipo de evento.');
  });

  it.each(['cumpleanos', 'boda', 'xv'] as const)('acepta el tipo de evento %s', (type) => {
    expect(validateEventType(type)).toBeNull();
  });
});
