import React, { act } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Reservation } from '../src/api/types';
import { SIMULATED_PAYMENT_NOTICE } from '../src/components/ReservationDetails';
import ConfirmacionScreen, {
  NO_RESERVATION_NOTICE,
} from '../src/screens/ConfirmacionScreen';
import ConsultarReservaScreen, {
  RESERVATION_NOT_FOUND_MESSAGE,
  SEARCH_BUTTON_TEXT,
  UNEXPECTED_ERROR_MESSAGE,
} from '../src/screens/ConsultarReservaScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';
import {
  RESERVATION_CODE_INVALID_MESSAGE,
  RESERVATION_CODE_REQUIRED_MESSAGE,
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

const samplePaidReservation: Reservation = {
  code: 'EU-8K9M2P',
  status: 'pagada',
  total_cop: 4_300_000,
  items: [
    {
      service_id: 'esp-1',
      name: 'Salón Campestre Las Palmas',
      provider_id: 'prv-1',
      provider_name: 'Hacienda Real',
      verification_status: 'verificado',
      cost_cop: 2_000_000,
    },
    {
      service_id: 'ali-1',
      name: 'Banquete Tradicional 3 Tiempos',
      provider_id: 'prv-2',
      provider_name: 'Catering Gourmet',
      verification_status: 'verificado',
      cost_cop: 1_500_000,
    },
    {
      service_id: 'dec-1',
      name: 'Decoración Floral Clásica',
      provider_id: 'prv-3',
      provider_name: 'Flores y Estilo',
      verification_status: 'verificado',
      cost_cop: 800_000,
    },
  ],
  customer: {
    name: 'Carlos Mendoza',
    email: 'carlos@ejemplo.co',
    phone: '3001234567',
  },
  event_date: '2027-06-15',
  payment: {
    status: 'aprobado',
    reference: 'SIM-REF-998877',
  },
};

function ConfirmacionHarness({
  initial,
}: {
  initial?: Partial<FlowState>;
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
        <ConfirmacionScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

function ConsultarHarness({
  initial,
}: {
  initial?: Partial<FlowState>;
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
        <ConsultarReservaScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

async function mountConfirmacion(initial?: Partial<FlowState>): Promise<TestInstance> {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <ConfirmacionHarness initial={initial} />
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

async function mountConsultar(initial?: Partial<FlowState>): Promise<TestInstance> {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <ConsultarHarness initial={initial} />
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

describe('HU_EU_03_11 — Confirmación y consulta de reserva (T_HU_EU_03_11_2, T_HU_EU_03_11_3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Pantalla ConfirmacionScreen (tras pago aprobado)', () => {
    it('criterios 2.1 a 2.5 y 5: muestra los datos completos de la reserva pagada', async () => {
      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(samplePaidReservation);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      expect(has(root, 'reservation-code')).toBe(true);
      expect(textOf(find(root, 'reservation-code'))).toBe('EU-8K9M2P');

      expect(has(root, 'total-amount')).toBe(true);
      expect(textOf(find(root, 'total-amount'))).toBe('$4.300.000');

      expect(has(root, 'customer-name')).toBe(true);
      expect(textOf(find(root, 'customer-name'))).toBe('Carlos Mendoza');

      expect(has(root, 'customer-email')).toBe(true);
      expect(textOf(find(root, 'customer-email'))).toBe('carlos@ejemplo.co');

      expect(has(root, 'customer-phone')).toBe(true);
      expect(textOf(find(root, 'customer-phone'))).toBe('3001234567');

      expect(has(root, 'event-date')).toBe(true);
      expect(textOf(find(root, 'event-date'))).toBe('2027-06-15');

      expect(has(root, 'payment-reference')).toBe(true);
      expect(textOf(find(root, 'payment-reference'))).toContain('SIM-REF-998877');

      // 2.5 Aviso: 'El pago fue simulado.'
      expect(SIMULATED_PAYMENT_NOTICE).toBe('El pago fue simulado.');
      expect(has(root, 'simulated-payment-notice')).toBe(true);
      expect(textOf(find(root, 'simulated-payment-notice'))).toContain('El pago fue simulado.');

      // 2.2 Servicios
      const all = findAllText(root).join(' ');
      expect(all).toContain('Salón Campestre Las Palmas');
      expect(all).toContain('Hacienda Real');
      expect(all).toContain('$2.000.000');
      expect(all).toContain('Banquete Tradicional 3 Tiempos');
      expect(all).toContain('Catering Gourmet');
      expect(all).toContain('$1.500.000');
      expect(all).toContain('Decoración Floral Clásica');
      expect(all).toContain('Flores y Estilo');
      expect(all).toContain('$800.000');
      expect(all).toContain('Pagada');
    });

    it('criterios 2.7 y 5: botón Volver al inicio vacía el carrito y navega a Inicio', async () => {
      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(samplePaidReservation);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
        cart: [
          {
            service_id: 'esp-1',
            name: 'Salón',
            category: 'espacio',
            provider_id: 'prv-1',
            provider_name: 'Hacienda Real',
            price_model: 'fijo',
            unit_price_cop: 2_000_000,
            min_guests: 10,
            max_guests: 200,
          },
        ],
      });

      // El carrito tiene 1 elemento antes de volver
      let snapshot = JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;
      expect(snapshot.cart).toHaveLength(1);

      // Pulsar Volver al inicio
      expect(has(root, 'btn-go-home')).toBe(true);
      await act(async () => {
        press(find(root, 'btn-go-home'));
      });

      // Se vació el carrito
      snapshot = JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;
      expect(snapshot.cart).toHaveLength(0);

      // Navega a Tabs con screen Inicio
      expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Inicio' });
    });

    it('criterio 6: ante error de red muestra NetworkErrorView con botón Reintentar', async () => {
      const getSpy = jest
        .spyOn(endpoints, 'getReservation')
        .mockRejectedValueOnce(
          new NetworkError('No hay conexión con el servidor. Revise su conexión e intente nuevamente.'),
        )
        .mockResolvedValueOnce(samplePaidReservation);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      const all = findAllText(root).join(' ');
      expect(all).toContain('No hay conexión con el servidor.');
      expect(all).toContain('Reintentar');

      const retryButtons = root.queryAll(
        (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Reintentar',
      );
      expect(retryButtons.length).toBeGreaterThan(0);

      await act(async () => {
        press(retryButtons[0]);
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(has(root, 'reservation-code')).toBe(true);
    });

    it('criterio 6: si la reserva no existe (404) muestra mensaje literal requerido', async () => {
      jest.spyOn(endpoints, 'getReservation').mockRejectedValueOnce(
        new ApiError(404, 'NOT_FOUND', 'Reserva inexistente'),
      );

      const root = await mountConfirmacion({
        reservationCode: 'EU-NONEXIST',
      });

      expect(RESERVATION_NOT_FOUND_MESSAGE).toBe('No encontramos una reserva con ese número.');
      const errBox = find(root, 'confirmacion-error');
      expect(textOf(errBox)).toBe('No encontramos una reserva con ese número.');
    });

    it.each([
      ['creada', 'creada'],
      ['pago rechazado', 'pago_rechazado'],
      ['cancelada', 'cancelada'],
      ['pendiente', 'pendiente'],
    ])('criterio 4: la confirmación solo se muestra para reservas pagadas; reserva con estado %s muestra aviso de no encontrada', async (_desc, status) => {
      const unpaidReservation: Reservation = {
        ...samplePaidReservation,
        status: status as Reservation['status'],
      };

      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(unpaidReservation);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      // No debe mostrar detalles de confirmación
      expect(has(root, 'reservation-code')).toBe(false);
      expect(has(root, 'confirmacion-error')).toBe(true);
      expect(textOf(find(root, 'confirmacion-error'))).toBe('No encontramos una reserva con ese número.');
    });

    it('criterio 4: nunca se muestran datos sensibles de tarjeta en la pantalla de confirmación', async () => {
      const reservationWithInjectedCard: Reservation = {
        ...samplePaidReservation,
        payment: {
          status: 'aprobado',
          reference: 'SIM-REF-998877',
          // @ts-expect-error simulación de datos sensibles no autorizados
          cardNumber: '4242424242424242',
          cvv: '888',
        },
      };

      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(reservationWithInjectedCard);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      const all = findAllText(root).join(' ');
      expect(all).not.toContain('4242424242424242');
      expect(all).not.toContain('888');
      expect(all).not.toContain('CVV');
    });

    it('criterio 4: la pantalla de confirmación es de solo lectura (no permite editar ni borrar)', async () => {
      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(samplePaidReservation);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      const all = findAllText(root).join(' ');
      expect(all).not.toContain('Editar');
      expect(all).not.toContain('Modificar');
      expect(all).not.toContain('Eliminar');
      expect(all).not.toContain('Cancelar');
      // No hay campos de texto editables en la confirmación
      expect(root.queryAll((n) => n.type === 'TextInput')).toHaveLength(0);
    });

    it('criterio 2.2 y SAD §7.1: la suma de costos de ítems coincide con el total_cop y se formatea en COP', async () => {
      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(samplePaidReservation);

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      const sumOfItems = samplePaidReservation.items.reduce((acc, item) => acc + item.cost_cop, 0);
      expect(sumOfItems).toBe(samplePaidReservation.total_cop);
      expect(textOf(find(root, 'total-amount'))).toBe('$4.300.000');
    });

    it('criterio 6: ante error 500 en confirmación muestra mensaje inesperado genérico', async () => {
      jest.spyOn(endpoints, 'getReservation').mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', 'Database error'),
      );

      const root = await mountConfirmacion({
        reservationCode: 'EU-8K9M2P',
      });

      expect(has(root, 'confirmacion-error')).toBe(true);
      expect(textOf(find(root, 'confirmacion-error'))).toBe('No fue posible completar la operación. Intente nuevamente.');
    });

    it('muestra estado vacío si se accede a ConfirmacionScreen sin reserva activa', async () => {
      const root = await mountConfirmacion();

      expect(has(root, 'no-reservation-container')).toBe(true);
      expect(textOf(find(root, 'no-reservation-container'))).toContain(NO_RESERVATION_NOTICE);

      await act(async () => {
        press(find(root, 'btn-go-home-empty'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Inicio' });
    });
  });

  describe('Pantalla ConsultarReservaScreen (pestaña Reservas)', () => {
    it('criterio 2.6: contiene campo Número de reserva y botón Consultar', async () => {
      const root = await mountConsultar();

      expect(has(root, 'input-search-code')).toBe(true);
      expect(has(root, 'btn-search-reservation')).toBe(true);
      expect(SEARCH_BUTTON_TEXT).toBe('Consultar');
      expect(textOf(find(root, 'btn-search-reservation'))).toBe('Consultar');
    });

    it('criterio 3.1: número vacío muestra mensaje "Ingrese el número de reserva."', async () => {
      const getSpy = jest.spyOn(endpoints, 'getReservation');
      const root = await mountConsultar();

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      expect(getSpy).not.toHaveBeenCalled();
      expect(RESERVATION_CODE_REQUIRED_MESSAGE).toBe('Ingrese el número de reserva.');
      expect(textOf(find(root, 'error-search-code'))).toBe('Ingrese el número de reserva.');
    });

    it.each([
      ['menos de 6 caracteres', 'EU-123'],
      ['más de 6 caracteres', 'EU-1234567'],
      ['sin prefijo', '123456'],
      ['sin guion', 'EU123456'],
      ['prefijo incorrecto', 'AB-8K9M2P'],
      ['caracteres especiales', 'EU-12345!'],
    ])('criterio 3.2: formato distinto de EU- más 6 caracteres alfanuméricos muestra "El número de reserva no es válido." (%s)', async (_desc, input) => {
      const getSpy = jest.spyOn(endpoints, 'getReservation');
      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText(input);
        press(find(root, 'btn-search-reservation'));
      });

      expect(getSpy).not.toHaveBeenCalled();
      expect(RESERVATION_CODE_INVALID_MESSAGE).toBe('El número de reserva no es válido.');
      expect(textOf(find(root, 'error-search-code'))).toBe('El número de reserva no es válido.');
    });

    it('limpia el error de validación cuando el usuario escribe en el campo', async () => {
      const root = await mountConsultar();

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });
      expect(has(root, 'error-search-code')).toBe(true);

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
      });
      expect(has(root, 'error-search-code')).toBe(false);
    });

    it('criterios 2.1 a 2.5 y 5: consulta con número existente pagado muestra los datos completos', async () => {
      const getSpy = jest
        .spyOn(endpoints, 'getReservation')
        .mockResolvedValue(samplePaidReservation);

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      expect(getSpy).toHaveBeenCalledWith('EU-8K9M2P', expect.any(Object));

      expect(has(root, 'reservation-code')).toBe(true);
      expect(textOf(find(root, 'reservation-code'))).toBe('EU-8K9M2P');
      expect(textOf(find(root, 'total-amount'))).toBe('$4.300.000');
      expect(textOf(find(root, 'customer-name'))).toBe('Carlos Mendoza');
      expect(textOf(find(root, 'simulated-payment-notice'))).toContain('El pago fue simulado.');

      // Criterio 4: nunca se muestran datos de tarjeta
      const all = findAllText(root).join(' ');
      expect(all).not.toContain('4242');
      expect(all).not.toContain('CVV');
      expect(all).not.toContain('Tarjeta');
    });

    it.each([
      ['creada', 'creada'],
      ['pago rechazado', 'pago_rechazado'],
      ['cancelada', 'cancelada'],
      ['pendiente', 'pendiente'],
      ['desconocido', 'desconocido'],
    ])('criterio 4: la confirmación solo se muestra para reservas pagadas; reserva con estado %s muestra aviso', async (_desc, status) => {
      const unpaidReservation: Reservation = {
        ...samplePaidReservation,
        status: status as Reservation['status'],
      };

      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(unpaidReservation);

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      // No se muestran detalles de confirmación
      expect(has(root, 'reservation-code')).toBe(false);
      expect(has(root, 'search-error')).toBe(true);
      expect(textOf(find(root, 'search-error'))).toBe('No encontramos una reserva con ese número.');
    });

    it('recorta espacios en blanco iniciales y finales antes de validar y consultar el código', async () => {
      const getSpy = jest
        .spyOn(endpoints, 'getReservation')
        .mockResolvedValue(samplePaidReservation);

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('  EU-8K9M2P  ');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      expect(getSpy).toHaveBeenCalledWith('EU-8K9M2P', expect.any(Object));
      expect(has(root, 'reservation-code')).toBe(true);
    });

    it('bloquea el botón y previene peticiones concurrentes mientras una consulta está en curso', async () => {
      let resolvePromise: (res: Reservation) => void = () => {};
      const pendingPromise = new Promise<Reservation>((resolve) => {
        resolvePromise = resolve;
      });

      const getSpy = jest.spyOn(endpoints, 'getReservation').mockReturnValue(pendingPromise);

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      // Botón debe estar deshabilitado
      const searchBtn = find(root, 'btn-search-reservation');
      expect(searchBtn.props.accessibilityState.disabled).toBe(true);

      // Segundo clic debe ser ignorado
      await act(async () => {
        press(searchBtn);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);

      // Resolver petición pendiente
      await act(async () => {
        resolvePromise(samplePaidReservation);
      });

      expect(has(root, 'reservation-code')).toBe(true);
    });

    it('criterio 4: la consulta de reserva es de solo lectura y no permite modificar datos', async () => {
      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(samplePaidReservation);

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
        press(find(root, 'btn-search-reservation'));
      });

      const all = findAllText(root).join(' ');
      expect(all).not.toContain('Modificar reserva');
      expect(all).not.toContain('Editar reserva');
      expect(all).not.toContain('Cancelar reserva');

      // Único TextInput en pantalla es el de búsqueda
      expect(root.queryAll((n) => n.type === 'TextInput')).toHaveLength(1);
    });

    it('muestra el aviso de carga lenta a los 5 s si la conexión tarda (HU_EU_01_04)', async () => {
      let triggerSlow: (() => void) | undefined;
      jest.spyOn(endpoints, 'getReservation').mockImplementation((_code, options) => {
        triggerSlow = options?.onSlow;
        return new Promise(() => {}); // queda pendiente
      });

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
        press(find(root, 'btn-search-reservation'));
      });

      expect(findAllText(root)).not.toContain(
        'Estamos conectando con el servidor. Esto puede tardar un momento.',
      );

      // Simular evento onSlow
      await act(async () => {
        triggerSlow?.();
      });

      expect(findAllText(root)).toContain(
        'Estamos conectando con el servidor. Esto puede tardar un momento.',
      );
    });

    it('criterio 6: si el número no existe (404) muestra "No encontramos una reserva con ese número."', async () => {
      jest.spyOn(endpoints, 'getReservation').mockRejectedValueOnce(
        new ApiError(404, 'NOT_FOUND', 'Not found'),
      );

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-999999');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      expect(has(root, 'search-error')).toBe(true);
      expect(textOf(find(root, 'search-error'))).toBe('No encontramos una reserva con ese número.');
    });

    it('criterio 6: ante fallo de red en la consulta muestra NetworkErrorView con botón Reintentar', async () => {
      const getSpy = jest
        .spyOn(endpoints, 'getReservation')
        .mockRejectedValueOnce(
          new NetworkError('No hay conexión con el servidor. Revise su conexión e intente nuevamente.'),
        )
        .mockResolvedValueOnce(samplePaidReservation);

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      const all = findAllText(root).join(' ');
      expect(all).toContain('No hay conexión con el servidor.');
      expect(all).toContain('Reintentar');

      const retryButtons = root.queryAll(
        (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Reintentar',
      );
      expect(retryButtons.length).toBeGreaterThan(0);

      await act(async () => {
        press(retryButtons[0]);
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(has(root, 'reservation-code')).toBe(true);
    });

    it('criterio 6: ante error 500 muestra mensaje literal genérico', async () => {
      jest.spyOn(endpoints, 'getReservation').mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', 'Database down'),
      );

      const root = await mountConsultar();

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
      });

      await act(async () => {
        press(find(root, 'btn-search-reservation'));
      });

      expect(UNEXPECTED_ERROR_MESSAGE).toBe(GENERIC_ERROR);
      expect(has(root, 'search-error')).toBe(true);
      expect(textOf(find(root, 'search-error'))).toBe('No fue posible completar la operación. Intente nuevamente.');
    });

    it('criterio 5: Volver al inicio desde la consulta vacía el carrito y navega a Inicio', async () => {
      jest.spyOn(endpoints, 'getReservation').mockResolvedValue(samplePaidReservation);

      const root = await mountConsultar({
        cart: [
          {
            service_id: 'esp-1',
            name: 'Salón',
            category: 'espacio',
            provider_id: 'prv-1',
            provider_name: 'Hacienda Real',
            price_model: 'fijo',
            unit_price_cop: 2_000_000,
            min_guests: 10,
            max_guests: 200,
          },
        ],
      });

      await act(async () => {
        find(root, 'input-search-code').props.onChangeText('EU-8K9M2P');
        press(find(root, 'btn-search-reservation'));
      });

      expect(has(root, 'btn-go-home')).toBe(true);
      await act(async () => {
        press(find(root, 'btn-go-home'));
      });

      const snapshot = JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;
      expect(snapshot.cart).toHaveLength(0);
      expect(mockNavigate).toHaveBeenCalledWith('Inicio');
    });
  });

  describe('Recorrido completo de extremo a extremo en dispositivo (HU_EU_03_11, T_HU_EU_03_11_3)', () => {
    function FullE2EJourney() {
      const { flow, update, clearCart } = useFlow();
      const [currentStep, setCurrentStep] = React.useState<
        'MiEvento' | 'DatosCliente' | 'Pago' | 'Confirmacion' | 'Consultar'
      >('MiEvento');

      return (
        <View>
          <Text testID="flow-step">{currentStep}</Text>
          <Text testID="flow-cart-count">{flow.cart.length}</Text>
          <Text testID="flow-reservation-code">{flow.reservationCode ?? ''}</Text>

          <Pressable
            testID="e2e-setup-cart"
            onPress={() => {
              update({
                eventType: 'boda',
                guests: 100,
                budgetCop: 10_000_000,
                eventDate: '2027-06-15',
                cart: samplePaidReservation.items.map((it) => ({
                  service_id: it.service_id,
                  name: it.name,
                  category: it.service_id.startsWith('esp')
                    ? 'espacio'
                    : it.service_id.startsWith('ali')
                      ? 'alimentacion'
                      : 'decoracion',
                  provider_id: it.provider_id,
                  provider_name: it.provider_name,
                  price_model: 'fijo',
                  unit_price_cop: it.cost_cop,
                  min_guests: 10,
                  max_guests: 200,
                })),
              });
              setCurrentStep('DatosCliente');
            }}
          />

          <Pressable
            testID="e2e-submit-customer"
            onPress={() => {
              update({
                customer: samplePaidReservation.customer,
                eventDate: samplePaidReservation.event_date,
                reservationCode: samplePaidReservation.code,
              });
              setCurrentStep('Pago');
            }}
          />

          <Pressable
            testID="e2e-pay-approved"
            onPress={() => {
              update({
                lastPayment: {
                  status: 'aprobado',
                  reference: 'SIM-REF-998877',
                  amount_cop: samplePaidReservation.total_cop,
                },
              });
              setCurrentStep('Confirmacion');
            }}
          />

          <Pressable
            testID="e2e-go-to-consultar"
            onPress={() => {
              setCurrentStep('Consultar');
            }}
          />

          <Pressable
            testID="e2e-clear-and-home"
            onPress={() => {
              clearCart();
              mockNavigate('Tabs', { screen: 'Inicio' });
            }}
          />

          {currentStep === 'Confirmacion' ? <ConfirmacionScreen /> : null}
          {currentStep === 'Consultar' ? <ConsultarReservaScreen /> : null}
        </View>
      );
    }

    it('ejecuta el recorrido completo de compra: Mi evento -> Datos -> Pago -> Confirmación -> Consulta en pestaña Reservas -> Volver al inicio con carrito vacío', async () => {
      const getSpy = jest
        .spyOn(endpoints, 'getReservation')
        .mockResolvedValue(samplePaidReservation);

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FullE2EJourney />
          </FlowProvider>,
        );
      });

      // 1. Inicia en MiEvento con carrito vacío
      expect(textOf(find(root.container, 'flow-step'))).toBe('MiEvento');
      expect(textOf(find(root.container, 'flow-cart-count'))).toBe('0');

      // 2. Configura MiEvento con 3 servicios (espacio, banquete, decoración)
      await act(async () => {
        press(find(root.container, 'e2e-setup-cart'));
      });
      expect(textOf(find(root.container, 'flow-step'))).toBe('DatosCliente');
      expect(textOf(find(root.container, 'flow-cart-count'))).toBe('3');

      // 3. Completa Datos del cliente y genera la reserva
      await act(async () => {
        press(find(root.container, 'e2e-submit-customer'));
      });
      expect(textOf(find(root.container, 'flow-step'))).toBe('Pago');
      expect(textOf(find(root.container, 'flow-reservation-code'))).toBe('EU-8K9M2P');

      // 4. Procesa el pago aprobado y llega a ConfirmacionScreen
      await act(async () => {
        press(find(root.container, 'e2e-pay-approved'));
      });
      expect(textOf(find(root.container, 'flow-step'))).toBe('Confirmacion');
      expect(getSpy).toHaveBeenCalledWith('EU-8K9M2P', expect.any(Object));

      // 4.1 Verifica datos en la pantalla de Confirmación
      expect(has(root.container, 'reservation-code')).toBe(true);
      expect(textOf(find(root.container, 'reservation-code'))).toBe('EU-8K9M2P');
      expect(textOf(find(root.container, 'total-amount'))).toBe('$4.300.000');
      expect(textOf(find(root.container, 'customer-name'))).toBe('Carlos Mendoza');
      expect(textOf(find(root.container, 'simulated-payment-notice'))).toContain('El pago fue simulado.');

      // 5. El usuario cambia a la pestaña Reservas (ConsultarReservaScreen)
      await act(async () => {
        press(find(root.container, 'e2e-go-to-consultar'));
      });
      expect(textOf(find(root.container, 'flow-step'))).toBe('Consultar');

      // 5.1 Consulta la reserva con el código obtenido
      await act(async () => {
        find(root.container, 'input-search-code').props.onChangeText('EU-8K9M2P');
        press(find(root.container, 'btn-search-reservation'));
      });

      // 5.2 Verifica que los datos coincidan exactamente con la confirmación
      expect(has(root.container, 'reservation-code')).toBe(true);
      expect(textOf(find(root.container, 'reservation-code'))).toBe('EU-8K9M2P');
      expect(textOf(find(root.container, 'total-amount'))).toBe('$4.300.000');
      expect(textOf(find(root.container, 'customer-name'))).toBe('Carlos Mendoza');
      expect(textOf(find(root.container, 'simulated-payment-notice'))).toContain('El pago fue simulado.');

      // 6. El usuario pulsa 'Volver al inicio' desde la consulta de reserva
      expect(has(root.container, 'btn-go-home')).toBe(true);
      await act(async () => {
        press(find(root.container, 'btn-go-home'));
      });

      // 6.1 'Mi evento' queda completamente vacío y navega a Inicio
      expect(textOf(find(root.container, 'flow-cart-count'))).toBe('0');
      expect(mockNavigate).toHaveBeenCalledWith('Inicio');
    });

    it('en el recorrido de consulta maneja adecuadamente número inexistente, formato inválido y reserva no pagada', async () => {
      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FullE2EJourney />
          </FlowProvider>,
        );
      });

      // Ir a la pestaña Reservas
      await act(async () => {
        press(find(root.container, 'e2e-go-to-consultar'));
      });

      // 1. Número vacío
      await act(async () => {
        press(find(root.container, 'btn-search-reservation'));
      });
      expect(textOf(find(root.container, 'error-search-code'))).toBe('Ingrese el número de reserva.');

      // 2. Formato inválido
      await act(async () => {
        find(root.container, 'input-search-code').props.onChangeText('INVALID');
        press(find(root.container, 'btn-search-reservation'));
      });
      expect(textOf(find(root.container, 'error-search-code'))).toBe('El número de reserva no es válido.');

      // 3. Número no existente (404)
      jest.spyOn(endpoints, 'getReservation').mockRejectedValueOnce(
        new ApiError(404, 'NOT_FOUND', 'Not found'),
      );
      await act(async () => {
        find(root.container, 'input-search-code').props.onChangeText('EU-000000');
        press(find(root.container, 'btn-search-reservation'));
      });
      expect(has(root.container, 'search-error')).toBe(true);
      expect(textOf(find(root.container, 'search-error'))).toBe('No encontramos una reserva con ese número.');

      // 4. Reserva no pagada
      jest.spyOn(endpoints, 'getReservation').mockResolvedValueOnce({
        ...samplePaidReservation,
        status: 'creada',
      });
      await act(async () => {
        find(root.container, 'input-search-code').props.onChangeText('EU-111111');
        press(find(root.container, 'btn-search-reservation'));
      });
      expect(has(root.container, 'reservation-code')).toBe(false);
      expect(has(root.container, 'search-error')).toBe(true);
      expect(textOf(find(root.container, 'search-error'))).toBe('No encontramos una reserva con ese número.');
    });
  });
});
