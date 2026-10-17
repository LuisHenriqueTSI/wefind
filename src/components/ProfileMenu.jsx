import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';

// ---------------------------------------------------------------------------
// Menu que abre ao tocar na foto do usuário (tela inicial)
// ---------------------------------------------------------------------------
// Um popover simples, no estilo dos menus do sistema: cabeçalho com foto e
// nome (toque abre o perfil), itens em lista com ícone de linha e "Sair" em
// vermelho no fim. Sem blocos coloridos atrás dos ícones e sem e-mail.
// ---------------------------------------------------------------------------

const MenuRow = ({ icon, label, onPress, danger, colors }) => (
  <Pressable
    onPress={onPress}
    android_ripple={{ color: colors.divider }}
    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.divider }]}
    accessibilityRole="menuitem"
  >
    <MaterialIcons name={icon} size={20} color={danger ? '#DC2626' : colors.textSecondary} />
    <Text style={[styles.rowText, { color: danger ? '#DC2626' : colors.text }]}>{label}</Text>
  </Pressable>
);

const ProfileMenu = ({ profile, isAdmin, onOpenProfile, onOpenSettings, onOpenAdmin, onSignOut, style }) => {
  const { colors, isDark } = useTheme();
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [appear]);

  const name = profile?.name || 'Usuário';
  const firstName = name.trim().split(/\s+/)[0];
  const avatarUrl = profile?.avatar_url || profile?.avatarUrl;

  return (
    <Animated.View
      style={[
        styles.menu,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
        },
        style,
      ]}
      accessibilityRole="menu"
    >
      <Pressable
        onPress={onOpenProfile}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.divider }]}
        accessibilityLabel="Abrir meu perfil"
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{name[0]?.toUpperCase() || 'U'}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{firstName}</Text>
          <Text style={[styles.subtitle, { color: colors.primary }]}>Ver perfil</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      {isAdmin && <MenuRow icon="admin-panel-settings" label="Administração" onPress={onOpenAdmin} colors={colors} />}
      <MenuRow icon="settings" label="Configurações" onPress={onOpenSettings} colors={colors} />

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      <MenuRow icon="logout" label="Sair" onPress={onSignOut} danger colors={colors} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    top: 58,
    right: 14,
    width: 232,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    backgroundColor: COLORS.secondary || '#B1734A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  rowText: { marginLeft: 14, fontSize: 14.5, fontWeight: '500' },
});

export default ProfileMenu;
