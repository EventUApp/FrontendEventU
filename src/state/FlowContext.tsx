import React, { createContext, useContext, useMemo, useState } from 'react';
import type { CartService, Customer, EventType, Modality, Package } from '../api/types';

/** Estado del flujo del marketplace. Volver atrás no lo borra (RF-GEN-06). */
export interface FlowState {
  budgetCop: number | null;
  eventType: EventType | null;
  guests: number | null;
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
}

export const initialFlow: FlowState = {
  budgetCop: null,
  eventType: null,
  guests: null,
  packages: [],
  chosenModality: null,
  chosenServiceIds: [],
  cart: [],
  cartOrigin: 'personalizado',
  customer: null,
  eventDate: null,
  reservationCode: null,
};

interface Ctx {
  flow: FlowState;
  update: (patch: Partial<FlowState>) => void;
  reset: () => void;
}

const FlowContext = createContext<Ctx | null>(null);

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [flow, setFlow] = useState<FlowState>(initialFlow);
  const value = useMemo<Ctx>(
    () => ({ flow, update: (patch) => setFlow((f) => ({ ...f, ...patch })), reset: () => setFlow(initialFlow) }),
    [flow],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Ctx {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow debe usarse dentro de FlowProvider.');
  return ctx;
}
