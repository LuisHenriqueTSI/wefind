import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import FosterVolunteerModal from '../components/FosterVolunteerModal';
import { getFosterProfile } from '../services/foster';
import { APP_FEATURES } from '../constants/features';

const ProfileScreen = ({ navigation }) => {
  const { userProfile, user, signOut, refreshProfile, isAdmin } = useAuth();
  const { colors, isDark } = useTheme();
  const [userItemsCount, setUserItemsCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [localSavedLocation, setLocalSavedLocation] = useState(null);
  const [fosterModalVisible, setFosterModalVisible] = useState(false);
  const [fosterProfile, setFosterProfile] = useState(null);

  const loadProfileData = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('@wefind/saved_location');
      if (stored) setLocalSavedLocation(JSON.parse(stored));
    } catch (e) {}

    if (user?.id) {
      const [itemsRes, fosterRes] = await Promise.allSettled([
        supabase
          .from('items')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id),
        APP_FEATURES.fosterVolunteers ? getFosterProfile(user.id) : Promise.resolve(null),
      ]);
      if (itemsRes.status === 'fulfilled') {
        if (itemsRes.value.error) {
          console.warn('[ProfileScreen] Erro ao contar publicações:', itemsRes.value.error.message);
        } else {
          setUserItemsCount(itemsRes.value.count || 0);
        }
      } else {
        console.warn('[ProfileScreen] Erro ao contar publicações:', itemsRes.reason?.message);
      }
      if (fosterRes.status === 'fulfilled') setFosterProfile(fosterRes.value);
      else console.warn('[ProfileScreen] Erro ao carregar perfil de lar temporário:', fosterRes.reason?.message);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData])
  );

  useEffect(() => {
    setAvatarUrl(userProfile?.avatar_url || userProfile?.avatarUrl || null);
  }, [userProfile]);

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para escolher uma foto de perfil.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!pickerResult.canceled && pickerResult.assets?.[0]?.uri) {
      setUploading(true);
      try {
        const { uploadAvatar, updateProfile } = await import('../services/user');
        const url = await uploadAvatar(user.id, pickerResult.assets[0].uri);
        const ext = url.split('.').pop().split('?')[0];
        await updateProfile(user.id, { avatar_path: `${user.id}/avatar.${ext}` });
        setAvatarUrl(url);
        await refreshProfile();
      } catch (error) {
        Alert.alert('Não foi possível atualizar', 'Tente escolher outra foto.');
      } finally {
        setUploading(false);
      }
    }
  };

  const initial = userProfile?.name?.[0]?.toUpperCase() || 'U';
  const effectiveCity = userProfile?.city || localSavedLocation?.city;
  const effectiveState = userProfile?.state || localSavedLocation?.state;

  const locationText = (effectiveCity && effectiveState)
    ? `${effectiveCity} - ${effectiveState}`
    : (effectiveCity || effectiveState || null);

  const communityLinks = [
    {
      label: 'Ranking da Comunidade',
      icon: 'leaderboard',
      iconColor: colors.secondary,
      route: 'Ranking',
    },
    {
      label: 'Rede de Lares Temporários',
      icon: 'groups',
      iconColor: '#16A34A',
      route: 'FosterVolunteers',
    },
    {
      label: 'Mural de Reencontros',
      icon: 'favorite',
      iconColor: '#EC4899',
      route: 'MuralReencontros',
    },
    {
      label: 'Sobre o WeFIND',
      icon: 'info',
      iconColor: colors.primary,
      route: 'Sobre',
    },
  ].filter((item) => (
    (item.route !== 'Ranking' || APP_FEATURES.communityRanking) &&
    (item.route !== 'FosterVolunteers' || APP_FEATURES.fosterVolunteers) &&
    (item.route !== 'MuralReencontros' || APP_FEATURES.successStories)
  ));

  const settingsLinks = [
    {
      label: 'Configurações',
      icon: 'settings',
      iconColor: colors.textSecondary,
      route: 'Config',
    },
    {
      label: 'Ajuda e suporte',
      icon: 'help',
      iconColor: colors.textSecondary,
      route: 'AjudaSuporte',
    },
  ];

  const profileLinks = [
    { label: 'Meus pets e carteirinhas', icon: 'pets', route: 'MyPets' },
    { label: 'Meus anúncios', icon: 'campaign', route: 'MeusAnuncios', count: userItemsCount },
    ...(APP_FEATURES.gamification
      ? [{ label: 'Conquistas e nível', icon: 'workspace-premium', route: 'Gamification' }]
      : []),
    { label: 'Solicitações de devolução', icon: 'assignment-turned-in', route: 'ClaimsManagement' },
    ...(isAdmin ? [{ label: 'Painel administrativo', icon: 'admin-panel-settings', route: 'Admin' }] : []),
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Identidade e dados principais */}
      <View style={styles.identityCard}>
        <View style={styles.identityRow}>
          <TouchableOpacity
            onPress={handlePickAvatar}
            disabled={uploading}
            activeOpacity={0.85}
            style={styles.avatarWrapper}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="camera" size={13} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.identityDetails}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {userProfile?.name || 'Usuário WeFIND'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
              {user?.email || 'Conta cadastrada'}
            </Text>
            {locationText ? (
              <Text style={[styles.userLocation, { color: colors.textSecondary }]} numberOfLines={1}>
                {locationText}
              </Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.editProfileButton, { borderTopColor: colors.divider }]}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.75}
        >
          <Text style={[styles.editProfileButtonText, { color: colors.primary }]}>Editar perfil e contatos</Text>
          <MaterialIcons name="arrow-forward" size={17} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>MINHA CONTA</Text>
      <View style={[styles.menuGroup, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        {profileLinks.map((item, index) => (
          <React.Fragment key={item.route}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.75}
            >
              <MaterialIcons name={item.icon} size={20} color={colors.primary} style={styles.menuIcon} />
              <Text style={[styles.menuTitle, styles.profileLinkTitle, { color: colors.text }]}>{item.label}</Text>
              {item.count !== undefined && item.count > 0 ? (
                <Text style={[styles.linkCount, { color: colors.textSecondary }]}>{item.count}</Text>
              ) : null}
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            {index < profileLinks.length - 1 ? (
              <View style={[styles.menuDivider, { backgroundColor: colors.divider }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      {/* 4. GRUPO: COMUNIDADE & IMPACTO */}
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>COMUNIDADE & IMPACTO</Text>
      <View style={[styles.menuGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {APP_FEATURES.fosterVolunteers && (
          <>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => setFosterModalVisible(true)}
              activeOpacity={0.75}
            >
              <MaterialIcons
                name="home-work"
                size={20}
                color={fosterProfile?.isActive ? '#16A34A' : colors.textSecondary}
                style={styles.menuIcon}
              />
              <View style={styles.menuTextBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.menuTitle, { color: colors.text }]}>Lar Temporário Solidário</Text>
                  <View style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1.5,
                    borderRadius: 6,
                    backgroundColor: fosterProfile?.isActive ? '#DCFCE7' : (isDark ? '#334155' : '#E2E8F0'),
                  }}>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: fosterProfile?.isActive ? '#15803D' : colors.textSecondary,
                    }}>
                      {fosterProfile?.isActive ? 'ATIVO' : 'INATIVO'}
                    </Text>
                  </View>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.divider }]} />
          </>
        )}

        {communityLinks.map((item, index) => (
          <React.Fragment key={item.route}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.75}
            >
              <MaterialIcons name={item.icon} size={20} color={item.iconColor} style={styles.menuIcon} />
              <View style={styles.menuTextBox}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{item.label}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            {index < communityLinks.length - 1 ? (
              <View style={[styles.menuDivider, { backgroundColor: colors.divider }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      {/* 5. GRUPO: CONTA & PREFERÊNCIAS */}
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>CONTA & PREFERÊNCIAS</Text>
      <View style={[styles.menuGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {settingsLinks.map((item, index) => (
          <React.Fragment key={item.route}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.75}
            >
              <MaterialIcons name={item.icon} size={20} color={item.iconColor} style={styles.menuIcon} />
              <View style={styles.menuTextBox}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{item.label}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            {index < settingsLinks.length - 1 ? (
              <View style={[styles.menuDivider, { backgroundColor: colors.divider }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      {/* 6. BOTÃO DE LOGOUT */}
      <TouchableOpacity
        style={[
          styles.logoutButton,
          {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
            borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2',
          },
        ]}
        onPress={signOut}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={16} color="#DC2626" style={{ marginRight: 8 }} />
        <Text style={styles.logoutButtonText}>Sair da conta</Text>
      </TouchableOpacity>

      {/* Modal de Lar Temporário Solidário */}
      {APP_FEATURES.fosterVolunteers && (
        <FosterVolunteerModal
          visible={fosterModalVisible}
          onClose={() => setFosterModalVisible(false)}
          onSaved={(updated) => setFosterProfile(updated)}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  identityCard: {
    paddingTop: 8,
    marginBottom: 22,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 21,
    fontWeight: '700',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    marginBottom: 3,
  },
  userLocation: {
    fontSize: 12,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editProfileButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.35,
    marginBottom: 6,
    marginLeft: 2,
  },
  menuGroup: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 22,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuIcon: {
    width: 24,
    marginRight: 12,
  },
  menuTextBox: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  profileLinkTitle: {
    flex: 1,
  },
  linkCount: {
    fontSize: 13,
    marginRight: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 0,
    marginBottom: 20,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default ProfileScreen;
