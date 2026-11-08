import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export type MinimalIconName =
  | 'home'
  | 'search'
  | 'event'
  | 'reservations'
  | 'venue'
  | 'catering'
  | 'decor'
  | 'music'
  | 'calendar'
  | 'users'
  | 'budget'
  | 'pin'
  | 'check'
  | 'chevron-right'
  | 'star';

interface MinimalIconProps {
  name: MinimalIconName;
  size?: number;
  color?: string;
}

const STROKE = 1.8;

/**
 * Sistema de iconos lineales minimalistas con trazo uniforme (1.8 pt)
 * para barra de navegación y pantallas del marketplace.
 */
export function MinimalIcon({
  name,
  size = 20,
  color = colors.text,
}: MinimalIconProps) {
  const scale = size / 20;

  return (
    <View
       accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.box,
        {
          width: size,
          height: size,
          transform: scale !== 1 ? [{ scale }] : undefined,
        },
      ]}
    >
      {renderGlyph(name, color)}
    </View>
  );
}

function renderGlyph(name: MinimalIconName, color: string) {
  switch (name) {
    case 'home':
      return (
        <>
          {/* Techo a dos aguas */}
          <View
            style={[
              styles.abs,
              {
                width: 11,
                height: 11,
                top: 3,
                left: 4.5,
                borderTopWidth: STROKE,
                borderLeftWidth: STROKE,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
          {/* Cuerpo de la casa */}
          <View
            style={[
              styles.abs,
              {
                width: 12,
                height: 9,
                bottom: 2.5,
                left: 4,
                borderLeftWidth: STROKE,
                borderRightWidth: STROKE,
                borderBottomWidth: STROKE,
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
                borderColor: color,
              },
            ]}
          />
          {/* Puerta */}
          <View
            style={[
              styles.abs,
              {
                width: 4,
                height: 5,
                bottom: 2.5,
                left: 8,
                borderTopWidth: STROKE,
                borderLeftWidth: STROKE,
                borderRightWidth: STROKE,
                borderTopLeftRadius: 1.5,
                borderTopRightRadius: 1.5,
                borderColor: color,
              },
            ]}
          />
        </>
      );

    case 'search':
      return (
        <>
          <View
            style={[
              styles.abs,
              {
                width: 12,
                height: 12,
                borderRadius: 6,
                top: 2.5,
                left: 2.5,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 6,
                height: STROKE,
                bottom: 4,
                right: 2,
                backgroundColor: color,
                borderRadius: 1,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
        </>
      );

    case 'event':
      return (
        <>
          {/* Asa superior del maletín / carrito de evento */}
          <View
            style={[
              styles.abs,
              {
                width: 7,
                height: 4.5,
                top: 2.5,
                left: 6.5,
                borderTopWidth: STROKE,
                borderLeftWidth: STROKE,
                borderRightWidth: STROKE,
                borderTopLeftRadius: 3.5,
                borderTopRightRadius: 3.5,
                borderColor: color,
              },
            ]}
          />
          {/* Cuerpo */}
          <View
            style={[
              styles.abs,
              {
                width: 15,
                height: 11.5,
                bottom: 2.5,
                left: 2.5,
                borderWidth: STROKE,
                borderRadius: 3,
                borderColor: color,
              },
            ]}
          />
          {/* Línea central */}
          <View
            style={[
              styles.abs,
              {
                width: 7,
                height: STROKE,
                top: 10.5,
                left: 6.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
        </>
      );

    case 'reservations':
      return (
        <>
          {/* Comprobante / ticket minimalista */}
          <View
            style={[
              styles.abs,
              {
                width: 14,
                height: 15,
                top: 2.5,
                left: 3,
                borderWidth: STROKE,
                borderRadius: 3,
                borderColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 7,
                height: STROKE,
                top: 7,
                left: 6.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 5,
                height: STROKE,
                top: 11,
                left: 6.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
        </>
      );

    case 'venue':
      return (
        <>
          {/* Frontón arquitectónico */}
          <View
            style={[
              styles.abs,
              {
                width: 10,
                height: 10,
                top: 3,
                left: 5,
                borderTopWidth: STROKE,
                borderLeftWidth: STROKE,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 14,
                height: STROKE,
                top: 7.5,
                left: 3,
                backgroundColor: color,
              },
            ]}
          />
          {/* Columnas */}
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 7,
                top: 8.5,
                left: 5,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 7,
                top: 8.5,
                left: 9.1,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 7,
                top: 8.5,
                right: 5,
                backgroundColor: color,
              },
            ]}
          />
          {/* Base */}
          <View
            style={[
              styles.abs,
              {
                width: 15,
                height: STROKE,
                bottom: 2.5,
                left: 2.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
        </>
      );

    case 'catering':
      return (
        <>
          {/* Pomo superior de la campana */}
          <View
            style={[
              styles.abs,
              {
                width: 3.5,
                height: 3.5,
                borderRadius: 2,
                top: 3,
                left: 8.25,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          {/* Cúpula */}
          <View
            style={[
              styles.abs,
              {
                width: 14,
                height: 8,
                top: 6,
                left: 3,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          {/* Bandeja inferior */}
          <View
            style={[
              styles.abs,
              {
                width: 16,
                height: STROKE,
                bottom: 3.5,
                left: 2,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
        </>
      );

    case 'decor':
      return (
        <>
          {/* Destello / rombo central */}
          <View
            style={[
              styles.abs,
              {
                width: 9,
                height: 9,
                top: 5.5,
                left: 5.5,
                borderWidth: STROKE,
                borderColor: color,
                borderRadius: 1.5,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
          {/* Rayos cardinales */}
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 3,
                top: 1.5,
                left: 9.1,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 3,
                bottom: 1.5,
                left: 9.1,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 3,
                height: STROKE,
                top: 9.1,
                left: 1.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 3,
                height: STROKE,
                top: 9.1,
                right: 1.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
        </>
      );

    case 'music':
      return (
        <>
          {/* Barra superior de corcheas */}
          <View
            style={[
              styles.abs,
              {
                width: 9.5,
                height: STROKE,
                top: 4,
                left: 6.5,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          {/* Plica izquierda */}
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 10,
                top: 4,
                left: 6.5,
                backgroundColor: color,
              },
            ]}
          />
          {/* Plica derecha */}
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 9,
                top: 4,
                left: 14.2,
                backgroundColor: color,
              },
            ]}
          />
          {/* Cabezas de nota */}
          <View
            style={[
              styles.abs,
              {
                width: 5,
                height: 4,
                borderRadius: 2.5,
                bottom: 3.5,
                left: 3.2,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 5,
                height: 4,
                borderRadius: 2.5,
                bottom: 4.5,
                left: 11,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
        </>
      );

    case 'calendar':
      return (
        <>
          {/* Anillos superiores */}
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 3.5,
                top: 2,
                left: 6,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: STROKE,
                height: 3.5,
                top: 2,
                right: 6,
                backgroundColor: color,
                borderRadius: 1,
              },
            ]}
          />
          {/* Marco del calendario */}
          <View
            style={[
              styles.abs,
              {
                width: 14,
                height: 13,
                bottom: 2.5,
                left: 3,
                borderWidth: STROKE,
                borderRadius: 3,
                borderColor: color,
              },
            ]}
          />
          {/* Divisor superior */}
          <View
            style={[
              styles.abs,
              {
                width: 13,
                height: STROKE,
                top: 8,
                left: 3.5,
                backgroundColor: color,
              },
            ]}
          />
        </>
      );

    case 'users':
      return (
        <>
          {/* Cabeza principal */}
          <View
            style={[
              styles.abs,
              {
                width: 6,
                height: 6,
                borderRadius: 3,
                top: 3,
                left: 5,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          {/* Hombros principales */}
          <View
            style={[
              styles.abs,
              {
                width: 11,
                height: 6,
                bottom: 3,
                left: 2.5,
                borderTopLeftRadius: 5.5,
                borderTopRightRadius: 5.5,
                borderTopWidth: STROKE,
                borderLeftWidth: STROKE,
                borderRightWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          {/* Silueta secundaria */}
          <View
            style={[
              styles.abs,
              {
                width: 4.5,
                height: 4.5,
                borderRadius: 2.25,
                top: 4,
                right: 3,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 5,
                height: 5,
                bottom: 3,
                right: 2,
                borderTopRightRadius: 4,
                borderTopWidth: STROKE,
                borderRightWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
        </>
      );

    case 'budget':
      return (
        <>
          {/* Billetera / tarjetero minimalista */}
          <View
            style={[
              styles.abs,
              {
                width: 15,
                height: 12,
                top: 4,
                left: 2.5,
                borderWidth: STROKE,
                borderRadius: 3,
                borderColor: color,
              },
            ]}
          />
          {/* Broche lateral */}
          <View
            style={[
              styles.abs,
              {
                width: 5,
                height: 5,
                top: 7.5,
                right: 2.5,
                borderWidth: STROKE,
                borderTopLeftRadius: 2.5,
                borderBottomLeftRadius: 2.5,
                borderColor: color,
              },
            ]}
          />
        </>
      );

    case 'pin':
      return (
        <>
          <View
            style={[
              styles.abs,
              {
                width: 11,
                height: 11,
                top: 2.5,
                left: 4.5,
                borderWidth: STROKE,
                borderColor: color,
                borderTopLeftRadius: 5.5,
                borderTopRightRadius: 5.5,
                borderBottomRightRadius: 5.5,
                borderBottomLeftRadius: 1.5,
                transform: [{ rotate: '-45deg' }],
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 3,
                height: 3,
                borderRadius: 1.5,
                top: 6.5,
                left: 8.5,
                backgroundColor: color,
              },
            ]}
          />
        </>
      );

    case 'check':
      return (
        <>
          <View
            style={[
              styles.abs,
              {
                width: 14,
                height: 14,
                borderRadius: 7,
                top: 3,
                left: 3,
                borderWidth: STROKE,
                borderColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 4,
                height: 7,
                top: 5.5,
                left: 8,
                borderRightWidth: STROKE,
                borderBottomWidth: STROKE,
                borderColor: color,
                transform: [{ rotate: '40deg' }],
              },
            ]}
          />
        </>
      );

    case 'chevron-right':
      return (
        <View
          style={[
            styles.abs,
            {
              width: 7,
              height: 7,
              top: 6.5,
              left: 5.5,
              borderTopWidth: STROKE,
              borderRightWidth: STROKE,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            },
          ]}
        />
      );

    case 'star':
      return (
        <>
          <View
            style={[
              styles.abs,
              {
                width: 10,
                height: 10,
                top: 5,
                left: 5,
                borderWidth: STROKE,
                borderColor: color,
                borderRadius: 2,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
          <View
            style={[
              styles.abs,
              {
                width: 3,
                height: 3,
                borderRadius: 1.5,
                top: 8.5,
                left: 8.5,
                backgroundColor: color,
              },
            ]}
          />
        </>
      );
  }
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  abs: {
    position: 'absolute',
  },
});
