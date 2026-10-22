import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
  // A tela fica estática; só rola se o conteúdo não couber (celular pequeno)
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

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
    { label: 'Ranking da comunidade', icon: 'bar-chart-2', route: 'Ranking' },
    { label: 'Rede de lares temporários', icon: 'users', route: 'FosterVolunteers' },
    { label: 'Mural de reencontros', icon: 'heart', route: 'MuralReencontros' },
    { label: 'Sobre o WeFIND', icon: 'info', route: 'Sobre' },
  ].filter((item) => (
    (item.route !== 'Ranking' || APP_FEATURES.communityRanking) &&
    (item.route !== 'FosterVolunteers' || APP_FEATURES.fosterVolunteers) &&
    (item.route !== 'MuralReencontros' || APP_FEATURES.successStories)
  ));

  const settingsLinks = [
    { label: 'Configurações', icon: 'settings', route: 'Config' },
    { label: 'Ajuda e suporte', icon: 'help-circle', route: 'AjudaSuporte' },
  ];

  const profileLinks = [
    { label: 'Meus pets e carteirinhas', icon: 'paw-outline', lib: 'mci', route: 'MyPets' },
    { label: 'Meus anúncios', icon: 'file-text', route: 'MeusAnuncios', count: userItemsCount },
    ...(APP_FEATURES.gamification
      ? [{ label: 'Conquistas e nível', icon: 'award', route: 'Gamification' }]
      : []),
    { label: 'Solicitações de devolução', icon: 'inbox', route: 'ClaimsManagement' },
    ...(isAdmin ? [{ label: 'Painel administrativo', icon: 'shield', route: 'Admin' }] : []),
  ];

  const iconBg = isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9';

  const renderIcon = (item, color = colors.text) => (
    <View style={[styles.menuIconBox, { backgroundColor: iconBg }]}>
      {item.lib === 'mci' ? (
        <MaterialCommunityIcons name={item.icon} size={19} color={color} />
      ) : (
        <Feather name={item.icon} size={17} color={color} />
      )}
    </View>
  );

  const renderRow = (item, { onPress, right, isLast }) => (
    <React.Fragment key={item.route || item.label}>
      <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
        {renderIcon(item)}
        <Text style={[styles.menuTitle, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
        {right}
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {!isLast ? <View style={[styles.menuDivider, { backgroundColor: colors.cardBorder }]} /> : null}
    </React.Fragment>
  );

  const secondGroup = [
    ...(APP_FEATURES.fosterVolunteers ? [{ key: 'foster' }] : []),
    ...communityLinks,
    ...settingsLinks,
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={contentHeight > viewportHeight + 1}
      bounces={false}
      overScrollMode="never"
      onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContentHeight(h)}
    >
      {/* Identidade */}
      <View style={[styles.identityCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={handlePickAvatar}
          disabled={uploading}
          activeOpacity={0.85}
          style={styles.avatarWrapper}
          accessibilityRole="button"
          accessibilityLabel="Alterar foto de perfil"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.text, borderColor: colors.card }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.card} />
            ) : (
              <Feather name="camera" size={12} color={colors.card} />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.identityDetails}>
          <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
            {userProfile?.name || 'Usuário WeFIND'}
          </Text>
          {locationText ? (
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={[styles.userLocation, { color: colors.textSecondary }]} numberOfLines={1}>
                {locationText}
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.editButton, { borderColor: colors.border }]}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.75}
          accessibilityLabel="Editar perfil"
        >
          <Text style={[styles.editButtonText, { color: colors.text }]}>Editar</Text>
        </TouchableOpacity>
      </View>

      {/* Minha conta */}
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>Minha conta</Text>
      <View style={[styles.menuGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {profileLinks.map((item, index) =>
          renderRow(item, {
            onPress: () => navigation.navigate(item.route),
            isLast: index === profileLinks.length - 1,
            right:
              item.count !== undefined && item.count > 0 ? (
                <View style={[styles.countPill, { backgroundColor: iconBg }]}>
                  <Text style={[styles.countText, { color: colors.textSecondary }]}>{item.count}</Text>
                </View>
              ) : null,
          })
        )}
      </View>

      {/* Comunidade e preferências */}
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>Comunidade e preferências</Text>
      <View style={[styles.menuGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {secondGroup.map((item, index) => {
          const isLast = index === secondGroup.length - 1;
          if (item.key === 'foster') {
            const active = !!fosterProfile?.isActive;
            return renderRow(
              { label: 'Lar temporário', icon: 'home', route: 'foster' },
              {
                onPress: () => setFosterModalVisible(true),
                isLast,
                right: (
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: active ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : iconBg },
                    ]}
                  >
                    <View style={[styles.statusDot, { backgroundColor: active ? '#10B981' : colors.textMuted }]} />
                    <Text style={[styles.statusText, { color: active ? (isDark ? '#34D399' : '#047857') : colors.textSecondary }]}>
                      {active ? 'Ativo' : 'Inativo'}
                    </Text>
                  </View>
                ),
              }
            );
          }
          return renderRow(item, { onPress: () => navigation.navigate(item.route), isLast });
        })}
      </View>

      {/* Sair */}
      <TouchableOpacity
        style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={signOut}
        activeOpacity={0.75}
      >
        <Feather name="log-out" size={17} color="#DC2626" style={{ marginRight: 8 }} />
        <Text style={styles.logoutButtonText}>Sair da conta</Text>
      </TouchableOpacity>

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
    paddingTop: 12,
    paddingBottom: 20,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 22,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityDetails: {
    flex: 1,
    marginRight: 10,
  },
  userName: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  userLocation: {
    fontSize: 14,
    flexShrink: 1,
  },
  editButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editButtonText: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuGroup: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 22,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    marginLeft: 58,
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  countText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 15.5,
    fontWeight: '600',
  },
});

export default ProfileScreen;
