import { useNavigation } from '@react-navigation/native';
import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Package } from '../src/api/types';
import CompararScreen from '../src/screens/CompararScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
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

const samplePackages: Package[] = [
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
            name: 'Buffet Tradicional',
            provider_id: 'prv-2',
            provider_name: 'Banquetes Cali',
            verification_status: 'verificado',
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
            name: 'Decoración Floral',
            provider_id: 'prv-3',
            provider_name: 'Flores y Estilo',
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
            name: 'Casa Quinta Campestre',
            provider_id: 'prv-4',
            provider_name: 'Quinta Pance',
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
            name: 'Catering Premium',
            provider_id: 'prv-2',
            provider_name: 'Banquetes Cali',
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
            name: 'Decoración Integral',
            provider_id: 'prv-5',
            provider_name: 'Arte Eventos',
            verification_status: 'verificado',
            cost_cop: 2_000_000,
          },
        ],
      },
    ],
  },
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
            provider_id: 'prv-6',
            provider_name: 'Eventos Valle',
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
            name: 'Banquete de Gala',
            provider_id: 'prv-7',
            provider_name: 'Sabores VIP',
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
            name: 'Decoración Alta Gama',
            provider_id: 'prv-5',
            provider_name: 'Arte Eventos',
            verification_status: 'verificado',
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
            name: 'Banda en vivo',
            provider_id: 'prv-8',
            provider_name: 'Son Cali',
            verification_status: 'verificado',
            cost_cop: 1_000_000,
          },
        ],
      },
    ],
  },
];

function Harness({ initial }: { initial?: Partial<FlowState> }) {
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
        <CompararScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

async function renderScreen(initial?: Partial<FlowState>) {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <Harness initial={initial} />
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

describe('CompararScreen (HU_EU_02_07 — T_HU_EU_02_07_1)', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigation as jest.Mock).mockReturnValue({ navigate: mockNavigate });
  });

  it('muestra título, casillas de selección, datos comparados (modalidad, total, restante y servicios por rubro) y acción Elegir este paquete (criterios 1, 2.1, 2.2, 2.3 y 5)', async () => {
    const root = await renderScreen({
      budgetCop: 10_000_000,
      eventType: 'boda',
      guests: 100,
      packages: samplePackages,
    });
    const c = root.container;

    expect(findAllText(c)).toContain('Comparar paquetes');
    expect(has(c, 'summary-inputs')).toBe(true);
    expect(textOf(find(c, 'summary-inputs'))).toContain('Boda');
    expect(textOf(find(c, 'summary-inputs'))).toContain('100 invitados');
    expect(textOf(find(c, 'summary-inputs'))).toContain('$10.000.000');

    // Casillas de selección presentes con rol checkbox
    expect(has(c, 'checkbox-ahorro')).toBe(true);
    expect(has(c, 'checkbox-equilibrado')).toBe(true);
    expect(has(c, 'checkbox-premium')).toBe(true);
    expect(find(c, 'checkbox-ahorro').props.accessibilityRole).toBe('checkbox');

    // Por defecto se comparan los primeros dos paquetes (Ahorro y Equilibrado)
    expect(has(c, 'compare-card-ahorro')).toBe(true);
    expect(has(c, 'compare-card-equilibrado')).toBe(true);

    // Datos por paquete comparado (Criterio 2.2)
    expect(textOf(find(c, 'compare-total-ahorro'))).toBe('$6.000.000');
    expect(textOf(find(c, 'compare-remaining-ahorro'))).toBe('$4.000.000');
    expect(textOf(find(c, 'compare-total-equilibrado'))).toBe('$8.000.000');
    expect(textOf(find(c, 'compare-remaining-equilibrado'))).toBe('$2.000.000');

    // Desglose de servicios y proveedores
    expect(findAllText(c)).toEqual(
      expect.arrayContaining([
        'Salón Jardín',
        'Jardines del Sur',
        'Casa Quinta Campestre',
        'Quinta Pance',
      ]),
    );

    // Acción 'Elegir este paquete' presente en cada paquete
    expect(has(c, 'choose-package-ahorro')).toBe(true);
    expect(has(c, 'choose-package-equilibrado')).toBe(true);
  });

  it('permite seleccionar 3 paquetes con las casillas y deseleccionar mostrando el mensaje literal si quedan menos de dos (criterios 2.1, 3.1, 6)', async () => {
    const root = await renderScreen({
      budgetCop: 10_000_000,
      eventType: 'boda',
      guests: 100,
      packages: samplePackages,
    });
    const c = root.container;

    // Inicialmente están Ahorro y Equilibrado seleccionados
    expect(find(c, 'checkbox-ahorro').props.accessibilityState).toEqual({ checked: true });
    expect(find(c, 'checkbox-equilibrado').props.accessibilityState).toEqual({ checked: true });
    expect(find(c, 'checkbox-premium').props.accessibilityState).toEqual({ checked: false });
    expect(has(c, 'compare-validation-error')).toBe(false);

    // Agregar Premium a la comparación (3 paquetes)
    await act(async () => {
      press(find(c, 'checkbox-premium'));
    });
    expect(find(c, 'checkbox-premium').props.accessibilityState).toEqual({ checked: true });
    expect(has(c, 'compare-card-premium')).toBe(true);
    expect(textOf(find(c, 'compare-total-premium'))).toBe('$9.500.000');
    expect(textOf(find(c, 'compare-remaining-premium'))).toBe('$500.000');
    expect(has(c, 'compare-validation-error')).toBe(false);

    // Deseleccionar Ahorro (quedan 2: Equilibrado y Premium)
    await act(async () => {
      press(find(c, 'checkbox-ahorro'));
    });
    expect(find(c, 'checkbox-ahorro').props.accessibilityState).toEqual({ checked: false });
    expect(has(c, 'compare-card-ahorro')).toBe(false);
    expect(has(c, 'compare-card-equilibrado')).toBe(true);
    expect(has(c, 'compare-card-premium')).toBe(true);
    expect(has(c, 'compare-validation-error')).toBe(false);

    // Deseleccionar Equilibrado (queda 1: menos de dos) -> Criterio 3.1 & 6
    await act(async () => {
      press(find(c, 'checkbox-equilibrado'));
    });
    expect(find(c, 'checkbox-equilibrado').props.accessibilityState).toEqual({ checked: false });
    expect(has(c, 'compare-validation-error')).toBe(true);
    expect(textOf(find(c, 'compare-validation-error'))).toBe(
      'Seleccione al menos dos paquetes para comparar.',
    );
    expect(has(c, 'compare-card-premium')).toBe(false);

    // Volver a seleccionar Ahorro -> se recuperan los 2 paquetes y desaparece el error
    await act(async () => {
      press(find(c, 'checkbox-ahorro'));
    });
    expect(has(c, 'compare-validation-error')).toBe(false);
    expect(has(c, 'compare-card-ahorro')).toBe(true);
    expect(has(c, 'compare-card-premium')).toBe(true);
  });

  it('Elegir este paquete carga los servicios en Mi evento y navega a la pestaña MiEvento (criterios 2.3 y 5)', async () => {
    const root = await renderScreen({
      budgetCop: 10_000_000,
      eventType: 'boda',
      guests: 100,
      packages: samplePackages,
    });
    const c = root.container;

    await act(async () => {
      press(find(c, 'choose-package-equilibrado'));
    });

    const flowSnap = snapshot(c);
    expect(flowSnap.chosenModality).toBe('equilibrado');
    expect(flowSnap.cartOrigin).toBe('equilibrado');
    expect(flowSnap.chosenServiceIds).toEqual(['svc-esp-2', 'svc-ali-2', 'svc-dec-2']);
    expect(flowSnap.cart.map((s) => s.service_id)).toEqual(['svc-esp-2', 'svc-ali-2', 'svc-dec-2']);
    expect(flowSnap.cart.map((s) => s.category)).toEqual([
      'espacio',
      'alimentacion',
      'decoracion',
    ]);
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'MiEvento' });
  });

  it('no muestra paquetes que superen el presupuesto y no modifica los paquetes del flujo (criterios 4 y 3.2)', async () => {
    // Si el presupuesto es 7.000.000, sólo 'ahorro' ($6M) está dentro del presupuesto;
    // 'equilibrado' ($8M) y 'premium' ($9.5M) superan el presupuesto
    const root = await renderScreen({
      budgetCop: 7_000_000,
      eventType: 'boda',
      guests: 100,
      packages: samplePackages,
    });
    const c = root.container;

    // Solo ahorro es elegible; equilibrado y premium no se muestran por superar presupuesto
    expect(has(c, 'checkbox-ahorro')).toBe(true);
    expect(has(c, 'checkbox-equilibrado')).toBe(false);
    expect(has(c, 'checkbox-premium')).toBe(false);

    // Como solo hay 1 paquete que cumple el presupuesto, se muestra el aviso de menos de 2
    expect(has(c, 'compare-validation-error')).toBe(true);
    expect(textOf(find(c, 'compare-validation-error'))).toBe(
      'Seleccione al menos dos paquetes para comparar.',
    );

    // Los paquetes del flujo permanecen inmutables (Criterio 4)
    expect(snapshot(c).packages).toHaveLength(3);
    expect(snapshot(c).packages.map((p) => p.modality)).toEqual([
      'ahorro',
      'equilibrado',
      'premium',
    ]);
  });

  it('si no hay paquetes cargados consulta el API y tolera error de red con Reintentar y error inesperado 500 (criterios 6, HU_EU_01_04)', async () => {
    const spy = jest
      .spyOn(endpoints, 'postRecommendations')
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', GENERIC_ERROR))
      .mockResolvedValueOnce({ packages: samplePackages, unavailable: [] });

    const root = await renderScreen({
      budgetCop: 10_000_000,
      eventType: 'boda',
      guests: 100,
      packages: [],
    });
    const c = root.container;

    // 1. Fallo de red inicial con botón Reintentar
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

    // 3. Reintento tiene éxito y carga los paquetes
    const retry500 = find(c, 'btn-retry-unexpected');
    await act(async () => {
      press(retry500);
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(has(c, 'checkbox-ahorro')).toBe(true);
    expect(has(c, 'compare-card-ahorro')).toBe(true);
    expect(has(c, 'compare-card-equilibrado')).toBe(true);
    expect(has(c, 'compare-validation-error')).toBe(false);
  });

  it('muestra mensaje informativo cuando no hay paquetes disponibles para comparar', async () => {
    const root = await renderScreen({
      budgetCop: null,
      eventType: null,
      guests: null,
      packages: [],
    });
    const c = root.container;

    expect(has(c, 'compare-empty-notice')).toBe(true);
    expect(textOf(find(c, 'compare-empty-notice'))).toContain(
      'No hay paquetes para comparar.',
    );
  });
});
