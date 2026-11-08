import { ApiError, apiFetch, GENERIC_ERROR, NetworkError } from '../src/api/client';
import {
  getCatalog,
  getHome,
  getProvider,
  getProviders,
  postQuote,
  postRecommendations,
  postReservation,
  postPayment,
  getReservation,
} from '../src/api/endpoints';
import type {
  CatalogItem,
  HomeResponse,
  PaymentRequest,
  PaymentResponse,
  Provider,
  ProvidersResponse,
  Quote,
  Reservation,
  ReservationRequest,
} from '../src/api/types';
import { REQUEST_TIMEOUT_MS, SLOW_NOTICE_MS } from '../src/config/limits';

jest.mock('../src/config/env', () => ({ API_BASE_URL: 'https://api.ejemplo.test' }));

const g = globalThis as unknown as { fetch: jest.Mock };

describe('apiFetch', () => {
  afterEach(() => jest.resetAllMocks());

  it('devuelve el JSON si la respuesta es correcta', async () => {
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' });
    expect(g.fetch.mock.calls[0][0]).toBe('https://api.ejemplo.test/api/v1/health');
  });

  it('convierte el error uniforme del API en ApiError', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Revise los datos.', fields: { budget_cop: 'x' } } }),
    });
    await expect(apiFetch('/recommendations', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fields: { budget_cop: 'x' },
    });
  });

  it('usa el mensaje genérico si el cuerpo del error no es JSON', async () => {
    g.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('x'); } });
    const err = (await apiFetch('/health').catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('No fue posible completar la operación. Intente nuevamente.');
  });

  it('lanza NetworkError si no hay conexión', async () => {
    g.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/health')).rejects.toBeInstanceOf(NetworkError);
  });

  it('invoca onSlow tras SLOW_NOTICE_MS (5 s) y aborta con NetworkError al agotar el tiempo de espera (60 s, HU_EU_01_04)', async () => {
    jest.useFakeTimers();
    try {
      const onSlow = jest.fn();
      g.fetch = jest.fn().mockImplementation((_url: string, init: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new Error('Aborted'));
          });
        });
      });

      const promise = apiFetch('/health', { onSlow });

      jest.advanceTimersByTime(SLOW_NOTICE_MS - 1);
      expect(onSlow).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(onSlow).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - SLOW_NOTICE_MS);
      await expect(promise).rejects.toMatchObject({
        name: 'NetworkError',
        message: 'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('usa siempre el mensaje genérico ante errores 5xx sin exponer trazas ni detalles técnicos (RF-GEN-03, RF-GEN-06)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Traceback (most recent call last): psycopg2.OperationalError...',
        },
      }),
    });

    await expect(apiFetch('/health')).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC_ERROR,
    });
  });
});

describe('postRecommendations (HU_EU_01_01)', () => {
  afterEach(() => jest.resetAllMocks());

  it('envía budget_cop, event_type y guests a POST /api/v1/recommendations y devuelve paquetes', async () => {
    const mockRes = { packages: [], unavailable: [] };
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockRes });

    const res = await postRecommendations({
      budget_cop: 5_000_000,
      event_type: 'boda',
      guests: 100,
    });

    expect(res).toEqual(mockRes);
    expect(g.fetch).toHaveBeenCalledWith(
      'https://api.ejemplo.test/api/v1/recommendations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ budget_cop: 5_000_000, event_type: 'boda', guests: 100 }),
      }),
    );
  });

  it('propaga ApiError 422 con campos específicos de validación (RN-19)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Revise los datos ingresados.',
          fields: {
            budget_cop: 'El presupuesto debe estar entre $1.000.000 y $50.000.000.',
            guests: 'Ingrese un número de invitados entre 1 y 500.',
          },
        },
      }),
    });

    await expect(
      postRecommendations({ budget_cop: 500_000, event_type: 'boda', guests: 600 }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fields: {
        budget_cop: 'El presupuesto debe estar entre $1.000.000 y $50.000.000.',
        guests: 'Ingrese un número de invitados entre 1 y 500.',
      },
    });
  });
});

describe('getHome (HU_EU_01_12 — T_HU_EU_01_12_4)', () => {
  afterEach(() => jest.resetAllMocks());

  const mockHomeResponse: HomeResponse = {
    categories: [
      { category: 'espacio', count: 6 },
      { category: 'alimentacion', count: 4 },
      { category: 'decoracion', count: 3 },
      { category: 'entretenimiento', count: 3 },
    ],
    featured: [
      {
        id: 'prv-atelier-del-evento',
        name: 'Atelier del Evento',
        categories: ['decoracion'],
        neighborhood: 'El Peñón',
        municipality: 'Cali',
        latitude: 3.451,
        longitude: -76.542,
        cover_url: 'https://picsum.photos/seed/atelier/600/400',
        rating_avg: 4.9,
        rating_count: 15,
        verification_status: 'verificado',
        price_from_cop: 1_100_000,
        featured: true,
      },
      {
        id: 'prv-casa-quinta-pance',
        name: 'Casa Quinta Pance',
        categories: ['espacio'],
        neighborhood: 'Pance',
        municipality: 'Cali',
        latitude: 3.321,
        longitude: -76.535,
        cover_url: 'https://picsum.photos/seed/pance/600/400',
        rating_avg: 4.8,
        rating_count: 12,
        verification_status: 'verificado',
        price_from_cop: 1_900_000,
        featured: true,
      },
      {
        id: 'prv-salon-los-guaduales',
        name: 'Salón Los Guaduales',
        categories: ['espacio'],
        neighborhood: 'Ciudad Jardín',
        municipality: 'Cali',
        latitude: 3.365,
        longitude: -76.531,
        cover_url: 'https://picsum.photos/seed/guaduales/600/400',
        rating_avg: 4.8,
        rating_count: 9,
        verification_status: 'verificado',
        price_from_cop: 1_600_000,
        featured: true,
      },
    ],
  };

  it('consulta GET /api/v1/home y devuelve conteo de los 4 rubros y destacados en orden RN-26', async () => {
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockHomeResponse });

    const res = await getHome();

    expect(g.fetch).toHaveBeenCalledWith(
      'https://api.ejemplo.test/api/v1/home',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res.categories).toHaveLength(4);
    expect(res.featured).toHaveLength(3);

    // Verifica orden RN-26: destacados primero, luego mayor rating_avg y empate por menor id
    for (let i = 1; i < res.featured.length; i++) {
      const prev = res.featured[i - 1];
      const curr = res.featured[i];
      expect(prev.featured).toBe(true);
      expect(curr.featured).toBe(true);
      const prevRating = prev.rating_avg ?? -1;
      const currRating = curr.rating_avg ?? -1;
      expect(prevRating).toBeGreaterThanOrEqual(currRating);
      if (prevRating === currRating) {
        expect(prev.id.localeCompare(curr.id)).toBeLessThan(0);
      }
    }
  });

  it('lanza NetworkError si falla la red al consultar GET /home (criterio 6)', async () => {
    g.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getHome()).rejects.toBeInstanceOf(NetworkError);
  });

  it('lanza ApiError con mensaje genérico si GET /home responde 500 (criterio 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: { code: 'INTERNAL_ERROR', message: 'SQLAlchemy OperationalError' },
      }),
    });

    await expect(getHome()).rejects.toMatchObject({
      status: 500,
      message: 'No fue posible completar la operación. Intente nuevamente.',
    });
  });
});

describe('getProviders (HU_EU_02_05 — T_HU_EU_02_05_4)', () => {
  afterEach(() => jest.resetAllMocks());

  it('envía query con category, event_type, guests, page y page_size a GET /api/v1/providers', async () => {
    const mockProviders: ProvidersResponse = {
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    };
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockProviders });

    const res = await getProviders({
      category: 'espacio',
      event_type: 'boda',
      guests: 120,
      page: 1,
      page_size: 10,
    });

    expect(res).toEqual(mockProviders);
    const calledUrl = g.fetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://api.ejemplo.test/api/v1/providers?');
    expect(calledUrl).toContain('category=espacio');
    expect(calledUrl).toContain('event_type=boda');
    expect(calledUrl).toContain('guests=120');
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).toContain('page_size=10');
  });

  it('serializa todos los filtros combinados y parámetros en la URL (HU_EU_02_15 / T_HU_EU_02_15_3)', async () => {
    const mockProviders: ProvidersResponse = {
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    };
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockProviders });

    await getProviders({
      category: 'alimentacion',
      event_type: 'xv',
      min_price_cop: 1_500_000,
      max_price_cop: 6_000_000,
      min_rating: 4.5,
      verified: true,
      sort: 'precio_asc',
      page: 2,
      page_size: 20,
    });

    const calledUrl = g.fetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('category=alimentacion');
    expect(calledUrl).toContain('event_type=xv');
    expect(calledUrl).toContain('min_price_cop=1500000');
    expect(calledUrl).toContain('max_price_cop=6000000');
    expect(calledUrl).toContain('min_rating=4.5');
    expect(calledUrl).toContain('verified=true');
    expect(calledUrl).toContain('sort=precio_asc');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('page_size=20');
  });

  it.each([
    'recomendados',
    'precio_asc',
    'precio_desc',
    'calificacion',
  ] as const)(
    'serializa la opción de orden determinista %s según RN-26 (criterios 2.6 y 3.3)',
    async (sortOrder) => {
      const mockProviders: ProvidersResponse = { items: [], total: 0, page: 1, page_size: 10 };
      g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockProviders });

      await getProviders({ sort: sortOrder });

      const calledUrl = g.fetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(`sort=${sortOrder}`);
    },
  );

  it('propaga NetworkError y sanitiza errores 500 con mensaje genérico (criterio 6)', async () => {
    g.fetch = jest.fn().mockRejectedValueOnce(new TypeError('Network failure'));
    await expect(getProviders({ page: 1, page_size: 10 })).rejects.toBeInstanceOf(NetworkError);

    g.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'db crash' } }),
    });
    await expect(getProviders({ page: 1, page_size: 10 })).rejects.toMatchObject({
      status: 500,
      message: GENERIC_ERROR,
    });
  });
});

describe('postQuote y getCatalog (HU_EU_02_06 — T_HU_EU_02_06_3)', () => {
  afterEach(() => jest.resetAllMocks());

  it('envía POST /api/v1/quotes con budget_cop, event_type, guests y service_ids (sin precios, ADR-09) y devuelve total y restante', async () => {
    const mockQuote: Quote = {
      total_cop: 3_600_000,
      remaining_cop: 400_000,
      breakdown: [
        {
          category: 'espacio',
          subtotal_cop: 800_000,
          items: [
            {
              service_id: 'esp-ok',
              name: 'Salón',
              provider_id: 'prv-1',
              provider_name: 'Proveedor 1',
              verification_status: 'verificado',
              cost_cop: 800_000,
            },
          ],
        },
      ],
      missing_categories: [],
      ineligible: [],
    };
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockQuote });

    const res = await postQuote({
      budget_cop: 4_000_000,
      event_type: 'boda',
      guests: 100,
      service_ids: ['esp-ok', 'ali', 'dec', 'ent'],
    });

    expect(res).toEqual(mockQuote);
    expect(g.fetch).toHaveBeenCalledWith(
      'https://api.ejemplo.test/api/v1/quotes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          budget_cop: 4_000_000,
          event_type: 'boda',
          guests: 100,
          service_ids: ['esp-ok', 'ali', 'dec', 'ent'],
        }),
      }),
    );
  });

  it('envía POST /api/v1/quotes sin budget_cop cuando el presupuesto está ausente y recibe remaining_cop null (RN-22)', async () => {
    const mockQuote: Quote = {
      total_cop: 11_800_000,
      remaining_cop: null,
      breakdown: [],
      missing_categories: [],
      ineligible: [],
    };
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockQuote });

    const res = await postQuote({
      event_type: 'boda',
      guests: 100,
      service_ids: ['esp2', 'ali', 'dec'],
    });

    expect(res.remaining_cop).toBeNull();
    expect(res.total_cop).toBe(11_800_000);
    const bodySent = JSON.parse(g.fetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(bodySent).not.toHaveProperty('budget_cop');
    expect(bodySent).toEqual({
      event_type: 'boda',
      guests: 100,
      service_ids: ['esp2', 'ali', 'dec'],
    });
  });

  it('propaga ApiError 409 BUDGET_EXCEEDED cuando la cotización supera el presupuesto (criterios 4 y 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'BUDGET_EXCEEDED',
          message: 'Ese cambio supera su presupuesto. Elija otra opción.',
        },
      }),
    });

    await expect(
      postQuote({
        budget_cop: 3_000_000,
        event_type: 'boda',
        guests: 100,
        service_ids: ['esp-caro', 'ali', 'dec'],
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'BUDGET_EXCEEDED',
    });
  });

  it('consulta GET /api/v1/catalog con category, event_type y guests para obtener alternativas elegibles (criterios 2.2 y 3.1)', async () => {
    const items: CatalogItem[] = [
      {
        id: 'esp-ok',
        name: 'Salón Jardín',
        category: 'espacio',
        provider_id: 'prv-1',
        provider_name: 'Proveedor 1',
        price_cop: 800_000,
        price_model: 'fijo',
        level: 'equilibrado',
        min_guests: 20,
        max_guests: 200,
      },
    ];
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });

    const res = await getCatalog({ category: 'espacio', event_type: 'boda', guests: 100 });

    expect(res.items).toEqual(items);
    const calledUrl = g.fetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://api.ejemplo.test/api/v1/catalog?');
    expect(calledUrl).toContain('category=espacio');
    expect(calledUrl).toContain('event_type=boda');
    expect(calledUrl).toContain('guests=100');
  });
});

describe('getProvider (HU_EU_02_08 — T_HU_EU_02_08_3)', () => {
  afterEach(() => jest.resetAllMocks());

  const mockProvider: Provider = {
    id: 'prv-hacienda-real',
    name: 'Hacienda Real',
    categories: ['espacio'],
    description: 'Hacienda campestre para eventos exclusivos.',
    neighborhood: 'Pance',
    municipality: 'Cali',
    phone: '3151234567',
    email: 'contacto@haciendareal.com',
    latitude: 3.32,
    longitude: -76.53,
    images: [{ url: 'https://example.com/hacienda.jpg', alt_text: 'Vista principal' }],
    rating_avg: 4.8,
    rating_count: 24,
    reviews: [],
    verification: {
      status: 'verificado',
      checks: [{ type: 'Cámara de Comercio', date: '2026-01-10' }],
    },
    services: [
      {
        id: 'svc-salon-principal',
        name: 'Salón Principal',
        category: 'espacio',
        provider_id: 'prv-hacienda-real',
        provider_name: 'Hacienda Real',
        price_cop: 4_000_000,
        price_model: 'fijo',
        level: 'premium',
        min_guests: 50,
        max_guests: 300,
      },
    ],
  };

  it('consulta GET /api/v1/providers/{id} y devuelve los datos completos del proveedor (criterios 1, 2.1 a 2.7)', async () => {
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockProvider });

    const res = await getProvider('prv-hacienda-real');

    expect(res).toEqual(mockProvider);
    expect(g.fetch).toHaveBeenCalledWith(
      'https://api.ejemplo.test/api/v1/providers/prv-hacienda-real',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('devuelve galería de fotos y lista de reseñas en GET /providers/{id} (HU_EU_02_16 / T_HU_EU_02_16_5)', async () => {
    const providerWithReviews: Provider = {
      ...mockProvider,
      images: [
        { url: 'https://example.com/foto1.jpg', alt_text: 'Jardín' },
        { url: 'https://example.com/foto2.jpg', alt_text: 'Salón' },
        { url: 'https://example.com/foto3.jpg', alt_text: 'Piscina' },
      ],
      rating_avg: 4.7,
      rating_count: 3,
      reviews: [
        { author_name: 'Ana', rating: 5, comment: 'Excelente', reviewed_on: '2026-04-01' },
        { author_name: 'Luis', rating: 5, comment: 'Mágico', reviewed_on: '2026-03-15' },
        { author_name: 'Pedro', rating: 4, comment: 'Muy bueno', reviewed_on: '2026-02-10' },
      ],
    };
    g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => providerWithReviews });

    const res = await getProvider('prv-hacienda-real');

    expect(res.images).toHaveLength(3);
    expect(res.reviews).toHaveLength(3);
    expect(res.rating_avg).toBe(4.7);
    expect(res.rating_count).toBe(3);
    expect(res.reviews[0].author_name).toBe('Ana');
    expect(res.reviews[0].rating).toBe(5);
  });

  it('propaga ApiError con status 404 si el proveedor no existe (criterio 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'NOT_FOUND', message: 'No encontramos este proveedor.' },
      }),
    });

    await expect(getProvider('prv-inexistente')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('propaga NetworkError ante fallos de conexión (criterio 6, HU_EU_01_04)', async () => {
    g.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getProvider('prv-hacienda-real')).rejects.toBeInstanceOf(NetworkError);
  });

  it('propaga ApiError con mensaje genérico si el servidor responde 500 (criterio 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: { code: 'INTERNAL_ERROR', message: 'Database crash' },
      }),
    });

    await expect(getProvider('prv-hacienda-real')).rejects.toMatchObject({
      status: 500,
      message: GENERIC_ERROR,
    });
  });
});

describe('postReservation (HU_EU_03_09, ADR-09, SAD §7.1)', () => {
  afterEach(() => jest.resetAllMocks());

  const sampleReq: ReservationRequest = {
    budget_cop: 5_000_000,
    event_type: 'boda',
    guests: 80,
    modality: 'personalizado',
    service_ids: ['svc-esp-1', 'svc-ali-1', 'svc-dec-1'],
    expected_total_cop: 4_500_000,
    customer: {
      name: 'María Pérez',
      email: 'maria@ejemplo.com',
      phone: '3001234567',
    },
    event_date: '2026-12-15',
  };

  const sampleReservation: Reservation = {
    code: 'EU-ABC123',
    status: 'creada',
    total_cop: 4_500_000,
    items: [
      {
        service_id: 'svc-esp-1',
        name: 'Hacienda Campestre',
        provider_id: 'prv-1',
        provider_name: 'Haciendas Cali',
        verification_status: 'verificado',
        cost_cop: 2_000_000,
      },
    ],
    customer: sampleReq.customer,
    event_date: '2026-12-15',
  };

  it('crea reserva con código y estado creada (201, criterios 4 y 5)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => sampleReservation,
    });

    const res = await postReservation(sampleReq);

    expect(g.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = g.fetch.mock.calls[0];
    expect(url).toBe('https://api.ejemplo.test/api/v1/reservations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(sampleReq);
    expect(res.code).toBe('EU-ABC123');
    expect(res.status).toBe('creada');
    expect(res.total_cop).toBe(4_500_000);
  });

  it('permite crear reserva sin presupuesto cuando budget_cop es omitido (RN-22)', async () => {
    const { budget_cop: _, ...reqWithoutBudget } = sampleReq;
    g.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => sampleReservation,
    });

    const res = await postReservation(reqWithoutBudget);

    expect(res.code).toBe('EU-ABC123');
    const [, init] = g.fetch.mock.calls[0];
    expect(JSON.parse(init.body).budget_cop).toBeUndefined();
  });

  it('propaga 409 TOTAL_MISMATCH si el total cambió en el catálogo (criterio 3.5 y 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'TOTAL_MISMATCH',
          message: 'El total de los servicios ha cambiado.',
        },
      }),
    });

    await expect(postReservation(sampleReq)).rejects.toMatchObject({
      status: 409,
      code: 'TOTAL_MISMATCH',
    });
  });

  it('propaga 409 BUDGET_EXCEEDED si el total excede el presupuesto (criterio 3.5 y 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'BUDGET_EXCEEDED',
          message: 'El costo total supera el presupuesto.',
        },
      }),
    });

    await expect(postReservation(sampleReq)).rejects.toMatchObject({
      status: 409,
      code: 'BUDGET_EXCEEDED',
    });
  });

  it('propaga 422 VALIDATION_ERROR si faltan rubros obligatorios o campos inválidos (criterio 6)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Falta un rubro obligatorio.',
        },
      }),
    });

    await expect(postReservation(sampleReq)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });
  });

  it('propaga NetworkError ante fallos de conexión (criterio 6, HU_EU_01_04)', async () => {
    g.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(postReservation(sampleReq)).rejects.toBeInstanceOf(NetworkError);
  });

  it.each(['ahorro', 'equilibrado', 'premium', 'personalizado'] as const)(
    'transmite fielmente la modalidad %s como origen de la reserva (RN-21, criterio 4)',
    async (modality) => {
      g.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ...sampleReservation, modality }),
      });

      await postReservation({ ...sampleReq, modality });

      const [, init] = g.fetch.mock.calls[0];
      expect(JSON.parse(init.body).modality).toBe(modality);
    },
  );

  it('verifica que el número de reserva cumple el formato propuesto EU- + 6 alfanuméricos (RN-18, criterio 5)', async () => {
    const validCodes = ['EU-ABC123', 'EU-X9Y8Z7', 'EU-000000', 'EU-ZZZZZZ'];
    for (const code of validCodes) {
      g.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ...sampleReservation, code }),
      });

      const res = await postReservation(sampleReq);
      expect(res.code).toMatch(/^EU-[A-Za-z0-9]{6}$/);
    }
  });
});

describe('postPayment (HU_EU_03_10, ADR-05, SAD §7.1)', () => {
  afterEach(() => jest.resetAllMocks());

  const samplePaymentReq: PaymentRequest = {
    reservation_code: 'EU-8K9M2P',
    card: {
      number: '4242424242424242',
      expiry: '12/28',
      cvv: '123',
    },
  };

  const sampleApprovedResponse: PaymentResponse = {
    payment: {
      status: 'aprobado',
      reference: 'SIM-PAY-987654',
      amount_cop: 4_500_000,
    },
    reservation_status: 'pagada',
  };

  const sampleDeclinedResponse: PaymentResponse = {
    payment: {
      status: 'rechazado',
      reference: 'SIM-PAY-DECLINED-001',
      amount_cop: 4_500_000,
    },
    reservation_status: 'pago_rechazado',
  };

  it('procesa pago con tarjeta aprobada y devuelve 200 con pago aprobado y reserva pagada (criterio 5, RF-PAG-03)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleApprovedResponse,
    });

    const res = await postPayment(samplePaymentReq);

    expect(g.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = g.fetch.mock.calls[0];
    expect(url).toBe('https://api.ejemplo.test/api/v1/payments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(samplePaymentReq);
    expect(res.payment.status).toBe('aprobado');
    expect(res.reservation_status).toBe('pagada');
    expect(res.payment.amount_cop).toBe(4_500_000);
    expect(res.payment.reference).toBe('SIM-PAY-987654');
  });

  it('un pago rechazado es un resultado de negocio y devuelve HTTP 200 con status rechazado (criterio 6, SAD §7.1, RF-PAG-04)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleDeclinedResponse,
    });

    const declinedReq: PaymentRequest = {
      ...samplePaymentReq,
      card: { ...samplePaymentReq.card, number: '4000000000000002' },
    };

    const res = await postPayment(declinedReq);

    expect(res.payment.status).toBe('rechazado');
    expect(res.reservation_status).toBe('pago_rechazado');
  });

  it('propaga ApiError 409 ALREADY_PAID cuando la reserva ya está pagada (criterio 4, SAD §5.4, RF-PAG-08)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'ALREADY_PAID',
          message: 'La reserva ya fue pagada.',
        },
      }),
    });

    await expect(postPayment(samplePaymentReq)).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_PAID',
    });
  });

  it('propaga ApiError 404 NOT_FOUND cuando la reserva no existe (criterio 1, SAD §7.1)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 'NOT_FOUND',
          message: 'No encontramos la reserva especificada.',
        },
      }),
    });

    await expect(
      postPayment({ ...samplePaymentReq, reservation_code: 'EU-NONEXIST' }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('propaga ApiError 422 VALIDATION_ERROR si los datos de la tarjeta son inválidos (criterio 3)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Revise los datos ingresados.',
          fields: {
            'card.number': 'El número de tarjeta debe tener 16 dígitos.',
          },
        },
      }),
    });

    await expect(
      postPayment({
        reservation_code: 'EU-8K9M2P',
        card: { number: '123', expiry: '12/28', cvv: '123' },
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fields: {
        'card.number': 'El número de tarjeta debe tener 16 dígitos.',
      },
    });
  });

  it('propaga NetworkError ante fallos de conexión (criterio 6, HU_EU_01_04)', async () => {
    g.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(postPayment(samplePaymentReq)).rejects.toBeInstanceOf(NetworkError);
  });

  it('propaga ApiError con mensaje genérico si el servidor responde 500 (criterio 6, SAD §7.3)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Gateway connection timed out in backend',
        },
      }),
    });

    await expect(postPayment(samplePaymentReq)).rejects.toMatchObject({
      status: 500,
      message: GENERIC_ERROR,
    });
  });
});

describe('getReservation (HU_EU_03_11, SAD §5.5, §7.1)', () => {
  afterEach(() => jest.resetAllMocks());

  const samplePaidReservation: Reservation = {
    code: 'EU-8K9M2P',
    status: 'pagada',
    total_cop: 4_300_000,
    items: [
      {
        service_id: 'svc-esp-1',
        name: 'Salón Campestre',
        provider_id: 'prv-1',
        provider_name: 'Hacienda Real',
        verification_status: 'verificado',
        cost_cop: 2_000_000,
      },
      {
        service_id: 'svc-ali-1',
        name: 'Banquete 3 Tiempos',
        provider_id: 'prv-2',
        provider_name: 'Catering Gourmet',
        verification_status: 'verificado',
        cost_cop: 1_500_000,
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

  it('consulta GET /api/v1/reservations/{code} y devuelve los datos completos de la reserva (criterio 1 y 5)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => samplePaidReservation,
    });

    const res = await getReservation('EU-8K9M2P');

    expect(g.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = g.fetch.mock.calls[0];
    expect(url).toBe('https://api.ejemplo.test/api/v1/reservations/EU-8K9M2P');
    expect(init.method).toBe('GET');
    expect(res).toEqual(samplePaidReservation);
    expect(res.code).toBe('EU-8K9M2P');
    expect(res.status).toBe('pagada');
    expect(res.items).toHaveLength(2);
    expect(res.payment?.status).toBe('aprobado');
  });

  it('propaga ApiError 404 NOT_FOUND cuando la reserva no existe (criterio 6, SAD §5.5)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 'NOT_FOUND',
          message: 'No encontramos una reserva con ese número.',
        },
      }),
    });

    await expect(getReservation('EU-NONEXIST')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('propaga ApiError 422 VALIDATION_ERROR si el formato del código es inválido (SAD §7.1)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'El número de reserva no es válido.',
        },
      }),
    });

    await expect(getReservation('invalido')).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });
  });

  it('propaga NetworkError ante fallos de conexión (criterio 6, HU_EU_01_04)', async () => {
    g.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getReservation('EU-8K9M2P')).rejects.toBeInstanceOf(NetworkError);
  });

  it('propaga ApiError con mensaje genérico si el servidor responde 500 (criterio 6, SAD §7.3)', async () => {
    g.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed',
        },
      }),
    });

    await expect(getReservation('EU-8K9M2P')).rejects.toMatchObject({
      status: 500,
      message: GENERIC_ERROR,
    });
  });
});




