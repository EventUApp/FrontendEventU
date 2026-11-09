import React, { act } from 'react';
import { Text, View } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type {
  CartService,
  HomeResponse,
  PaymentResponse,
  Provider,
  ProviderSummary,
  ProvidersResponse,
  RecommendationResponse,
  Reservation,
} from '../src/api/types';
import ConfirmacionScreen from '../src/screens/ConfirmacionScreen';
import ConsultarReservaScreen from '../src/screens/ConsultarReservaScreen';
import DatosClienteScreen from '../src/screens/DatosClienteScreen';
import InicioScreen from '../src/screens/InicioScreen';
import MiEventoScreen from '../src/screens/MiEventoScreen';
import PagoScreen from '../src/screens/PagoScreen';
import PaquetesScreen from '../src/screens/PaquetesScreen';
import PresupuestoScreen from '../src/screens/PresupuestoScreen';
import ProveedorScreen from '../src/screens/ProveedorScreen';
import ResultadosScreen from '../src/screens/ResultadosScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';
import { font, MIN_TOUCH } from '../src/theme';
import {
  MISSING_CATEGORIES_MESSAGE,
} from '../src/utils/cart';
import { formatCOP } from '../src/utils/money';

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
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

// ---------------------------------------------------------------------------
// DATOS DE PRUEBA REALISTAS PARA USUARIO FINAL
// ---------------------------------------------------------------------------

const sampleHomeData: HomeResponse = {
  featured: [
    {
      id: 'prv-hacienda-maria',
      name: 'Hacienda La María',
      categories: ['espacio'],
      neighborhood: 'Pance',
      municipality: 'Cali',
      latitude: 3.32,
      longitude: -76.53,
      cover_url: 'https://images.example.com/hacienda.jpg',
      rating_avg: 4.9,
      rating_count: 28,
      verification_status: 'verificado',
      price_from_cop: 2500000,
      featured: true,
    },
  ],
  categories: [
    { category: 'espacio', count: 10 },
    { category: 'alimentacion', count: 8 },
    { category: 'decoracion', count: 6 },
    { category: 'entretenimiento', count: 4 },
  ],
};

const sampleRecommendation: RecommendationResponse = {
  packages: [
    {
      modality: 'ahorro',
      total_cop: 7800000,
      remaining_cop: 4200000,
      breakdown: [
        {
          category: 'espacio',
          subtotal_cop: 3200000,
          items: [
            {
              service_id: 'srv-esp-ahorro',
              name: 'Salón Clásico Pance',
              provider_id: 'prv-salon-pance',
              provider_name: 'Salón Social Pance',
              cost_cop: 3200000,
              verification_status: 'verificado',
            },
          ],
        },
        {
          category: 'alimentacion',
          subtotal_cop: 3200000,
          items: [
            {
              service_id: 'srv-ali-ahorro',
              name: 'Buffet Tradicional Caleño',
              provider_id: 'prv-catering-cali',
              provider_name: 'Catering del Valle',
              cost_cop: 3200000,
              verification_status: 'verificado',
            },
          ],
        },
        {
          category: 'decoracion',
          subtotal_cop: 1400000,
          items: [
            {
              service_id: 'srv-dec-ahorro',
              name: 'Decoración Esencial Luces y Flores',
              provider_id: 'prv-deco-estilo',
              provider_name: 'DecoEstilo Cali',
              cost_cop: 1400000,
              verification_status: 'verificado',
            },
          ],
        },
      ],
    },
    {
      modality: 'equilibrado',
      total_cop: 9900000,
      remaining_cop: 2100000,
      breakdown: [
        {
          category: 'espacio',
          subtotal_cop: 4000000,
          items: [
            {
              service_id: 'srv-esp-equi',
              name: 'Hacienda Campestre La María',
              provider_id: 'prv-hacienda-maria',
              provider_name: 'Hacienda La María',
              cost_cop: 4000000,
              verification_status: 'verificado',
            },
          ],
        },
        {
          category: 'alimentacion',
          subtotal_cop: 4000000,
          items: [
            {
              service_id: 'srv-ali-equi',
              name: 'Banquete Tres Tiempos',
              provider_id: 'prv-catering-cali',
              provider_name: 'Catering del Valle',
              cost_cop: 4000000,
              verification_status: 'verificado',
            },
          ],
        },
        {
          category: 'decoracion',
          subtotal_cop: 1900000,
          items: [
            {
              service_id: 'srv-dec-equi',
              name: 'Ambientación Temática Completa',
              provider_id: 'prv-deco-estilo',
              provider_name: 'DecoEstilo Cali',
              cost_cop: 1900000,
              verification_status: 'verificado',
            },
          ],
        },
      ],
    },
    {
      modality: 'premium',
      total_cop: 11800000,
      remaining_cop: 200000,
      breakdown: [
        {
          category: 'espacio',
          subtotal_cop: 5000000,
          items: [
            {
              service_id: 'srv-esp-prem',
              name: 'Gran Salón Campestre Imperial',
              provider_id: 'prv-salon-imperial',
              provider_name: 'Salón Imperial',
              cost_cop: 5000000,
              verification_status: 'verificado',
            },
          ],
        },
        {
          category: 'alimentacion',
          subtotal_cop: 4800000,
          items: [
            {
              service_id: 'srv-ali-prem',
              name: 'Cena Gourmet Internacional con Postres',
              provider_id: 'prv-catering-cali',
              provider_name: 'Catering del Valle',
              cost_cop: 4800000,
              verification_status: 'verificado',
            },
          ],
        },
        {
          category: 'decoracion',
          subtotal_cop: 2000000,
          items: [
            {
              service_id: 'srv-dec-prem',
              name: 'Decoración Premium Floral Alta Gama',
              provider_id: 'prv-deco-estilo',
              provider_name: 'DecoEstilo Cali',
              cost_cop: 2000000,
              verification_status: 'verificado',
            },
          ],
        },
      ],
    },
  ],
  unavailable: [],
};

const sampleProviderHacienda: Provider = {
  id: 'prv-hacienda-maria',
  name: 'Hacienda La María',
  categories: ['espacio'],
  description: 'Exclusiva hacienda campestre para eventos sociales en el sur de Cali.',
  neighborhood: 'Pance',
  municipality: 'Cali',
  phone: '3157778899',
  email: 'eventos@haciendalamaria.com',
  latitude: 3.32,
  longitude: -76.53,
  images: [
    { url: 'https://images.example.com/hacienda-1.jpg', alt_text: 'Vista de los jardines' },
    { url: 'https://images.example.com/hacienda-2.jpg', alt_text: 'Salón principal' },
  ],
  rating_avg: 4.9,
  rating_count: 28,
  reviews: [
    {
      author_name: 'Carolina Duque',
      rating: 5,
      comment: 'Hermoso lugar, amplios jardines y atención impecable.',
      reviewed_on: '2026-10-15',
    },
  ],
  verification: {
    status: 'verificado',
    checks: [
      {
        type: 'registro_mercantil',
        date: '2026-01-10',
      },
      {
        type: 'visita_tecnica',
        date: '2026-02-12',
      },
    ],
  },
  services: [
    {
      id: 'srv-esp-hacienda',
      name: 'Alquiler Exclusivo de Hacienda por 8 Horas',
      category: 'espacio',
      price_model: 'fijo',
      price_cop: 4000000,
      level: 'equilibrado',
      min_guests: 50,
      max_guests: 250,
      provider_id: 'prv-hacienda-maria',
      provider_name: 'Hacienda La María',
      description: 'Incluye quiosco, jardines y parqueadero vigilado.',
    },
  ],
};

const sampleProvidersMarketplace: ProviderSummary[] = [
  {
    id: 'prv-hacienda-maria',
    name: 'Hacienda La María',
    categories: ['espacio'],
    neighborhood: 'Pance',
    municipality: 'Cali',
    latitude: 3.32,
    longitude: -76.53,
    cover_url: 'https://images.example.com/hacienda-cover.jpg',
    rating_avg: 4.9,
    rating_count: 28,
    verification_status: 'verificado',
    price_from_cop: 4000000,
    featured: true,
  },
];

const sampleProvidersResponse: ProvidersResponse = {
  items: sampleProvidersMarketplace,
  total: 1,
  page: 1,
  page_size: 10,
};

const sampleReservationValeria: Reservation = {
  code: 'EU-VAL80X',
  status: 'creada',
  total_cop: 10400000,
  event_date: '2027-02-20',
  customer: {
    name: 'Valeria Gómez',
    email: 'valeria.gomez@example.com',
    phone: '3123456789',
  },
  items: [
    {
      service_id: 'srv-esp-equi',
      name: 'Hacienda Campestre La María',
      provider_id: 'prv-hacienda-maria',
      provider_name: 'Hacienda La María',
      cost_cop: 4000000,
      verification_status: 'verificado',
    },
    {
      service_id: 'srv-ali-prem',
      name: 'Cena Gourmet Internacional con Postres',
      provider_id: 'prv-catering-cali',
      provider_name: 'Catering del Valle',
      cost_cop: 4800000,
      verification_status: 'verificado',
    },
    {
      service_id: 'srv-dec-equi',
      name: 'Ambientación Temática Completa',
      provider_id: 'prv-deco-estilo',
      provider_name: 'DecoEstilo Cali',
      cost_cop: 1600000,
      verification_status: 'verificado',
    },
  ],
};

const samplePaidReservationValeria: Reservation = {
  ...sampleReservationValeria,
  status: 'pagada',
};

const samplePaymentSuccess: PaymentResponse = {
  payment: {
    status: 'aprobado',
    reference: 'SIM-PAY-VAL-101',
    amount_cop: 10400000,
  },
  reservation_status: 'pagada',
};

const samplePaymentDeclined: PaymentResponse = {
  payment: {
    status: 'rechazado',
    reference: 'SIM-PAY-VAL-FAIL',
    amount_cop: 10400000,
  },
  reservation_status: 'pago_rechazado',
};

describe('Pruebas de Usuario Final — Experiencia Completa de Usuario (End-User Acceptance Tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  // =========================================================================
  // FLUJO DE USUARIO 1: ATAJO POR PRESUPUESTO (PERSONA: VALERIA - XV AÑOS)
  // =========================================================================
  describe('Flujo de Usuario 1: Organización de Quinceañera por Presupuesto (Valeria)', () => {
    it('permite a Valeria completar el viaje de usuario desde Presupuesto hasta Confirmación con pago simulado y vuelta al inicio', async () => {
      // 1. Mock de recomendaciones para Valeria
      const mockRecSpy = jest
        .spyOn(endpoints, 'postRecommendations')
        .mockResolvedValue(sampleRecommendation);

      // 2. Pantalla 1: PresupuestoScreen
      const rootPresupuesto = createRoot();
      await act(async () => {
        rootPresupuesto.render(
          <FlowProvider>
            <PresupuestoScreen />
          </FlowProvider>,
        );
      });

      // Valeria ingresa presupuesto, tipo y número de invitados
      await act(async () => {
        find(rootPresupuesto.container, 'input-budget').props.onChangeText('12.000.000');
        press(find(rootPresupuesto.container, 'option-xv'));
        find(rootPresupuesto.container, 'input-guests').props.onChangeText('80');
      });

      // Valeria presiona "Ver paquetes"
      await act(async () => {
        press(find(rootPresupuesto.container, 'btn-submit'));
      });

      expect(mockRecSpy).toHaveBeenCalledWith(
        {
          budget_cop: 12000000,
          event_type: 'xv',
          guests: 80,
        },
        expect.any(Object),
      );
      expect(mockNavigate).toHaveBeenCalledWith('Paquetes');

      // 3. Pantalla 2: PaquetesScreen
      const initialFlowValeria: Partial<FlowState> = {
        budgetCop: 12000000,
        eventType: 'xv',
        guests: 80,
        packages: sampleRecommendation.packages,
      };

      const rootPaquetes = createRoot();
      await act(async () => {
        rootPaquetes.render(
          <FlowProvider initial={initialFlowValeria}>
            <PaquetesScreen />
          </FlowProvider>,
        );
      });

      // Verifica los 3 paquetes generados
      expect(has(rootPaquetes.container, 'package-card-ahorro')).toBe(true);
      expect(has(rootPaquetes.container, 'package-card-equilibrado')).toBe(true);
      expect(has(rootPaquetes.container, 'package-card-premium')).toBe(true);

      // Valeria abre Comparar paquetes
      expect(has(rootPaquetes.container, 'btn-compare-packages')).toBe(true);
      await act(async () => {
        press(find(rootPaquetes.container, 'btn-compare-packages'));
      });
      expect(mockNavigate).toHaveBeenCalledWith('Comparar');

      // Valeria elige el paquete Equilibrado
      await act(async () => {
        press(find(rootPaquetes.container, 'choose-package-equilibrado'));
      });
      expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'MiEvento' });

      // 4. Pantalla 3: MiEventoScreen con el paquete cargado
      const cartFromEqui: CartService[] = [
        {
          service_id: 'srv-esp-equi',
          name: 'Hacienda Campestre La María',
          category: 'espacio',
          provider_id: 'prv-hacienda-maria',
          provider_name: 'Hacienda La María',
          price_model: 'fijo',
          unit_price_cop: 4000000,
          min_guests: 1,
          max_guests: 500,
        },
        {
          service_id: 'srv-ali-equi',
          name: 'Banquete Tres Tiempos',
          category: 'alimentacion',
          provider_id: 'prv-catering-cali',
          provider_name: 'Catering del Valle',
          price_model: 'fijo',
          unit_price_cop: 4000000,
          min_guests: 1,
          max_guests: 500,
        },
        {
          service_id: 'srv-dec-equi',
          name: 'Ambientación Temática Completa',
          category: 'decoracion',
          provider_id: 'prv-deco-estilo',
          provider_name: 'DecoEstilo Cali',
          price_model: 'fijo',
          unit_price_cop: 1900000,
          min_guests: 1,
          max_guests: 500,
        },
      ];

      const initialFlowCart: Partial<FlowState> = {
        ...initialFlowValeria,
        cart: cartFromEqui,
        cartOrigin: 'equilibrado',
      };

      const rootMiEvento = createRoot();
      await act(async () => {
        rootMiEvento.render(
          <FlowProvider initial={initialFlowCart}>
            <MiEventoScreen />
          </FlowProvider>,
        );
      });

      // Verifica total y restante en formato COP
      expect(textOf(find(rootMiEvento.container, 'cart-total'))).toBe('$9.900.000');
      expect(textOf(find(rootMiEvento.container, 'cart-remaining'))).toBe('$2.100.000');

      // Continúa a reservar
      await act(async () => {
        press(find(rootMiEvento.container, 'btn-continue-to-reserve'));
      });
      expect(mockNavigate).toHaveBeenCalledWith('DatosCliente');

      // 5. Pantalla 4: DatosClienteScreen
      const mockReservationSpy = jest
        .spyOn(endpoints, 'postReservation')
        .mockResolvedValue(sampleReservationValeria);

      const rootDatos = createRoot();
      await act(async () => {
        rootDatos.render(
          <FlowProvider initial={initialFlowCart}>
            <DatosClienteScreen />
          </FlowProvider>,
        );
      });

      // Valeria llena sus datos de contacto
      await act(async () => {
        find(rootDatos.container, 'input-name').props.onChangeText('Valeria Gómez');
        find(rootDatos.container, 'input-email').props.onChangeText('valeria.gomez@example.com');
        find(rootDatos.container, 'input-phone').props.onChangeText('3123456789');
        find(rootDatos.container, 'input-event-date').props.onChangeText('2027-02-20');
      });

      // Envía datos para crear la reserva
      await act(async () => {
        press(find(rootDatos.container, 'btn-continue-payment'));
      });

      expect(mockReservationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: {
            name: 'Valeria Gómez',
            email: 'valeria.gomez@example.com',
            phone: '3123456789',
          },
          event_type: 'xv',
          guests: 80,
          event_date: '2027-02-20',
        }),
        expect.any(Object),
      );
      expect(mockNavigate).toHaveBeenCalledWith('Pago');

      // 6. Pantalla 5: PagoScreen (Pago Simulado)
      const mockPaySpy = jest
        .spyOn(endpoints, 'postPayment')
        .mockResolvedValue(samplePaymentSuccess);

      const initialFlowPago: Partial<FlowState> = {
        ...initialFlowCart,
        customer: sampleReservationValeria.customer,
        reservationCode: sampleReservationValeria.code,
        eventDate: '2027-02-20',
      };

      const rootPago = createRoot();
      await act(async () => {
        rootPago.render(
          <FlowProvider initial={initialFlowPago}>
            <PagoScreen />
          </FlowProvider>,
        );
      });

      // Verifica aviso permanente de simulación (Regla #6)
      expect(textOf(find(rootPago.container, 'simulation-notice'))).toContain(
        'Pago simulado: no se cobrará dinero real.',
      );

      // Valeria usa la tarjeta de prueba demo aprobada
      await act(async () => {
        press(find(rootPago.container, 'btn-demo-approved'));
      });

      // Ejecuta el pago
      await act(async () => {
        press(find(rootPago.container, 'btn-pay'));
      });

      expect(mockPaySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reservation_code: 'EU-VAL80X',
          card: expect.objectContaining({
            number: '4242424242424242',
          }),
        }),
        expect.any(Object),
      );
      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');

      // 7. Pantalla 6: ConfirmacionScreen y regreso a Inicio
      const mockGetResSpy = jest
        .spyOn(endpoints, 'getReservation')
        .mockResolvedValue(samplePaidReservationValeria);

      const initialFlowConfirmacion: Partial<FlowState> = {
        ...initialFlowPago,
        lastPayment: {
          status: 'aprobado',
          reference: 'SIM-PAY-VAL-101',
          amount_cop: 10400000,
        },
      };

      const rootConfirmacion = createRoot();
      await act(async () => {
        rootConfirmacion.render(
          <FlowProvider initial={initialFlowConfirmacion}>
            <ConfirmacionScreen />
          </FlowProvider>,
        );
      });

      // Verificaciones en la Confirmación
      expect(mockGetResSpy).toHaveBeenCalledWith('EU-VAL80X', expect.any(Object));
      expect(textOf(find(rootConfirmacion.container, 'reservation-code'))).toBe('EU-VAL80X');
      expect(textOf(find(rootConfirmacion.container, 'customer-name'))).toBe('Valeria Gómez');
      expect(textOf(find(rootConfirmacion.container, 'simulated-payment-notice'))).toContain(
        'El pago fue simulado.',
      );

      // Valeria toca "Volver al inicio"
      await act(async () => {
        press(find(rootConfirmacion.container, 'btn-go-home'));
      });

      // La app navega a Inicio
      expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Inicio' });
    });
  });

  // =========================================================================
  // FLUJO DE USUARIO 2: MARKETPLACE, MAPA Y CARRITO LIBRE (PERSONA: CARLOS)
  // =========================================================================
  describe('Flujo de Usuario 2: Descubrimiento en Marketplace, Mapa y Armado Libre (Carlos - Boda)', () => {
    it('permite a Carlos buscar proveedores de boda, explorarlos en el mapa, abrir la ficha con reseñas y agregarlos al carrito', async () => {
      // 1. Mock de catálogo, proveedores y home
      jest.spyOn(endpoints, 'getHome').mockResolvedValue(sampleHomeData);
      jest.spyOn(endpoints, 'getProviders').mockResolvedValue(sampleProvidersResponse);
      const mockGetProviderSpy = jest
        .spyOn(endpoints, 'getProvider')
        .mockResolvedValue(sampleProviderHacienda);

      // 2. Pantalla Inicio: Carlos busca boda con 120 invitados
      const rootInicio = createRoot();
      await act(async () => {
        rootInicio.render(
          <FlowProvider>
            <InicioScreen />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(find(rootInicio.container, 'option-boda'));
        find(rootInicio.container, 'input-guests').props.onChangeText('120');
      });

      await act(async () => {
        press(find(rootInicio.container, 'btn-search'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('Resultados', {
        eventType: 'boda',
        guests: 120,
        date: undefined,
      });

      // 3. Pantalla Resultados: Carlos conmuta a vista de Mapa
      const initialFlowCarlos: Partial<FlowState> = {
        eventType: 'boda',
        guests: 120,
      };

      const rootResultados = createRoot();
      await act(async () => {
        rootResultados.render(
          <FlowProvider initial={initialFlowCarlos}>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Cambia de vista lista a vista mapa mediante btn-view-mapa
      expect(has(rootResultados.container, 'btn-view-mapa')).toBe(true);
      await act(async () => {
        press(find(rootResultados.container, 'btn-view-mapa'));
      });

      // Verifica existencia de marcador de mapa con precio
      expect(has(rootResultados.container, 'map-marker-prv-hacienda-maria')).toBe(true);
      expect(textOf(find(rootResultados.container, 'map-marker-prv-hacienda-maria'))).toContain(
        '$4.000.000',
      );

      // Carlos toca el marcador para ver la tarjeta emergente
      await act(async () => {
        press(find(rootResultados.container, 'map-marker-prv-hacienda-maria'));
      });
      expect(has(rootResultados.container, 'map-popup-card')).toBe(true);
      expect(textOf(find(rootResultados.container, 'map-popup-name'))).toBe('Hacienda La María');

      // Toca "Ver ficha"
      await act(async () => {
        press(find(rootResultados.container, 'btn-popup-view-profile'));
      });
      expect(mockNavigate).toHaveBeenCalledWith('Proveedor', {
        providerId: 'prv-hacienda-maria',
      });

      // 4. Pantalla Proveedor: Carlos revisa la ficha
      mockRouteParams = { providerId: 'prv-hacienda-maria' };
      const rootProveedor = createRoot();
      await act(async () => {
        rootProveedor.render(
          <FlowProvider initial={initialFlowCarlos}>
            <ProveedorScreen />
          </FlowProvider>,
        );
      });

      expect(mockGetProviderSpy).toHaveBeenCalledWith('prv-hacienda-maria', expect.any(Object));

      // Verifica elementos clave de confianza y calidad
      expect(textOf(find(rootProveedor.container, 'provider-name'))).toBe('Hacienda La María');
      expect(textOf(find(rootProveedor.container, 'verification-badge'))).toBe('Verificado');
      expect(textOf(find(rootProveedor.container, 'verification-notice'))).toContain(
        'no garantiza el cumplimiento del servicio',
      );
      expect(textOf(find(rootProveedor.container, 'reviews-notice'))).toContain(
        'Reseñas de ejemplo para la demostración.',
      );

      // Carlos agrega el espacio a Mi evento
      expect(has(rootProveedor.container, 'btn-add-service-srv-esp-hacienda')).toBe(true);
      await act(async () => {
        press(find(rootProveedor.container, 'btn-add-service-srv-esp-hacienda'));
      });

      // Verifica que el servicio está en la pantalla
      expect(has(rootProveedor.container, 'btn-add-service-srv-esp-hacienda')).toBe(true);
    });

    it('permite a Carlos consultar su reserva confirmada en la pestaña Reservas por código', async () => {
      const mockGetRes = jest
        .spyOn(endpoints, 'getReservation')
        .mockResolvedValue(samplePaidReservationValeria);

      const rootConsultar = createRoot();
      await act(async () => {
        rootConsultar.render(
          <FlowProvider>
            <ConsultarReservaScreen />
          </FlowProvider>,
        );
      });

      // Carlos escribe su código de reserva
      await act(async () => {
        find(rootConsultar.container, 'input-search-code').props.onChangeText('EU-VAL80X');
        press(find(rootConsultar.container, 'btn-search-reservation'));
      });

      expect(mockGetRes).toHaveBeenCalledWith('EU-VAL80X', expect.any(Object));
      expect(textOf(find(rootConsultar.container, 'reservation-code'))).toBe('EU-VAL80X');
      expect(textOf(find(rootConsultar.container, 'customer-name'))).toBe('Valeria Gómez');
    });
  });

  // =========================================================================
  // FLUJO DE USUARIO 3: CASOS LÍMITE, RESILIENCIA, USABILIDAD Y SEGURIDAD
  // =========================================================================
  describe('Flujo de Usuario 3: Usabilidad, Validación de Errores, Privacidad y Resiliencia (Mariana)', () => {
    it('bloquea la continuación si faltan rubros obligatorios en Mi evento (RN-03, RN-23)', async () => {
      // Carrito con solo espacio (falta alimentación y decoración)
      const incompleteCart: CartService[] = [
        {
          service_id: 'srv-esp-01',
          name: 'Hacienda Campestre',
          category: 'espacio',
          provider_id: 'prv-01',
          provider_name: 'Hacienda Uno',
          price_model: 'fijo',
          unit_price_cop: 2500000,
          min_guests: 10,
          max_guests: 200,
        },
      ];

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider initial={{ cart: incompleteCart }}>
            <MiEventoScreen />
          </FlowProvider>,
        );
      });

      // Verifica aviso visible de rubros faltantes
      expect(has(root.container, 'missing-categories-notice')).toBe(true);
      expect(textOf(find(root.container, 'missing-categories-notice'))).toBe(
        MISSING_CATEGORIES_MESSAGE,
      );

      // Al pulsar "Continuar a reservar" no navega porque está deshabilitado
      await act(async () => {
        press(find(root.container, 'btn-continue-to-reserve'));
      });
      expect(mockNavigate).not.toHaveBeenCalledWith('DatosCliente');
    });

    it('muestra errores de validación en línea junto a los campos en PresupuestoScreen', async () => {
      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <PresupuestoScreen />
          </FlowProvider>,
        );
      });

      // Mariana intenta enviar el formulario totalmente vacío
      await act(async () => {
        press(find(root.container, 'btn-submit'));
      });

      const allTexts = findAllText(root.container);
      expect(allTexts).toContain('Ingrese su presupuesto.');
      expect(allTexts).toContain('Seleccione el tipo de evento.');
      expect(allTexts).toContain('Ingrese un número de invitados entre 1 y 500.');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('muestra errores de validación en línea en DatosClienteScreen con datos erróneos', async () => {
      const completeCart: CartService[] = [
        {
          service_id: 'srv-1',
          name: 'Espacio',
          category: 'espacio',
          provider_id: 'prv-1',
          provider_name: 'P1',
          price_model: 'fijo',
          unit_price_cop: 1000000,
          min_guests: 1,
          max_guests: 100,
        },
        {
          service_id: 'srv-2',
          name: 'Alimentación',
          category: 'alimentacion',
          provider_id: 'prv-2',
          provider_name: 'P2',
          price_model: 'fijo',
          unit_price_cop: 1000000,
          min_guests: 1,
          max_guests: 100,
        },
        {
          service_id: 'srv-3',
          name: 'Decoración',
          category: 'decoracion',
          provider_id: 'prv-3',
          provider_name: 'P3',
          price_model: 'fijo',
          unit_price_cop: 1000000,
          min_guests: 1,
          max_guests: 100,
        },
      ];

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider initial={{ cart: completeCart, guests: 50, eventType: 'boda' }}>
            <DatosClienteScreen />
          </FlowProvider>,
        );
      });

      // Mariana ingresa correo sin arroba y teléfono de 4 dígitos
      await act(async () => {
        find(root.container, 'input-name').props.onChangeText('');
        find(root.container, 'input-email').props.onChangeText('mariana_sin_arroba');
        find(root.container, 'input-phone').props.onChangeText('1234');
      });

      await act(async () => {
        press(find(root.container, 'btn-continue-payment'));
      });

      const allTexts = findAllText(root.container);
      expect(allTexts).toContain('Ingrese su nombre.');
      expect(allTexts).toContain('Ingrese un correo electrónico válido.');
      expect(allTexts).toContain('Ingrese un teléfono de 10 dígitos.');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('maneja el rechazo de pago, permite reintentar y NO almacena datos de tarjeta (Regla #6 y RN-09)', async () => {
      let flowCapture: FlowState | null = null;
      function FlowSpy() {
        const { flow } = useFlow();
        flowCapture = flow;
        return <Text testID="flow-spy">FlowActive</Text>;
      }

      // Simular tarjeta rechazada primero (status: 'rechazado') y luego aprobada
      const mockPay = jest
        .spyOn(endpoints, 'postPayment')
        .mockResolvedValueOnce(samplePaymentDeclined)
        .mockResolvedValueOnce(samplePaymentSuccess);

      const initialFlowPago: Partial<FlowState> = {
        reservationCode: 'EU-VAL80X',
        customer: sampleReservationValeria.customer,
      };

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider initial={initialFlowPago}>
            <View>
              <FlowSpy />
              <PagoScreen />
            </View>
          </FlowProvider>,
        );
      });

      // Mariana pulsa chip de tarjeta rechazada
      await act(async () => {
        press(find(root.container, 'btn-demo-declined'));
      });

      // Presiona pagar
      await act(async () => {
        press(find(root.container, 'btn-pay'));
      });

      // Se muestra mensaje de rechazo amigable
      expect(has(root.container, 'payment-declined-error')).toBe(true);
      expect(textOf(find(root.container, 'payment-declined-error'))).toContain(
        'El pago fue rechazado.',
      );
      expect(mockNavigate).not.toHaveBeenCalled();

      // Mariana reintenta con tarjeta aprobada
      await act(async () => {
        press(find(root.container, 'btn-demo-approved'));
      });

      await act(async () => {
        press(find(root.container, 'btn-pay'));
      });

      expect(mockPay).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith('Confirmacion');

      // VERIFICACIÓN ESTRICTA DE PRIVACIDAD: Ningún dato de tarjeta en flowCapture
      expect(flowCapture).not.toBeNull();
      const capturedState = flowCapture as unknown as FlowState;
      const rawFlowJson = JSON.stringify(capturedState);
      expect(rawFlowJson).not.toContain('4242424242424242');
      expect(rawFlowJson).not.toContain('4000000000000002');
      expect(rawFlowJson).not.toContain('card_number');
      expect(rawFlowJson).not.toContain('cardExpiry');
      expect(rawFlowJson).not.toContain('cardCvv');
      expect(capturedState.lastPayment?.reference).toBe('SIM-PAY-VAL-101');
    });

    it('soporta errores de red mostrando vista con botón Reintentar sin colapso (RF-GEN-03)', async () => {
      const mockRec = jest
        .spyOn(endpoints, 'postRecommendations')
        .mockRejectedValueOnce(new NetworkError('No se pudo conectar con el servidor'))
        .mockResolvedValueOnce(sampleRecommendation);

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <PresupuestoScreen />
          </FlowProvider>,
        );
      });

      await act(async () => {
        find(root.container, 'input-budget').props.onChangeText('10.000.000');
        press(find(root.container, 'option-boda'));
        find(root.container, 'input-guests').props.onChangeText('50');
      });

      await act(async () => {
        press(find(root.container, 'btn-submit'));
      });

      // Vista de error de red amigable con mensaje y botón 'Reintentar'
      const texts = findAllText(root.container);
      expect(texts).toContain('No se pudo conectar con el servidor');
      expect(texts).toContain('Reintentar');

      const retryBtn = root.container.queryAll(
        (n) => n.props.accessibilityRole === 'button' && findAllText(n).includes('Reintentar'),
      )[0];
      expect(retryBtn).toBeDefined();

      // Reintento exitoso
      await act(async () => {
        press(retryBtn);
      });

      expect(mockRec).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith('Paquetes');
    });

    it('cumple los requisitos de diseño táctil (área ≥ 44pt) y tipografía base legible (≥ 16pt)', () => {
      expect(MIN_TOUCH).toBeGreaterThanOrEqual(44);
      expect(font.base).toBeGreaterThanOrEqual(16);
      expect(formatCOP(12500000)).toBe('$12.500.000');
      expect(formatCOP(0)).toBe('$0');
    });
  });
});
