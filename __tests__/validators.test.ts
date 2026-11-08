import { BUDGET_MAX_COP, BUDGET_MIN_COP, GUESTS_MAX, GUESTS_MIN } from '../src/config/limits';
import {
  EMAIL_INVALID_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  PHONE_INVALID_MESSAGE,
  PRICE_MIN_GREATER_THAN_MAX_MESSAGE,
  validateBudget,
  validateEmail,
  validateEventDate,
  validateEventType,
  validateGuests,
  validateName,
  validatePhone,
  validatePriceRange,
} from '../src/utils/validators';

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

describe('validateEventDate (RN-20, HU_EU_01_12 criterio 3.3)', () => {
  const EXPECTED_MSG = 'Seleccione una fecha posterior a hoy.';
  const TODAY = '2026-11-07';

  it.each(['', '   '])('acepta vacío cuando es opcional al buscar (%j)', (input) => {
    expect(validateEventDate(input, { optional: true, today: TODAY })).toBeNull();
  });

  it.each(['', '   '])('rechaza vacío cuando es obligatoria al reservar (%j)', (input) => {
    expect(validateEventDate(input, { optional: false, today: TODAY })).toBe(EXPECTED_MSG);
  });

  it.each([
    '2026-11-07', // hoy (no posterior)
    '2026-11-06', // ayer
    '2025-01-01', // año anterior
    '2026-02-29', // 2026 no es bisiesto
    '2026-02-30', // fecha inexistente
    '2026-04-31', // abril tiene 30 días
    '2026-13-01', // mes 13 inexistente
    '2026-00-10', // mes 0 inexistente
    '07/11/2027', // formato inválido
    '2027-1-5', // sin ceros a la izquierda
    'no-es-fecha',
  ])('rechaza fecha igual o anterior a hoy o con formato inválido (%s)', (input) => {
    expect(validateEventDate(input, { optional: true, today: TODAY })).toBe(EXPECTED_MSG);
  });

  it.each([
    '2026-11-08', // mañana (borde inferior válido)
    '2026-12-15',
    '2027-05-20',
    '2028-02-29', // año bisiesto válido
    ' 2027-01-01 ',
  ])(
    'acepta fecha posterior a hoy (%s)',
    (input) => {
      expect(validateEventDate(input, { optional: true, today: TODAY })).toBeNull();
    },
  );
});

describe('validatePriceRange (HU_EU_02_15, criterios 2.3, 3.1 y 3.2)', () => {
  it('constante PRICE_MIN_GREATER_THAN_MAX_MESSAGE coincide exactamente con el criterio literal 3.1', () => {
    expect(PRICE_MIN_GREATER_THAN_MAX_MESSAGE).toBe(
      'El precio mínimo no puede ser mayor que el máximo.',
    );
  });

  it.each([
    [null, null, 'ambos nulos'],
    [1_000_000, null, 'solo mínimo definido'],
    [null, 5_000_000, 'solo máximo definido'],
    [1_000_000, 1_000_000, 'mínimo igual a máximo'],
    [0, 0, 'ambos cero'],
    [1, 1, 'enteros mínimos iguales'],
    [500_000, 2_000_000, 'mínimo menor que máximo'],
    [0, 10_000_000, 'mínimo cero'],
    [10_000_000, 10_000_001, 'diferencia mínima de una unidad'],
  ])('acepta rangos válidos: %s y %s (%s)', (min, max, _desc) => {
    expect(validatePriceRange(min, max)).toBeNull();
  });

  it.each([
    [2_000_000, 1_000_000],
    [5_000_001, 5_000_000],
    [10_000_000, 0],
    [1, 0],
    [100_000_000, 50_000_000],
  ])('rechaza cuando min (%d) > max (%d) con mensaje literal', (min, max) => {
    expect(validatePriceRange(min, max)).toBe('El precio mínimo no puede ser mayor que el máximo.');
  });
});

describe('validateName (HU_EU_03_09, criterio 3.1)', () => {
  it('coincide exactamente con la constante NAME_REQUIRED_MESSAGE', () => {
    expect(NAME_REQUIRED_MESSAGE).toBe('Ingrese su nombre.');
  });

  it.each(['', '   ', '\t', '\n'])('rechaza nombre vacío o solo espacios (%j)', (input) => {
    expect(validateName(input)).toBe('Ingrese su nombre.');
  });

  it.each([
    'María Pérez',
    'Juan Carlos Gómez',
    'Ana',
    'Jean Paul',
    'David R.',
  ])('acepta nombres válidos (%s)', (name) => {
    expect(validateName(name)).toBeNull();
  });
});

describe('validateEmail (HU_EU_03_09, criterio 3.2)', () => {
  it('coincide exactamente con la constante EMAIL_INVALID_MESSAGE', () => {
    expect(EMAIL_INVALID_MESSAGE).toBe('Ingrese un correo electrónico válido.');
  });

  it.each([
    '',
    '   ',
    'sin-arroba',
    'usuario@',
    '@dominio.com',
    'usuario@dominio',
    'usuario@dominio.',
    'usuario con espacios@dominio.com',
    'usuario@dominio com',
  ])('rechaza formatos inválidos de correo (%j)', (input) => {
    expect(validateEmail(input)).toBe('Ingrese un correo electrónico válido.');
  });

  it.each([
    'cliente@ejemplo.com',
    'maria.perez@dominio.co',
    'organizador123@eventu.app',
    'juan_carlos@empresa.com.co',
  ])('acepta correos electrónicos con formato válido (%s)', (email) => {
    expect(validateEmail(email)).toBeNull();
  });
});

describe('validatePhone (HU_EU_03_09, criterio 3.3)', () => {
  it('coincide exactamente con la constante PHONE_INVALID_MESSAGE', () => {
    expect(PHONE_INVALID_MESSAGE).toBe('Ingrese un teléfono de 10 dígitos.');
  });

  it.each([
    '',
    '   ',
    '123',
    '123456789', // 9 dígitos
    '12345678901', // 11 dígitos
    '300123456a', // contiene letras
    '300-123456', // contiene guiones
    '+573001234567', // contiene prefijo con '+'
    '300 123 456',
  ])('rechaza teléfonos distintos de 10 dígitos numéricos (%j)', (input) => {
    expect(validatePhone(input)).toBe('Ingrese un teléfono de 10 dígitos.');
  });

  it.each([
    '3001234567',
    '3109876543',
    '3201122334',
    '3155554321',
    '6023334455',
  ])('acepta teléfonos de exactamente 10 dígitos numéricos (%s)', (phone) => {
    expect(validatePhone(phone)).toBeNull();
  });
});

