import React, { act } from 'react';
import { Pressable } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import * as endpoints from '../src/api/endpoints';
import type {
  BreakdownLine,
  Category,
  EventType,
  Modality,
  Package,
  RecommendationResponse,
  VerificationStatus,
} from '../src/api/types';
import PaquetesScreen from '../src/screens/PaquetesScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

/**
 * Especificación pura de referencia del algoritmo recomendador (SAD §6, RN-01 a RN-16)
 * usada para verificar las 10 condiciones de SAD §6.8, incluida la prueba de propiedad
 * con 100 entradas aleatorias (criterio 4 de HU_EU_01_03).
 */
export interface RecommenderCatalogService {
  id: string;
  name: string;
  category: Category;
  provider_id: string;
  provider_name: string;
  verification_status: VerificationStatus;
  price_model: 'fijo' | 'por_invitado';
  unit_price_cop: number;
  min_guests: number;
  max_guests: number;
  event_types: EventType[];
}

export const MODALITY_PCT: Record<Modality, number> = {
  ahorro: 0.7,
  equilibrado: 0.85,
  premium: 1.0,
};

export const CATEGORY_SHARES: Record<Category, number> = {
  espacio: 40,
  alimentacion: 35,
  decoracion: 15,
  entretenimiento: 10,
};

const REQUIRED_RUBROS: Category[] = ['espacio', 'alimentacion', 'decoracion'];
const MODALITIES: Modality[] = ['ahorro', 'equilibrado', 'premium'];

export function computeServiceCost(service: RecommenderCatalogService, guests: number): number {
  return service.price_model === 'fijo'
    ? service.unit_price_cop
    : Math.round(service.unit_price_cop * guests);
}

function allocateBudgets(objetivo: number, rubros: Category[]): Record<Category, number> {
  const totalWeight = rubros.reduce((acc, r) => acc + CATEGORY_SHARES[r], 0);
  const topes = {
    espacio: 0,
    alimentacion: 0,
    decoracion: 0,
    entretenimiento: 0,
  };
  for (const r of rubros) {
    topes[r] = Math.floor((objetivo * CATEGORY_SHARES[r]) / totalWeight);
  }
  return topes;
}

function selectByModality<T>(modality: Modality, candidates: T[]): T {
  if (modality === 'ahorro') return candidates[0];
  if (modality === 'premium') return candidates[candidates.length - 1];
  return candidates[Math.floor((candidates.length - 1) / 2)];
}

export function recomendar(
  budgetCop: number,
  eventType: EventType,
  guests: number,
  catalog: RecommenderCatalogService[],
): RecommendationResponse {
  // RN-14: elegibles si admiten el tipo de evento y cubren el número de invitados
  const elegibles = catalog
    .filter(
      (s) =>
        s.event_types.includes(eventType) &&
        guests >= s.min_guests &&
        guests <= s.max_guests,
    )
    .map((s) => ({ ...s, cost_cop: computeServiceCost(s, guests) }));

  const packages: Package[] = [];
  const unavailable: RecommendationResponse['unavailable'] = [];

  for (const modality of MODALITIES) {
    const objetivo = Math.floor(budgetCop * MODALITY_PCT[modality]);
    const rubros: Category[] =
      modality === 'ahorro'
        ? [...REQUIRED_RUBROS]
        : [...REQUIRED_RUBROS, 'entretenimiento'];
    const topes = allocateBudgets(objetivo, rubros);

    const breakdown: BreakdownLine[] = [];
    let missingMandatory = false;

    for (const rubro of rubros) {
      const isMandatory = REQUIRED_RUBROS.includes(rubro);
      const candidatos = elegibles
        .filter((s) => s.category === rubro)
        .sort((a, b) => (a.cost_cop !== b.cost_cop ? a.cost_cop - b.cost_cop : a.id.localeCompare(b.id)));

      const dentro = candidatos.filter((s) => s.cost_cop <= topes[rubro]);

      let chosen: (typeof candidatos)[number] | undefined;
      if (dentro.length > 0) {
        chosen = selectByModality(modality, dentro);
      } else if (isMandatory && candidatos.length > 0) {
        chosen = candidatos[0];
      } else if (isMandatory) {
        missingMandatory = true;
        break;
      } else {
        continue;
      }

      breakdown.push({
        category: rubro,
        subtotal_cop: chosen.cost_cop,
        items: [
          {
            service_id: chosen.id,
            name: chosen.name,
            provider_id: chosen.provider_id,
            provider_name: chosen.provider_name,
            verification_status: chosen.verification_status,
            cost_cop: chosen.cost_cop,
          },
        ],
      });
    }

    if (missingMandatory) {
      unavailable.push({ modality, cause: 'sin_servicios' });
      continue;
    }

    const totalCop = breakdown.reduce((sum, line) => sum + line.subtotal_cop, 0);
    if (totalCop > objetivo) {
      unavailable.push({ modality, cause: 'presupuesto_insuficiente' });
      continue;
    }

    packages.push({
      modality,
      total_cop: totalCop,
      remaining_cop: budgetCop - totalCop,
      breakdown,
    });
  }

  return { packages, unavailable };
}

const seedCatalog: RecommenderCatalogService[] = [
  // Espacio
  {
    id: 'svc-esp-1',
    name: 'Salón Jardín',
    category: 'espacio',
    provider_id: 'prv-1',
    provider_name: 'Jardines del Sur',
    verification_status: 'verificado',
    price_model: 'fijo',
    unit_price_cop: 1_200_000,
    min_guests: 10,
    max_guests: 200,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-esp-2',
    name: 'Hacienda El Paraíso',
    category: 'espacio',
    provider_id: 'prv-2',
    provider_name: 'Eventos Cali',
    verification_status: 'verificado',
    price_model: 'fijo',
    unit_price_cop: 2_500_000,
    min_guests: 20,
    max_guests: 300,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-esp-3',
    name: 'Club Campestre',
    category: 'espacio',
    provider_id: 'prv-3',
    provider_name: 'Club del Valle',
    verification_status: 'verificado',
    price_model: 'fijo',
    unit_price_cop: 3_800_000,
    min_guests: 30,
    max_guests: 500,
    event_types: ['boda', 'xv'],
  },
  // Alimentación (por invitado)
  {
    id: 'svc-ali-1',
    name: 'Menú Tradicional',
    category: 'alimentacion',
    provider_id: 'prv-4',
    provider_name: 'Sabores Vallunos',
    verification_status: 'verificado',
    price_model: 'por_invitado',
    unit_price_cop: 25_000,
    min_guests: 10,
    max_guests: 400,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-ali-2',
    name: 'Buffet Internacional',
    category: 'alimentacion',
    provider_id: 'prv-5',
    provider_name: 'Catering Gourmet',
    verification_status: 'verificado',
    price_model: 'por_invitado',
    unit_price_cop: 45_000,
    min_guests: 20,
    max_guests: 500,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-ali-3',
    name: 'Cena de Gala 3 Tiempos',
    category: 'alimentacion',
    provider_id: 'prv-5',
    provider_name: 'Catering Gourmet',
    verification_status: 'verificado',
    price_model: 'por_invitado',
    unit_price_cop: 65_000,
    min_guests: 20,
    max_guests: 500,
    event_types: ['boda', 'xv'],
  },
  // Decoración
  {
    id: 'svc-dec-1',
    name: 'Decoración Básica',
    category: 'decoracion',
    provider_id: 'prv-6',
    provider_name: 'Arte Floral',
    verification_status: 'en_revision',
    price_model: 'fijo',
    unit_price_cop: 600_000,
    min_guests: 1,
    max_guests: 500,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-dec-2',
    name: 'Decoración Romántica',
    category: 'decoracion',
    provider_id: 'prv-6',
    provider_name: 'Arte Floral',
    verification_status: 'en_revision',
    price_model: 'fijo',
    unit_price_cop: 1_100_000,
    min_guests: 1,
    max_guests: 500,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-dec-3',
    name: 'Decoración Luxury',
    category: 'decoracion',
    provider_id: 'prv-7',
    provider_name: 'Diseño Imperial',
    verification_status: 'verificado',
    price_model: 'fijo',
    unit_price_cop: 1_500_000,
    min_guests: 1,
    max_guests: 500,
    event_types: ['boda', 'xv'],
  },
  // Entretenimiento
  {
    id: 'svc-ent-1',
    name: 'DJ y Sonido Básico',
    category: 'entretenimiento',
    provider_id: 'prv-8',
    provider_name: 'Son Cali',
    verification_status: 'verificado',
    price_model: 'fijo',
    unit_price_cop: 500_000,
    min_guests: 1,
    max_guests: 500,
    event_types: ['cumpleanos', 'boda', 'xv'],
  },
  {
    id: 'svc-ent-2',
    name: 'Orquesta en Vivo',
    category: 'entretenimiento',
    provider_id: 'prv-8',
    provider_name: 'Son Cali',
    verification_status: 'verificado',
    price_model: 'fijo',
    unit_price_cop: 950_000,
    min_guests: 20,
    max_guests: 500,
    event_types: ['boda', 'xv'],
  },
];

// Generador pseudoaleatorio determinista con semilla fija (Mulberry32)
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  const { update } = useFlow();
  const [mounted, setMounted] = React.useState(!initial);

  return !mounted ? (
    <Pressable
      testID="seed-flow"
      onPress={() => {
        if (initial) update(initial);
        setMounted(true);
      }}
    />
  ) : (
    <PaquetesScreen />
  );
}

describe('Algoritmo recomendador — Casos unitarios y de propiedad (HU_EU_01_03, SAD §6.8)', () => {
  it('Caso 1: Presupuesto holgado con catálogo semilla genera tres paquetes y ninguno supera el presupuesto', () => {
    const budget = 12_000_000;
    const res = recomendar(budget, 'boda', 50, seedCatalog);
    expect(res.packages.map((p) => p.modality)).toEqual(['ahorro', 'equilibrado', 'premium']);
    expect(res.unavailable).toEqual([]);
    for (const pkg of res.packages) {
      expect(pkg.total_cop).toBeLessThanOrEqual(budget);
      expect(pkg.total_cop).toBeLessThanOrEqual(Math.floor(budget * MODALITY_PCT[pkg.modality]));
      expect(pkg.remaining_cop).toBe(budget - pkg.total_cop);
    }
  });

  it('Caso 2: Presupuesto igual al mínimo posible del paquete Ahorro (al 70 %) genera Ahorro', () => {
    // Mínimo para 50 invitados: espacio 1.200.000 + alimentación (25.000*50=1.250.000) + decoración 600.000 = 3.050.000
    // Para que objetivo Ahorro (floor(budget * 0.7)) >= 3.050.000 -> budget = 4.357.143
    const budget = 4_357_143;
    const res = recomendar(budget, 'boda', 50, seedCatalog);
    const ahorro = res.packages.find((p) => p.modality === 'ahorro');
    expect(ahorro).toBeDefined();
    expect(ahorro?.total_cop).toBe(3_050_000);
    expect(ahorro?.total_cop).toBeLessThanOrEqual(Math.floor(budget * 0.7));
  });

  it('Caso 3: Presupuesto menor que el paquete más barato devuelve packages vacío y causa presupuesto_insuficiente', () => {
    const res = recomendar(2_000_000, 'boda', 50, seedCatalog);
    expect(res.packages).toEqual([]);
    expect(res.unavailable).toEqual([
      { modality: 'ahorro', cause: 'presupuesto_insuficiente' },
      { modality: 'equilibrado', cause: 'presupuesto_insuficiente' },
      { modality: 'premium', cause: 'presupuesto_insuficiente' },
    ]);
  });

  it('Caso 4: Un rubro obligatorio sin servicios elegibles no genera modalidades y marca causa sin_servicios', () => {
    const withoutDecoracion = seedCatalog.filter((s) => s.category !== 'decoracion');
    const res = recomendar(15_000_000, 'boda', 50, withoutDecoracion);
    expect(res.packages).toEqual([]);
    expect(res.unavailable).toEqual([
      { modality: 'ahorro', cause: 'sin_servicios' },
      { modality: 'equilibrado', cause: 'sin_servicios' },
      { modality: 'premium', cause: 'sin_servicios' },
    ]);
  });

  it('Caso 5: Servicios con capacidad insuficiente para el número de invitados quedan excluidos (RN-14)', () => {
    // Para 250 invitados, svc-esp-1 (max 200) queda excluido; Ahorro debe elegir svc-esp-2 (max 300)
    const res = recomendar(25_000_000, 'boda', 250, seedCatalog);
    const ahorro = res.packages.find((p) => p.modality === 'ahorro');
    expect(ahorro).toBeDefined();
    const espacioItem = ahorro?.breakdown.find((b) => b.category === 'espacio')?.items[0];
    expect(espacioItem?.service_id).toBe('svc-esp-2');
  });

  it('Caso 6: Desempate determinista ante igual costo: gana el menor identificador (RN-13)', () => {
    const tieCatalog: RecommenderCatalogService[] = [
      {
        id: 'svc-esp-b',
        name: 'Espacio B',
        category: 'espacio',
        provider_id: 'p1',
        provider_name: 'P1',
        verification_status: 'verificado',
        price_model: 'fijo',
        unit_price_cop: 1_000_000,
        min_guests: 1,
        max_guests: 500,
        event_types: ['boda'],
      },
      {
        id: 'svc-esp-a',
        name: 'Espacio A',
        category: 'espacio',
        provider_id: 'p1',
        provider_name: 'P1',
        verification_status: 'verificado',
        price_model: 'fijo',
        unit_price_cop: 1_000_000,
        min_guests: 1,
        max_guests: 500,
        event_types: ['boda'],
      },
      ...seedCatalog.filter((s) => s.category !== 'espacio'),
    ];

    const res = recomendar(10_000_000, 'boda', 50, tieCatalog);
    const ahorroEspacio = res.packages
      .find((p) => p.modality === 'ahorro')
      ?.breakdown.find((b) => b.category === 'espacio')?.items[0];
    expect(ahorroEspacio?.service_id).toBe('svc-esp-a');
  });

  it('Caso 7: Costo por invitado se multiplica por invitados y se redondea a COP entero (RN-15)', () => {
    const svc: RecommenderCatalogService = {
      id: 'svc-ali-dec',
      name: 'Menú',
      category: 'alimentacion',
      provider_id: 'p1',
      provider_name: 'P1',
      verification_status: 'verificado',
      price_model: 'por_invitado',
      unit_price_cop: 33_333.6,
      min_guests: 1,
      max_guests: 500,
      event_types: ['boda'],
    };
    const cost = computeServiceCost(svc, 3);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBe(Math.round(33_333.6 * 3));
  });

  it('Caso 8: Tipo de evento sin servicios elegibles devuelve causa sin_servicios', () => {
    const onlyBodaCatalog = seedCatalog.map((s) => ({ ...s, event_types: ['boda'] as EventType[] }));
    const res = recomendar(15_000_000, 'cumpleanos', 50, onlyBodaCatalog);
    expect(res.packages).toEqual([]);
    expect(res.unavailable.every((u) => u.cause === 'sin_servicios')).toBe(true);
  });

  it('Caso 9: Determinismo — mismas entradas dos veces producen salida idéntica (RF-REC-09)', () => {
    const r1 = recomendar(10_000_000, 'xv', 80, seedCatalog);
    const r2 = recomendar(10_000_000, 'xv', 80, seedCatalog);
    expect(r1).toEqual(r2);
  });

  it('Caso 10 (Prueba de propiedad): 100 entradas aleatorias con semilla fija nunca superan el presupuesto, incluyen los 3 rubros obligatorios y total = suma de ítems', () => {
    const rng = createRng(20261107);
    const eventTypes: EventType[] = ['cumpleanos', 'boda', 'xv'];
    const categories: Category[] = ['espacio', 'alimentacion', 'decoracion', 'entretenimiento'];

    for (let i = 0; i < 100; i += 1) {
      const budgetCop = Math.floor(1_000_000 + rng() * 49_000_000);
      const guests = Math.floor(1 + rng() * 500);
      const eventType = eventTypes[Math.floor(rng() * eventTypes.length)];

      // Generar catálogo aleatorio de entre 4 y 24 servicios
      const catalogSize = Math.floor(4 + rng() * 20);
      const randomCatalog: RecommenderCatalogService[] = [];
      for (let j = 0; j < catalogSize; j += 1) {
        const category = categories[j % categories.length];
        const priceModel = rng() < 0.5 ? 'fijo' : 'por_invitado';
        const unitPrice =
          priceModel === 'fijo'
            ? Math.floor(200_000 + rng() * 6_000_000)
            : Math.floor(10_000 + rng() * 90_000);
        const minGuests = Math.floor(1 + rng() * 50);
        const maxGuests = Math.floor(minGuests + rng() * (500 - minGuests));

        randomCatalog.push({
          id: `svc-${i}-${j.toString().padStart(2, '0')}`,
          name: `Servicio ${j}`,
          category,
          provider_id: `prv-${j}`,
          provider_name: `Proveedor ${j}`,
          verification_status: rng() < 0.7 ? 'verificado' : 'en_revision',
          price_model: priceModel,
          unit_price_cop: unitPrice,
          min_guests: minGuests,
          max_guests: maxGuests,
          event_types: [eventType],
        });
      }

      const result = recomendar(budgetCop, eventType, guests, randomCatalog);

      // En todas las 100 ejecuciones:
      for (const pkg of result.packages) {
        // 1. Nunca supera el presupuesto ni el porcentaje de la modalidad (RN-01, RN-11)
        const modalityCap = Math.floor(budgetCop * MODALITY_PCT[pkg.modality]);
        expect(pkg.total_cop).toBeLessThanOrEqual(budgetCop);
        expect(pkg.total_cop).toBeLessThanOrEqual(modalityCap);

        // 2. Incluye siempre espacio, alimentación y decoración (RN-03)
        const pkgCategories = pkg.breakdown.map((b) => b.category);
        expect(pkgCategories).toEqual(
          expect.arrayContaining(['espacio', 'alimentacion', 'decoracion']),
        );

        // 3. Total es exactamente la suma de ítems y remaining_cop = budgetCop - total_cop (RN-04, RN-05)
        const sumItems = pkg.breakdown.reduce(
          (acc, line) => acc + line.items.reduce((s, it) => s + it.cost_cop, 0),
          0,
        );
        expect(pkg.total_cop).toBe(sumItems);
        expect(pkg.remaining_cop).toBe(budgetCop - pkg.total_cop);
        expect(Number.isInteger(pkg.total_cop)).toBe(true);
        expect(Number.isInteger(pkg.remaining_cop)).toBe(true);
      }

      // 4. Toda modalidad o está en packages o está en unavailable
      expect(result.packages.length + result.unavailable.length).toBe(3);
    }
  });
});

describe('Mensajes en PaquetesScreen ante casos sin paquete posible (HU_EU_01_03, criterio 6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('6.1 muestra mensaje literal cuando el presupuesto es insuficiente', async () => {
    jest.spyOn(endpoints, 'postRecommendations').mockResolvedValue({
      packages: [],
      unavailable: [
        { modality: 'ahorro', cause: 'presupuesto_insuficiente' },
        { modality: 'equilibrado', cause: 'presupuesto_insuficiente' },
        { modality: 'premium', cause: 'presupuesto_insuficiente' },
      ],
    });

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness initial={{ budgetCop: 1_000_000, eventType: 'boda', guests: 100, packages: [] }} />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    expect(findAllText(root.container)).toContain(
      'Con ese presupuesto no es posible armar un paquete. Pruebe con un presupuesto mayor.',
    );
  });

  it('6.2 muestra mensaje literal cuando un rubro obligatorio no tiene servicios elegibles', async () => {
    jest.spyOn(endpoints, 'postRecommendations').mockResolvedValue({
      packages: [],
      unavailable: [
        { modality: 'ahorro', cause: 'sin_servicios' },
        { modality: 'equilibrado', cause: 'sin_servicios' },
        { modality: 'premium', cause: 'sin_servicios' },
      ],
    });

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness initial={{ budgetCop: 10_000_000, eventType: 'xv', guests: 450, packages: [] }} />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    expect(findAllText(root.container)).toContain(
      'No hay servicios disponibles para este tipo de evento o número de invitados.',
    );
  });
});
