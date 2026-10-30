import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Feather, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import MapLocationPicker from './MapLocationPicker';
import COLORS from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { removeHouseNumberFromAddress } from '../utils/locationPrivacy';

const SightingModal = ({ visible, onClose, onSubmit, loading }) => {
  const { colors, isDark } = useTheme();
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [coordinate, setCoordinate] = useState(null);
  const [locationDetails, setLocationDetails] = useState(null);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  // 'street' = solto na rua (pode virar rota) | 'private' = em casa/quintal (nunca vira rota)
  const [animalPlace, setAnimalPlace] = useState(null);

  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [facebook, setFacebook] = useState('');
  const [showContacts, setShowContacts] = useState(false);

  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const scrollRef = useRef(null);
  const sectionOffsetsRef = useRef({});

  // Ao focar um campo, rola até a seção dele depois que o teclado abre
  const scrollToSection = (key) => {
    setTimeout(() => {
      const y = sectionOffsetsRef.current[key];
      if (key === 'contacts') scrollRef.current?.scrollToEnd({ animated: true });
      else if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }, 250);
  };
  const rememberOffset = (key) => (e) => {
    sectionOffsetsRef.current[key] = e?.nativeEvent?.layout?.y;
  };

  const handleSend = () => {
    // Local no mapa é obrigatório (UC04: Selecionar Localização no Mapa é <<include>>)
    if (!description.trim() || !animalPlace || !(coordinate?.latitude && coordinate?.longitude)) return;
    onSubmit({
      description: description.trim(),
      location: removeHouseNumberFromAddress(location.trim()),
      animal_place: animalPlace,
      coordinate,
      location_details: locationDetails,
      contact_info: {
        instagram: instagram.trim(),
        whatsapp: whatsapp.trim(),
        facebook: facebook.trim(),
        animal_place: animalPlace,
        coordinate,
        location_details: locationDetails,
      },
      photo_url: photoUrl,
    });
    handleReset();
  };

  const handleReset = () => {
    setDescription('');
    setLocation('');
    setCoordinate(null);
    setLocationDetails(null);
    setAnimalPlace(null);
    setInstagram('');
    setWhatsapp('');
    setFacebook('');
    setShowContacts(false);
    setPhotoUrl('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Permissão para acessar fotos é necessária!');
      return;
    }
    setUploading(true);
    let pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    setUploading(false);
    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
      setPhotoUrl(pickerResult.assets[0].uri);
    }
  };

  const handleConfirmLocation = (data) => {
    setMapPickerVisible(false);
    if (data?.coordinate) {
      setCoordinate(data.coordinate);
    }
    if (data?.addressDetails) {
      setLocationDetails(data.addressDetails);
    }
    const formatted = data?.fullAddressText || data?.addressDetails?.text || '';
    if (formatted) {
      setLocation(formatted);
    }
  };

  const hasCoordinate = Boolean(coordinate?.latitude && coordinate?.longitude);
  const canSend = Boolean(description.trim() && animalPlace && hasCoordinate) && !loading;
  const fieldBg = isDark ? '#0F172A' : '#F8FAFC';
  const cardStyle = { backgroundColor: colors.surface, borderColor: colors.border };
  const inputStyle = [styles.input, { backgroundColor: fieldBg, borderColor: colors.border, color: colors.text }];

  const SectionHeader = ({ number, title, optional }) => (
    <View style={styles.sectionHeader}>
      <View style={[styles.stepBadge, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.stepBadgeText, { color: colors.primary }]}>{number}</Text>
      </View>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {optional ? <Text style={[styles.optionalTag, { color: colors.textMuted }]}>opcional</Text> : null}
    </View>
  );

  return (
    <>
      <Modal
        visible={visible && !mapPickerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          {/* Cabeçalho */}
          <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.headerBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
              accessibilityLabel="Fechar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Vi o pet</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                Sua pista ajuda o tutor a encontrar o animal
              </Text>
            </View>
            <View style={[styles.headerIcon, { backgroundColor: colors.primaryLight }]}>
              <MaterialIcons name="visibility" size={20} color={colors.primary} />
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* 1. O que viu */}
              <View style={[styles.card, cardStyle]}>
                <SectionHeader number="1" title="O que você viu?" />
                <TextInput
                  style={[inputStyle, styles.textArea]}
                  placeholder="Ex.: Vi o pet correndo na calçada em direção ao parque, parecia assustado..."
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Text style={[styles.counter, { color: colors.textMuted }]}>{description.length}/500</Text>
              </View>

              {/* 2. Onde o animal está: define se o local pode virar rota */}
              <View style={[styles.card, cardStyle]}>
                <SectionHeader number="2" title="Onde o animal está?" />
                <View style={styles.placeRow}>
                  {[
                    { key: 'street', icon: 'directions-walk', title: 'Solto na rua', hint: 'Calçada, praça ou terreno aberto' },
                    { key: 'private', icon: 'home', title: 'Em casa ou quintal', hint: 'Comigo ou dentro de um imóvel' },
                  ].map((opt) => {
                    const active = animalPlace === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.placeOption,
                          { backgroundColor: fieldBg, borderColor: colors.border },
                          active && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                        ]}
                        onPress={() => setAnimalPlace(opt.key)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <View style={styles.placeTop}>
                          <View style={[styles.placeIcon, { backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#E2E8F0') }]}>
                            <MaterialIcons name={opt.icon} size={18} color={active ? '#FFFFFF' : colors.textSecondary} />
                          </View>
                          <MaterialIcons
                            name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                            size={18}
                            color={active ? colors.primary : colors.textMuted}
                          />
                        </View>
                        <Text style={[styles.placeTitle, { color: active ? colors.primary : colors.text }]}>{opt.title}</Text>
                        <Text style={[styles.placeHint, { color: colors.textSecondary }]}>{opt.hint}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {animalPlace === 'street' && (
                  <View style={[styles.notice, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#F0F9FF', borderColor: isDark ? 'rgba(14, 165, 233, 0.35)' : '#BAE6FD' }]}>
                    <MaterialIcons name="info-outline" size={16} color={isDark ? '#7DD3FC' : '#0369A1'} />
                    <Text style={[styles.noticeText, { color: isDark ? '#BAE6FD' : '#075985' }]}>
                      Marque a rua onde viu o animal, não o seu endereço. A rota mostra só uma área aproximada.
                    </Text>
                  </View>
                )}
                {animalPlace === 'private' && (
                  <View style={[styles.notice, { backgroundColor: isDark ? 'rgba(22, 163, 74, 0.12)' : '#F0FDF4', borderColor: isDark ? 'rgba(22, 163, 74, 0.35)' : '#BBF7D0' }]}>
                    <MaterialIcons name="lock-outline" size={16} color={isDark ? '#86EFAC' : '#15803D'} />
                    <Text style={[styles.noticeText, { color: isDark ? '#BBF7D0' : '#166534' }]}>
                      O tutor recebe sua informação, mas este local não vira rota e o endereço fica protegido.
                    </Text>
                  </View>
                )}
              </View>

              {/* 3. Local */}
              <View style={[styles.card, cardStyle]} onLayout={rememberOffset('location')}>
                <SectionHeader number="3" title="Onde foi visto?" />
                <TouchableOpacity
                  style={[
                    styles.mapPickBox,
                    { borderColor: hasCoordinate ? colors.primary : colors.border, backgroundColor: hasCoordinate ? colors.primaryLight : fieldBg },
                  ]}
                  onPress={() => setMapPickerVisible(true)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.mapPickIcon, { backgroundColor: colors.primary }]}>
                    <Feather name="map-pin" size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mapPickTitle, { color: colors.text }]}>
                      {hasCoordinate ? 'Local marcado' : 'Marcar no mapa'}
                    </Text>
                    <Text style={[styles.mapPickText, { color: colors.textSecondary }]} numberOfLines={2}>
                      {hasCoordinate ? (location || 'Ponto marcado no mapa') : 'Toque para escolher o ponto onde o animal foi visto'}
                    </Text>
                  </View>
                  <Text style={[styles.mapPickAction, { color: colors.primary }]}>{hasCoordinate ? 'Alterar' : 'Abrir'}</Text>
                </TouchableOpacity>
                <TextInput
                  style={[inputStyle, { marginTop: 10 }]}
                  placeholder="Ponto de referência (ex.: perto da Padaria Central)"
                  placeholderTextColor={colors.textMuted}
                  value={location}
                  onChangeText={setLocation}
                  onFocus={() => scrollToSection('location')}
                />
              </View>

              {/* 4. Foto */}
              <View style={[styles.card, cardStyle]}>
                <SectionHeader number="4" title="Foto do animal" optional />
                {photoUrl ? (
                  <View style={styles.photoContainer}>
                    <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
                    <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setPhotoUrl('')} accessibilityLabel="Remover foto">
                      <MaterialIcons name="close" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handlePickImage}
                    style={[styles.uploadBox, { borderColor: colors.border, backgroundColor: fieldBg }]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.uploadIcon, { backgroundColor: colors.primaryLight }]}>
                      <Feather name="camera" size={20} color={colors.primary} />
                    </View>
                    <Text style={[styles.uploadText, { color: colors.text }]}>
                      {uploading ? 'Carregando foto...' : 'Adicionar uma foto'}
                    </Text>
                    <Text style={[styles.uploadHint, { color: colors.textMuted }]}>Ajuda o tutor a confirmar que é o pet dele</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 5. Contatos */}
              <View style={[styles.card, cardStyle]}>
                <TouchableOpacity
                  onPress={() => setShowContacts(!showContacts)}
                  style={styles.contactsToggle}
                  activeOpacity={0.8}
                >
                  <View style={[styles.stepBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.stepBadgeText, { color: colors.primary }]}>5</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Contato para retorno</Text>
                    <Text style={[styles.contactsHint, { color: colors.textMuted }]}>Opcional · o tutor também pode falar com você pelo chat</Text>
                  </View>
                  <Feather name={showContacts ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>

                {showContacts && (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    {[
                      { icon: 'whatsapp', color: '#25D366', placeholder: 'WhatsApp com DDD', value: whatsapp, onChange: (text) => setWhatsapp(text.replace(/[^0-9]/g, '')), keyboard: 'numeric', maxLength: 15 },
                      { icon: 'instagram', color: '#C13584', placeholder: 'Instagram (ex.: @seunome)', value: instagram, onChange: setInstagram },
                      { icon: 'facebook-square', color: '#1877F3', placeholder: 'Facebook', value: facebook, onChange: setFacebook },
                    ].map((field) => (
                      <View key={field.icon} style={[styles.contactField, { backgroundColor: fieldBg, borderColor: colors.border }]}>
                        <FontAwesome name={field.icon} size={17} color={field.color} style={{ width: 24 }} />
                        <TextInput
                          style={[styles.contactInput, { color: colors.text }]}
                          onFocus={() => scrollToSection('contacts')}
                          placeholder={field.placeholder}
                          placeholderTextColor={colors.textMuted}
                          value={field.value}
                          onChangeText={field.onChange}
                          keyboardType={field.keyboard || 'default'}
                          maxLength={field.maxLength}
                          autoCapitalize="none"
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Rodapé fixo */}
            <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              {!canSend && !loading ? (
                <Text style={[styles.footerHint, { color: colors.textMuted }]}>
                  Preencha o que você viu, onde ele está e marque no mapa.
                </Text>
              ) : null}
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: colors.primary }, !canSend && { opacity: 0.45 }]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="send" size={17} color="#FFFFFF" />
                      <Text style={styles.sendText}>Enviar pista</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Seletor de Mapa Interativo Integrado */}
      <MapLocationPicker
        visible={mapPickerVisible}
        initialLocation={coordinate}
        mode="pin"
        showRadius={false}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={handleConfirmLocation}
        onSelectLocation={handleConfirmLocation}
      />
    </>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, marginTop: 1 },

  scrollContent: { padding: 16, paddingBottom: 24, gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  stepBadgeText: { fontSize: 12, fontWeight: '900' },
  sectionTitle: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  optionalTag: { fontSize: 11.5, fontWeight: '600', marginLeft: 6 },

  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14.5 },
  textArea: { minHeight: 104, textAlignVertical: 'top' },
  counter: { fontSize: 11, textAlign: 'right', marginTop: 4 },

  placeRow: { flexDirection: 'row', gap: 10 },
  placeOption: { flex: 1, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  placeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  placeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  placeTitle: { fontSize: 14, fontWeight: '800' },
  placeHint: { fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },

  mapPickBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  mapPickIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mapPickTitle: { fontSize: 14, fontWeight: '800' },
  mapPickText: { fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  mapPickAction: { fontSize: 13, fontWeight: '800' },

  uploadBox: { alignItems: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 12 },
  uploadIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  uploadText: { fontSize: 14, fontWeight: '800' },
  uploadHint: { fontSize: 12, marginTop: 2, textAlign: 'center' },
  photoContainer: { borderRadius: 14, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 190 },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  contactsToggle: { flexDirection: 'row', alignItems: 'center' },
  contactsHint: { fontSize: 12, marginTop: 1 },
  contactField: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  contactInput: { flex: 1, paddingVertical: 11, paddingHorizontal: 6, fontSize: 14 },

  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  footerHint: { fontSize: 12, textAlign: 'center', marginBottom: 8 },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700' },
  sendBtn: { flex: 1.6, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
});

export default SightingModal;
