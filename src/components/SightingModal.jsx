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
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialIcons, Feather, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Button from './Button';
import MapLocationPicker from './MapLocationPicker';
import COLORS from '../constants/theme';
import { removeHouseNumberFromAddress } from '../utils/locationPrivacy';

const SightingModal = ({ visible, onClose, onSubmit, loading }) => {
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
    if (!description.trim() || !animalPlace) return;
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

  return (
    <>
      <Modal visible={visible && !mapPickerVisible} animationType="slide" transparent statusBarTranslucent onRequestClose={handleClose}>
        {/* Com o edge-to-edge do Android (app.json) a janela do modal não
            encolhe sozinha com o teclado: o KeyboardAvoidingView reserva o
            espaço nas duas plataformas e o cartão encolhe (com rolagem). */}
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          {/* Fundo: toque fora do cartão fecha o teclado. Fica ATRÁS do cartão
              (e não em volta dele) para não disputar o gesto de rolagem. */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

                <View style={styles.modal}>
                  {/* Header */}
                  <View style={styles.header}>
                    <View style={styles.headerTitleRow}>
                      <View style={styles.iconCircle}>
                        <MaterialIcons name="visibility" size={20} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Compartilhar informação</Text>
                        <Text style={styles.subtitle}>Ajude o tutor com detalhes ou pistas sobre o pet</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                      <MaterialIcons name="close" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

            {/* flexShrink: o conteúdo rola dentro do cartão em vez de vazar
                para fora dele (antes, ao marcar o local, a prévia do endereço
                empurrava foto, contatos e botões para fora da tela). */}
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* Campo de Descrição */}
              <Text style={styles.inputLabel}>Detalhes e informações *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Ex: Vi o pet correndo na calçada em direção ao parque..."
                placeholderTextColor="#9CA3AF"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              {/* Onde o animal está: define se o local pode virar rota */}
              <Text style={styles.inputLabel}>Onde o animal está? *</Text>
              <View style={styles.placeRow}>
                {[
                  { key: 'street', icon: 'directions-walk', title: 'Solto na rua', hint: 'calçada, praça, terreno aberto' },
                  { key: 'private', icon: 'home', title: 'Em casa ou quintal', hint: 'comigo ou dentro de um imóvel' },
                ].map((opt) => {
                  const active = animalPlace === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.placeOption, active && styles.placeOptionActive]}
                      onPress={() => setAnimalPlace(opt.key)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <MaterialIcons name={opt.icon} size={20} color={active ? COLORS.primary : '#64748B'} />
                      <Text style={[styles.placeTitle, active && { color: COLORS.primary }]}>{opt.title}</Text>
                      <Text style={styles.placeHint}>{opt.hint}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {animalPlace === 'street' && (
                <View style={styles.placeNotice}>
                  <MaterialIcons name="info-outline" size={15} color="#0369A1" />
                  <Text style={styles.placeNoticeText}>
                    Marque a rua onde viu o animal, não o seu endereço. A rota mostra só uma área aproximada.
                  </Text>
                </View>
              )}
              {animalPlace === 'private' && (
                <View style={[styles.placeNotice, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <MaterialIcons name="lock-outline" size={15} color="#15803D" />
                  <Text style={[styles.placeNoticeText, { color: '#166534' }]}>
                    O tutor recebe sua informação, mas este local não vira rota e o endereço fica protegido.
                  </Text>
                </View>
              )}

              {/* Seção de Localização com Mapa */}
              <Text style={styles.inputLabel}>Onde foi visto?</Text>
              <View style={styles.locationCard} onLayout={rememberOffset('location')}>
                <View style={styles.locationCardHeader}>
                  <MaterialIcons name="location-on" size={20} color={COLORS.primary} />
                  <Text style={styles.locationCardTitle}>
                    {location ? 'Localização Selecionada' : 'Marcar no mapa'}
                  </Text>
                </View>

                {location ? (
                  <View style={styles.locationPreview}>
                    <Text style={styles.locationText}>{location}</Text>
                    {coordinate && (
                      <Text style={styles.coordsText}>
                        Lat: {coordinate.latitude?.toFixed(4)}, Lng: {coordinate.longitude?.toFixed(4)}
                      </Text>
                    )}
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.mapButton}
                  onPress={() => setMapPickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="map-pin" size={16} color="#FFFFFF" />
                  <Text style={styles.mapButtonText}>
                    {location ? 'Alterar no mapa interativo' : 'Abrir mapa interativo'}
                  </Text>
                </TouchableOpacity>

                {/* Input manual opcional de complemento */}
                <TextInput
                  style={[styles.input, { marginTop: 8, marginBottom: 0 }]}
                  placeholder="Ou digite o local manualmente (ex: Perto da Padaria Central)"
                  placeholderTextColor="#9CA3AF"
                  value={location}
                  onChangeText={setLocation}
                  onFocus={() => scrollToSection('location')}
                />
              </View>

              {/* Foto da Informação */}
              <Text style={styles.inputLabel}>Foto do pet no local (opcional)</Text>
              {photoUrl ? (
                <View style={styles.photoContainer}>
                  <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setPhotoUrl('')}
                  >
                    <MaterialIcons name="delete" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={handlePickImage} style={styles.uploadBox} activeOpacity={0.7}>
                  <Feather name="camera" size={22} color={COLORS.primary} />
                  <Text style={styles.uploadText}>
                    {uploading ? 'Carregando foto...' : 'Adicionar foto da informação'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Seção de Contatos Opcionais */}
              <TouchableOpacity
                onPress={() => setShowContacts(!showContacts)}
                style={styles.toggleContactsRow}
                activeOpacity={0.7}
              >
                <Feather name={showContacts ? 'chevron-up' : 'chevron-down'} size={18} color="#4B5563" />
                <Text style={styles.toggleContactsText}>
                  {showContacts ? 'Ocultar contatos para retorno' : 'Deixar contatos para o tutor falar comigo'}
                </Text>
              </TouchableOpacity>

              {showContacts && (
                <View style={styles.contactsBox}>
                  <View style={styles.contactField}>
                    <FontAwesome name="whatsapp" size={16} color="#25D366" style={{ width: 22 }} />
                    <TextInput
                      style={styles.contactInput}
                      onFocus={() => scrollToSection('contacts')}
                      placeholder="WhatsApp (apenas números com DDD)"
                      placeholderTextColor="#9CA3AF"
                      value={whatsapp}
                      onChangeText={text => setWhatsapp(text.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                      maxLength={15}
                    />
                  </View>

                  <View style={styles.contactField}>
                    <FontAwesome name="instagram" size={16} color="#C13584" style={{ width: 22 }} />
                    <TextInput
                      style={styles.contactInput}
                      onFocus={() => scrollToSection('contacts')}
                      placeholder="Instagram (ex: @seunome)"
                      placeholderTextColor="#9CA3AF"
                      value={instagram}
                      onChangeText={setInstagram}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.contactField}>
                    <FontAwesome name="facebook-square" size={16} color="#1877F3" style={{ width: 22 }} />
                    <TextInput
                      style={styles.contactInput}
                      onFocus={() => scrollToSection('contacts')}
                      placeholder="Facebook (opcional)"
                      placeholderTextColor="#9CA3AF"
                      value={facebook}
                      onChangeText={setFacebook}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Ações */}
            <View style={styles.actions}>
              <Button title="Cancelar" onPress={handleClose} variant="secondary" style={styles.button} />
              <Button
                title={loading ? 'Enviando...' : 'Enviar Informação'}
                onPress={handleSend}
                disabled={loading || !description.trim() || !animalPlace}
                style={styles.button}
              />
            </View>
            {loading && <ActivityIndicator style={{ marginTop: 8 }} color={COLORS.primary} />}
                </View>
        </KeyboardAvoidingView>
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
  placeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  placeOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  placeOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#F0FDF4',
  },
  placeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 4,
  },
  placeHint: {
    fontSize: 10.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
  },
  placeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  placeNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#075985',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    paddingTop: 40,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    // Encolhe para caber entre o topo e o teclado (paddingBottom do overlay)
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 0,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  textArea: {
    minHeight: 58,
    textAlignVertical: 'top',
  },
  locationCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  locationCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  locationPreview: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDark,
    lineHeight: 18,
  },
  coordsText: {
    fontSize: 11,
    color: COLORS.primary,
    marginTop: 2,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    gap: 8,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  uploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 8,
  },
  uploadText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
  },
  photoContainer: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  photoPreview: {
    width: '100%',
    height: 88,
    borderRadius: 10,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#DC2626',
    borderRadius: 14,
    padding: 4,
  },
  toggleContactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 9,
    marginBottom: 4,
    paddingVertical: 2,
  },
  toggleContactsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  contactsBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginTop: 4,
  },
  contactField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  contactInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontSize: 13,
    color: '#0F172A',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  button: {
    flex: 1,
  },
});

export default SightingModal;
