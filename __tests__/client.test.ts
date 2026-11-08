import { ApiError, apiFetch, GENERIC_ERROR, NetworkError } from '../src/api/client';
import { postRecommendations } from '../src/api/endpoints';
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
