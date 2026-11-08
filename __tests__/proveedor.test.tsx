import { useNavigation } from '@react-navigation/native';
import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Provider } from '../src/api/types';
import ProveedorScreen, {
  INELIGIBLE_GUESTS_MESSAGE,
  NOT_FOUND_MESSAGE,
  VERIFICATION_WARNING_MESSAGE,
} from '../src/screens/ProveedorScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';
import {
  CANCEL_REPLACE_TEXT,
  CONFIRM_REPLACE_TEXT,
  REPLACE_CATEGORY_CONFIRMATION_MESSAGE,
} from '../src/utils/cart';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
    useRoute: jest.fn(() => ({ params: { providerId: 'prv-default' } })),
  };
});

function textOf(node: TestInstance): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
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

const verifiedProvider: Provider = {
  id: 'prv-hacienda-real',
  name: 'Hacienda Real',
  categories: ['espacio', 'decoracion'],
  description: 'Hacienda campestre en Pance para bodas y eventos inolvidables.',
  neighborhood: 'Pance',
  municipality: 'Cali',
  phone: '3151234567',
  email: 'contacto@haciendareal.com',
  latitude: 3.32,
  longitude: -76.53,
  images: [{ url: 'https://example.com/hacienda.jpg', alt_text: 'Vista de la hacienda' }],
  rating_avg: 4.8,
  rating_count: 24,
  reviews: [],
  verification: {
    status: 'verificado',
    checks: [
      { type: 'Cámara de Comercio', date: '2026-01-15' },
      { type: 'Visita técnica', date: '2026-02-01' },
    ],
  },
  services: [
    {
      id: 'svc-salon-campestre',
      name: 'Salón Campestre',
      category: 'espacio',
      provider_id: 'prv-hacienda-real',
      provider_name: 'Hacienda Real',
      price_cop: 3_500_000,
      price_model: 'fijo',
      level: 'equilibrado',
      description: 'Salón abierto con vista a los jardines y piscina.',
      min_guests: 50,
      max_guests: 200,
    },
    {
      id: 'svc-kiosko-pequeno',
      name: 'Kiosko Colonial',
      category: 'espacio',
      provider_id: 'prv-hacienda-real',
      provider_name: 'Hacienda Real',
      price_cop: 1_800_000,
      price_model: 'fijo',
      level: 'ahorro',
      description: 'Kiosko íntimo para celebraciones familiares.',
      min_guests: 10,
      max_guests: 60,
    },
  ],
};

const unverifiedProvider: Provider = {
  ...verifiedProvider,
  id: 'prv-sonido-cali',
  name: 'Sonido Cali',
  categories: ['entretenimiento'],
  verification: {
    status: 'en_revision',
    checks: [],
  },
  services: [
    {
      id: 'svc-dj-fiesta',
      name: 'DJ y Luces Fiesta',
      category: 'entretenimiento',
      provider_id: 'prv-sonido-cali',
      provider_name: 'Sonido Cali',
      price_cop: 800_000,
      price_model: 'fijo',
      level: 'ahorro',
      description: 'Montaje de sonido profesional y luces robóticas.',
      min_guests: 20,
      max_guests: 500,
    },
  ],
};

function Harness({
  initial,
  providerId,
  requireReplaceConfirm,
}: {
  initial?: Partial<FlowState>;
  providerId: string;
  requireReplaceConfirm?: boolean;
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
        <ProveedorScreen
          route={{ params: { providerId } }}
          requireReplaceConfirm={requireReplaceConfirm}
        />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

async function renderScreen(
  providerId: string,
  initial?: Partial<FlowState>,
  requireReplaceConfirm?: boolean,
) {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <Harness
          initial={initial}
          providerId={providerId}
          requireReplaceConfirm={requireReplaceConfirm}
        />
      </FlowProvider>,
    );
  });
  if (initial) {
    await act(async () => {
      press(find(root.container, 'seed-flow'));
    });
  }
  return root;
}

const snapshot = (root: TestInstance): FlowState =>
  JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;

describe('ProveedorScreen (HU_EU_02_08 — T_HU_EU_02_08_3)', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigation as jest.Mock).mockReturnValue({ navigate: mockNavigate });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('muestra datos obligatorios: nombre, rubros, descripción, ubicación y datos de contacto (criterios 2.1 a 2.4, 3.2)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

    const root = await renderScreen(verifiedProvider.id);
    const c = root.container;

    expect(textOf(find(c, 'provider-name'))).toBe('Hacienda Real');
    expect(findAllText(c)).toContain('Espacio');
    expect(findAllText(c)).toContain('Decoración');
    expect(textOf(find(c, 'provider-description'))).toContain(
      'Hacienda campestre en Pance para bodas y eventos inolvidables.',
    );
    expect(textOf(find(c, 'provider-location'))).toContain('Pance, Cali');
    expect(textOf(find(c, 'provider-phone'))).toContain('3151234567');
    expect(textOf(find(c, 'provider-email'))).toContain('contacto@haciendareal.com');
  });

  it('muestra estado Verificado, aviso legal permanente y comprobaciones con tipo y fecha cuando tiene comprobaciones registradas (criterios 2.5, 2.6, 3.1, 4 y 5)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

    const root = await renderScreen(verifiedProvider.id);
    const c = root.container;

    // Estado Verificado
    expect(textOf(find(c, 'verification-badge'))).toBe('Verificado');

    // Aviso legal de no garantía (Criterio 5)
    expect(has(c, 'verification-notice')).toBe(true);
    expect(textOf(find(c, 'verification-notice'))).toBe(VERIFICATION_WARNING_MESSAGE);
    expect(textOf(find(c, 'verification-notice'))).toBe(
      'La verificación confirma los datos del proveedor, pero no garantiza el cumplimiento del servicio.',
    );

    // Comprobaciones registradas con tipo y fecha (Criterio 2.6)
    expect(has(c, 'checks-section')).toBe(true);
    expect(findAllText(c)).toContain('Cámara de Comercio');
    expect(findAllText(c)).toContain('2026-01-15');
    expect(findAllText(c)).toContain('Visita técnica');
    expect(findAllText(c)).toContain('2026-02-01');
  });

  it('muestra En revisión y no muestra el aviso legal ni comprobaciones si no tiene comprobaciones registradas (criterios 2.5, 3.1 y 4)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(unverifiedProvider);

    const root = await renderScreen(unverifiedProvider.id);
    const c = root.container;

    expect(textOf(find(c, 'verification-badge'))).toBe('En revisión');
    expect(has(c, 'verification-notice')).toBe(false);
    expect(has(c, 'checks-section')).toBe(false);
  });

  it('no muestra Verificado si el estado dice verificado pero la lista de comprobaciones está vacía (criterios 3.1 y 4)', async () => {
    const anomalousProvider: Provider = {
      ...verifiedProvider,
      verification: {
        status: 'verificado',
        checks: [], // Sin comprobaciones registradas
      },
    };
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(anomalousProvider);

    const root = await renderScreen(anomalousProvider.id);
    const c = root.container;

    // Restricción 3.1 & 4: solo se muestra 'Verificado' si existe al menos una comprobación
    expect(textOf(find(c, 'verification-badge'))).toBe('En revisión');
    expect(has(c, 'verification-notice')).toBe(false);
    expect(has(c, 'checks-section')).toBe(false);
  });

  it('muestra servicios del proveedor con nombre, descripción, capacidad y precio, y botón Agregar a mi evento (criterios 2.7 y 2.8)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

    const root = await renderScreen(verifiedProvider.id);
    const c = root.container;

    expect(has(c, 'services-section')).toBe(true);
    expect(textOf(find(c, 'service-name-svc-salon-campestre'))).toBe('Salón Campestre');
    expect(findAllText(c)).toContain('Salón abierto con vista a los jardines y piscina.');
    expect(textOf(find(c, 'service-capacity-svc-salon-campestre'))).toContain('50 a 200 personas');
    expect(textOf(find(c, 'service-price-svc-salon-campestre'))).toBe('$3.500.000');
    expect(has(c, 'btn-add-service-svc-salon-campestre')).toBe(true);
  });

  it('permite agregar un servicio a Mi evento, actualizando FlowContext con cartOrigin personalizado (criterios 2.8 y 5)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

    const root = await renderScreen(verifiedProvider.id, {
      cart: [],
      guests: 100,
    });
    const c = root.container;

    await act(async () => {
      press(find(c, 'btn-add-service-svc-salon-campestre'));
    });

    const flowSnap = snapshot(c);
    expect(flowSnap.cartOrigin).toBe('personalizado');
    expect(flowSnap.cart).toHaveLength(1);
    expect(flowSnap.cart[0]).toMatchObject({
      service_id: 'svc-salon-campestre',
      name: 'Salón Campestre',
      category: 'espacio',
      provider_id: 'prv-hacienda-real',
      provider_name: 'Hacienda Real',
      unit_price_cop: 3_500_000,
    });
  });

  it('deshabilita el servicio que no cubre los invitados indicados y muestra el mensaje literal (criterio 3.3)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

    // Indicamos 100 invitados en el flujo:
    // Salón Campestre (50 a 200) -> ADMITE
    // Kiosko Colonial (10 a 60) -> NO ADMITE
    const root = await renderScreen(verifiedProvider.id, {
      guests: 100,
    });
    const c = root.container;

    // Salón Campestre admite
    const btnSalon = find(c, 'btn-add-service-svc-salon-campestre');
    expect(btnSalon.props.accessibilityState).toMatchObject({ disabled: false });
    expect(has(c, 'ineligible-notice-svc-salon-campestre')).toBe(false);

    // Kiosko Colonial no admite
    const btnKiosko = find(c, 'btn-add-service-svc-kiosko-pequeno');
    expect(btnKiosko.props.accessibilityState).toMatchObject({ disabled: true });
    expect(has(c, 'ineligible-notice-svc-kiosko-pequeno')).toBe(true);
    expect(textOf(find(c, 'ineligible-notice-svc-kiosko-pequeno'))).toBe(
      INELIGIBLE_GUESTS_MESSAGE,
    );
    expect(textOf(find(c, 'ineligible-notice-svc-kiosko-pequeno'))).toBe(
      'Este servicio no admite ese número de invitados.',
    );
  });

  it('muestra el mensaje literal cuando el proveedor no existe (404) (criterio 6)', async () => {
    jest.spyOn(endpoints, 'getProvider').mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Not found'),
    );

    const root = await renderScreen('prv-inexistente');
    const c = root.container;

    expect(has(c, 'provider-not-found')).toBe(true);
    expect(textOf(find(c, 'provider-not-found'))).toBe(NOT_FOUND_MESSAGE);
    expect(textOf(find(c, 'provider-not-found'))).toBe('No encontramos este proveedor.');
  });

  it('maneja error de red con HU_EU_01_04 (NetworkErrorView con Reintentar) y error inesperado 500 (criterio 6)', async () => {
    const spy = jest
      .spyOn(endpoints, 'getProvider')
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', GENERIC_ERROR))
      .mockResolvedValueOnce(verifiedProvider);

    const root = await renderScreen(verifiedProvider.id);
    const c = root.container;

    // 1. Error de red inicial con Reintentar
    expect(findAllText(c)).toContain(
      'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
    );
    const retryButtons = c.queryAll(
      (n) => n.props.accessibilityRole === 'button' && textOf(n).includes('Reintentar'),
    );
    expect(retryButtons.length).toBeGreaterThan(0);

    // 2. Reintento falla con 500
    await act(async () => {
      press(retryButtons[0]);
    });
    expect(findAllText(c)).toContain(
      'No fue posible completar la operación. Intente nuevamente.',
    );

    // 3. Reintento tiene éxito y carga la ficha
    const retry500 = find(c, 'btn-retry-unexpected');
    await act(async () => {
      press(retry500);
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(textOf(find(c, 'provider-name'))).toBe('Hacienda Real');
  });
});

describe('T_HU_EU_02_08_5: Casos de la regla de verificación, proveedor inexistente y ficha completa', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigation as jest.Mock).mockReturnValue({ navigate: mockNavigate });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Regla de verificación (RN-07, RF-PRO-02, RF-PRO-03, RF-PRO-05, criterios 2.5, 2.6, 3.1, 4 y 5)', () => {
    it.each<{
      caso: string;
      status: 'verificado' | 'en_revision';
      checks: { type: string; date: string }[];
      expectedBadge: 'Verificado' | 'En revisión';
      shouldShowNotice: boolean;
      shouldShowChecks: boolean;
    }>([
      {
        caso: 'verificado con una comprobación documentada -> Verificado con aviso y comprobaciones',
        status: 'verificado',
        checks: [{ type: 'Cámara de Comercio', date: '2026-01-10' }],
        expectedBadge: 'Verificado',
        shouldShowNotice: true,
        shouldShowChecks: true,
      },
      {
        caso: 'verificado con múltiples comprobaciones documentadas -> Verificado con aviso y todas las comprobaciones',
        status: 'verificado',
        checks: [
          { type: 'RUT', date: '2026-01-05' },
          { type: 'Cámara de Comercio', date: '2026-01-10' },
          { type: 'Visita técnica', date: '2026-02-15' },
        ],
        expectedBadge: 'Verificado',
        shouldShowNotice: true,
        shouldShowChecks: true,
      },
      {
        caso: 'status verificado pero sin comprobaciones (checks vacíos) -> En revisión, sin aviso ni comprobaciones (RN-07, 3.1, 4)',
        status: 'verificado',
        checks: [],
        expectedBadge: 'En revisión',
        shouldShowNotice: false,
        shouldShowChecks: false,
      },
      {
        caso: 'status en_revision sin comprobaciones -> En revisión, sin aviso ni comprobaciones',
        status: 'en_revision',
        checks: [],
        expectedBadge: 'En revisión',
        shouldShowNotice: false,
        shouldShowChecks: false,
      },
      {
        caso: 'status en_revision aunque tenga comprobaciones -> En revisión, sin aviso ni comprobaciones',
        status: 'en_revision',
        checks: [{ type: 'RUT', date: '2026-01-05' }],
        expectedBadge: 'En revisión',
        shouldShowNotice: false,
        shouldShowChecks: false,
      },
    ])(
      '$caso',
      async ({ status, checks, expectedBadge, shouldShowNotice, shouldShowChecks }) => {
        const testProvider: Provider = {
          ...verifiedProvider,
          id: `prv-test-${status}-${checks.length}`,
          verification: { status, checks },
        };
        jest.spyOn(endpoints, 'getProvider').mockResolvedValue(testProvider);

        const root = await renderScreen(testProvider.id);
        const c = root.container;

        expect(textOf(find(c, 'verification-badge'))).toBe(expectedBadge);
        expect(has(c, 'verification-notice')).toBe(shouldShowNotice);
        if (shouldShowNotice) {
          expect(textOf(find(c, 'verification-notice'))).toBe(VERIFICATION_WARNING_MESSAGE);
        }

        expect(has(c, 'checks-section')).toBe(shouldShowChecks);
        if (shouldShowChecks) {
          for (const chk of checks) {
            expect(findAllText(c)).toContain(chk.type);
            expect(findAllText(c)).toContain(chk.date);
          }
        }
      },
    );
  });

  describe('Validación de capacidad por invitados en bordes exactos (criterio 3.3, RN-14)', () => {
    it.each<{
      caso: string;
      guests: number;
      admitsSalon: boolean;
      admitsKiosko: boolean;
    }>([
      {
        caso: 'exactamente en el mínimo de Salón (50 invitados) -> Salón admite, Kiosko admite',
        guests: 50,
        admitsSalon: true,
        admitsKiosko: true,
      },
      {
        caso: 'exactamente en el máximo de Kiosko (60 invitados) -> Salón admite, Kiosko admite',
        guests: 60,
        admitsSalon: true,
        admitsKiosko: true,
      },
      {
        caso: '1 por encima del máximo de Kiosko (61 invitados) -> Salón admite, Kiosko NO admite',
        guests: 61,
        admitsSalon: true,
        admitsKiosko: false,
      },
      {
        caso: '1 por debajo del mínimo de Salón (49 invitados) -> Salón NO admite, Kiosko admite',
        guests: 49,
        admitsSalon: false,
        admitsKiosko: true,
      },
      {
        caso: 'exactamente en el máximo de Salón (200 invitados) -> Salón admite, Kiosko NO admite',
        guests: 200,
        admitsSalon: true,
        admitsKiosko: false,
      },
      {
        caso: '1 por encima del máximo de Salón (201 invitados) -> Ninguno admite',
        guests: 201,
        admitsSalon: false,
        admitsKiosko: false,
      },
    ])(
      '$caso',
      async ({ guests, admitsSalon, admitsKiosko }) => {
        jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

        const root = await renderScreen(verifiedProvider.id, { guests });
        const c = root.container;

        const btnSalon = find(c, 'btn-add-service-svc-salon-campestre');
        expect(btnSalon.props.accessibilityState).toMatchObject({ disabled: !admitsSalon });
        expect(has(c, 'ineligible-notice-svc-salon-campestre')).toBe(!admitsSalon);

        const btnKiosko = find(c, 'btn-add-service-svc-kiosko-pequeno');
        expect(btnKiosko.props.accessibilityState).toMatchObject({ disabled: !admitsKiosko });
        expect(has(c, 'ineligible-notice-svc-kiosko-pequeno')).toBe(!admitsKiosko);
      },
    );
  });

  describe('Adición a Mi evento y sustitución de rubro (criterio 2.8, RN-23)', () => {
    it('sustituye servicio del mismo rubro y conserva servicios de otros rubros', async () => {
      jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

      const existingCart = [
        {
          service_id: 'svc-espacio-viejo',
          name: 'Salón Viejo',
          category: 'espacio' as const,
          provider_id: 'prv-otro',
          provider_name: 'Otro Proveedor',
          price_model: 'fijo' as const,
          unit_price_cop: 2_000_000,
          min_guests: 10,
          max_guests: 300,
        },
        {
          service_id: 'svc-banquete-existente',
          name: 'Banquete Gourmet',
          category: 'alimentacion' as const,
          provider_id: 'prv-banquetes',
          provider_name: 'Banquetes Cali',
          price_model: 'fijo' as const,
          unit_price_cop: 3_000_000,
          min_guests: 10,
          max_guests: 300,
        },
      ];

      const root = await renderScreen(verifiedProvider.id, {
        cart: existingCart,
        guests: 100,
      });
      const c = root.container;

      await act(async () => {
        press(find(c, 'btn-add-service-svc-salon-campestre'));
      });

      const flowSnap = snapshot(c);
      expect(flowSnap.cart.map((s) => s.service_id)).toEqual([
        'svc-banquete-existente',
        'svc-salon-campestre',
      ]);
      expect(flowSnap.cart.map((s) => s.category)).toEqual(['alimentacion', 'espacio']);
      expect(flowSnap.cartOrigin).toBe('personalizado');
    });

    it('con confirmación habilitada (requireReplaceConfirm), muestra diálogo y Cancelar no altera el carrito (criterio 3.1)', async () => {
      jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

      const existingCart = [
        {
          service_id: 'svc-espacio-viejo',
          name: 'Salón Viejo',
          category: 'espacio' as const,
          provider_id: 'prv-otro',
          provider_name: 'Otro Proveedor',
          price_model: 'fijo' as const,
          unit_price_cop: 2_000_000,
          min_guests: 10,
          max_guests: 300,
        },
      ];

      const root = await renderScreen(
        verifiedProvider.id,
        { cart: existingCart, guests: 100 },
        true, // requireReplaceConfirm = true
      );
      const c = root.container;

      expect(has(c, 'replace-confirmation-dialog')).toBe(false);

      // Presiona agregar otro salón (mismo rubro espacio)
      await act(async () => {
        press(find(c, 'btn-add-service-svc-salon-campestre'));
      });

      // Debe mostrar el diálogo de confirmación con el mensaje literal
      expect(has(c, 'replace-confirmation-dialog')).toBe(true);
      expect(textOf(find(c, 'replace-confirmation-text'))).toBe(
        REPLACE_CATEGORY_CONFIRMATION_MESSAGE,
      );
      expect(textOf(find(c, 'replace-confirmation-text'))).toBe(
        'Ya tiene un servicio de este rubro. ¿Desea reemplazarlo?',
      );
      expect(textOf(find(c, 'btn-confirm-replace'))).toBe(CONFIRM_REPLACE_TEXT);
      expect(textOf(find(c, 'btn-cancel-replace'))).toBe(CANCEL_REPLACE_TEXT);

      // El carrito aún no cambia
      expect(snapshot(c).cart.map((s) => s.service_id)).toEqual(['svc-espacio-viejo']);

      // Toca Cancelar
      await act(async () => {
        press(find(c, 'btn-cancel-replace'));
      });

      // Se oculta el diálogo y el carrito sigue intacto
      expect(has(c, 'replace-confirmation-dialog')).toBe(false);
      expect(snapshot(c).cart.map((s) => s.service_id)).toEqual(['svc-espacio-viejo']);
    });

    it('con confirmación habilitada (requireReplaceConfirm), Reemplazar sustituye el rubro en el carrito (criterio 3.1)', async () => {
      jest.spyOn(endpoints, 'getProvider').mockResolvedValue(verifiedProvider);

      const existingCart = [
        {
          service_id: 'svc-espacio-viejo',
          name: 'Salón Viejo',
          category: 'espacio' as const,
          provider_id: 'prv-otro',
          provider_name: 'Otro Proveedor',
          price_model: 'fijo' as const,
          unit_price_cop: 2_000_000,
          min_guests: 10,
          max_guests: 300,
        },
      ];

      const root = await renderScreen(
        verifiedProvider.id,
        { cart: existingCart, guests: 100 },
        true, // requireReplaceConfirm = true
      );
      const c = root.container;

      // Presiona agregar
      await act(async () => {
        press(find(c, 'btn-add-service-svc-salon-campestre'));
      });

      expect(has(c, 'replace-confirmation-dialog')).toBe(true);

      // Toca Reemplazar
      await act(async () => {
        press(find(c, 'btn-confirm-replace'));
      });

      // Se oculta el diálogo y el servicio fue sustituido con cartOrigin personalizado
      expect(has(c, 'replace-confirmation-dialog')).toBe(false);
      const snap = snapshot(c);
      expect(snap.cart.map((s) => s.service_id)).toEqual(['svc-salon-campestre']);
      expect(snap.cartOrigin).toBe('personalizado');
    });
  });

  describe('Casos de fallo y proveedor inexistente (criterio 6)', () => {
    it('muestra mensaje literal cuando providerId está vacío o ausente', async () => {
      const root = await renderScreen('');
      const c = root.container;

      expect(has(c, 'provider-not-found')).toBe(true);
      expect(textOf(find(c, 'provider-not-found'))).toBe(NOT_FOUND_MESSAGE);
    });
  });
});
