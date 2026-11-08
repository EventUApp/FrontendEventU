import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Package } from '../src/api/types';
import PaquetesScreen from '../src/screens/PaquetesScreen';
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

function findByTestId(root: TestInstance, testID: string): TestInstance {
  const matches = root.queryAll((n) => n.props.testID === testID);
  if (matches.length === 0) {
    throw new Error(`No se encontró testID="${testID}"`);
  }
  return matches[0];
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

function FlowHarness({ initial }: { initial?: Partial<FlowState> }) {
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
        <PaquetesScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

const samplePackages: Package[] = [
  {
    modality: 'premium',
    total_cop: 9_500_000,
    remaining_cop: 500_000,
    breakdown: [
      {
        category: 'espacio',
        subtotal_cop: 4_000_000,
        items: [
          {
            service_id: 'svc-esp-3',
            name: 'Hacienda Real',
            provider_id: 'prv-3',
            provider_name: 'Eventos Cali',
            verification_status: 'verificado',
            cost_cop: 4_000_000,
          },
        ],
      },
      {
        category: 'alimentacion',
        subtotal_cop: 3_000_000,
        items: [
          {
            service_id: 'svc-ali-3',
            name: 'Banquete Gourmet',
            provider_id: 'prv-4',
            provider_name: 'Sabores del Valle',
            verification_status: 'verificado',
            cost_cop: 3_000_000,
          },
        ],
      },
      {
        category: 'decoracion',
        subtotal_cop: 1_500_000,
        items: [
          {
            service_id: 'svc-dec-3',
            name: 'Decoración Imperial',
            provider_id: 'prv-5',
            provider_name: 'Arte Floral',
            verification_status: 'en_revision',
            cost_cop: 1_500_000,
          },
        ],
      },
      {
        category: 'entretenimiento',
        subtotal_cop: 1_000_000,
        items: [
          {
            service_id: 'svc-ent-3',
            name: 'Orquesta en vivo',
            provider_id: 'prv-6',
            provider_name: 'Son Cali',
            verification_status: 'verificado',
            cost_cop: 1_000_000,
          },
        ],
      },
    ],
  },
  {
    modality: 'ahorro',
    total_cop: 6_000_000,
    remaining_cop: 4_000_000,
    breakdown: [
      {
        category: 'espacio',
        subtotal_cop: 2_500_000,
        items: [
          {
            service_id: 'svc-esp-1',
            name: 'Salón Jardín',
            provider_id: 'prv-1',
            provider_name: 'Jardines del Sur',
            verification_status: 'verificado',
            cost_cop: 2_500_000,
          },
        ],
      },
      {
        category: 'alimentacion',
        subtotal_cop: 2_200_000,
        items: [
          {
            service_id: 'svc-ali-1',
            name: 'Menú Tradicional',
            provider_id: 'prv-2',
            provider_name: 'Catering Cali',
            verification_status: 'en_revision',
            cost_cop: 2_200_000,
          },
        ],
      },
      {
        category: 'decoracion',
        subtotal_cop: 1_300_000,
        items: [
          {
            service_id: 'svc-dec-1',
            name: 'Decoración Clásica',
            provider_id: 'prv-5',
            provider_name: 'Arte Floral',
            verification_status: 'en_revision',
            cost_cop: 1_300_000,
          },
        ],
      },
    ],
  },
  {
    modality: 'equilibrado',
    total_cop: 8_000_000,
    remaining_cop: 2_000_000,
    breakdown: [
      {
        category: 'espacio',
        subtotal_cop: 3_200_000,
        items: [
          {
            service_id: 'svc-esp-2',
            name: 'Campestre Sol',
            provider_id: 'prv-1',
            provider_name: 'Jardines del Sur',
            verification_status: 'verificado',
            cost_cop: 3_200_000,
          },
        ],
      },
      {
        category: 'alimentacion',
        subtotal_cop: 2_800_000,
        items: [
          {
            service_id: 'svc-ali-2',
            name: 'Buffet Especial',
            provider_id: 'prv-4',
            provider_name: 'Sabores del Valle',
            verification_status: 'verificado',
            cost_cop: 2_800_000,
          },
        ],
      },
      {
        category: 'decoracion',
        subtotal_cop: 2_000_000,
        items: [
          {
            service_id: 'svc-dec-2',
            name: 'Decoración Moderna',
            provider_id: 'prv-5',
            provider_name: 'Arte Floral',
            verification_status: 'en_revision',
            cost_cop: 2_000_000,
          },
        ],
      },
    ],
  },
];

describe('PaquetesScreen (HU_EU_01_02)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('muestra los tres paquetes en orden Ahorro, Equilibrado y Premium con sus totales y restantes en COP', () => {
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              budgetCop: 10_000_000,
              eventType: 'boda',
              guests: 100,
              packages: samplePackages,
            }}
          />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    const cards = root.container.queryAll((n) =>
      typeof n.props.testID === 'string' && n.props.testID.startsWith('package-card-'),
    );
    expect(cards.map((c) => c.props.testID)).toEqual([
      'package-card-ahorro',
      'package-card-equilibrado',
      'package-card-premium',
    ]);

    const texts = findAllText(root.container).join(' | ');
    expect(texts).toContain('Ahorro');
    expect(texts).toContain('Equilibrado');
    expect(texts).toContain('Premium');
    expect(texts).toContain('$6.000.000');
    expect(texts).toContain('$4.000.000');
    expect(texts).toContain('$8.000.000');
    expect(texts).toContain('$2.000.000');
    expect(texts).toContain('$9.500.000');
    expect(texts).toContain('$500.000');
  });

  it('permite expandir el desglose por rubro mostrando servicios, proveedor, precio, estado de verificación y abrir la ficha del proveedor', () => {
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              budgetCop: 10_000_000,
              eventType: 'boda',
              guests: 100,
              packages: samplePackages,
            }}
          />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    // Asegura que el desglose de Ahorro esté visible (o se expanda al pulsar)
    const toggleAhorro = findByTestId(root.container, 'toggle-breakdown-ahorro');
    if (!findAllText(root.container).some((t) => t.includes('Salón Jardín'))) {
      act(() => {
        press(toggleAhorro);
      });
    }

    const texts = findAllText(root.container).join(' | ');
    expect(texts).toContain('Salón Jardín');
    expect(texts).toContain('Jardines del Sur');
    expect(texts).toContain('$2.500.000');
    expect(texts).toContain('Verificado');
    expect(texts).toContain('En revisión');

    act(() => {
      press(findByTestId(root.container, 'provider-link-ahorro-svc-esp-1'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Proveedor', { providerId: 'prv-1' });
  });

  it('al pulsar Elegir este paquete carga sus servicios en Mi evento con la modalidad como origen y navega a Mi evento', () => {
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              budgetCop: 10_000_000,
              eventType: 'boda',
              guests: 100,
              packages: samplePackages,
            }}
          />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    act(() => {
      press(findByTestId(root.container, 'choose-package-equilibrado'));
    });

    const snapshot = JSON.parse(textOf(findByTestId(root.container, 'flow-snapshot'))) as FlowState;
    expect(snapshot.chosenModality).toBe('equilibrado');
    expect(snapshot.cartOrigin).toBe('equilibrado');
    expect(snapshot.chosenServiceIds).toEqual(['svc-esp-2', 'svc-ali-2', 'svc-dec-2']);
    expect(snapshot.cart.map((s) => s.service_id)).toEqual(['svc-esp-2', 'svc-ali-2', 'svc-dec-2']);
    expect(snapshot.cart.map((s) => s.category)).toEqual(['espacio', 'alimentacion', 'decoracion']);
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'MiEvento' });
  });

  it('permite navegar a Comparar paquetes (HU_EU_02_07)', () => {
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              budgetCop: 10_000_000,
              eventType: 'boda',
              guests: 100,
              packages: samplePackages,
            }}
          />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    act(() => {
      press(findByTestId(root.container, 'btn-compare-packages'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('Comparar');
  });

  it('consulta POST /recommendations si no hay paquetes cargados y maneja error de red con Reintentar e inesperado (criterio 6)', async () => {
    const spy = jest
      .spyOn(endpoints, 'postRecommendations')
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', GENERIC_ERROR))
      .mockResolvedValueOnce({ packages: samplePackages, unavailable: [] });

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              budgetCop: 10_000_000,
              eventType: 'boda',
              guests: 100,
              packages: [],
            }}
          />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    expect(findAllText(root.container)).toContain(
      'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
    );

    const retryBtn = root.container.queryAll(
      (n) => n.props.accessibilityRole === 'button' && textOf(n).includes('Reintentar'),
    )[0];

    await act(async () => {
      await press(retryBtn);
    });

    expect(findAllText(root.container)).toContain(
      'No fue posible completar la operación. Intente nuevamente.',
    );

    await act(async () => {
      await press(findByTestId(root.container, 'btn-retry-unexpected'));
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(findAllText(root.container)).toContain('Ahorro');
  });
});
