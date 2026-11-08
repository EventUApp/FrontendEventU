// Contrato del API (SAD §7). snake_case e importes enteros con sufijo _cop.
export type EventType = 'cumpleanos' | 'boda' | 'xv';
export type Modality = 'ahorro' | 'equilibrado' | 'premium';
/** Origen de la reserva (RN-21): un paquete sin cambios o una selección propia. */
export type ReservationOrigin = Modality | 'personalizado';
export type SortOrder = 'recomendados' | 'precio_asc' | 'precio_desc' | 'calificacion';
export type Category = 'espacio' | 'alimentacion' | 'decoracion' | 'entretenimiento';
export type VerificationStatus = 'verificado' | 'en_revision';
export type ReservationStatus = 'creada' | 'pagada' | 'pago_rechazado' | 'cancelada';

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface PackageItem {
  service_id: string;
  name: string;
  provider_id: string;
  provider_name: string;
  verification_status: VerificationStatus;
  cost_cop: number;
}
export interface BreakdownLine {
  category: Category;
  subtotal_cop: number;
  items: PackageItem[];
}
export interface Package {
  modality: Modality;
  total_cop: number;
  remaining_cop: number;
  breakdown: BreakdownLine[];
}
export interface QuoteRequest {
  budget_cop?: number;
  event_type: EventType;
  guests: number;
  service_ids: string[];
}
export interface Quote {
  total_cop: number;
  remaining_cop: number | null;
  breakdown: BreakdownLine[];
  missing_categories: Category[];
  ineligible: string[];
}
export interface RecommendationRequest {
  budget_cop: number;
  event_type: EventType;
  guests: number;
}
export interface RecommendationResponse {
  packages: Package[];
  unavailable: { modality: Modality; cause: 'presupuesto_insuficiente' | 'sin_servicios' }[];
}
export interface CatalogItem {
  id: string;
  name: string;
  category: Category;
  provider_id: string;
  provider_name: string;
  price_cop?: number;
  price_model: 'fijo' | 'por_invitado';
  level: Modality;
  description?: string;
  min_guests?: number;
  max_guests?: number;
}
export interface ProviderImage {
  url: string;
  alt_text: string;
}
export interface ProviderReview {
  author_name: string;
  rating: number; // 1 a 5
  comment: string;
  reviewed_on: string; // YYYY-MM-DD
}
/** Tarjeta de GET /providers (HU_EU_02_05). */
export interface ProviderSummary {
  id: string;
  name: string;
  categories?: Category[];
  neighborhood: string;
  municipality: string;
  latitude: number | null;
  longitude: number | null;
  cover_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  verification_status: VerificationStatus;
  price_from_cop: number; // RN-25, lo calcula el servidor
  featured: boolean;
}
export interface ProvidersQuery {
  category?: Category;
  event_type?: EventType;
  guests?: number;
  min_price_cop?: number;
  max_price_cop?: number;
  min_rating?: number;
  verified?: boolean;
  featured?: boolean;
  sort?: SortOrder;
  bbox?: string; // 'lat_min,lon_min,lat_max,lon_max'
  page?: number;
  page_size?: number;
}
export interface ProvidersResponse {
  items: ProviderSummary[];
  total: number;
  page: number;
  page_size: number;
}
/** GET /home (HU_EU_01_12). */
export interface HomeResponse {
  featured: ProviderSummary[];
  categories: { category: Category; count: number }[];
}
/** Ficha de GET /providers/{id} (HU_EU_02_08). */
export interface Provider {
  id: string;
  name: string;
  categories: Category[];
  description: string;
  neighborhood: string;
  municipality: string;
  phone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  images: ProviderImage[];
  rating_avg: number | null;
  rating_count: number;
  reviews: ProviderReview[];
  verification: { status: VerificationStatus; checks: { type: string; date: string }[] };
  services: CatalogItem[];
}
/** Servicio agregado a «Mi evento» (HU_EU_02_13). El precio es solo informativo: el servidor decide. */
export interface CartService {
  service_id: string;
  name: string;
  category: Category;
  provider_id: string;
  provider_name: string;
  price_model: 'fijo' | 'por_invitado';
  unit_price_cop: number;
  min_guests: number;
  max_guests: number;
}
export interface Customer {
  name: string;
  email: string;
  phone: string;
}
export interface ReservationRequest {
  event_type: EventType;
  guests: number;
  budget_cop?: number; // opcional (RN-22)
  modality: ReservationOrigin;
  service_ids: string[];
  expected_total_cop: number;
  customer: Customer;
  event_date: string; // YYYY-MM-DD
}
export interface Reservation {
  code: string;
  status: ReservationStatus;
  total_cop: number;
  items: PackageItem[];
  customer: Customer;
  event_date: string;
  payment?: { status: 'aprobado' | 'rechazado'; reference: string };
}
export interface PaymentRequest {
  reservation_code: string;
  card: { number: string; expiry: string; cvv: string };
}
export interface PaymentResponse {
  payment: { status: 'aprobado' | 'rechazado'; reference: string; amount_cop: number };
  reservation_status: ReservationStatus;
}
