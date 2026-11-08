import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GENERIC_ERROR, NetworkError } from '../api/client';
import { postRecommendations } from '../api/endpoints';
import type {
  CartService,
  Category,
  EventType,
  Modality,
  Package,
  RecommendationResponse,
} from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { GUESTS_MAX, GUESTS_MIN } from '../config/limits';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { formatCOP } from '../utils/money';

const MODALITY_ORDER: Modality[] = ['ahorro', 'equilibrado', 'premium'];

const MODALITY_LABELS: Record<Modality, string> = {
  ahorro: 'Ahorro',
  equilibrado: 'Equilibrado',
  premium: 'Premium',
};

const CATEGORY_ORDER: Category[] = ['espacio', 'alimentacion', 'decoracion', 'entretenimiento'];

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  cumpleanos: 'Cumpleaños',
  boda: 'Boda',
  xv: 'XV años',
};

function packageToCartServices(pkg: Package): CartService[] {
  const services: CartService[] = [];
  for (const line of pkg.breakdown) {
    for (const item of line.items) {
      services.push({
        service_id: item.service_id,
        name: item.name,
        category: line.category,
        provider_id: item.provider_id,
        provider_name: item.provider_name,
        price_model: 'fijo',
        unit_price_cop: item.cost_cop,
        min_guests: GUESTS_MIN,
        max_guests: GUESTS_MAX,
      });
    }
  }
  return services;
}

/** HU_EU_01_02: Pantalla «Paquetes recomendados» con tres modalidades, desglose y elección hacia «Mi evento». */
export default function PaquetesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { flow, update } = useFlow();

  const [expanded, setExpanded] = useState<Record<Modality, boolean>>({
    ahorro: true,
    equilibrado: false,
    premium: false,
  });
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<RecommendationResponse['unavailable']>([]);

  const autoFetchedRef = useRef(false);

  const loadRecommendations = useCallback(async () => {
    if (flow.budgetCop === null || flow.eventType === null || flow.guests === null) {
      return;
    }
    setLoading(true);
    setSlow(false);
    setNetworkError(null);
    setUnexpectedError(null);
    try {
      const res = await postRecommendations(
        {
          budget_cop: flow.budgetCop,
          event_type: flow.eventType,
          guests: flow.guests,
        },
        { onSlow: () => setSlow(true) },
      );
      update({ packages: res.packages });
      setUnavailable(res.unavailable);
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError(err.message);
      } else {
        setUnexpectedError(GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
      setSlow(false);
    }
  }, [flow.budgetCop, flow.eventType, flow.guests, update]);

  useEffect(() => {
    if (
      !autoFetchedRef.current &&
      flow.packages.length === 0 &&
      flow.budgetCop !== null &&
      flow.eventType !== null &&
      flow.guests !== null
    ) {
      autoFetchedRef.current = true;
      void loadRecommendations();
    }
  }, [flow.packages.length, flow.budgetCop, flow.eventType, flow.guests, loadRecommendations]);

  const sortedPackages = useMemo(() => {
    return [...flow.packages].sort(
      (a, b) => MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality),
    );
  }, [flow.packages]);

  const toggleExpand = (modality: Modality) => {
    setExpanded((prev) => ({ ...prev, [modality]: !prev[modality] }));
  };

  const handleChoosePackage = (pkg: Package) => {
    const cartServices = packageToCartServices(pkg);
    const serviceIds = cartServices.map((s) => s.service_id);
    update({
      chosenModality: pkg.modality,
      chosenServiceIds: serviceIds,
      cart: cartServices,
      cartOrigin: pkg.modality,
    });
    navigation.navigate('Tabs', { screen: 'MiEvento' });
  };

  const emptyMessage = useMemo(() => {
    if (sortedPackages.length > 0) return null;
    if (unavailable.some((u) => u.cause === 'sin_servicios')) {
      return 'No hay servicios disponibles para este tipo de evento o número de invitados.';
    }
    if (unavailable.some((u) => u.cause === 'presupuesto_insuficiente')) {
      return 'Con ese presupuesto no es posible armar un paquete. Pruebe con un presupuesto mayor.';
    }
    return null;
  }, [sortedPackages.length, unavailable]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Paquetes recomendados</Text>
        {flow.budgetCop !== null && flow.eventType !== null && flow.guests !== null ? (
          <Text style={styles.summaryText} testID="summary-inputs">
            {EVENT_TYPE_LABELS[flow.eventType]} · {flow.guests} invitados · Presupuesto:{' '}
            {formatCOP(flow.budgetCop)}
          </Text>
        ) : null}
      </View>

      {sortedPackages.length >= 2 ? (
        <Pressable
          testID="btn-compare-packages"
          onPress={() => navigation.navigate('Comparar')}
          accessibilityRole="button"
          style={styles.compareButton}
        >
          <Text style={styles.compareButtonText}>Comparar paquetes</Text>
        </Pressable>
      ) : null}

      {loading ? <LoadingNotice slow={slow} /> : null}

      {networkError ? (
        <NetworkErrorView message={networkError} onRetry={loadRecommendations} />
      ) : null}

      {unexpectedError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{unexpectedError}</Text>
          <Pressable
            testID="btn-retry-unexpected"
            onPress={loadRecommendations}
            accessibilityRole="button"
            style={styles.retryInlineButton}
          >
            <Text style={styles.retryInlineButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !networkError && !unexpectedError && emptyMessage ? (
        <View style={styles.noticeBox} accessibilityRole="alert">
          <Text style={styles.noticeText}>{emptyMessage}</Text>
        </View>
      ) : null}

      {sortedPackages.map((pkg) => {
        const isExpanded = Boolean(expanded[pkg.modality]);
        const orderedBreakdown = [...pkg.breakdown].sort(
          (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
        );

        return (
          <View
            key={pkg.modality}
            testID={`package-card-${pkg.modality}`}
            style={styles.card}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.modalityTitle}>{MODALITY_LABELS[pkg.modality]}</Text>
              <View style={styles.amountsRow}>
                <View style={styles.amountBlock}>
                  <Text style={styles.amountLabel}>Costo total</Text>
                  <Text style={styles.totalValue}>{formatCOP(pkg.total_cop)}</Text>
                </View>
                <View style={styles.amountBlock}>
                  <Text style={styles.amountLabel}>Presupuesto restante</Text>
                  <Text style={styles.remainingValue}>{formatCOP(pkg.remaining_cop)}</Text>
                </View>
              </View>
            </View>

            <Pressable
              testID={`toggle-breakdown-${pkg.modality}`}
              onPress={() => toggleExpand(pkg.modality)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              style={styles.toggleButton}
            >
              <Text style={styles.toggleButtonText}>
                {isExpanded ? 'Ocultar desglose' : 'Ver desglose por rubro'}
              </Text>
            </Pressable>

            {isExpanded ? (
              <View style={styles.breakdownContainer}>
                {orderedBreakdown.map((line) => (
                  <View key={line.category} style={styles.categorySection}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryTitle}>
                        {CATEGORY_LABELS[line.category]}
                      </Text>
                      <Text style={styles.categorySubtotal}>
                        {formatCOP(line.subtotal_cop)}
                      </Text>
                    </View>
                    {line.items.map((item) => {
                      const isVerified = item.verification_status === 'verificado';
                      return (
                        <View key={item.service_id} style={styles.serviceRow}>
                          <View style={styles.serviceInfo}>
                            <Text style={styles.serviceName}>{item.name}</Text>
                            <View style={styles.providerMetaRow}>
                              <Pressable
                                testID={`provider-link-${pkg.modality}-${item.service_id}`}
                                onPress={() =>
                                  navigation.navigate('Proveedor', {
                                    providerId: item.provider_id,
                                  })
                                }
                                accessibilityRole="button"
                                style={styles.providerLink}
                              >
                                <Text style={styles.providerNameText}>
                                  {item.provider_name}
                                </Text>
                              </Pressable>
                              <View
                                style={[
                                  styles.badge,
                                  isVerified ? styles.badgeVerified : styles.badgeReview,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.badgeText,
                                    isVerified
                                      ? styles.badgeTextVerified
                                      : styles.badgeTextReview,
                                  ]}
                                >
                                  {isVerified ? 'Verificado' : 'En revisión'}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.serviceCost}>{formatCOP(item.cost_cop)}</Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable
              testID={`choose-package-${pkg.modality}`}
              onPress={() => handleChoosePackage(pkg)}
              accessibilityRole="button"
              style={styles.chooseButton}
            >
              <Text style={styles.chooseButtonText}>Elegir este paquete</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  title: {
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
  },
  summaryText: {
    fontSize: font.base,
    color: colors.muted,
    lineHeight: 22,
  },
  compareButton: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  compareButtonText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.primary,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  cardHeader: {
    gap: spacing.sm,
  },
  modalityTitle: {
    fontSize: font.title - 2,
    fontWeight: '700',
    color: colors.text,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountBlock: {
    flex: 1,
    gap: 2,
  },
  amountLabel: {
    fontSize: font.base - 2,
    color: colors.muted,
  },
  totalValue: {
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
  },
  remainingValue: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.primary,
  },
  toggleButton: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
  },
  toggleButtonText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.primary,
  },
  breakdownContainer: {
    gap: spacing.md,
  },
  categorySection: {
    gap: spacing.xs,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTitle: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  categorySubtotal: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  serviceInfo: {
    flex: 1,
    gap: 2,
  },
  serviceName: {
    fontSize: font.base,
    color: colors.text,
  },
  providerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  providerLink: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  providerNameText: {
    fontSize: font.base - 1,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeVerified: {
    borderColor: colors.primary,
    backgroundColor: '#F3F0FF',
  },
  badgeReview: {
    borderColor: colors.border,
    backgroundColor: '#F7F7FA',
  },
  badgeText: {
    fontSize: font.base - 2,
    fontWeight: '500',
  },
  badgeTextVerified: {
    color: colors.primary,
  },
  badgeTextReview: {
    color: colors.muted,
  },
  serviceCost: {
    fontSize: font.base,
    fontWeight: '500',
    color: colors.text,
  },
  chooseButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chooseButtonText: {
    fontSize: font.base,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: '#FDF2F2',
    gap: spacing.sm,
  },
  errorBannerText: {
    fontSize: font.base,
    color: colors.error,
  },
  retryInlineButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryInlineButtonText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '600',
  },
  noticeBox: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F7F7FA',
  },
  noticeText: {
    fontSize: font.base,
    color: colors.text,
  },
});
