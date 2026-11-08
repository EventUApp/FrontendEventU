import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GENERIC_ERROR, NetworkError } from '../api/client';
import { getProviders } from '../api/endpoints';
import type { ProviderSummary, ProvidersQuery } from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { ProviderCard } from '../components/ProviderCard';
import { PROVIDERS_PAGE_SIZE } from '../config/limits';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';

type ResultadosNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Resultados'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type ViewMode = 'lista' | 'mapa';

const surfaceTokens = {
  subtleBg: '#F7F7FA',
  accentSurface: '#F3F0FF',
  accentBorder: '#D4C9FA',
  accentText: '#3A2399',
};

/**
 * HU_EU_02_05: pantalla 'Resultados' con tarjetas de proveedor, contador 'N resultados',
 * acceso a filtros/orden (HU_EU_02_15), conmutador 'Lista / Mapa' (HU_EU_03_14),
 * estado vacío y paginación de 10 en 10.
 */
export default function ResultadosScreen() {
  const navigation = useNavigation<ResultadosNavigationProp>();
  const { flow, update } = useFlow();

  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [items, setItems] = useState<ProviderSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [slow, setSlow] = useState<boolean>(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);

  const baseQuery = useMemo<ProvidersQuery>(() => {
    const query: ProvidersQuery = { ...flow.filters };
    if (query.event_type === undefined && flow.eventType) {
      query.event_type = flow.eventType;
    }
    if (query.guests === undefined && flow.guests !== null) {
      query.guests = flow.guests;
    }
    return query;
  }, [flow.filters, flow.eventType, flow.guests]);

  useEffect(() => {
    let active = true;
    getProviders(
      { ...baseQuery, page: 1, page_size: PROVIDERS_PAGE_SIZE },
      { onSlow: () => active && setSlow(true) },
    )
      .then((res) => {
        if (!active) return;
        const safeItems = Array.isArray(res?.items) ? res.items : [];
        const safeTotal = typeof res?.total === 'number' ? res.total : safeItems.length;
        setItems(safeItems);
        setTotal(safeTotal);
        setPage(1);
        setNetworkError(null);
        setUnexpectedError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof NetworkError) {
          setNetworkError(err.message);
        } else {
          setUnexpectedError(GENERIC_ERROR);
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setSlow(false);
      });

    return () => {
      active = false;
    };
  }, [baseQuery]);

  const fetchPage = async (targetPage: number, queryOverride?: ProvidersQuery) => {
    const effectiveQuery = queryOverride ?? baseQuery;
    const isFirstPage = targetPage === 1;

    if (isFirstPage) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setSlow(false);
    setNetworkError(null);
    setUnexpectedError(null);

    try {
      const res = await getProviders(
        { ...effectiveQuery, page: targetPage, page_size: PROVIDERS_PAGE_SIZE },
        { onSlow: () => setSlow(true) },
      );
      const nextItems = Array.isArray(res?.items) ? res.items : [];
      const nextTotal = typeof res?.total === 'number' ? res.total : nextItems.length;

      if (isFirstPage) {
        setItems(nextItems);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of nextItems) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
      }
      setTotal(nextTotal);
      setPage(targetPage);
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError(err.message);
      } else {
        setUnexpectedError(GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setSlow(false);
    }
  };

  const hasMore = items.length < total;

  const handleLoadMore = async () => {
    if (loading || loadingMore || !hasMore) return;
    await fetchPage(page + 1);
  };

  const handleRetry = async () => {
    if (loading || loadingMore) return;
    await fetchPage(items.length === 0 ? 1 : page + 1);
  };

  const handleClearFilters = async () => {
    if (loading || loadingMore) return;
    const hadFilters = Object.keys(baseQuery).length > 0;
    update({
      filters: {},
      eventType: null,
      guests: null,
      eventDate: null,
    });
    if (!hadFilters) {
      await fetchPage(1, {});
    }
  };

  const handleProviderPress = (provider: ProviderSummary) => {
    navigation.navigate('Proveedor', { providerId: provider.id });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (loading || loadingMore || !hasMore) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);
    if (distanceFromBottom <= 120) {
      void handleLoadMore();
    }
  };

  const isEmpty =
    !loading && !networkError && !unexpectedError && items.length === 0;

  return (
    <ScrollView
      testID="results-scroll"
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScroll={handleScroll}
      scrollEventThrottle={160}
    >
      {/* Barra superior: contador 'N resultados' (criterio 2.2) y conmutador 'Lista / Mapa' (criterio 2.3) */}
      <View style={styles.headerRow}>
        <View style={styles.counterBlock}>
          <Text style={styles.screenTitle}>Proveedores</Text>
          <Text testID="results-count" style={styles.resultsCount}>
            {total} resultados
          </Text>
        </View>

        <View
          testID="toggle-view-mode"
          accessibilityRole="tablist"
          style={styles.viewToggle}
        >
          <Pressable
            testID="btn-view-lista"
            onPress={() => setViewMode('lista')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'lista' }}
            style={[
              styles.viewToggleOption,
              viewMode === 'lista' ? styles.viewToggleOptionActive : null,
            ]}
          >
            <Text
              style={[
                styles.viewToggleText,
                viewMode === 'lista' ? styles.viewToggleTextActive : null,
              ]}
            >
              Lista
            </Text>
          </Pressable>
          <Pressable
            testID="btn-view-mapa"
            onPress={() => setViewMode('mapa')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'mapa' }}
            style={[
              styles.viewToggleOption,
              viewMode === 'mapa' ? styles.viewToggleOptionActive : null,
            ]}
          >
            <Text
              style={[
                styles.viewToggleText,
                viewMode === 'mapa' ? styles.viewToggleTextActive : null,
              ]}
            >
              Mapa
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Accesos a Filtros y Ordenar (criterio 2.3 — HU_EU_02_15) */}
      <View style={styles.toolbarRow}>
        <Pressable
          testID="btn-filters"
          onPress={() => {}}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.toolbarButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <MinimalIcon name="search" size={16} color={colors.text} />
          <Text style={styles.toolbarButtonText}>Filtros</Text>
        </Pressable>

        <Pressable
          testID="btn-sort"
          onPress={() => {}}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.toolbarButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <MinimalIcon name="decor" size={16} color={colors.text} />
          <Text style={styles.toolbarButtonText}>Ordenar</Text>
        </Pressable>
      </View>

      {/* Estado de carga inicial o de paginación */}
      {loading ? <LoadingNotice slow={slow} /> : null}

      {/* Error de red (HU_EU_01_04, criterio 6) */}
      {networkError ? (
        <NetworkErrorView message={networkError} onRetry={handleRetry} />
      ) : null}

      {/* Error inesperado (criterio 6) */}
      {unexpectedError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{unexpectedError}</Text>
          <Pressable
            testID="btn-retry-providers"
            onPress={handleRetry}
            accessibilityRole="button"
            style={styles.primaryActionButton}
          >
            <Text style={styles.primaryActionText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Estado vacío con mensaje literal y acción 'Limpiar filtros' (criterio 6) */}
      {isEmpty ? (
        <View testID="empty-results" style={styles.emptyCard}>
          <Text style={styles.emptyMessage}>
            No encontramos proveedores con esos criterios.
          </Text>
          <Pressable
            testID="btn-clear-filters"
            onPress={handleClearFilters}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryActionButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.primaryActionText}>Limpiar filtros</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Lista de tarjetas de proveedor (criterios 2.1 y 5) */}
      {items.length > 0 ? (
        <View style={styles.cardsList}>
          {items.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onPress={handleProviderPress}
            />
          ))}
        </View>
      ) : null}

      {/* Paginación de 10 en 10 al llegar al final (criterio 5) */}
      {loadingMore ? <LoadingNotice slow={slow} /> : null}

      {hasMore && !loading ? (
        <Pressable
          testID="btn-load-more"
          onPress={handleLoadMore}
          disabled={loadingMore}
          accessibilityRole="button"
          accessibilityState={{ disabled: loadingMore }}
          style={({ pressed }) => [
            styles.loadMoreButton,
            loadingMore ? styles.buttonDisabled : null,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.loadMoreText}>Mostrar más proveedores</Text>
        </Pressable>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg * 2,
    gap: spacing.md,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  counterBlock: {
    flex: 1,
    gap: 2,
  },
  screenTitle: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
  },
  resultsCount: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    padding: 2,
  },
  viewToggleOption: {
    minHeight: MIN_TOUCH - 4,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleOptionActive: {
    backgroundColor: colors.primary,
  },
  viewToggleText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.muted,
  },
  viewToggleTextActive: {
    color: colors.background,
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toolbarButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
  },
  toolbarButtonText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  errorBannerText: {
    fontSize: font.base,
    color: colors.error,
  },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyMessage: {
    fontSize: font.base,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryActionButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.background,
  },
  cardsList: {
    gap: spacing.md,
  },
  loadMoreButton: {
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: surfaceTokens.accentBorder,
    backgroundColor: surfaceTokens.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    fontSize: font.base,
    fontWeight: '700',
    color: surfaceTokens.accentText,
  },
});
