import { apiFetch, type RequestOptions } from './client';
import type {
  CatalogItem,
  HomeResponse,
  PaymentRequest,
  PaymentResponse,
  Provider,
  ProvidersQuery,
  ProvidersResponse,
  QuoteRequest,
  Quote,
  RecommendationRequest,
  RecommendationResponse,
  Reservation,
  ReservationRequest,
} from './types';

type Opts = Pick<RequestOptions, 'onSlow'>;

export const getHealth = (o?: Opts) => apiFetch<{ status: string }>('/health', o);

export const getCatalog = (
  query: { category?: string; event_type?: string; min_price_cop?: number; max_price_cop?: number; guests?: number },
  o?: Opts,
) => apiFetch<{ items: CatalogItem[] }>('/catalog', { ...o, query });

/** Listado tipo marketplace con filtros, orden y paginación (HU_EU_02_05, HU_EU_03_14). */
export const getProviders = (query: ProvidersQuery, o?: Opts) =>
  apiFetch<ProvidersResponse>('/providers', { ...o, query: { ...query } });

/** Destacados y conteo por rubro para el Inicio (HU_EU_01_12). */
export const getHome = (o?: Opts) => apiFetch<HomeResponse>('/home', o);

export const getProvider = (id: string, o?: Opts) => apiFetch<Provider>(`/providers/${encodeURIComponent(id)}`, o);

export const postRecommendations = (body: RecommendationRequest, o?: Opts) =>
  apiFetch<RecommendationResponse>('/recommendations', { ...o, method: 'POST', body });

/** Cotización de «Mi evento»: el servidor decide el total (ADR-09). */
export const postQuote = (body: QuoteRequest, o?: Opts) =>
  apiFetch<Quote>('/quotes', { ...o, method: 'POST', body });

export const postReservation = (body: ReservationRequest, o?: Opts) =>
  apiFetch<Reservation>('/reservations', { ...o, method: 'POST', body });

export const cancelReservation = (code: string, o?: Opts) =>
  apiFetch<{ code: string; status: string }>(`/reservations/${encodeURIComponent(code)}/cancel`, { ...o, method: 'POST' });

export const postPayment = (body: PaymentRequest, o?: Opts) =>
  apiFetch<PaymentResponse>('/payments', { ...o, method: 'POST', body });

export const getReservation = (code: string, o?: Opts) =>
  apiFetch<Reservation>(`/reservations/${encodeURIComponent(code)}`, o);
