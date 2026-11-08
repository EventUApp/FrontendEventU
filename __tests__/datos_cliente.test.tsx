import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { CartService, Reservation } from '../src/api/types';
import DatosClienteScreen, {
  CONTINUE_TO_PAYMENT_TEXT,
  DATA_TREATMENT_NOTICE,
  RESERVATION_CREATION_FAILED_MESSAGE,
} from '../src/screens/DatosClienteScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';
import {
  EMAIL_INVALID_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  PHONE_INVALID_MESSAGE,
} from '../src/utils/validators';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

function textOf(node: TestInstance): string {
  return node.children
    .map((c) => (typeof c === 'string' ? c : textOf(c)))
    .join('');
}

function findAllText(root: TestInstance): string[] {
  return root.queryAll((n) => n.type === 'Text').map(textOf);
}

function find(root: TestInstance, testID: string): TestInstance {
  const matches = root.queryAll((n) => n.props.testID === testID);
  if (matches.length === 0) {
    throw new Error(`No se encontró testID="${testID}"`);
  }
  return matches[0];
}

function has(root: TestInstance, testID: string): boolean {
  return root.queryAll((n) => n.props.testID === testID).length > 0;
}

function press(node: TestInstance): unknown {
  let curr: { memoizedProps?: { onPress?: () => unknown }; return?: unknown } | null =
    node.unstable_fiber;
  while (curr) {
    if (typeof curr.memoizedProps?.onPress === 'function') {
      return curr.memoizedProps.onPress();
    }
    curr = (curr.return as typeof curr) ?? null;
  }
  throw new Error('No se encontró manejador onPress');
}

const makeService = (
  id: string,
  category: CartService['category'],
  unitCost: number,
  name?: string,
  provider?: string,
): CartService => ({
  service_id: id,
  name: name ?? `Servicio ${id}`,
  category,
  provider_id: `prv-${id}`,
  provider_name: provider ?? `Proveedor ${id}`,
  price_model: 'fijo',
  unit_price_cop: unitCost,
  min_guests: 1,
  max_guests: 500,
});

const COMPLETE_CART: CartService[] = [
  makeService('esp-1', 'espacio', 2_000_000, 'Salón Campestre Las Palmas', 'Hacienda Real'),
  makeService('ali-1', 'alimentacion', 1_500_000, 'Banquete Tradicional', 'Banquetes Cali'),
  makeService('dec-1', 'decoracion', 800_000, 'Decoración Floral Clásica', 'Flores y Estilo'),
];

function FlowHarness({
  initial,
  navigation,
}: {
  initial?: Partial<FlowState>;
  navigation?: any;
}) {
  const { flow, update } = useFlow();
  const [mounted, setMounted] = React.useState(!initial);

  return (
    <>
      {!mounted ? (
        <Pressable
          testID="seed-flow"
          onPress={() => {
            if (initial) update(initial);
            setMounted(true);
          }}
        />
      ) : (
        <DatosClienteScreen navigation={navigation} />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

async function mountScreen(
  initial?: Partial<FlowState>,
  navProp?: any,
): Promise<TestInstance> {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <FlowHarness initial={initial} navigation={navProp} />
      </FlowProvider>,
    );
  });

  if (initial) {
    await act(async () => {
      press(find(root.container, 'seed-flow'));
    });
  }

  return root.container;
}

const snapshot = (root: TestInstance): FlowState =>
  JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;

const futureDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

describe('DatosClienteScreen (HU_EU_03_09, T_HU_EU_03_09_3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Renderizado de campos y teclados (Criterio 2)', () => {
    it('renderiza campos obligatorios con etiquetas, placeholders y teclados correctos', async () => {
      const root = await mountScreen({
        cart: COMPLETE_CART,
        guests: 80,
        eventType: 'boda',
        budgetCop: 5_000_000,
      });

      const inputName = find(root, 'input-name');
      const inputEmail = find(root, 'input-email');
      const inputPhone = find(root, 'input-phone');
      const inputDate = find(root, 'input-event-date');
      const submitBtn = find(root, 'btn-continue-payment');

      expect(inputName).toBeDefined();
      expect(inputEmail.props.keyboardType).toBe('email-address');
      expect(inputEmail.props.autoCapitalize).toBe('none');
      expect(inputPhone.props.keyboardType).toBe('phone-pad');
      expect(inputDate).toBeDefined();
      expect(submitBtn).toBeDefined();

      const allTexts = findAllText(root);
      expect(allTexts).toContain('Nombre completo');
      expect(allTexts).toContain('Correo electrónico');
      expect(allTexts).toContain('Teléfono');
      expect(allTexts).toContain('Fecha del evento');
      expect(allTexts).toContain(CONTINUE_TO_PAYMENT_TEXT);
    });

    it('muestra el aviso de tratamiento de datos personales (RNF-SEG-05, Criterio 4)', async () => {
      const root = await mountScreen({ cart: COMPLETE_CART });
      const allTexts = findAllText(root);
      expect(allTexts.some((t) => t.includes(DATA_TREATMENT_NOTICE))).toBe(true);
    });

    it('precarga datos del cliente y fecha si ya existen en FlowContext (RF-GEN-01)', async () => {
      const root = await mountScreen({
        cart: COMPLETE_CART,
        customer: {
          name: 'Carlos Mendoza',
          email: 'carlos@empresa.com',
          phone: '3123456789',
        },
        eventDate: '2026-12-25',
      });

      expect(find(root, 'input-name').props.value).toBe('Carlos Mendoza');
      expect(find(root, 'input-email').props.value).toBe('carlos@empresa.com');
      expect(find(root, 'input-phone').props.value).toBe('3123456789');
      expect(find(root, 'input-event-date').props.value).toBe('2026-12-25');
    });

    it('actualiza FlowContext al escribir en los campos para no perder datos al navegar (RF-GEN-01)', async () => {
      const root = await mountScreen({ cart: COMPLETE_CART });

      await act(async () => {
        find(root, 'input-name').props.onChangeText('Laura Victoria');
        find(root, 'input-email').props.onChangeText('laura@correo.co');
        find(root, 'input-phone').props.onChangeText('3109876543');
        find(root, 'input-event-date').props.onChangeText('2026-11-30');
      });

      const st = snapshot(root);
      expect(st.customer).toEqual({
        name: 'Laura Victoria',
        email: 'laura@correo.co',
        phone: '3109876543',
      });
      expect(st.eventDate).toBe('2026-11-30');
    });
  });

  describe('2. Resumen de la reserva (Criterio 2.5)', () => {
    it('muestra los servicios de «Mi evento», total y presupuesto restante cuando hay presupuesto', async () => {
      const root = await mountScreen({
        cart: COMPLETE_CART, // total: 2M + 1.5M + 0.8M = 4.300.000 COP
        guests: 50,
        budgetCop: 5_000_000,
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain('Resumen de la reserva');
      expect(allTexts).toContain('Salón Campestre Las Palmas');
      expect(allTexts).toContain('Banquete Tradicional');
      expect(allTexts).toContain('Decoración Floral Clásica');

      // Total: 4.300.000 COP
      expect(find(root, 'summary-total').props.children).toBe('$4.300.000');

      // Presupuesto restante: 5.000.000 - 4.300.000 = 700.000 COP
      expect(has(root, 'summary-remaining-budget')).toBe(true);
      expect(find(root, 'summary-remaining-budget').props.children).toBe('$700.000');
    });

    it('omite el presupuesto restante cuando no se indicó presupuesto (RN-22)', async () => {
      const root = await mountScreen({
        cart: COMPLETE_CART,
        guests: 50,
        budgetCop: null, // presupuesto ausente
      });

      expect(find(root, 'summary-total').props.children).toBe('$4.300.000');
      expect(has(root, 'summary-remaining-budget')).toBe(false);
    });
  });

  describe('3. Validaciones al presionar Continuar al pago (Criterio 3)', () => {
    it('muestra mensajes literales junto a cada campo inválido', async () => {
      const root = await mountScreen({
        cart: COMPLETE_CART,
        guests: 50,
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain(NAME_REQUIRED_MESSAGE); // 'Ingrese su nombre.'
      expect(allTexts).toContain(EMAIL_INVALID_MESSAGE); // 'Ingrese un correo electrónico válido.'
      expect(allTexts).toContain(PHONE_INVALID_MESSAGE); // 'Ingrese un teléfono de 10 dígitos.'
      expect(allTexts).toContain('Seleccione una fecha posterior a hoy.');
    });

    it.each([
      ['sin-arroba'],
      ['usuario@'],
      ['@dominio.com'],
      ['invalido@dominio'],
    ])('valida correo sin formato válido con %s (criterio 3.2)', async (badEmail) => {
      const root = await mountScreen({ cart: COMPLETE_CART });

      await act(async () => {
        find(root, 'input-name').props.onChangeText('Ana Gómez');
        find(root, 'input-email').props.onChangeText(badEmail);
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(futureDate());
        press(find(root, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain(EMAIL_INVALID_MESSAGE);
      expect(allTexts).not.toContain(NAME_REQUIRED_MESSAGE);
      expect(allTexts).not.toContain(PHONE_INVALID_MESSAGE);
    });

    it.each(['123', '300123456', '30012345678', '300123456a'])(
      'valida teléfono distinto de 10 dígitos con %s (criterio 3.3)',
      async (badPhone) => {
        const root = await mountScreen({ cart: COMPLETE_CART });

        await act(async () => {
          find(root, 'input-name').props.onChangeText('Ana Gómez');
          find(root, 'input-email').props.onChangeText('ana@ejemplo.com');
          find(root, 'input-phone').props.onChangeText(badPhone);
          find(root, 'input-event-date').props.onChangeText(futureDate());
          press(find(root, 'btn-continue-payment'));
        });

        const allTexts = findAllText(root);
        expect(allTexts).toContain(PHONE_INVALID_MESSAGE);
      },
    );

    it.each(['2020-01-01', 'hoy-invalido'])(
      'valida fecha no posterior a hoy con %s (criterio 3.4)',
      async (badDate) => {
        const root = await mountScreen({ cart: COMPLETE_CART });

        await act(async () => {
          find(root, 'input-name').props.onChangeText('Ana Gómez');
          find(root, 'input-email').props.onChangeText('ana@ejemplo.com');
          find(root, 'input-phone').props.onChangeText('3001234567');
          find(root, 'input-event-date').props.onChangeText(badDate);
          press(find(root, 'btn-continue-payment'));
        });

        const allTexts = findAllText(root);
        expect(allTexts).toContain('Seleccione una fecha posterior a hoy.');
      },
    );

    it('permite seleccionar fecha rápida mediante chips de preset (criterio 2.4)', async () => {
      const root = await mountScreen({ cart: COMPLETE_CART });

      expect(has(root, 'date-preset-1m')).toBe(true);
      await act(async () => {
        press(find(root, 'date-preset-1m'));
      });

      const dateValue = find(root, 'input-event-date').props.value;
      expect(/^\d{4}-\d{2}-\d{2}$/.test(dateValue)).toBe(true);
    });
  });

  describe('4. Creación de reserva exitosa (Criterio 5)', () => {
    it('envía los datos a POST /reservations, actualiza FlowContext y navega a Pago', async () => {
      const mockReservation: Reservation = {
        code: 'EU-XYZ789',
        status: 'creada',
        total_cop: 4_300_000,
        items: [],
        customer: {
          name: 'María Pérez',
          email: 'maria@ejemplo.com',
          phone: '3001234567',
        },
        event_date: futureDate(),
      };

      const spyPost = jest
        .spyOn(endpoints, 'postReservation')
        .mockResolvedValueOnce(mockReservation);

      const nav = { navigate: mockNavigate };
      const root = await mountScreen(
        {
          cart: COMPLETE_CART,
          guests: 50,
          eventType: 'cumpleanos',
          budgetCop: 6_000_000,
          cartOrigin: 'personalizado',
        },
        nav,
      );

      const fDate = futureDate();
      await act(async () => {
        find(root, 'input-name').props.onChangeText('María Pérez');
        find(root, 'input-email').props.onChangeText('maria@ejemplo.com');
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(fDate);
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      expect(spyPost).toHaveBeenCalledTimes(1);
      const req = spyPost.mock.calls[0][0];
      expect(req.budget_cop).toBe(6_000_000);
      expect(req.event_type).toBe('cumpleanos');
      expect(req.guests).toBe(50);
      expect(req.modality).toBe('personalizado');
      expect(req.service_ids).toEqual(['esp-1', 'ali-1', 'dec-1']);
      expect(req.expected_total_cop).toBe(4_300_000);
      expect(req.customer).toEqual({
        name: 'María Pérez',
        email: 'maria@ejemplo.com',
        phone: '3001234567',
      });
      expect(req.event_date).toBe(fDate);

      expect(mockNavigate).toHaveBeenCalledWith('Pago');
    });
  });

  describe('5. Manejo de fallos del servidor y red (Criterio 6)', () => {
    it('muestra mensaje literal ante 409 TOTAL_MISMATCH', async () => {
      jest.spyOn(endpoints, 'postReservation').mockRejectedValueOnce(
        new ApiError(409, 'TOTAL_MISMATCH', 'Total changed'),
      );

      const root = await mountScreen({ cart: COMPLETE_CART, guests: 40 });
      await act(async () => {
        find(root, 'input-name').props.onChangeText('María Pérez');
        find(root, 'input-email').props.onChangeText('maria@ejemplo.com');
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(futureDate());
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain(RESERVATION_CREATION_FAILED_MESSAGE);
    });

    it('muestra mensaje literal ante 409 BUDGET_EXCEEDED', async () => {
      jest.spyOn(endpoints, 'postReservation').mockRejectedValueOnce(
        new ApiError(409, 'BUDGET_EXCEEDED', 'Exceeded budget'),
      );

      const root = await mountScreen({ cart: COMPLETE_CART, guests: 40 });
      await act(async () => {
        find(root, 'input-name').props.onChangeText('María Pérez');
        find(root, 'input-email').props.onChangeText('maria@ejemplo.com');
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(futureDate());
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain(RESERVATION_CREATION_FAILED_MESSAGE);
    });

    it('muestra mensaje literal ante 422 VALIDATION_ERROR si falta rubro obligatorio', async () => {
      jest.spyOn(endpoints, 'postReservation').mockRejectedValueOnce(
        new ApiError(422, 'VALIDATION_ERROR', 'Missing category'),
      );

      const root = await mountScreen({ cart: COMPLETE_CART, guests: 40 });
      await act(async () => {
        find(root, 'input-name').props.onChangeText('María Pérez');
        find(root, 'input-email').props.onChangeText('maria@ejemplo.com');
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(futureDate());
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain(RESERVATION_CREATION_FAILED_MESSAGE);
    });

    it('muestra NetworkErrorView y permite reintentar ante fallo de conexión (HU_EU_01_04)', async () => {
      const mockPost = jest
        .spyOn(endpoints, 'postReservation')
        .mockRejectedValueOnce(new NetworkError('No hay conexión con el servidor.'))
        .mockResolvedValueOnce({
          code: 'EU-RETRY1',
          status: 'creada',
          total_cop: 4_300_000,
          items: [],
          customer: { name: 'María', email: 'm@e.com', phone: '3001234567' },
          event_date: futureDate(),
        });

      const nav = { navigate: mockNavigate };
      const root = await mountScreen({ cart: COMPLETE_CART, guests: 40 }, nav);

      await act(async () => {
        find(root, 'input-name').props.onChangeText('María');
        find(root, 'input-email').props.onChangeText('m@e.com');
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(futureDate());
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      expect(has(root, 'network-error-container')).toBe(true);
      expect(findAllText(root)).toContain('Reintentar');

      const retryBtn = root.queryAll(
        (n) => n.props.accessibilityRole === 'button' && textOf(n).includes('Reintentar'),
      )[0];
      expect(retryBtn).toBeDefined();

      // Presionar Reintentar
      await act(async () => {
        press(retryBtn);
      });

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith('Pago');
    });

    it('muestra mensaje genérico ante error inesperado 500', async () => {
      jest.spyOn(endpoints, 'postReservation').mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', GENERIC_ERROR),
      );

      const root = await mountScreen({ cart: COMPLETE_CART, guests: 40 });
      await act(async () => {
        find(root, 'input-name').props.onChangeText('María Pérez');
        find(root, 'input-email').props.onChangeText('maria@ejemplo.com');
        find(root, 'input-phone').props.onChangeText('3001234567');
        find(root, 'input-event-date').props.onChangeText(futureDate());
      });

      await act(async () => {
        press(find(root, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root);
      expect(allTexts).toContain('No fue posible completar la operación. Intente nuevamente.');
    });
  });
});
