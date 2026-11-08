import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { getReservation } from '../api/endpoints';
import type { Reservation } from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { ReservationDetails } from '../components/ReservationDetails';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';

export const NO_RESERVATION_NOTICE = 'No hay una reserva activa para mostrar.';
export const RESERVATION_NOT_FOUND_MESSAGE = 'No encontramos una reserva con ese número.';
export const UNEXPECTED_ERROR_MESSAGE = GENERIC_ERROR;

export default function ConfirmacionScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { flow, clearCart } = useFlow();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(Boolean(flow.reservationCode));
  const [slow, setSlow] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const code = flow.reservationCode;
    if (!code) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const data = await getReservation(code, {
          onSlow: () => {
            if (active) setSlow(true);
          },
        });
        if (active) {
          setReservation(data);
          setErrorMessage(null);
          setNetworkError(null);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof NetworkError) {
          setNetworkError({
            message: err.message,
            retry: () => {
              setLoading(true);
              setReloadKey((k) => k + 1);
            },
          });
        } else if (err instanceof ApiError && err.status === 404) {
          setErrorMessage(RESERVATION_NOT_FOUND_MESSAGE);
        } else {
          setErrorMessage(UNEXPECTED_ERROR_MESSAGE);
        }
      } finally {
        if (active) {
          setLoading(false);
          setSlow(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [flow.reservationCode, reloadKey]);

  const handleGoHome = () => {
    clearCart();
    if (navigation) {
      navigation.navigate('Tabs', { screen: 'Inicio' });
    }
  };

  return (
    <ScrollView
      testID="confirmacion-screen"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Confirmación de reserva</Text>
        <Text style={styles.subtitle}>
          Su reserva ha sido procesada exitosamente en el sistema.
        </Text>
      </View>

      {loading ? <LoadingNotice slow={slow} /> : null}

      {networkError ? (
        <View style={styles.errorBox}>
          <NetworkErrorView
            message={networkError.message}
            onRetry={networkError.retry}
          />
        </View>
      ) : null}

      {errorMessage ? (
        <View testID="confirmacion-error" style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {!loading && !networkError && !errorMessage && reservation ? (
        <ReservationDetails
          reservation={reservation}
          onGoHome={handleGoHome}
          showGoHome={true}
        />
      ) : null}

      {!loading && !flow.reservationCode && !reservation ? (
        <View testID="no-reservation-container" style={styles.emptyCard}>
          <Text style={styles.emptyText}>{NO_RESERVATION_NOTICE}</Text>
          <Pressable
            testID="btn-go-home-empty"
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio"
            style={({ pressed }) => [
              styles.emptyButton,
              pressed ? styles.pressed : null,
            ]}
            onPress={handleGoHome}
          >
            <Text style={styles.emptyButtonText}>Volver al inicio</Text>
          </Pressable>
        </View>
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
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: font.base,
    color: colors.muted,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  emptyButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.85,
  },
});
