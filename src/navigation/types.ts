// Marketplace (CR-01): pestañas Inicio · Resultados · Mi evento · Reservas, y pantallas de detalle sobre ellas.
export type TabParamList = {
  Inicio: undefined;
  Resultados: { category?: string; eventType?: string; guests?: number; date?: string } | undefined;
  MiEvento: undefined;
  Reservas: undefined;
};

export type RootStackParamList = {
  Tabs: { screen?: keyof TabParamList; params?: TabParamList[keyof TabParamList] } | undefined;
  Presupuesto: undefined; // atajo por presupuesto (HU_EU_01_01)
  Paquetes: undefined;
  Comparar: undefined;
  Proveedor: { providerId: string };
  DatosCliente: undefined;
  Pago: undefined;
  Confirmacion: undefined;
};
