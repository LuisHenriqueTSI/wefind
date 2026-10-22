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
      keyboardShouldPersistTaps="handled"
    >
      {/* Foto e nome */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handlePickAvatar}
          disabled={uploadingAvatar || saving}
          activeOpacity={0.85}
          style={styles.avatarButton}
          accessibilityRole="button"
          accessibilityLabel="Alterar foto de perfil"
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
          <View style={[styles.avatarBadge, { backgroundColor: colors.text, borderColor: colors.background }]}>
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Feather name="camera" size={14} color={colors.background} />
            )}
          </View>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {name || 'Seu nome'}
        </Text>
        <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar || saving} hitSlop={8}>
          <Text style={[styles.headerLink, { color: colors.primary }]}>Alterar foto</Text>
        </TouchableOpacity>
      </View>

      {/* Dados pessoais */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Dados pessoais</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Input
          label="Nome completo"
          placeholder="Ex: Ana Silva"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          style={styles.input}
        />
        <Input
          label="E-mail"
          placeholder={user?.email || userProfile?.email}
          value={user?.email || userProfile?.email}
          editable={false}
          inputStyle={{ color: colors.textMuted }}
          style={styles.inputLast}
        />
      </View>

      {/* Localização */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Localização</Text>
      <TouchableOpacity
        style={[styles.sectionCard, styles.rowCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => setMapVisible(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={hasLocation ? 'Alterar localização' : 'Definir localização'}
      >
        <View style={[styles.rowIcon, { backgroundColor: isDark ? colors.innerCard : '#F1F5F9' }]}>
          <Feather name="map-pin" size={18} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: hasLocation ? colors.text : colors.textMuted }]} numberOfLines={2}>
            {hasLocation ? locationDisplayText : 'Nenhuma localização definida'}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            Usada para mostrar publicações e avisos perto de você
          </Text>
        </View>
        <Text style={[styles.rowAction, { color: colors.primary }]}>
          {hasLocation ? 'Alterar' : 'Definir'}
        </Text>
      </TouchableOpacity>

      {/* Contatos */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Contatos</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Input
          label="WhatsApp"
          placeholder="(11) 99999-9999"
          value={formatBrazilianPhone(whatsapp)}
          onChangeText={(text) => setWhatsapp(text.replace(/\D/g, ''))}
          keyboardType="phone-pad"
          style={{ marginBottom: 6 }}
        />
        <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
          Se você trocar o número, enviaremos um código para confirmar.
        </Text>

        <Input
          label="Instagram"
          placeholder="@seu_perfil (opcional)"
          value={instagram}
          onChangeText={setInstagram}
          style={styles.input}
        />
        <Input
          label="Facebook"
          placeholder="seu_usuario (opcional)"
          value={facebook}
          onChangeText={setFacebook}
          style={styles.inputLast}
        />
      </View>

      {/* Conta */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Conta</Text>
      <View style={[styles.sectionCard, styles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.listRow} onPress={handleChangePassword} activeOpacity={0.7}>
          <Feather name="lock" size={18} color={colors.text} style={styles.listIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Alterar senha</Text>
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>Com código enviado no WhatsApp</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />
        <TouchableOpacity style={styles.listRow} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Feather name="trash-2" size={18} color="#DC2626" style={styles.listIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: '#DC2626' }]}>Excluir conta</Text>
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>Remove seus dados de forma definitiva</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {errorMsg ? (
        <View style={[styles.errorBanner, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2' }]}>
          <Feather name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Ações */}
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
          title={saving ? 'Salvando...' : 'Salvar'}
          variant="primary"
          onPress={handleSave}
          disabled={saving}
          loading={saving}
          style={[styles.footerBtn, { flex: 1.5 }]}
        />
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

      {/* Mapa para escolher a localização */}
      <MapLocationPicker
        visible={mapVisible}
        mode="profile"
        initialLocation={profileCoords}
        showRadius={false}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 20,
  },
  avatarButton: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: '90%',
  },
  headerLink: {
    fontSize: 14.5,
    fontWeight: '600',
    marginTop: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  input: {
    marginBottom: 14,
  },
  inputLast: {
    marginBottom: 0,
  },
  fieldHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  rowAction: {
    fontSize: 14.5,
    fontWeight: '600',
    marginLeft: 12,
  },
  listCard: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  listIcon: {
    marginRight: 14,
  },
  divider: {
    height: 1,
    marginLeft: 32,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  footerBtn: {
    flex: 1,
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
