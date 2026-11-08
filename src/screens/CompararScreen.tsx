import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GENERIC_ERROR, NetworkError } from '../api/client';
import { postRecommendations } from '../api/endpoints';
import type {
  Category,
  EventType,
  Modality,
  Package,
} from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { packageToCartServices } from '../utils/cart';
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

/** Mensaje literal de HU_EU_02_07 (criterios 3.1 y 6). */
export const COMPARE_VALIDATION_ERROR = 'Seleccione al menos dos paquetes para comparar.';

/**
 * HU_EU_02_07: Pantalla «Comparar paquetes» con selección de dos o tres paquetes,
 * visualización lado a lado de costo, servicios y restante, y acción «Elegir este paquete».
 */
export default function CompararScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { flow, update } = useFlow();

  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);

  // Paquetes elegibles que no superan el presupuesto (Criterio 4)
  const eligiblePackages = useMemo(() => {
    return flow.packages
      .filter((p) => flow.budgetCop === null || p.total_cop <= flow.budgetCop)
      .sort((a, b) => MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality));
  }, [flow.packages, flow.budgetCop]);

  // Selección de modalidades a comparar con casillas (Criterio 2.1)
  const [selectedModalities, setSelectedModalities] = useState<Modality[]>(() => {
    return eligiblePackages.map((p) => p.modality).slice(0, 2);
  });

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
      const eligible = res.packages
        .filter((p) => flow.budgetCop === null || p.total_cop <= flow.budgetCop)
        .sort((a, b) => MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality));
      setSelectedModalities(eligible.map((p) => p.modality).slice(0, 2));
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

  const toggleModality = (modality: Modality) => {
    setSelectedModalities((prev) => {
      if (prev.includes(modality)) {
        return prev.filter((m) => m !== modality);
      }
      return [...prev, modality].sort(
        (a, b) => MODALITY_ORDER.indexOf(a) - MODALITY_ORDER.indexOf(b),
      );
    });
  };

  const activeSelectedModalities = useMemo(() => {
    return selectedModalities.filter((m) =>
      eligiblePackages.some((p) => p.modality === m),
    );
  }, [selectedModalities, eligiblePackages]);

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

  const comparedPackages = useMemo(() => {
    return eligiblePackages.filter((p) => activeSelectedModalities.includes(p.modality));
  }, [eligiblePackages, activeSelectedModalities]);

  const isLessThanTwo = activeSelectedModalities.length < 2;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Comparar paquetes</Text>
        {flow.budgetCop !== null && flow.eventType !== null && flow.guests !== null ? (
          <Text style={styles.summaryText} testID="summary-inputs">
            {EVENT_TYPE_LABELS[flow.eventType]} · {flow.guests} invitados · Presupuesto:{' '}
            {formatCOP(flow.budgetCop)}
          </Text>
        ) : null}
      </View>

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

      {!loading && !networkError && !unexpectedError && eligiblePackages.length === 0 ? (
        <View style={styles.noticeBox} accessibilityRole="alert" testID="compare-empty-notice">
          <Text style={styles.noticeText}>
            No hay paquetes para comparar. Ingrese a Arma mi evento por presupuesto para
            recomendarlos.
          </Text>
        </View>
      ) : null}

      {/* Casillas de selección (Criterio 2.1) */}
      {eligiblePackages.length > 0 ? (
        <View style={styles.selectionSection}>
          <Text style={styles.sectionLabel}>Seleccione los paquetes a comparar (2 o 3):</Text>
          <View style={styles.checkboxRow}>
            {eligiblePackages.map((pkg) => {
              const isChecked = activeSelectedModalities.includes(pkg.modality);
              return (
                <Pressable
                  key={pkg.modality}
                  testID={`checkbox-${pkg.modality}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  onPress={() => toggleModality(pkg.modality)}
                  style={[styles.checkboxChip, isChecked ? styles.checkboxChipChecked : null]}
                >
                  <View style={[styles.checkboxSquare, isChecked ? styles.checkboxSquareChecked : null]}>
                    {isChecked ? <MinimalIcon name="check" size={14} color="#FFFFFF" /> : null}
                  </View>
                  <Text
                    style={[
                      styles.checkboxLabel,
                      isChecked ? styles.checkboxLabelChecked : null,
                    ]}
                  >
                    {MODALITY_LABELS[pkg.modality]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Validación: menos de dos paquetes seleccionados (Criterio 3.1 & 6) */}
      {eligiblePackages.length > 0 && isLessThanTwo ? (
        <View style={styles.errorBanner} accessibilityRole="alert" testID="compare-validation-error">
          <Text style={styles.errorBannerText}>{COMPARE_VALIDATION_ERROR}</Text>
        </View>
      ) : null}

      {/* Visualización comparativa lado a lado (Criterios 2.2, 2.3, 5) */}
      {!isLessThanTwo && comparedPackages.length >= 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsRow}
        >
          {comparedPackages.map((pkg) => {
            const orderedBreakdown = [...pkg.breakdown].sort(
              (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
            );

            return (
              <View
                key={pkg.modality}
                testID={`compare-card-${pkg.modality}`}
                style={styles.compareCard}
              >
                <View style={styles.cardHeader}>
                  <Text
                    style={styles.modalityTitle}
                    testID={`compare-modality-${pkg.modality}`}
                  >
                    {MODALITY_LABELS[pkg.modality]}
                  </Text>
                  <View style={styles.amountsBlock}>
                    <View style={styles.amountLine}>
                      <Text style={styles.amountLabel}>Costo total</Text>
                      <Text
                        style={styles.totalValue}
                        testID={`compare-total-${pkg.modality}`}
                      >
                        {formatCOP(pkg.total_cop)}
                      </Text>
                    </View>
                    <View style={styles.amountLine}>
                      <Text style={styles.amountLabel}>Presupuesto restante</Text>
                      <Text
                        style={styles.remainingValue}
                        testID={`compare-remaining-${pkg.modality}`}
                      >
                        {formatCOP(pkg.remaining_cop)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Acción 'Elegir este paquete' (Criterio 2.3) */}
                <Pressable
                  testID={`choose-package-${pkg.modality}`}
                  onPress={() => handleChoosePackage(pkg)}
                  accessibilityRole="button"
                  style={styles.chooseButton}
                >
                  <Text style={styles.chooseButtonText}>Elegir este paquete</Text>
                </Pressable>

                {/* Desglose de servicios por rubro (Criterio 2.2) */}
                <View style={styles.breakdownContainer}>
                  <Text style={styles.breakdownTitle}>Servicios incluidos:</Text>
                  {orderedBreakdown.map((line) => (
                    <View key={line.category} style={styles.categorySection}>
                      <View style={styles.categoryHeader}>
                        <Text style={styles.categoryTitle}>{CATEGORY_LABELS[line.category]}</Text>
                        <Text style={styles.categorySubtotal}>{formatCOP(line.subtotal_cop)}</Text>
                      </View>
                      {line.items.map((item) => {
                        const isVerified = item.verification_status === 'verificado';
                        return (
                          <View key={item.service_id} style={styles.serviceRow}>
                            <View style={styles.serviceInfo}>
                              <Text style={styles.serviceName}>{item.name}</Text>
                              <View style={styles.providerRow}>
                                <Text style={styles.providerName}>{item.provider_name}</Text>
                                <View
                                  style={[
                                    styles.badge,
                                    isVerified ? styles.badgeVerified : styles.badgeReview,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.badgeText,
                                      isVerified ? styles.badgeTextVerified : styles.badgeTextReview,
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
              </View>
            );
          })}
        </ScrollView>
      ) : null}
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
  selectionSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  checkboxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  checkboxChip: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#F7F7FA',
  },
  checkboxChipChecked: {
    borderColor: colors.primary,
    backgroundColor: '#F3F0FF',
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  checkboxSquareChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxLabel: {
    fontSize: font.base,
    color: colors.text,
    fontWeight: '500',
  },
  checkboxLabelChecked: {
    color: colors.primary,
    fontWeight: '700',
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
    fontWeight: '500',
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
  cardsRow: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  compareCard: {
    width: 300,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  cardHeader: {
    gap: spacing.sm,
  },
  modalityTitle: {
    fontSize: font.title - 2,
    fontWeight: '700',
    color: colors.text,
  },
  amountsBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  amountLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: font.base - 2,
    color: colors.muted,
  },
  totalValue: {
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  remainingValue: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
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
  breakdownContainer: {
    gap: spacing.sm,
  },
  breakdownTitle: {
    fontSize: font.base - 1,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  categorySection: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    fontSize: font.base - 1,
    fontWeight: '600',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  serviceInfo: {
    flex: 1,
    gap: 2,
  },
  serviceName: {
    fontSize: font.base - 1,
    color: colors.text,
    fontWeight: '500',
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  providerName: {
    fontSize: font.base - 2,
    color: colors.muted,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: 4,
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
    fontSize: font.base - 3,
    fontWeight: '500',
  },
  badgeTextVerified: {
    color: colors.primary,
  },
  badgeTextReview: {
    color: colors.muted,
  },
  serviceCost: {
    fontSize: font.base - 1,
    fontWeight: '500',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
