import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type {
  CartService,
  Customer,
  EventType,
  Modality,
  Package,
  PaymentResponse,
  ProvidersQuery,
} from '../api/types';
import {
  addToCart as addToCartUtil,
  ineligibleAfterGuestsChange,
  removeFromCart as removeFromCartUtil,
  type AddResult,
} from '../utils/cart';

/** Estado del flujo del marketplace. Volver atrás no lo borra (RF-GEN-06). */
export interface FlowState {
  budgetCop: number | null;
  eventType: EventType | null;
  guests: number | null;
  /** Filtros y orden activos del listado de proveedores (HU_EU_01_04, HU_EU_02_15). */
  filters: ProvidersQuery;
  packages: Package[];
  chosenModality: Modality | null;
  chosenServiceIds: string[];
  /** «Mi evento»: servicios agregados, uno por rubro (HU_EU_02_13). Se vacía al reservar. */
  cart: CartService[];
  /** Origen de la selección para la reserva (RN-21). */
  cartOrigin: Modality | 'personalizado';
  customer: Customer | null;
  eventDate: string | null;
  reservationCode: string | null;
  reservationTotalCop: number | null;
  /** Resultado del último pago simulado (HU_EU_03_10). No guarda datos de tarjeta (RN-09). */
  lastPayment: PaymentResponse['payment'] | null;
}

export const initialFlow: FlowState = {
  budgetCop: null,
  eventType: null,
  guests: null,
  filters: {},
  packages: [],
  chosenModality: null,
  chosenServiceIds: [],
  cart: [],
  cartOrigin: 'personalizado',
  customer: null,
  eventDate: null,
  reservationCode: null,
  reservationTotalCop: null,
  lastPayment: null,
};

export interface FlowContextValue {
  flow: FlowState;
  update: (patch: Partial<FlowState>) => void;
  reset: () => void;
  /** Agrega un servicio a «Mi evento» reemplazando el del mismo rubro (RN-23). Fija cartOrigin a personalizado. */
  addToCart: (service: CartService) => AddResult;
  /** Quita un servicio de «Mi evento» por identificador. Fija cartOrigin a personalizado. */
  removeFromCart: (serviceId: string) => void;
  /** Vacía el carrito de «Mi evento». */
  clearCart: () => void;
  /** Revalida el carrito actual ante un cambio de invitados, devolviendo los que dejan de ser elegibles (criterio 3.4). */
  revalidateCartForGuests: (guests: number) => CartService[];
}

export type Ctx = FlowContextValue;

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [flow, setFlow] = useState<FlowState>(initialFlow);

  const update = useCallback((patch: Partial<FlowState>) => {
    setFlow((f) => ({ ...f, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setFlow(initialFlow);
  }, []);

  const addToCart = useCallback(
    (service: CartService): AddResult => {
      const result = addToCartUtil(flow.cart, service);
      setFlow((prev) => ({
        ...prev,
        cart: addToCartUtil(prev.cart, service).cart,
        cartOrigin: 'personalizado',
      }));
      return result;
    },
    [flow.cart],
  );

  const removeFromCart = useCallback((serviceId: string) => {
    setFlow((prev) => ({
      ...prev,
      cart: removeFromCartUtil(prev.cart, serviceId),
      cartOrigin: 'personalizado',
    }));
  }, []);

  const clearCart = useCallback(() => {
    setFlow((prev) => ({
      ...prev,
      cart: [],
      cartOrigin: 'personalizado',
    }));
  }, []);

  const revalidateCartForGuests = useCallback(
    (guests: number): CartService[] => {
      return ineligibleAfterGuestsChange(flow.cart, guests);
    },
    [flow.cart],
  );

  const value = useMemo<FlowContextValue>(
    () => ({
      flow,
      update,
      reset,
      addToCart,
      removeFromCart,
      clearCart,
      revalidateCartForGuests,
    }),
    [flow, update, reset, addToCart, removeFromCart, clearCart, revalidateCartForGuests],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow debe usarse dentro de FlowProvider.');
  return ctx;
}
