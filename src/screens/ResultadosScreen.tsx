import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { GENERIC_ERROR, NetworkError } from '../api/client';
import { getProviders } from '../api/endpoints';
import type {
  Category,
  EventType,
  ProviderSummary,
  ProvidersQuery,
  SortOrder,
} from '../api/types';
import { FieldError } from '../components/FieldError';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { ProviderCard } from '../components/ProviderCard';
import { RatingStars } from '../components/RatingStars';
import { PROVIDERS_PAGE_SIZE } from '../config/limits';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import {
  APPROXIMATE_LOCATION_TEXT,
  CALI_DEFAULT_REGION,
  calculateBbox,
  isValidCoordinate,
  MAP_LOAD_ERROR_MESSAGE,
  SEARCH_THIS_ZONE_TEXT,
  VIEW_PROFILE_BUTTON_TEXT,
  type MapRegion,
} from '../utils/map';
import { formatCOP } from '../utils/money';
import { validatePriceRange } from '../utils/validators';

export {
  APPROXIMATE_LOCATION_TEXT,
  CALI_DEFAULT_REGION,
  MAP_LOAD_ERROR_MESSAGE,
  SEARCH_THIS_ZONE_TEXT,
  VIEW_PROFILE_BUTTON_TEXT,
};

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
  chipBg: '#EDE9FE',
  chipBorder: '#DDD6FE',
  chipText: '#432874',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  cumpleanos: 'Cumpleaños',
  boda: 'Boda',
  xv: 'XV años',
};

export const SORT_LABELS: Record<SortOrder, string> = {
  recomendados: 'Recomendados',
  precio_asc: 'Menor precio',
  precio_desc: 'Mayor precio',
  calificacion: 'Mejor calificados',
};

const CATEGORIES: Category[] = ['espacio', 'alimentacion', 'decoracion', 'entretenimiento'];
const EVENT_TYPES: EventType[] = ['cumpleanos', 'boda', 'xv'];
const RATINGS = [3, 4, 4.5];
const SORTS: SortOrder[] = ['recomendados', 'precio_asc', 'precio_desc', 'calificacion'];

export interface ResultadosScreenProps {
  simulateMapError?: boolean;
}

class MapErrorBoundary extends React.Component<
  { onError: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function MapErrorThrower(): null {
  throw new Error('Simulated map load error');
}

/**
 * HU_EU_02_05 y HU_EU_02_15: pantalla 'Resultados' con tarjetas de proveedor, contador 'N resultados',
 * hoja de 'Filtros', hoja de 'Ordenar', chips con filtros activos, conmutador 'Lista / Mapa',
 * estado vacío y paginación de 10 en 10.
 */
export default function ResultadosScreen({
  simulateMapError = false,
}: ResultadosScreenProps = {}) {
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

  // Estados de apertura de hojas inferiores (criterio 1)
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);
  const [isSortOpen, setIsSortOpen] = useState<boolean>(false);

  // Estados temporales del borrador de filtros (hoja de filtros)
  const [draftCategory, setDraftCategory] = useState<Category | undefined>(undefined);
  const [draftEventType, setDraftEventType] = useState<EventType | undefined>(undefined);
  const [draftMinPrice, setDraftMinPrice] = useState<string>('');
  const [draftMaxPrice, setDraftMaxPrice] = useState<string>('');
  const [draftMinRating, setDraftMinRating] = useState<number | undefined>(undefined);
  const [draftVerified, setDraftVerified] = useState<boolean>(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Estado temporal del borrador de orden (hoja de ordenar)
  const [draftSort, setDraftSort] = useState<SortOrder>('recomendados');

  // Estados para la vista de mapa (HU_EU_03_14)
  const [currentRegion, setCurrentRegion] = useState<MapRegion>(CALI_DEFAULT_REGION);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSummary | null>(null);
  const [popupImageFailed, setPopupImageFailed] = useState<boolean>(false);
  const [mapErrorBanner, setMapErrorBanner] = useState<string | null>(null);

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

  const validMapProviders = useMemo(() => {
    return items.filter((p) => isValidCoordinate(p.latitude, p.longitude));
  }, [items]);

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

  const handleRegionChange = (region: MapRegion) => {
    if (region) {
      setCurrentRegion(region);
    }
  };

  const handleSearchThisZone = () => {
    const bbox = calculateBbox(currentRegion);
    void fetchPage(1, { ...baseQuery, bbox });
  };

  const handleMapError = () => {
    setMapErrorBanner(MAP_LOAD_ERROR_MESSAGE);
    setViewMode('lista');
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

  // Abrir hoja de filtros inicializando el borrador con el estado actual
  const handleOpenFilters = () => {
    setDraftCategory(flow.filters.category);
    setDraftEventType(flow.filters.event_type ?? flow.eventType ?? undefined);
    setDraftMinPrice(
      flow.filters.min_price_cop !== undefined ? String(flow.filters.min_price_cop) : '',
    );
    setDraftMaxPrice(
      flow.filters.max_price_cop !== undefined ? String(flow.filters.max_price_cop) : '',
    );
    setDraftMinRating(flow.filters.min_rating);
    setDraftVerified(!!flow.filters.verified);
    setPriceError(null);
    setIsFiltersOpen(true);
  };

  // Aplicar filtros validados (criterios 2.7, 3.1, 3.2 y 5)
  const handleApplyFilters = async () => {
    const minVal = draftMinPrice.trim() !== '' ? parseInt(draftMinPrice, 10) : null;
    const maxVal = draftMaxPrice.trim() !== '' ? parseInt(draftMaxPrice, 10) : null;

    const validationError = validatePriceRange(minVal, maxVal);
    if (validationError) {
      setPriceError(validationError);
      return;
    }

    const nextFilters: ProvidersQuery = {
      ...flow.filters,
      category: draftCategory,
      event_type: draftEventType,
      min_price_cop: minVal ?? undefined,
      max_price_cop: maxVal ?? undefined,
      min_rating: draftMinRating,
      verified: draftVerified ? true : undefined,
    };

    (Object.keys(nextFilters) as (keyof ProvidersQuery)[]).forEach((key) => {
      if (nextFilters[key] === undefined) {
        delete nextFilters[key];
      }
    });

    update({
      filters: nextFilters,
      eventType: draftEventType ?? null,
    });
    setIsFiltersOpen(false);
  };

  // Limpiar filtros dentro de la hoja (criterio 2.7)
  const handleClearFiltersSheet = () => {
    setDraftCategory(undefined);
    setDraftEventType(undefined);
    setDraftMinPrice('');
    setDraftMaxPrice('');
    setDraftMinRating(undefined);
    setDraftVerified(false);
    setPriceError(null);
  };

  // Abrir hoja de ordenar
  const handleOpenSort = () => {
    setDraftSort(flow.filters.sort ?? 'recomendados');
    setIsSortOpen(true);
  };

  // Aplicar orden seleccionado (criterios 2.6, 3.3 y 5)
  const handleApplySort = async (order?: SortOrder) => {
    const targetSort = order ?? draftSort;
    const nextFilters: ProvidersQuery = {
      ...flow.filters,
      sort: targetSort,
    };
    update({ filters: nextFilters });
    setIsSortOpen(false);
  };

  // Construcción de chips activos (criterios 2.7 y 5)
  const activeChips = useMemo(() => {
    const list: {
      id: string;
      label: string;
      testID: string;
      removeTestID: string;
      onRemove: () => Promise<void>;
    }[] = [];

    if (flow.filters.category) {
      list.push({
        id: 'category',
        label: CATEGORY_LABELS[flow.filters.category],
        testID: 'chip-category',
        removeTestID: 'chip-remove-category',
        onRemove: async () => {
          const next = { ...flow.filters };
          delete next.category;
          update({ filters: next });
        },
      });
    }

    const currentEventType = flow.filters.event_type ?? flow.eventType;
    if (currentEventType) {
      list.push({
        id: 'event_type',
        label: EVENT_TYPE_LABELS[currentEventType],
        testID: 'chip-event-type',
        removeTestID: 'chip-remove-event-type',
        onRemove: async () => {
          const next = { ...flow.filters };
          delete next.event_type;
          update({ filters: next, eventType: null });
        },
      });
    }

    const hasMinPrice = flow.filters.min_price_cop !== undefined;
    const hasMaxPrice = flow.filters.max_price_cop !== undefined;
    if (hasMinPrice || hasMaxPrice) {
      let priceLabel = '';
      if (hasMinPrice && hasMaxPrice) {
        priceLabel = `${formatCOP(flow.filters.min_price_cop!)} - ${formatCOP(flow.filters.max_price_cop!)}`;
      } else if (hasMinPrice) {
        priceLabel = `Desde ${formatCOP(flow.filters.min_price_cop!)}`;
      } else {
        priceLabel = `Hasta ${formatCOP(flow.filters.max_price_cop!)}`;
      }
      list.push({
        id: 'price',
        label: priceLabel,
        testID: 'chip-price',
        removeTestID: 'chip-remove-price',
        onRemove: async () => {
          const next = { ...flow.filters };
          delete next.min_price_cop;
          delete next.max_price_cop;
          update({ filters: next });
        },
      });
    }

    if (flow.filters.min_rating !== undefined) {
      list.push({
        id: 'min_rating',
        label: `★ ${flow.filters.min_rating}+`,
        testID: 'chip-rating',
        removeTestID: 'chip-remove-rating',
        onRemove: async () => {
          const next = { ...flow.filters };
          delete next.min_rating;
          update({ filters: next });
        },
      });
    }

    if (flow.filters.verified) {
      list.push({
        id: 'verified',
        label: 'Solo verificados',
        testID: 'chip-verified',
        removeTestID: 'chip-remove-verified',
        onRemove: async () => {
          const next = { ...flow.filters };
          delete next.verified;
          update({ filters: next });
        },
      });
    }

    if (flow.filters.sort && flow.filters.sort !== 'recomendados') {
      list.push({
        id: 'sort',
        label: SORT_LABELS[flow.filters.sort],
        testID: 'chip-sort',
        removeTestID: 'chip-remove-sort',
        onRemove: async () => {
          const next = { ...flow.filters };
          delete next.sort;
          update({ filters: next });
        },
      });
    }

    return list;
  }, [flow.filters, flow.eventType, update]);

  const activeFiltersCount = activeChips.filter((c) => c.id !== 'sort').length;
  const currentSortLabel = flow.filters.sort ? SORT_LABELS[flow.filters.sort] : 'Ordenar';

  const isEmpty =
    !loading && !networkError && !unexpectedError && items.length === 0;

  return (
    <View style={styles.screen}>
      {/* Controles superiores compartidos entre Lista y Mapa (HU_EU_02_15 y HU_EU_03_14 criterio 2.3) */}
      <View style={styles.topControls}>
        {/* Barra superior: contador 'N resultados' y conmutador 'Lista / Mapa' */}
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
              onPress={() => {
                setMapErrorBanner(null);
                setViewMode('mapa');
              }}
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

        {/* Accesos a Filtros y Ordenar (criterio 1 — HU_EU_02_15) */}
        <View style={styles.toolbarRow}>
          <Pressable
            testID="btn-filters"
            onPress={handleOpenFilters}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.toolbarButton,
              activeFiltersCount > 0 ? styles.toolbarButtonActive : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <MinimalIcon
              name="search"
              size={16}
              color={activeFiltersCount > 0 ? surfaceTokens.accentText : colors.text}
            />
            <Text
              style={[
                styles.toolbarButtonText,
                activeFiltersCount > 0 ? styles.toolbarButtonTextActive : null,
              ]}
            >
              {activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Filtros'}
            </Text>
          </Pressable>

          <Pressable
            testID="btn-sort"
            onPress={handleOpenSort}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.toolbarButton,
              flow.filters.sort && flow.filters.sort !== 'recomendados'
                ? styles.toolbarButtonActive
                : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <MinimalIcon
              name="decor"
              size={16}
              color={
                flow.filters.sort && flow.filters.sort !== 'recomendados'
                  ? surfaceTokens.accentText
                  : colors.text
              }
            />
            <Text
              style={[
                styles.toolbarButtonText,
                flow.filters.sort && flow.filters.sort !== 'recomendados'
                  ? styles.toolbarButtonTextActive
                  : null,
              ]}
            >
              {flow.filters.sort && flow.filters.sort !== 'recomendados'
                ? currentSortLabel
                : 'Ordenar'}
            </Text>
          </Pressable>
        </View>

        {/* Chips con los filtros activos (criterios 2.7 y 5) */}
        {activeChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.activeChipsScroll}
            contentContainerStyle={styles.activeChipsContent}
            testID="active-filters-chips"
          >
            {activeChips.map((chip) => (
              <View key={chip.id} style={styles.activeChip} testID={chip.testID}>
                <Text style={styles.activeChipText}>{chip.label}</Text>
                <Pressable
                  testID={chip.removeTestID}
                  onPress={() => void chip.onRemove()}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar filtro ${chip.label}`}
                  style={styles.activeChipRemoveBtn}
                >
                  <Text style={styles.activeChipRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              testID="btn-clear-all-chips"
              onPress={() => void handleClearFilters()}
              accessibilityRole="button"
              style={styles.clearAllChip}
            >
              <Text style={styles.clearAllChipText}>Limpiar filtros</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {/* Banner de error de carga del mapa (HU_EU_03_14, criterio 6) */}
        {mapErrorBanner ? (
          <View testID="map-load-error-banner" style={styles.mapErrorBanner}>
            <Text style={styles.mapErrorBannerText}>{mapErrorBanner}</Text>
          </View>
        ) : null}
      </View>

      {/* Vista Lista (HU_EU_02_05) */}
      {viewMode === 'lista' ? (
        <ScrollView
          testID="results-scroll"
          style={styles.scrollList}
          contentContainerStyle={styles.content}
          onScroll={handleScroll}
          scrollEventThrottle={160}
        >
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
      ) : null}

      {/* Vista Mapa (HU_EU_03_14) */}
      {viewMode === 'mapa' ? (
        <View testID="map-container" style={styles.mapContainer}>
          <MapErrorBoundary onError={handleMapError}>
            {simulateMapError ? (
              <MapErrorThrower />
            ) : (
              <MapView
                testID="results-map"
                style={styles.mapView}
                initialRegion={CALI_DEFAULT_REGION}
                onRegionChangeComplete={handleRegionChange}
              >
                {/* 2.1 y 3.1: Marcadores con el precio 'Desde' solo para proveedores con coordenadas válidas */}
                {validMapProviders.map((provider) => (
                  <Marker
                    key={provider.id}
                    testID={`map-marker-${provider.id}`}
                    coordinate={{
                      latitude: provider.latitude!,
                      longitude: provider.longitude!,
                    }}
                    onPress={() => {
                      setPopupImageFailed(false);
                      setSelectedProvider(provider);
                    }}
                  >
                    <View style={styles.markerBadge}>
                      <Text style={styles.markerBadgeText}>
                        Desde {formatCOP(provider.price_from_cop)}
                      </Text>
                    </View>
                  </Marker>
                ))}
              </MapView>
            )}
          </MapErrorBoundary>

          {/* 2.4 y 5: Botón 'Buscar en esta zona' */}
          <View style={styles.searchThisZoneWrapper}>
            <Pressable
              testID="btn-search-this-zone"
              accessibilityRole="button"
              accessibilityLabel={SEARCH_THIS_ZONE_TEXT}
              style={({ pressed }) => [
                styles.searchThisZoneButton,
                loading ? styles.buttonDisabled : null,
                pressed ? styles.buttonPressed : null,
              ]}
              onPress={handleSearchThisZone}
              disabled={loading}
            >
              <MinimalIcon name="search" size={16} color="#FFFFFF" />
              <Text style={styles.searchThisZoneText}>{SEARCH_THIS_ZONE_TEXT}</Text>
            </Pressable>
          </View>

          {/* 2.2 y 5: Tarjeta emergente con foto, nombre, calificación y botón 'Ver ficha' */}
          {selectedProvider ? (
            <View testID="map-popup-card" style={styles.popupCard}>
              <Pressable
                testID="btn-popup-close"
                accessibilityRole="button"
                accessibilityLabel="Cerrar tarjeta"
                style={styles.popupCloseButton}
                onPress={() => setSelectedProvider(null)}
              >
                <Text style={styles.popupCloseText}>✕</Text>
              </Pressable>

              <View style={styles.popupContentRow}>
                {selectedProvider.cover_url && !popupImageFailed ? (
                  <Image
                    testID="map-popup-image"
                    source={{ uri: selectedProvider.cover_url }}
                    style={styles.popupImage}
                    onError={() => setPopupImageFailed(true)}
                  />
                ) : (
                  <View style={styles.popupPlaceholderImage}>
                    <Text style={styles.popupPlaceholderText}>
                      {selectedProvider.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={styles.popupInfo}>
                  <Text
                    testID="map-popup-name"
                    style={styles.popupTitle}
                    numberOfLines={1}
                  >
                    {selectedProvider.name}
                  </Text>
                  <View style={styles.popupRatingRow}>
                    <RatingStars
                      ratingAvg={selectedProvider.rating_avg}
                      ratingCount={selectedProvider.rating_count}
                    />
                  </View>
                  <Text style={styles.popupPrice}>
                    Desde {formatCOP(selectedProvider.price_from_cop)}
                  </Text>
                </View>
              </View>

              <Pressable
                testID="btn-popup-view-profile"
                accessibilityRole="button"
                accessibilityLabel={VIEW_PROFILE_BUTTON_TEXT}
                style={({ pressed }) => [
                  styles.popupViewProfileButton,
                  pressed ? styles.buttonPressed : null,
                ]}
                onPress={() => handleProviderPress(selectedProvider)}
              >
                <Text style={styles.popupViewProfileText}>
                  {VIEW_PROFILE_BUTTON_TEXT}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Indicadores de carga y error en modo mapa */}
          {loading ? (
            <View style={styles.mapLoadingOverlay}>
              <LoadingNotice slow={slow} />
            </View>
          ) : null}

          {networkError ? (
            <View style={styles.mapErrorOverlay}>
              <NetworkErrorView message={networkError} onRetry={handleRetry} />
            </View>
          ) : null}

          {unexpectedError ? (
            <View style={styles.mapErrorOverlay}>
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorBannerText}>{unexpectedError}</Text>
                <Pressable
                  testID="btn-retry-providers-map"
                  onPress={handleRetry}
                  accessibilityRole="button"
                  style={styles.primaryActionButton}
                >
                  <Text style={styles.primaryActionText}>Reintentar</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Hoja de Filtros (criterio 1, 2 y 3) */}
      <Modal
        visible={isFiltersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFiltersOpen(false)}
        testID="modal-filters"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContainer} testID="filters-sheet">
            <View style={styles.sheetHandle} />

            {/* Cabecera */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} testID="filters-sheet-title">
                Filtros
              </Text>
              <Pressable
                testID="btn-close-filters"
                onPress={() => setIsFiltersOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar filtros"
                style={styles.sheetCloseButton}
              >
                <Text style={styles.sheetCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 2.1 Filtro por rubro */}
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Rubro</Text>
                <View style={styles.optionsRow}>
                  {CATEGORIES.map((cat) => {
                    const selected = draftCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        testID={`filter-rubro-${cat}`}
                        onPress={() =>
                          setDraftCategory((prev) => (prev === cat ? undefined : cat))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.optionChip,
                          selected ? styles.optionChipSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected ? styles.optionChipTextSelected : null,
                          ]}
                        >
                          {CATEGORY_LABELS[cat]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 2.2 Filtro por tipo de evento */}
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Tipo de evento</Text>
                <View style={styles.optionsRow}>
                  {EVENT_TYPES.map((type) => {
                    const selected = draftEventType === type;
                    return (
                      <Pressable
                        key={type}
                        testID={`filter-event-type-${type}`}
                        onPress={() =>
                          setDraftEventType((prev) => (prev === type ? undefined : type))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.optionChip,
                          selected ? styles.optionChipSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected ? styles.optionChipTextSelected : null,
                          ]}
                        >
                          {EVENT_TYPE_LABELS[type]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 2.3 Filtro por rango de precio (enteros) y validación (3.1 y 3.2) */}
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Rango de precio</Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <Text style={styles.fieldSubLabel}>Mínimo</Text>
                    <TextInput
                      testID="input-min-price"
                      value={draftMinPrice}
                      onChangeText={(val) => {
                        setDraftMinPrice(val.replace(/[^0-9]/g, ''));
                        setPriceError(null);
                      }}
                      keyboardType="number-pad"
                      placeholder="COP min"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Precio mínimo"
                      style={styles.priceInput}
                    />
                  </View>
                  <View style={styles.priceField}>
                    <Text style={styles.fieldSubLabel}>Máximo</Text>
                    <TextInput
                      testID="input-max-price"
                      value={draftMaxPrice}
                      onChangeText={(val) => {
                        setDraftMaxPrice(val.replace(/[^0-9]/g, ''));
                        setPriceError(null);
                      }}
                      keyboardType="number-pad"
                      placeholder="COP max"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Precio máximo"
                      style={styles.priceInput}
                    />
                  </View>
                </View>
                {priceError ? (
                  <View testID="error-price-range">
                    <FieldError message={priceError} />
                  </View>
                ) : null}
              </View>

              {/* 2.4 Filtro por calificación mínima */}
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Calificación mínima</Text>
                <View style={styles.optionsRow}>
                  {RATINGS.map((rate) => {
                    const selected = draftMinRating === rate;
                    const idStr = String(rate);
                    return (
                      <Pressable
                        key={rate}
                        testID={`filter-rating-${idStr}`}
                        onPress={() =>
                          setDraftMinRating((prev) => (prev === rate ? undefined : rate))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.optionChip,
                          selected ? styles.optionChipSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected ? styles.optionChipTextSelected : null,
                          ]}
                        >
                          {rate === 4.5 ? '★ 4,5+' : `★ ${rate}+`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 2.5 Interruptor 'Solo verificados' */}
              <Pressable
                testID="toggle-only-verified"
                onPress={() => setDraftVerified((prev) => !prev)}
                accessibilityRole="switch"
                accessibilityState={{ checked: draftVerified }}
                accessibilityLabel="Solo verificados"
                style={styles.switchRow}
              >
                <Text style={styles.switchLabel}>Solo verificados</Text>
                <Switch
                  value={draftVerified}
                  onValueChange={setDraftVerified}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  trackColor={{ false: colors.border, true: surfaceTokens.accentBorder }}
                  thumbColor={draftVerified ? colors.primary : colors.muted}
                />
              </Pressable>
            </ScrollView>

            {/* Acciones 'Aplicar' y 'Limpiar filtros' (criterio 2.7) */}
            <View style={styles.sheetFooter}>
              <Pressable
                testID="btn-clear-filters-sheet"
                onPress={handleClearFiltersSheet}
                accessibilityRole="button"
                style={styles.sheetClearButton}
              >
                <Text style={styles.sheetClearButtonText}>Limpiar filtros</Text>
              </Pressable>

              <Pressable
                testID="btn-apply-filters"
                onPress={() => void handleApplyFilters()}
                accessibilityRole="button"
                style={styles.sheetApplyButton}
              >
                <Text style={styles.sheetApplyButtonText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hoja de Ordenar (criterios 1, 2.6 y 3.3) */}
      <Modal
        visible={isSortOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSortOpen(false)}
        testID="modal-sort"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContainer} testID="sort-sheet">
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} testID="sort-sheet-title">
                Ordenar por
              </Text>
              <Pressable
                testID="btn-close-sort"
                onPress={() => setIsSortOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar ordenar"
                style={styles.sheetCloseButton}
              >
                <Text style={styles.sheetCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.sortOptionsList}>
              {SORTS.map((sortOption) => {
                const selected = draftSort === sortOption;
                return (
                  <Pressable
                    key={sortOption}
                    testID={`sort-option-${sortOption}`}
                    onPress={() => setDraftSort(sortOption)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.sortOptionRow,
                      selected ? styles.sortOptionRowSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        selected ? styles.sortOptionTextSelected : null,
                      ]}
                    >
                      {SORT_LABELS[sortOption]}
                    </Text>
                    {selected ? (
                      <View style={styles.radioSelectedDot}>
                        <MinimalIcon name="check" size={14} color={colors.primary} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sheetFooter}>
              <Pressable
                testID="btn-apply-sort"
                onPress={() => void handleApplySort()}
                accessibilityRole="button"
                style={styles.sheetApplyButton}
              >
                <Text style={styles.sheetApplyButtonText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topControls: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    zIndex: 10,
    gap: spacing.md,
  },
  scrollList: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
  toolbarButtonActive: {
    borderColor: surfaceTokens.accentBorder,
    backgroundColor: surfaceTokens.accentSurface,
  },
  toolbarButtonText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  toolbarButtonTextActive: {
    color: surfaceTokens.accentText,
    fontWeight: '700',
  },
  activeChipsScroll: {
    maxHeight: MIN_TOUCH + 4,
  },
  activeChipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.xs,
    paddingVertical: 4,
    borderRadius: 18,
    backgroundColor: surfaceTokens.chipBg,
    borderWidth: 1,
    borderColor: surfaceTokens.chipBorder,
    gap: spacing.xs,
  },
  activeChipText: {
    fontSize: font.base - 2,
    fontWeight: '600',
    color: surfaceTokens.chipText,
  },
  activeChipRemoveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeChipRemoveText: {
    fontSize: 13,
    fontWeight: '700',
    color: surfaceTokens.chipText,
  },
  clearAllChip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surfaceTokens.subtleBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearAllChipText: {
    fontSize: font.base - 2,
    fontWeight: '600',
    color: colors.muted,
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
  // Estilos de modal y hojas inferiores
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginVertical: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  sheetTitle: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
  },
  sheetCloseButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.muted,
  },
  sheetBody: {
    maxHeight: 400,
  },
  sheetBodyContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionBlock: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  optionChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipSelected: {
    backgroundColor: surfaceTokens.accentSurface,
    borderColor: surfaceTokens.accentBorder,
  },
  optionChipText: {
    fontSize: font.base - 1,
    fontWeight: '600',
    color: colors.text,
  },
  optionChipTextSelected: {
    color: surfaceTokens.accentText,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priceField: {
    flex: 1,
    gap: 4,
  },
  fieldSubLabel: {
    fontSize: font.base - 2,
    color: colors.muted,
    fontWeight: '500',
  },
  priceInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: surfaceTokens.subtleBg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  switchLabel: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  sheetClearButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetClearButtonText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  sheetApplyButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetApplyButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.background,
  },
  sortOptionsList: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  sortOptionRow: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
  },
  sortOptionRowSelected: {
    backgroundColor: surfaceTokens.accentSurface,
    borderColor: surfaceTokens.accentBorder,
  },
  sortOptionText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  sortOptionTextSelected: {
    color: surfaceTokens.accentText,
    fontWeight: '700',
  },
  radioSelectedDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: surfaceTokens.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  mapView: {
    ...StyleSheet.absoluteFill,
  },
  markerBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  markerBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  searchThisZoneWrapper: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    zIndex: 10,
  },
  searchThisZoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  searchThisZoneText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '700',
  },
  popupCard: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 20,
  },
  popupCloseButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    minWidth: 32,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  popupCloseText: {
    fontSize: 16,
    color: colors.muted,
    fontWeight: '700',
  },
  popupContentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingRight: 24,
  },
  popupImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#EEEEF4',
  },
  popupPlaceholderImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: surfaceTokens.chipBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupPlaceholderText: {
    color: surfaceTokens.chipText,
    fontSize: font.base,
    fontWeight: '800',
  },
  popupInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  popupTitle: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  popupRatingRow: {
    marginVertical: 2,
  },
  popupPrice: {
    fontSize: font.base - 2,
    fontWeight: '700',
    color: colors.primary,
  },
  popupViewProfileButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  popupViewProfileText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '700',
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: spacing.md + 48,
    alignSelf: 'center',
    zIndex: 15,
  },
  mapErrorOverlay: {
    position: 'absolute',
    top: spacing.md + 48,
    left: spacing.md,
    right: spacing.md,
    zIndex: 15,
  },
  mapErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  mapErrorBannerText: {
    color: '#991B1B',
    fontSize: font.base - 1,
    textAlign: 'center',
  },
});
