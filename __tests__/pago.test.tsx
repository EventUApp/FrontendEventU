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
import {
  CARD_CVV_INVALID_MESSAGE,
  CARD_EXPIRY_INVALID_MESSAGE,
  CARD_NUMBER_INVALID_MESSAGE,
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

describe('Pruebas exhaustivas de PagoScreen (HU_EU_03_10 / T_HU_EU_03_10_4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Campos, resumen y aviso de simulación (Criterios 2.1, 2.4, 2.5, 2.6)', () => {
    it('criterio 2.1: muestra resumen con número de reserva y monto COP calculado del carrito', async () => {
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

      expect(textOf(find(root, 'summary-reservation-code'))).toBe('EU-8K9M2P');
      expect(textOf(find(root, 'summary-total-cop'))).toBe('$4.300.000');
      const all = findAllText(root).join(' ');
      expect(all).toContain('EU-8K9M2P');
      expect(all).toContain('$4.300.000');
      expect(all).toContain('Carlos Mendoza');
    });

    it('criterio 2.1: prioriza reservationTotalCop cuando está presente en FlowState', async () => {
      const root = await mountScreen({
        reservationCode: 'EU-XYZ123',
        reservationTotalCop: 5_250_000,
        cart: [],
      });

      expect(textOf(find(root, 'summary-reservation-code'))).toBe('EU-XYZ123');
      expect(textOf(find(root, 'summary-total-cop'))).toBe('$5.250.000');
    });

    it('criterio 2.4: aviso permanente literal "Pago simulado: no se cobrará dinero real." visible en todo momento (RF-PAG-02)', async () => {
      const root = await mountScreen({
        reservationCode: 'EU-8K9M2P',
        cart: defaultCart,
      });

      expect(SIMULATION_NOTICE).toBe('Pago simulado: no se cobrará dinero real.');
      const noticeNode = find(root, 'simulation-notice');
      expect(textOf(noticeNode)).toContain(SIMULATION_NOTICE);
    });

    it('criterio 2.5: botón con texto literal "Pagar" disponible', async () => {
      const root = await mountScreen({
        reservationCode: 'EU-8K9M2P',
        cart: defaultCart,
      });

      expect(PAY_BUTTON_TEXT).toBe('Pagar');
      expect(textOf(find(root, 'btn-pay'))).toBe('Pagar');
    });

    it('criterio 2.6: muestra chips de tarjetas de prueba para la demo y autocompleta al tocarlas', async () => {
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

      expect(find(root, 'input-card-number').props.value).toBe('4242 4242 4242 4242');
      expect(find(root, 'input-card-expiry').props.value).toBe('12/28');
      expect(find(root, 'input-card-cvv').props.value).toBe('123');

      // Tocar chip tarjeta rechazada
      await act(async () => {
        press(find(root, 'btn-demo-declined'));
      });

      expect(find(root, 'input-card-number').props.value).toBe('4000 0000 0000 0002');
      expect(find(root, 'input-card-expiry').props.value).toBe('12/28');
      expect(find(root, 'input-card-cvv').props.value).toBe('123');
    });

    it('formatea dinámicamente la entrada de número de tarjeta en grupos de 4 y el vencimiento con barra', async () => {
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        find(root, 'input-card-number').props.onChangeText('1234567812345678');
      });
      expect(find(root, 'input-card-number').props.value).toBe('1234 5678 1234 5678');

      await act(async () => {
        find(root, 'input-card-expiry').props.onChangeText('0729');
      });
      expect(find(root, 'input-card-expiry').props.value).toBe('07/29');
    });
  });

  describe('2. Validaciones exhaustivas en cliente con casos tabulados (Criterios 3.1 a 3.3)', () => {
    it('comprueba mensajes literales exactos de las constantes', () => {
      expect(CARD_NUMBER_INVALID_MESSAGE).toBe('Ingrese un número de tarjeta válido.');
      expect(CARD_EXPIRY_INVALID_MESSAGE).toBe('Ingrese una fecha de vencimiento válida.');
      expect(CARD_CVV_INVALID_MESSAGE).toBe('Ingrese el código de seguridad.');
    });

    it('enviar con todos los campos vacíos muestra los 3 mensajes de error y no llama al API', async () => {
      const postPaymentSpy = jest.spyOn(endpoints, 'postPayment');
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(postPaymentSpy).not.toHaveBeenCalled();
      expect(textOf(find(root, 'error-card-number'))).toBe('Ingrese un número de tarjeta válido.');
      expect(textOf(find(root, 'error-card-expiry'))).toBe('Ingrese una fecha de vencimiento válida.');
      expect(textOf(find(root, 'error-card-cvv'))).toBe('Ingrese el código de seguridad.');
    });

    it.each([
      ['vacío', ''],
      ['espacios', '   '],
      ['4 dígitos', '1234'],
      ['15 dígitos', '424242424242424'],
      ['17 dígitos', '42424242424242421'],
      ['con letras', '424242424242424a'],
      ['símbolos', '4242-4242-4242-424!'],
    ])('criterio 3.1: rechaza número de tarjeta inválido (%s) con mensaje literal', async (_desc, input) => {
      const postPaymentSpy = jest.spyOn(endpoints, 'postPayment');
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved')); // primero llena válidos
      });
      await act(async () => {
        find(root, 'input-card-number').props.onChangeText(input);
        press(find(root, 'btn-pay'));
      });

      expect(postPaymentSpy).not.toHaveBeenCalled();
      expect(textOf(find(root, 'error-card-number'))).toBe('Ingrese un número de tarjeta válido.');
    });

    it.each([
      ['vacío', ''],
      ['espacios', '   '],
      ['mes 00', '00/28'],
      ['mes 13', '13/28'],
      ['mes 99', '99/28'],
      ['solo mes', '12'],
      ['formato incompleto', '12/'],
      ['año pasado', '12/24'],
      ['mes pasado del año actual', '10/26'],
      ['no numérico', 'ab/cd'],
    ])('criterio 3.2: rechaza vencimiento inválido o vencido (%s) con mensaje literal', async (_desc, input) => {
      const postPaymentSpy = jest.spyOn(endpoints, 'postPayment');
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        find(root, 'input-card-expiry').props.onChangeText(input);
        press(find(root, 'btn-pay'));
      });

      expect(postPaymentSpy).not.toHaveBeenCalled();
      expect(textOf(find(root, 'error-card-expiry'))).toBe('Ingrese una fecha de vencimiento válida.');
    });

    it.each([
      ['vacío', ''],
      ['espacios', '   '],
      ['1 dígito', '1'],
      ['2 dígitos', '12'],
      ['con letra', '12a'],
      ['no numérico', 'abc'],
    ])('criterio 3.3: rechaza CVV inválido o incompleto (%s) con mensaje literal', async (_desc, input) => {
      const postPaymentSpy = jest.spyOn(endpoints, 'postPayment');
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        find(root, 'input-card-cvv').props.onChangeText(input);
        press(find(root, 'btn-pay'));
      });

      expect(postPaymentSpy).not.toHaveBeenCalled();
      expect(textOf(find(root, 'error-card-cvv'))).toBe('Ingrese el código de seguridad.');
    });

    it('limpia los errores de validación inmediatamente cuando el usuario corrige el campo', async () => {
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      // Generar errores
      await act(async () => {
        press(find(root, 'btn-pay'));
      });
      expect(has(root, 'error-card-number')).toBe(true);

      // Corregir número
      await act(async () => {
        find(root, 'input-card-number').props.onChangeText('4242424242424242');
      });
      expect(has(root, 'error-card-number')).toBe(false);

      // Corregir vencimiento
      await act(async () => {
        find(root, 'input-card-expiry').props.onChangeText('12/28');
      });
      expect(has(root, 'error-card-expiry')).toBe(false);

      // Corregir CVV
      await act(async () => {
        find(root, 'input-card-cvv').props.onChangeText('123');
      });
      expect(has(root, 'error-card-cvv')).toBe(false);
    });
  });

  describe('3. Flujo de pago aprobado y transición de estados (Criterio 5, RF-PAG-03)', () => {
    it('pago con tarjeta aprobada 4242 4242 4242 4242 pasa a pagada, guarda lastPayment y navega a Confirmacion', async () => {
      const postPaymentSpy = jest
        .spyOn(endpoints, 'postPayment')
        .mockResolvedValue(sampleApprovedPaymentResponse);

      const root = await mountScreen({
        reservationCode: 'EU-8K9M2P',
        cart: defaultCart,
        guests: 80,
      });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });

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

      // Verifica resultado guardado en el flujo
      const snapshot = JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;
      expect(snapshot.lastPayment).toEqual({
        status: 'aprobado',
        reference: 'SIM-REF-998877',
        amount_cop: 4_300_000,
      });

      // Campos locales quedan vacíos tras el pago
      expect(find(root, 'input-card-number').props.value).toBe('');
      expect(find(root, 'input-card-expiry').props.value).toBe('');
      expect(find(root, 'input-card-cvv').props.value).toBe('');
    });
  });

  describe('4. Flujo de pago rechazado y tarjetas desconocidas (Criterios 3.4 y 6, RN-17, RF-PAG-04, RF-PAG-07)', () => {
    it('pago con tarjeta rechazada 4000 0000 0000 0002 muestra mensaje literal exacto y permanece en pantalla', async () => {
      const postPaymentSpy = jest
        .spyOn(endpoints, 'postPayment')
        .mockResolvedValue(sampleDeclinedPaymentResponse);

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-declined'));
      });

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
      const errBox = find(root, 'payment-declined-error');
      expect(textOf(errBox)).toContain(
        'El pago fue rechazado. Verifique los datos o intente con otra tarjeta.',
      );
    });

    it.each([
      ['Visa comercial desconocida', '4111111111111111'],
      ['Mastercard comercial desconocida', '5555555555555555'],
      ['Amex desconocida con 16 dígitos', '3782822463100055'],
      ['Número secuencial no demo', '1234567890123456'],
    ])('criterio 3.4 y RF-PAG-07: cualquier tarjeta distinta de las de prueba se rechaza en el servidor (%s)', async (_desc, number) => {
      jest.spyOn(endpoints, 'postPayment').mockResolvedValue(sampleDeclinedPaymentResponse);

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        find(root, 'input-card-number').props.onChangeText(number);
        find(root, 'input-card-expiry').props.onChangeText('12/28');
        find(root, 'input-card-cvv').props.onChangeText('123');
        press(find(root, 'btn-pay'));
      });

      expect(has(root, 'payment-declined-error')).toBe(true);
      expect(textOf(find(root, 'payment-declined-error'))).toContain(PAYMENT_DECLINED_MESSAGE);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('5. Reintentos tras rechazo y transición a pagada (Criterio 6, RF-PAG-05)', () => {
    it('permite reintentar tras rechazo con tarjeta aprobada y la reserva pasa a pagada', async () => {
      const postPaymentSpy = jest
        .spyOn(endpoints, 'postPayment')
        .mockResolvedValueOnce(sampleDeclinedPaymentResponse)
        .mockResolvedValueOnce(sampleApprovedPaymentResponse);

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      // Intento 1: Rechazado
      await act(async () => {
        press(find(root, 'btn-demo-declined'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });
      expect(has(root, 'payment-declined-error')).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();

      // Intento 2: Usuario toca tarjeta aprobada
      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      // El error de rechazo se oculta al seleccionar nueva tarjeta
      expect(has(root, 'payment-declined-error')).toBe(false);

      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(postPaymentSpy).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
    });

    it('permite múltiples reintentos fallidos sucesivos hasta lograr el pago aprobado', async () => {
      const postPaymentSpy = jest
        .spyOn(endpoints, 'postPayment')
        .mockResolvedValueOnce(sampleDeclinedPaymentResponse) // intento 1
        .mockResolvedValueOnce(sampleDeclinedPaymentResponse) // intento 2
        .mockResolvedValueOnce(sampleApprovedPaymentResponse); // intento 3

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      // Intento 1: Rechazo con demo rechazada
      await act(async () => {
        press(find(root, 'btn-demo-declined'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });
      expect(has(root, 'payment-declined-error')).toBe(true);

      // Intento 2: Rechazo con otra tarjeta
      await act(async () => {
        find(root, 'input-card-number').props.onChangeText('4111 1111 1111 1111');
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });
      expect(has(root, 'payment-declined-error')).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();

      // Intento 3: Éxito con tarjeta aprobada
      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(postPaymentSpy).toHaveBeenCalledTimes(3);
      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
    });
  });

  describe('6. Prevención de doble pago, concurrencia y reserva ya pagada (Criterio 4, RF-PAG-08, SAD §5.4)', () => {
    it('bloquea el botón Pagar y evita llamadas concurrentes ante múltiples pulsaciones simultáneas', async () => {
      let resolvePayment!: (val: PaymentResponse) => void;
      const pendingPromise = new Promise<PaymentResponse>((res) => {
        resolvePayment = res;
      });

      const spy = jest.spyOn(endpoints, 'postPayment').mockReturnValue(pendingPromise);

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });

      // Primera pulsación inicia la llamada
      act(() => {
        press(find(root, 'btn-pay'));
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(find(root, 'btn-pay').props.accessibilityState.disabled).toBe(true);

      // Segunda y tercera pulsación rápida en vuelo son ignoradas
      act(() => {
        press(find(root, 'btn-pay'));
        press(find(root, 'btn-pay'));
      });
      expect(spy).toHaveBeenCalledTimes(1);

      // Resolver llamada
      await act(async () => {
        resolvePayment(sampleApprovedPaymentResponse);
      });

      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
    });

    it('segundo pago sobre reserva ya pagada (409 ALREADY_PAID) se ignora y navega a Confirmacion (SAD §5.4)', async () => {
      jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
        new ApiError(409, 'ALREADY_PAID', 'La reserva ya fue pagada.'),
      );

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });

      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
    });

    it('estado inválido (409 INVALID_STATE) muestra mensaje de error genérico', async () => {
      jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
        new ApiError(409, 'INVALID_STATE', 'La reserva se encuentra cancelada.'),
      );

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });

      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(has(root, 'payment-generic-error')).toBe(true);
      expect(textOf(find(root, 'payment-generic-error'))).toBe(UNEXPECTED_ERROR_MESSAGE);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('7. Seguridad y privacidad — NUNCA almacenar datos de tarjeta (Criterio 4, RN-09, RNF-SEG-02, Regla que no se rompe #6)', () => {
    it('comprueba estrictamente que ni número, ni vencimiento, ni CVV existen en FlowState en ninguna fase', async () => {
      jest.spyOn(endpoints, 'postPayment').mockResolvedValue(sampleApprovedPaymentResponse);

      const root = await mountScreen({
        reservationCode: 'EU-SEC001',
        cart: defaultCart,
        guests: 50,
      });

      // Fase 1: Estado inicial
      let snapshotText = textOf(find(root, 'flow-snapshot'));
      expect(snapshotText).not.toContain('4242');
      expect(snapshotText).not.toContain('123');
      let flowObj = JSON.parse(snapshotText);
      expect(flowObj).not.toHaveProperty('cardNumber');
      expect(flowObj).not.toHaveProperty('card');
      expect(flowObj).not.toHaveProperty('cvv');

      // Fase 2: Usuario llena el formulario con chip
      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      snapshotText = textOf(find(root, 'flow-snapshot'));
      expect(snapshotText).not.toContain('4242424242424242');
      expect(snapshotText).not.toContain('12/28');
      expect(snapshotText).not.toContain('123');

      // Fase 3: Pago completado
      await act(async () => {
        press(find(root, 'btn-pay'));
      });
      snapshotText = textOf(find(root, 'flow-snapshot'));
      flowObj = JSON.parse(snapshotText);

      // Solo se almacena el objeto payment con referencia simulada, monto y status
      expect(flowObj.lastPayment).toEqual({
        status: 'aprobado',
        reference: 'SIM-REF-998877',
        amount_cop: 4_300_000,
      });

      // Ningún dato sensible de tarjeta en absoluto
      expect(snapshotText).not.toContain('4242424242424242');
      expect(snapshotText).not.toContain('12/28');
      expect(snapshotText).not.toContain('123');
      expect(flowObj).not.toHaveProperty('card');
      expect(flowObj).not.toHaveProperty('cardNumber');
      expect(flowObj).not.toHaveProperty('expiry');
      expect(flowObj).not.toHaveProperty('cvv');
    });

    it('después de un pago rechazado, tampoco se filtran ni persisten datos de tarjeta en el flujo', async () => {
      jest.spyOn(endpoints, 'postPayment').mockResolvedValue(sampleDeclinedPaymentResponse);

      const root = await mountScreen({
        reservationCode: 'EU-SEC002',
        cart: defaultCart,
      });

      await act(async () => {
        press(find(root, 'btn-demo-declined'));
      });

      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      const snapshotText = textOf(find(root, 'flow-snapshot'));
      expect(snapshotText).not.toContain('4000000000000002');
      expect(snapshotText).not.toContain('123');
      const flowObj = JSON.parse(snapshotText);
      expect(flowObj.lastPayment).toBeNull();
    });
  });

  describe('8. Red móvil, fallos de conexión y errores de servidor (Criterio 6, HU_EU_01_04, RNF-FIA-01, RNF-FIA-02, SAD §7.3)', () => {
    it('fallo de conexión muestra NetworkErrorView con botón Reintentar y preserva el formulario', async () => {
      const postPaymentSpy = jest
        .spyOn(endpoints, 'postPayment')
        .mockRejectedValueOnce(
          new NetworkError('No hay conexión con el servidor. Revise su conexión e intente nuevamente.'),
        )
        .mockResolvedValueOnce(sampleApprovedPaymentResponse);

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      const all = findAllText(root).join(' ');
      expect(all).toContain('No hay conexión con el servidor.');
      expect(all).toContain('Reintentar');

      const retryButtons = root.queryAll(
        (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Reintentar',
      );
      expect(retryButtons.length).toBeGreaterThan(0);

      // Reintentar
      await act(async () => {
        press(retryButtons[0]);
      });

      expect(postPaymentSpy).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');
    });

    it('error 500 del servidor muestra mensaje literal genérico sin trazas técnicas (RF-GEN-03)', async () => {
      jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', 'Traceback OperationalError in postgres'),
      );

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(UNEXPECTED_ERROR_MESSAGE).toBe(GENERIC_ERROR);
      const genericNode = find(root, 'payment-generic-error');
      expect(textOf(genericNode)).toBe('No fue posible completar la operación. Intente nuevamente.');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('error 404 del servidor (reserva inexistente) muestra mensaje de error genérico', async () => {
      jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
        new ApiError(404, 'NOT_FOUND', 'Reserva no encontrada'),
      );

      const root = await mountScreen({ reservationCode: 'EU-NONEXIST', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(has(root, 'payment-generic-error')).toBe(true);
      expect(textOf(find(root, 'payment-generic-error'))).toBe(UNEXPECTED_ERROR_MESSAGE);
    });

    it('error 422 del servidor con campos específicos mapea los errores a FieldError', async () => {
      jest.spyOn(endpoints, 'postPayment').mockRejectedValueOnce(
        new ApiError(422, 'VALIDATION_ERROR', 'Error de validación', {
          'card.number': 'Número inválido en pasarela',
          'card.expiry': 'Fecha inválida en pasarela',
          'card.cvv': 'CVV inválido en pasarela',
        }),
      );

      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      await act(async () => {
        press(find(root, 'btn-demo-approved'));
      });
      await act(async () => {
        press(find(root, 'btn-pay'));
      });

      expect(textOf(find(root, 'error-card-number'))).toBe('Ingrese un número de tarjeta válido.');
      expect(textOf(find(root, 'error-card-expiry'))).toBe('Ingrese una fecha de vencimiento válida.');
      expect(textOf(find(root, 'error-card-cvv'))).toBe('Ingrese el código de seguridad.');
    });

    it('RNF-USA-02: cumple con área táctil mínima de 44 pt en botón Pagar y chips de prueba', async () => {
      const root = await mountScreen({ reservationCode: 'EU-8K9M2P', cart: defaultCart });

      const payBtn = find(root, 'btn-pay');
      expect(payBtn.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ minHeight: 44 })]),
      );

      const approvedChip = find(root, 'btn-demo-approved');
      expect(approvedChip.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ minHeight: 44 })]),
      );

      const declinedChip = find(root, 'btn-demo-declined');
      expect(declinedChip.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ minHeight: 44 })]),
      );
    });
  });
});
