import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import COLORS from '../constants/theme';

const Button = ({
  onPress,
  title,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const getStyles = () => {
    switch (variant) {
      // Ações secundárias (Cancelar, Voltar, Ainda não) usam um cinza neutro.
      case 'secondary':
        return styles.neutralButton;
      case 'orange':
        return styles.secondaryButton;
      case 'danger':
        return styles.dangerButton;
      case 'outline':
        return styles.outlineButton;
      case 'neutral':
        return styles.neutralButton;
      default:
        return styles.primaryButton;
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'secondary':
        return styles.neutralText;
      case 'orange':
        return styles.secondaryText;
      case 'danger':
        return styles.dangerText;
      case 'outline':
        return styles.outlineText;
      case 'neutral':
        return styles.neutralText;
      default:
        return styles.primaryText;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        getStyles(),
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={[getTextStyles(), textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  primaryButton: {
    backgroundColor: COLORS.primary,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: COLORS.orange,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neutralButton: {
    backgroundColor: COLORS.gray200,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButton: {
    backgroundColor: COLORS.error,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  outlineText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  neutralText: {
    color: COLORS.gray900,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default Button;
