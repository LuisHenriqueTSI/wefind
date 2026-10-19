import React, { useState, useEffect } from 'react';
import {
  Image,
  TouchableOpacity,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as userService from '../services/user';
import * as supabaseAuth from '../services/supabaseAuth';
import Button from '../components/Button';
import Input from '../components/Input';
import MapLocationPicker from '../components/MapLocationPicker';
import { states } from '../lib/br-locations';
import COLORS from '../constants/theme';
import SEARCH_RADIUS_OPTIONS_KM from '../constants/searchRadiusOptions';

const normalizeRegionName = (value = '') =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizedRegionToUf = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

const formatBrazilianPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const EditProfileScreen = ({ navigation }) => {
  const { user, userProfile, refreshProfile, setUserProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [profileState, setProfileState] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileDistrict, setProfileDistrict] = useState('');
  const [profileStreet, setProfileStreet] = useState('');
  const [profileAddressText, setProfileAddressText] = useState('');
  const [profileCoords, setProfileCoords] = useState(null);
  const [searchRadiusKm, setSearchRadiusKm] = useState(25);
  const [mapVisible, setMapVisible] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Estados para verificação de alteração de WhatsApp
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);
  const [phoneVerifyCode, setPhoneVerifyCode] = useState('');
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const timer = setInterval(() => {
      setPhoneCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneCooldown]);

  useEffect(() => {
    const loadSavedLocation = async () => {
      try {
        const storedRadius = await AsyncStorage.getItem('@wefind/search_radius');
        if (storedRadius) {
          const r = Number(storedRadius);
          if (r > 0) setSearchRadiusKm(r);
        }

        const storedLoc = await AsyncStorage.getItem('@wefind/saved_location');
        if (storedLoc) {
          const parsed = JSON.parse(storedLoc);
          if (parsed?.city) setProfileCity((prev) => prev || parsed.city);
          if (parsed?.state) setProfileState((prev) => prev || parsed.state);
          if (parsed?.addressText) setProfileAddressText((prev) => prev || parsed.addressText);
          if (parsed?.street) setProfileStreet((prev) => prev || parsed.street);
          if (parsed?.district || parsed?.neighborhood) setProfileDistrict((prev) => prev || parsed.district || parsed.neighborhood);
          if (parsed?.radiusKm) setSearchRadiusKm(Number(parsed.radiusKm));
          if (parsed?.coords) setProfileCoords((prev) => prev || parsed.coords);
        }
      } catch (e) {
        console.warn('[EditProfileScreen] Erro ao carregar localização:', e.message);
      }
    };
    loadSavedLocation();
  }, []);

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || '');
      setInstagram(userProfile.instagram || '');
      setFacebook(userProfile.facebook || '');
      setWhatsapp(userProfile.whatsapp || userProfile.phone || '');
      if (userProfile.state) setProfileState(userProfile.state);
      if (userProfile.city) setProfileCity(userProfile.city);
      if (userProfile.neighborhood) setProfileDistrict(userProfile.neighborhood);
      if (userProfile.latitude && userProfile.longitude) {
        setProfileCoords({
          latitude: Number(userProfile.latitude),
          longitude: Number(userProfile.longitude),
        });
      }
      setAvatarUrl(userProfile.avatar_url || null);
    }
  }, [userProfile]);

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para escolher uma foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      setAvatar(selectedUri);
      if (user) {
        setUploadingAvatar(true);
        try {
          const url = await userService.uploadAvatar(user.id, selectedUri);
          const ext = url.split('.').pop().split('?')[0];
          await userService.updateProfile(user.id, { avatar_path: `${user.id}/avatar.${ext}` });
          setAvatarUrl(url);
          setAvatar(null);
          await refreshProfile();
        } catch (e) {
          Alert.alert('Erro ao enviar foto', e.message || 'Tente outra imagem.');
        } finally {
          setUploadingAvatar(false);
        }
      }
    }
  };

  const performSaveProfile = async (targetWhatsapp) => {
    try {
      setSaving(true);
      const fullText = profileAddressText || [
        profileStreet,
        profileDistrict,
        [profileCity, profileState].filter(Boolean).join(' - '),
      ].filter(Boolean).join(', ') || `${profileCity}, ${profileState}`;

      await userService.updateProfile(user.id, {
        name: name.trim(),
        instagram: instagram.trim(),
        facebook: facebook.trim(),
        whatsapp: targetWhatsapp,
        phone: targetWhatsapp,
        state: profileState,
        city: profileCity,
        neighborhood: profileDistrict,
      });

      // Atualiza no AsyncStorage para sincronia com a HomeScreen
      try {
        await AsyncStorage.setItem(
          '@wefind/saved_location',
          JSON.stringify({
            addressText: fullText,
            street: profileStreet,
            district: profileDistrict,
            neighborhood: profileDistrict,
            city: profileCity,
            state: profileState,
            coords: profileCoords || null,
            radiusKm: searchRadiusKm || 25,
          })
        );
        await AsyncStorage.setItem('@wefind/search_radius', String(searchRadiusKm || 25));
      } catch (e) {
        console.warn('[EditProfileScreen] Falha ao sincronizar AsyncStorage:', e.message);
      }

      if (typeof setUserProfile === 'function') {
        setUserProfile((prev) => ({
          ...prev,
          name: name.trim(),
          instagram: instagram.trim(),
          facebook: facebook.trim(),
          whatsapp: targetWhatsapp,
          phone: targetWhatsapp,
          state: profileState,
          city: profileCity,
          neighborhood: profileDistrict,
        }));
      }

      await refreshProfile();
      Alert.alert('Perfil Atualizado', 'Suas informações foram salvas com sucesso!');
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('MainApp');
      }
    } catch (error) {
      setErrorMsg(error.message || 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Por favor, informe seu nome.');
      return;
    }

    if (!profileState || !profileCity) {
      setErrorMsg('Defina sua localização no mapa antes de salvar.');
      return;
    }

    const rawNewPhone = whatsapp.replace(/\D/g, '');
    const rawOriginalPhone = (userProfile?.whatsapp || userProfile?.phone || '').replace(/\D/g, '');

    // Se o número de WhatsApp foi alterado, exige verificação por código via WhatsApp
    if (rawNewPhone && rawNewPhone !== rawOriginalPhone) {
      if (rawNewPhone.length < 10) {
        setErrorMsg('Informe um número de WhatsApp completo com DDD.');
        return;
      }

      setSaving(true);
      try {
        await supabaseAuth.sendPhoneChangeVerificationCode(rawNewPhone, user.email);
        setPhoneCooldown(60);
        setPhoneVerifyCode('');
        setShowPhoneVerifyModal(true);
      } catch (err) {
        Alert.alert(
          'Não foi possível enviar o código',
          err.message || 'Verifique o número informado e tente novamente.'
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    // Se não alterou o WhatsApp, salva diretamente
    await performSaveProfile(rawNewPhone);
  };

  const handleConfirmPhoneChange = async () => {
    const cleanCode = phoneVerifyCode.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      Alert.alert('Código Incompleto', 'Digite o código de 6 dígitos recebido no WhatsApp.');
      return;
    }

    setVerifyingPhone(true);
    try {
      await supabaseAuth.verifyPhoneChangeCode(user.email, cleanCode);
      setShowPhoneVerifyModal(false);
      const rawNewPhone = whatsapp.replace(/\D/g, '');
      await performSaveProfile(rawNewPhone);
    } catch (err) {
      Alert.alert('Código Inválido', err.message || 'Código incorreto ou expirado. Tente novamente.');
    } finally {
      setVerifyingPhone(false);
    }
  };

  const handleResendPhoneCode = async () => {
    if (phoneCooldown > 0) {
      Alert.alert('Aguarde', `Você poderá solicitar outro código em ${phoneCooldown}s.`);
      return;
    }

    const rawNewPhone = whatsapp.replace(/\D/g, '');
    setVerifyingPhone(true);
    try {
      await supabaseAuth.sendPhoneChangeVerificationCode(rawNewPhone, user.email);
      setPhoneCooldown(60);
      Alert.alert('Código Reenviado', 'Um novo código foi enviado para o seu WhatsApp.');
    } catch (err) {
      Alert.alert('Erro ao reenviar', err.message || 'Não foi possível reenviar o código.');
    } finally {
      setVerifyingPhone(false);
    }
  };

  // Redefinir senha de acesso via WhatsApp
  const handleChangePassword = () => {
    const phoneToUse = whatsapp || userProfile?.whatsapp || userProfile?.phone || '';
    navigation.navigate('EsqueciSenha', {
      initialWhatsapp: phoneToUse,
    });
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Excluir Conta',
      'Tem certeza de que deseja excluir permanentemente sua conta? Esta ação não pode ser desfeita e todas as suas publicações serão removidas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir definitivamente',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await supabaseAuth.deleteUser();
              Alert.alert(
                'Conta excluída',
                result?.sessionCleanupError
                  ? 'Sua conta foi excluída. Feche e abra o aplicativo novamente para encerrar a sessão local.'
                  : 'Sua conta foi encerrada com sucesso.'
              );
            } catch (e) {
              Alert.alert('Erro', e.message || 'Erro ao excluir conta.');
            }
          },
        },
      ]
    );
  };

  const hasLocation = Boolean(profileCity && profileState);
  const locationDisplayText = profileAddressText || [
    profileStreet,
    profileDistrict,
    [profileCity, profileState].filter(Boolean).join(' - '),
  ].filter(Boolean).join(', ') || (hasLocation ? `${profileCity}, ${profileState}` : null);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Cabeçalho do Perfil com Avatar */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={handlePickAvatar}
          disabled={uploadingAvatar || saving}
          activeOpacity={0.85}
          style={styles.avatarButton}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarInitial}>{name?.charAt(0)?.toUpperCase() || 'U'}</Text>
            </View>
          )}
          <View style={[styles.avatarBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="camera" size={13} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>{name || 'Seu Nome'}</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          Toque na foto para alterar sua imagem de perfil
        </Text>
      </View>

      {/* Seção 1: Dados Pessoais */}
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Dados Pessoais</Text>

        <Input
          label="Nome completo"
          placeholder="Ex: Ana Silva"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />

        <Input
          label="E-mail (vinculado à conta)"
          placeholder={user?.email || userProfile?.email}
          value={user?.email || userProfile?.email}
          editable={false}
          style={styles.input}
        />
      </View>

      {/* Seção 2: Localização (Via Mapa Interativo) */}
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Localização Padrão</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Defina sua cidade e estado no mapa para personalizar seu radar de busca e avisos próximos.
        </Text>

        {hasLocation ? (
          <View
            style={[
              styles.locationDisplayBox,
              {
                backgroundColor: isDark ? colors.innerCard : COLORS.primaryLight,
                borderColor: isDark ? colors.cardBorder : COLORS.primaryBorder,
              },
            ]}
          >
            <View style={styles.locationPinCircle}>
              <MaterialIcons name="place" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                Localização Selecionada:
              </Text>
              <Text style={[styles.locationValue, { color: colors.primary }]}>
                {locationDisplayText}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.noLocationBox,
              { backgroundColor: isDark ? colors.innerCard : '#F8FAFC', borderColor: colors.border },
            ]}
          >
            <MaterialIcons
              name="location-off"
              size={20}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.noLocationText, { color: colors.textMuted }]}>
              Nenhuma localização selecionada
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.mapLauncherBtn,
            {
              borderColor: colors.primary,
              backgroundColor: isDark ? 'rgba(5, 150, 105, 0.12)' : COLORS.primaryLight,
            },
          ]}
          onPress={() => setMapVisible(true)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="map" size={19} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.mapLauncherBtnText, { color: colors.primary }]}>
            {hasLocation ? 'Alterar localização no mapa' : 'Escolher no mapa'}
          </Text>
        </TouchableOpacity>

        {/* Seletor de Raio Padrão */}
        <View style={{
          backgroundColor: isDark ? colors.innerCard : COLORS.primaryLight,
          padding: 12,
          borderRadius: 12,
          marginTop: 14,
          borderWidth: 1,
          borderColor: isDark ? colors.cardBorder : COLORS.primaryBorder,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <MaterialIcons name="radar" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: isDark ? colors.primaryLight : colors.primaryDark, fontSize: 13, fontWeight: '700' }}>
              Raio de Busca: <Text style={{ fontWeight: '900', color: colors.primary }}>{searchRadiusKm} km</Text>
            </Text>
          </View>
          <Text style={{ color: isDark ? colors.textSecondary : '#475569', fontSize: 11.5, marginBottom: 10 }}>
            Distância máxima padrão para notificações e feed de animais próximos:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {SEARCH_RADIUS_OPTIONS_KM.map((r) => {
              const isSelected = searchRadiusKm === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setSearchRadiusKm(r)}
                  activeOpacity={0.75}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : (isDark ? colors.surface : '#FFFFFF'),
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: isSelected ? '800' : '600',
                    color: isSelected ? '#FFFFFF' : colors.text,
                  }}>
                    {r} km
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Seção 3: Contatos e Redes Sociais */}
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Contatos</Text>

        <Input
          label="WhatsApp (com DDD)"
          placeholder="(11) 99999-9999"
          value={formatBrazilianPhone(whatsapp)}
          onChangeText={(text) => setWhatsapp(text.replace(/\D/g, ''))}
          keyboardType="phone-pad"
          style={styles.input}
        />
        <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
          💡 Ao alterar o número do WhatsApp, enviaremos um código de 6 dígitos para confirmação.
        </Text>

        <Input
          label="Instagram (opcional)"
          placeholder="@seu_perfil"
          value={instagram}
          onChangeText={setInstagram}
          style={styles.input}
        />

        <Input
          label="Facebook (opcional)"
          placeholder="seu_usuario"
          value={facebook}
          onChangeText={setFacebook}
          style={styles.input}
        />
      </View>

      {/* Seção 4: Segurança */}
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Segurança</Text>
        <TouchableOpacity
          style={[
            styles.securityButton,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
              borderColor: colors.border,
            },
          ]}
          onPress={handleChangePassword}
          activeOpacity={0.75}
        >
          <Feather name="lock" size={16} color={colors.primary} style={{ marginRight: 10 }} />
          <Text style={[styles.securityButtonText, { color: colors.text }]}>
            Redefinir senha de acesso via WhatsApp
          </Text>
          <Feather name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

      {errorMsg ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 6 }} />
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Botões de Ação Inferiores */}
      <View style={styles.footerRow}>
        <Button
          title="Cancelar"
          variant="secondary"
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('MainApp');
            }
          }}
          style={styles.footerBtn}
        />
        <Button
          title={saving ? 'Salvando...' : 'Salvar Alterações'}
          variant="primary"
          onPress={handleSave}
          disabled={saving}
          loading={saving}
          style={[styles.footerBtn, { flex: 1.5 }]}
        />
      </View>

      {/* Bloco de Excluir Conta */}
      <View
        style={[
          styles.deleteCard,
          {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
            borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
          },
        ]}
      >
        <Text style={styles.deleteTitle}>Zona de Perigo</Text>
        <Text style={[styles.deleteText, { color: colors.textSecondary }]}>
          Se desejar encerrar sua conta e remover todos os seus dados definitivamente.
        </Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
          activeOpacity={0.8}
        >
          <Feather name="trash-2" size={15} color="#DC2626" style={{ marginRight: 6 }} />
          <Text style={styles.deleteBtnText}>Excluir minha conta</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de Confirmação de Novo WhatsApp */}
      <Modal
        visible={showPhoneVerifyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhoneVerifyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: colors.primaryLight }]}>
              <MaterialIcons name="sms" size={28} color={colors.primary} />
            </View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>Validar Novo WhatsApp</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Enviamos um código de 6 dígitos para o número{' '}
              <Text style={{ fontWeight: '800', color: colors.primary }}>
                {formatBrazilianPhone(whatsapp)}
              </Text>
              . Digite o código abaixo para confirmar a alteração.
            </Text>

            <TextInput
              style={[
                styles.codeInput,
                {
                  backgroundColor: isDark ? colors.card : '#F8FAFC',
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={phoneVerifyCode}
              onChangeText={setPhoneVerifyCode}
              autoFocus
            />

            <TouchableOpacity
              onPress={handleResendPhoneCode}
              disabled={phoneCooldown > 0 || verifyingPhone}
              style={{ marginTop: 8, marginBottom: 16 }}
            >
              <Text
                style={[
                  styles.resendText,
                  { color: phoneCooldown > 0 ? colors.textMuted : colors.primary },
                ]}
              >
                {phoneCooldown > 0
                  ? `Reenviar código em ${phoneCooldown}s`
                  : 'Não recebeu? Reenviar código'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setShowPhoneVerifyModal(false)}
                disabled={verifyingPhone}
                style={{ flex: 1 }}
              />
              <Button
                title={verifyingPhone ? 'Validando...' : 'Confirmar'}
                variant="primary"
                onPress={handleConfirmPhoneChange}
                disabled={verifyingPhone || phoneVerifyCode.trim().length !== 6}
                loading={verifyingPhone}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Componente Modal de Mapa com Raio */}
      <MapLocationPicker
        visible={mapVisible}
        mode="profile"
        initialLocation={profileCoords}
        radiusKm={searchRadiusKm}
        showRadius={true}
        onRadiusChange={(r) => setSearchRadiusKm(r)}
        onClose={() => setMapVisible(false)}
        onConfirm={({ address, addressDetails, addressText, street, houseNumber, district, neighborhood, city, state, coordinate, radiusKm }) => {
          const region = String(addressDetails?.state || address?.region || state || '').trim();
          const stateValue = states.includes(region.toUpperCase())
            ? region.toUpperCase()
            : (normalizedRegionToUf[normalizeRegionName(region)] || region);
          const cityValue =
            addressDetails?.city || address?.city || city || '';
          const distValue = addressDetails?.district || district || neighborhood || '';
          const stValue = addressDetails?.street || street || '';

          setProfileState(stateValue);
          setProfileCity(cityValue);
          setProfileDistrict(distValue);
          setProfileStreet(stValue);
          setProfileAddressText(addressText || '');
          if (radiusKm) setSearchRadiusKm(radiusKm);
          if (coordinate && coordinate.latitude && coordinate.longitude) {
            setProfileCoords(coordinate);
          }
          setMapVisible(false);
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  headerCard: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  avatarButton: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12.5,
    marginTop: 3,
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  helperText: {
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 12,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: -6,
    marginBottom: 12,
    lineHeight: 16,
  },
  input: {
    marginBottom: 12,
  },
  locationDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  locationPinCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  locationLabel: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  locationValue: {
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 1,
  },
  noLocationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  noLocationText: {
    fontSize: 13,
    fontWeight: '500',
  },
  mapLauncherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  mapLauncherBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  securityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  securityButtonText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  footerBtn: {
    flex: 1,
  },
  deleteCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  deleteTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 4,
  },
  deleteText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  codeInput: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 8,
  },
  resendText: {
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
});

export default EditProfileScreen;
