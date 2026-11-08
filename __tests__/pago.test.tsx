import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { CartService, PaymentResponse } from '../src/api/types';
import PagoScreen, {
  PAY_BUTTON_TEXT,
  PAYMENT_DECLINED_MESSAGE,
  SIMULATION_NOTICE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../src/screens/PagoScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

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
  min_guests: 10,
  max_guests: 200,
});

const defaultCart: CartService[] = [
  makeService('esp-1', 'espacio', 2_000_000, 'Salón Campestre Las Palmas', 'Hacienda Real'),
  makeService('ali-1', 'alimentacion', 1_500_000, 'Banquete Tradicional 3 Tiempos', 'Catering Gourmet'),
  makeService('dec-1', 'decoracion', 800_000, 'Decoración Floral Clásica', 'Flores y Estilo'),
];

function FlowHarness({
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
        <PagoScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

async function mountScreen(initial?: Partial<FlowState>): Promise<TestInstance> {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <FlowHarness initial={initial} />
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

const sampleApprovedPaymentResponse: PaymentResponse = {
  payment: {
    status: 'aprobado',
    reference: 'SIM-REF-998877',
    amount_cop: 4_300_000,
  },
  reservation_status: 'pagada',
};

const sampleDeclinedPaymentResponse: PaymentResponse = {
  payment: {
    status: 'rechazado',
    reference: 'SIM-REF-DECLINED-01',
    amount_cop: 4_300_000,
  },
  reservation_status: 'pago_rechazado',
};

describe('Pantalla PagoScreen (HU_EU_03_10 / T_HU_EU_03_10_3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('criterio 2.1: muestra resumen con número de reserva y monto en COP', async () => {
    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
      guests: 80,
      customer: {
        name: 'Carlos Mendoza',
        email: 'carlos@ejemplo.co',
        phone: '3001234567',
      },
    });

    const codeNode = find(root, 'summary-reservation-code');
    expect(textOf(codeNode)).toBe('EU-8K9M2P');

    const totalNode = find(root, 'summary-total-cop');
    expect(textOf(totalNode)).toBe('$4.300.000');

    const all = findAllText(root).join(' ');
    expect(all).toContain('EU-8K9M2P');
    expect(all).toContain('$4.300.000');
    expect(all).toContain('Carlos Mendoza');
  });

  it('criterio 2.4: aviso permanente "Pago simulado: no se cobrará dinero real." visible en todo momento', async () => {
    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    expect(SIMULATION_NOTICE).toBe('Pago simulado: no se cobrará dinero real.');
    const noticeNode = find(root, 'simulation-notice');
    expect(textOf(noticeNode)).toContain(SIMULATION_NOTICE);
  });

  it('criterio 2.5: muestra botón "Pagar"', async () => {
    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    expect(PAY_BUTTON_TEXT).toBe('Pagar');
    const payBtn = find(root, 'btn-pay');
    expect(textOf(payBtn)).toBe('Pagar');
  });

  it('criterio 2.6: muestra chips de tarjetas de prueba y autocompleta al tocarlas', async () => {
    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    const all = findAllText(root).join(' ');
    expect(all).toContain('4242 4242 4242 4242');
    expect(all).toContain('4000 0000 0000 0002');
    expect(all).toContain('Aprobada');
    expect(all).toContain('Rechazada');

    // Tocar chip tarjeta aprobada
    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    const numInput = find(root, 'input-card-number');
    const expInput = find(root, 'input-card-expiry');
    const cvvInput = find(root, 'input-card-cvv');

    expect(numInput.props.value).toBe('4242 4242 4242 4242');
    expect(expInput.props.value).toBe('12/28');
    expect(cvvInput.props.value).toBe('123');

    // Tocar chip tarjeta rechazada
    await act(async () => {
      press(find(root, 'btn-demo-declined'));
    });

    expect(find(root, 'input-card-number').props.value).toBe('4000 0000 0000 0002');
    expect(find(root, 'input-card-expiry').props.value).toBe('12/28');
    expect(find(root, 'input-card-cvv').props.value).toBe('123');
  });

  it('criterios 3.1 a 3.3: validaciones en cliente con mensajes literales junto a cada campo', async () => {
    const postPaymentSpy = jest.spyOn(endpoints, 'postPayment');
    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    // Enviar con campos vacíos
    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(postPaymentSpy).not.toHaveBeenCalled();

    const errNum = find(root, 'error-card-number');
    const errExp = find(root, 'error-card-expiry');
    const errCvv = find(root, 'error-card-cvv');

    expect(textOf(errNum)).toBe('Ingrese un número de tarjeta válido.');
    expect(textOf(errExp)).toBe('Ingrese una fecha de vencimiento válida.');
    expect(textOf(errCvv)).toBe('Ingrese el código de seguridad.');

    // Probar número inválido (menos de 16 dígitos)
    await act(async () => {
      find(root, 'input-card-number').props.onChangeText('42424242');
      press(find(root, 'btn-pay'));
    });
    expect(textOf(find(root, 'error-card-number'))).toBe('Ingrese un número de tarjeta válido.');

    // Probar fecha vencida
    await act(async () => {
      find(root, 'input-card-expiry').props.onChangeText('10/24');
      press(find(root, 'btn-pay'));
    });
    expect(textOf(find(root, 'error-card-expiry'))).toBe('Ingrese una fecha de vencimiento válida.');

    // Probar CVV incompleto
    await act(async () => {
      find(root, 'input-card-cvv').props.onChangeText('12');
      press(find(root, 'btn-pay'));
    });
    expect(textOf(find(root, 'error-card-cvv'))).toBe('Ingrese el código de seguridad.');
  });

  it('criterio 4 y RF-PAG-08: bloquea el botón Pagar durante el procesamiento', async () => {
    let resolvePayment: (val: PaymentResponse) => void = () => {};
    const pendingPromise = new Promise<PaymentResponse>((res) => {
      resolvePayment = res;
    });

    jest.spyOn(endpoints, 'postPayment').mockReturnValue(pendingPromise);

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    // Rellenar con tarjeta aprobada
    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    // Presionar Pagar
    act(() => {
      press(find(root, 'btn-pay'));
    });

    // Botón debe estar deshabilitado
    const payBtn = find(root, 'btn-pay');
    expect(payBtn.props.accessibilityState.disabled).toBe(true);

    // Resolver promesa
    await act(async () => {
      resolvePayment(sampleApprovedPaymentResponse);
    });

    expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
  });

  it('criterio 5 y RF-PAG-03: éxito con tarjeta aprobada marca reserva pagada y navega a Confirmacion', async () => {
    const postPaymentSpy = jest
      .spyOn(endpoints, 'postPayment')
      .mockResolvedValue(sampleApprovedPaymentResponse);

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
      guests: 80,
    });

    // Llenar datos con chip aprobado
    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    // Pagar
    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(postPaymentSpy).toHaveBeenCalledWith(
      {
        reservation_code: 'EU-8K9M2P',
        card: {
          number: '4242424242424242',
          expiry: '12/28',
          cvv: '123',
        },
      },
      expect.any(Object),
    );

    expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');

    // Regla inquebrantable #6 y criterio 4: NO se guardan datos de tarjeta en el flujo
    const snapshotText = textOf(find(root, 'flow-snapshot'));
    const flowSnapshot = JSON.parse(snapshotText);

    expect(flowSnapshot.lastPayment).toEqual(sampleApprovedPaymentResponse.payment);
    expect(flowSnapshot).not.toHaveProperty('cardNumber');
    expect(flowSnapshot).not.toHaveProperty('card');
    expect(snapshotText).not.toContain('4242424242424242');
    expect(snapshotText).not.toContain('123');
  });

  it('criterio 6 y RF-PAG-04: fallo con tarjeta rechazada muestra mensaje literal y permanece en la pantalla', async () => {
    const postPaymentSpy = jest
      .spyOn(endpoints, 'postPayment')
      .mockResolvedValue(sampleDeclinedPaymentResponse);

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    // Llenar datos con chip rechazada
    await act(async () => {
      press(find(root, 'btn-demo-declined'));
    });

    // Pagar
    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(postPaymentSpy).toHaveBeenCalledWith(
      {
        reservation_code: 'EU-8K9M2P',
        card: {
          number: '4000000000000002',
          expiry: '12/28',
          cvv: '123',
        },
      },
      expect.any(Object),
    );

    expect(mockNavigate).not.toHaveBeenCalled();

    // Mensaje literal
    expect(PAYMENT_DECLINED_MESSAGE).toBe(
      'El pago fue rechazado. Verifique los datos o intente con otra tarjeta.',
    );
    const errorNode = find(root, 'payment-declined-error');
    expect(textOf(errorNode)).toContain(PAYMENT_DECLINED_MESSAGE);
  });

  it('criterio 6 y RF-PAG-05: permite reintentar el pago tras rechazo y pasar a pagada', async () => {
    const postPaymentSpy = jest
      .spyOn(endpoints, 'postPayment')
      .mockResolvedValueOnce(sampleDeclinedPaymentResponse)
      .mockResolvedValueOnce(sampleApprovedPaymentResponse);

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    // Primer intento con tarjeta rechazada
    await act(async () => {
      press(find(root, 'btn-demo-declined'));
    });

    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(has(root, 'payment-declined-error')).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();

    // Reintento: usuario selecciona tarjeta aprobada
    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    // El error de rechazo anterior se limpia al cambiar datos
    expect(has(root, 'payment-declined-error')).toBe(false);

    // Enviar segundo intento
    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(postPaymentSpy).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
  });

  it('criterio 6 y HU_EU_01_04: ante fallo de red muestra NetworkErrorView con botón Reintentar', async () => {
    const postPaymentSpy = jest
      .spyOn(endpoints, 'postPayment')
      .mockRejectedValueOnce(
        new NetworkError('No hay conexión con el servidor. Revise su conexión e intente nuevamente.'),
      )
      .mockResolvedValueOnce(sampleApprovedPaymentResponse);

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    // Muestra error de red con botón Reintentar
    const all = findAllText(root).join(' ');
    expect(all).toContain('No hay conexión con el servidor.');
    expect(all).toContain('Reintentar');

    // Buscar botón reintentar
    const retryButtons = root.queryAll(
      (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Reintentar',
    );
    expect(retryButtons.length).toBeGreaterThan(0);

    // Pulsar Reintentar
    await act(async () => {
      press(retryButtons[0]);
    });

    expect(postPaymentSpy).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
  });

  it('criterio 6: ante error 500 o inesperado muestra mensaje literal genérico', async () => {
    jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL_ERROR', 'Database crashed'),
    );

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(UNEXPECTED_ERROR_MESSAGE).toBe(GENERIC_ERROR);
    const genericNode = find(root, 'payment-generic-error');
    expect(textOf(genericNode)).toBe(GENERIC_ERROR);
    expect(textOf(genericNode)).toBe('No fue posible completar la operación. Intente nuevamente.');
  });

  it('criterio 4 y RF-PAG-08: ante ALREADY_PAID (segundo pago sobre reserva ya pagada) navega a Confirmacion', async () => {
    jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
      new ApiError(409, 'ALREADY_PAID', 'La reserva ya fue pagada.'),
    );

    const root = await mountScreen({
      reservationCode: 'EU-8K9M2P',
      cart: defaultCart,
    });

    await act(async () => {
      press(find(root, 'btn-demo-approved'));
    });

    await act(async () => {
      press(find(root, 'btn-pay'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
  });
});
