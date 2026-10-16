import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Botão "Entrar" usado no cabeçalho verde das telas públicas
const LoginPillButton = ({ onPress, style }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.pill, style]}
    activeOpacity={0.75}
    accessibilityRole="button"
    accessibilityLabel="Entrar na conta"
  >
    <MaterialIcons name="person" size={16} color="#FFFFFF" />
    <Text style={styles.text}>Entrar</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  text: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});

export default LoginPillButton;
