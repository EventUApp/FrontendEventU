import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { postRecommendations } from '../api/endpoints';
import type { EventType } from '../api/types';
import { FieldError } from '../components/FieldError';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { parseCOP } from '../utils/money';
import {
  validateBudget,
  validateEventType,
  validateGuests,
  type FieldErrors,
} from '../utils/validators';

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'cumpleanos', label: 'Cumpleaños' },
  { value: 'boda', label: 'Boda' },
  { value: 'xv', label: 'XV años' },
];

/** HU_EU_01_01: formulario del atajo «Arma mi evento por presupuesto» (antes era el Inicio). */
export default function PresupuestoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { flow, update } = useFlow();

  const [budgetText, setBudgetText] = useState(
    flow.budgetCop !== null ? String(flow.budgetCop) : '',
  );
  const [eventType, setEventType] = useState<EventType | null>(flow.eventType);
  const [guestsText, setGuestsText] = useState(
    flow.guests !== null ? String(flow.guests) : '',
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);

  const handleBudgetChange = (text: string) => {
    setBudgetText(text);
    const parsed = parseCOP(text);
    update({ budgetCop: parsed });
    if (errors.budget_cop) {
      setErrors((prev) => ({ ...prev, budget_cop: undefined }));
    }
  };

  const handleEventTypeSelect = (selected: EventType) => {
    setEventType(selected);
    update({ eventType: selected });
    if (errors.event_type) {
      setErrors((prev) => ({ ...prev, event_type: undefined }));
    }
  };

  const handleGuestsChange = (text: string) => {
    setGuestsText(text);
    const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
    update({ guests: parsed });
    if (errors.guests) {
      setErrors((prev) => ({ ...prev, guests: undefined }));
    }
  };

  const handleSubmit = async () => {
    if (loading) return;

    const budgetError = validateBudget(budgetText);
    const eventTypeError = validateEventType(eventType);
    const guestsError = validateGuests(guestsText);

    const nextErrors: FieldErrors = {};
    if (budgetError) nextErrors.budget_cop = budgetError;
    if (eventTypeError) nextErrors.event_type = eventTypeError;
    if (guestsError) nextErrors.guests = guestsError;

    setErrors(nextErrors);
    setNetworkError(null);
    setUnexpectedError(null);

    if (budgetError || eventTypeError || guestsError || !eventType) {
      return;
    }

    const budgetCop = parseCOP(budgetText)!;
    const guests = Number(guestsText.trim());

    update({ budgetCop, eventType, guests });

    setLoading(true);
    setSlow(false);

    try {
      const response = await postRecommendations(
        { budget_cop: budgetCop, event_type: eventType, guests },
        { onSlow: () => setSlow(true) },
      );
      update({
        budgetCop,
        eventType,
        guests,
        packages: response.packages,
      });
      navigation.navigate('Paquetes');
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError(err.message);
      } else if (err instanceof ApiError && err.status === 422 && Object.keys(err.fields).length > 0) {
        setErrors({
          budget_cop: err.fields.budget_cop,
          event_type: err.fields.event_type,
          guests: err.fields.guests,
        });
      } else {
        setUnexpectedError(GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
      setSlow(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Arma mi evento por presupuesto</Text>
        <Text style={styles.subtitle}>
          Ingresa tu presupuesto, el tipo de evento y los invitados para recibir tres paquetes
          ajustados a lo que puedes gastar.
        </Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Presupuesto total (COP)</Text>
        <TextInput
          testID="input-budget"
          style={[styles.input, errors.budget_cop ? styles.inputError : null]}
          value={budgetText}
          onChangeText={handleBudgetChange}
          placeholder="Ej. 5.000.000"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          editable={!loading}
          accessibilityLabel="Presupuesto en pesos colombianos"
        />
        <FieldError message={errors.budget_cop} />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Tipo de evento</Text>
        <View style={styles.optionsRow} accessibilityRole="radiogroup">
          {EVENT_TYPE_OPTIONS.map((option) => {
            const selected = eventType === option.value;
            return (
              <Pressable
                key={option.value}
                testID={`option-${option.value}`}
                onPress={() => handleEventTypeSelect(option.value)}
                disabled={loading}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.optionPill, selected ? styles.optionPillSelected : null]}
              >
                <Text
                  style={[styles.optionText, selected ? styles.optionTextSelected : null]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <FieldError message={errors.event_type} />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Número de invitados</Text>
        <TextInput
          testID="input-guests"
          style={[styles.input, errors.guests ? styles.inputError : null]}
          value={guestsText}
          onChangeText={handleGuestsChange}
          placeholder="Ej. 80"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          editable={!loading}
          accessibilityLabel="Número de invitados"
        />
        <FieldError message={errors.guests} />
      </View>

      {loading ? <LoadingNotice slow={slow} /> : null}

      {networkError ? (
        <NetworkErrorView message={networkError} onRetry={handleSubmit} />
      ) : null}

      {unexpectedError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{unexpectedError}</Text>
        </View>
      ) : null}

      <Pressable
        testID="btn-submit"
        onPress={handleSubmit}
        disabled={loading}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
      >
        <Text style={styles.submitButtonText}>Ver paquetes</Text>
      </Pressable>
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
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  title: {
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: font.base,
    color: colors.muted,
    lineHeight: 22,
  },
  formGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.error,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionPill: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  optionPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: font.base,
    color: colors.text,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: '#FDF2F2',
  },
  errorBannerText: {
    color: colors.error,
    fontSize: font.base,
  },
  submitButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '600',
  },
});
