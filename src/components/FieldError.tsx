import React from 'react';
import { Text } from 'react-native';
import { colors, font } from '../theme';

/** Mensaje de validación junto al campo (RNF-USA-04). No renderiza nada si no hay error. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text style={{ color: colors.error, fontSize: font.base - 2 }} accessibilityRole="alert">{message}</Text>;
}
