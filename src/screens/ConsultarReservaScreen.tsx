import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { getReservation } from '../api/endpoints';
import type { Reservation } from '../api/types';
import { FieldError } from '../components/FieldError';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { ReservationDetails } from '../components/ReservationDetails';
import type { TabParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { validateReservationCode } from '../utils/validators';

export const SEARCH_BUTTON_TEXT = 'Consultar';
export const RESERVATION_NOT_FOUND_MESSAGE = 'No encontramos una reserva con ese número.';
export const UNEXPECTED_ERROR_MESSAGE = GENERIC_ERROR;

export default function ConsultarReservaScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, 'Reservas'>>();
  const { clearCart } = useFlow();

  const [codeText, setCodeText] = useState('');
  const codeRef = useRef(codeText);

  const [codeError, setCodeError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);

  const isSubmittingRef = useRef(false);

  const handleCodeChange = (text: string) => {
    const uppercase = text.toUpperCase();
    codeRef.current = uppercase;
    setCodeText(uppercase);
    if (codeError) setCodeError(null);
    if (searchError) setSearchError(null);
  };

  const handleSearch = async () => {
    if (loading || isSubmittingRef.current) return;

    const currentCode = codeRef.current.trim();
    const validationError = validateReservationCode(currentCode);

    if (validationError) {
      setCodeError(validationError);
      setSearchError(null);
      setReservation(null);
      return;
    }

    setCodeError(null);
    setSearchError(null);
    setNetworkError(null);
    setReservation(null);

    isSubmittingRef.current = true;
    setLoading(true);
    setSlow(false);

    try {
      const data = await getReservation(currentCode, {
        onSlow: () => setSlow(true),
      });

      // Criterio 4: la confirmación solo se muestra para reservas pagadas
      if (data.status === 'pagada') {
        setReservation(data);
      } else {
        setSearchError(RESERVATION_NOT_FOUND_MESSAGE);
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError({
          message: err.message,
          retry: handleSearch,
        });
      } else if (err instanceof ApiError && err.status === 404) {
        setSearchError(RESERVATION_NOT_FOUND_MESSAGE);
      } else {
        setSearchError(UNEXPECTED_ERROR_MESSAGE);
      }
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setSlow(false);
    }
  };

  const handleGoHome = () => {
    clearCart();
    if (navigation) {
      navigation.navigate('Inicio');
    }
  };

  return (
    <ScrollView
      testID="consultar-reserva-screen"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Consultar reserva</Text>
        <Text style={styles.subtitle}>
          Ingrese su número de reserva para ver el estado, los servicios reservados y el comprobante de pago.
        </Text>
      </View>

      {/* Formulario de búsqueda (Criterio 2.6) */}
      <View style={styles.searchCard}>
        <Text style={styles.inputLabel}>Número de reserva</Text>
        <TextInput
          testID="input-search-code"
          style={[styles.input, codeError ? styles.inputError : null]}
          placeholder="EU-XXXXXX"
          placeholderTextColor={colors.muted}
          value={codeText}
          onChangeText={handleCodeChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          editable={!loading}
          accessibilityLabel="Número de reserva en formato EU- seguido de 6 caracteres alfanuméricos"
        />
        <FieldError testID="error-search-code" message={codeError} />

        <Pressable
          testID="btn-search-reservation"
          accessibilityRole="button"
          accessibilityLabel={SEARCH_BUTTON_TEXT}
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          style={({ pressed }) => [
            styles.searchButton,
            loading ? styles.buttonDisabled : null,
            pressed && !loading ? styles.buttonPressed : null,
          ]}
          onPress={handleSearch}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.searchButtonText}>Consultando...</Text>
            </View>
          ) : (
            <Text style={styles.searchButtonText}>{SEARCH_BUTTON_TEXT}</Text>
          )}
        </Pressable>
      </View>

      {/* Indicador de carga lenta (5 s) */}
      {loading ? <LoadingNotice slow={slow} /> : null}

      {/* Error de red con reintento (Criterio 6, HU_EU_01_04) */}
      {networkError ? (
        <View style={styles.errorBox}>
          <NetworkErrorView
            message={networkError.message}
            onRetry={networkError.retry}
          />
        </View>
      ) : null}

      {/* Error de número no encontrado o inesperado (Criterio 6) */}
      {searchError ? (
        <View testID="search-error" style={styles.errorCard}>
          <Text style={styles.errorText}>{searchError}</Text>
        </View>
      ) : null}

      {/* Resultado de la reserva (Criterios 2.1 a 2.5 y 5) */}
      {reservation ? (
        <ReservationDetails
          reservation={reservation}
          onGoHome={handleGoHome}
          showGoHome={true}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.lg * 2,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.title,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    minHeight: MIN_TOUCH,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: '#F7F7FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    letterSpacing: 1,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: '#FFF5F5',
  },
  searchButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  searchButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorBox: {
    marginBottom: spacing.md,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: font.base,
    color: '#991B1B',
  },
});
