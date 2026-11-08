import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MinimalIcon, type MinimalIconName } from '../components/MinimalIcon';
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
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof TabParamList, MinimalIconName> = {
  Inicio: 'home',
  Resultados: 'search',
  MiEvento: 'event',
  Reservas: 'reservations',
};

export function Tabs() {
  const { flow } = useFlow();
  const cartCount = flow.cart.length;

  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarLabelStyle: styles.tabBarLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: colors.text,
        tabBarIcon: ({ color }) => (
          <MinimalIcon name={TAB_ICONS[route.name]} size={20} color={color} />
        ),
      })}
    >
      <Tab.Screen
        name="Inicio"
        component={InicioScreen}
        options={{
          title: 'Inicio',
          tabBarButtonTestID: 'tab-Inicio',
        }}
      />
      <Tab.Screen
        name="Resultados"
        component={ResultadosScreen}
        options={{
          title: 'Resultados',
          tabBarButtonTestID: 'tab-Resultados',
        }}
      />
      <Tab.Screen
        name="MiEvento"
        component={MiEventoScreen}
        options={{
          title: 'Mi evento',
          tabBarButtonTestID: 'tab-MiEvento',
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: styles.tabBadge,
        }}
      />
      <Tab.Screen
        name="Reservas"
        component={ConsultarReservaScreen}
        options={{
          title: 'Reservas',
          tabBarButtonTestID: 'tab-Reservas',
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Presupuesto"
        component={PresupuestoScreen}
        options={{ title: 'Arma mi evento por presupuesto' }}
      />
      <Stack.Screen
        name="Paquetes"
        component={PaquetesScreen}
        options={{ title: 'Paquetes recomendados' }}
      />
      <Stack.Screen
        name="Comparar"
        component={CompararScreen}
        options={{ title: 'Comparar paquetes' }}
      />
      <Stack.Screen
        name="Proveedor"
        component={ProveedorScreen}
        options={{ title: 'Ficha del proveedor' }}
      />
      <Stack.Screen
        name="DatosCliente"
        component={DatosClienteScreen}
        options={{ title: 'Datos del cliente' }}
      />
      <Stack.Screen
        name="Pago"
        component={PagoScreen}
        options={{ title: 'Pago' }}
      />
      <Stack.Screen
        name="Confirmacion"
        component={ConfirmacionScreen}
        options={{ title: 'Confirmación' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
  },
  tabBar: {
    minHeight: MIN_TOUCH + spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabBarItem: {
    minHeight: MIN_TOUCH,
  },
  tabBarLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: colors.primary,
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
});
