import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import InicioScreen from '../screens/InicioScreen';
import ResultadosScreen from '../screens/ResultadosScreen';
import MiEventoScreen from '../screens/MiEventoScreen';
import ConsultarReservaScreen from '../screens/ConsultarReservaScreen';
import PresupuestoScreen from '../screens/PresupuestoScreen';
import PaquetesScreen from '../screens/PaquetesScreen';
import CompararScreen from '../screens/CompararScreen';
import ProveedorScreen from '../screens/ProveedorScreen';
import DatosClienteScreen from '../screens/DatosClienteScreen';
import PagoScreen from '../screens/PagoScreen';
import ConfirmacionScreen from '../screens/ConfirmacionScreen';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator initialRouteName="Inicio">
      <Tab.Screen name="Inicio" component={InicioScreen} />
      <Tab.Screen name="Resultados" component={ResultadosScreen} />
      <Tab.Screen name="MiEvento" component={MiEventoScreen} options={{ title: 'Mi evento' }} />
      <Tab.Screen name="Reservas" component={ConsultarReservaScreen} options={{ title: 'Reservas' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Tabs">
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Presupuesto" component={PresupuestoScreen} options={{ title: 'Arma mi evento por presupuesto' }} />
      <Stack.Screen name="Paquetes" component={PaquetesScreen} options={{ title: 'Paquetes recomendados' }} />
      <Stack.Screen name="Comparar" component={CompararScreen} options={{ title: 'Comparar paquetes' }} />
      <Stack.Screen name="Proveedor" component={ProveedorScreen} options={{ title: 'Ficha del proveedor' }} />
      <Stack.Screen name="DatosCliente" component={DatosClienteScreen} options={{ title: 'Datos del cliente' }} />
      <Stack.Screen name="Pago" component={PagoScreen} options={{ title: 'Pago' }} />
      <Stack.Screen name="Confirmacion" component={ConfirmacionScreen} options={{ title: 'Confirmación' }} />
    </Stack.Navigator>
  );
}
