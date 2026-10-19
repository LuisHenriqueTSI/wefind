import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { states } from '../lib/br-locations';
import COLORS from '../constants/theme';
import { removeHouseNumberFromAddress } from '../utils/locationPrivacy';
import SEARCH_RADIUS_OPTIONS_KM from '../constants/searchRadiusOptions';

const BRAZIL_REGION = {
  latitude: -14.235,
  longitude: -51.9253,
  latitudeDelta: 35,
  longitudeDelta: 35,
};

const regionToUf = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE',
  'Distrito Federal': 'DF', 'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', Pará: 'PA',
  Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS',
  Rondônia: 'RO', Roraima: 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP',
  Sergipe: 'SE', Tocantins: 'TO',
};

const normalizeRegionName = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizedRegionToUf = Object.fromEntries(
  Object.entries(regionToUf).map(([name, uf]) => [normalizeRegionName(name), uf])
);

const MapLocationPicker = ({
  visible,
  initialLocation,
  mode,
  radiusKm = 25,
  showRadius = mode === 'profile',
  onClose,
  onConfirm,
  onSelectLocation,
  onRadiusChange,
}) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const [coordinate, setCoordinate] = useState(initialLocation || null);
  const [currentRadiusKm, setCurrentRadiusKm] = useState(radiusKm || 25);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Campos de endereço editáveis
  const [street, setStreet] = useState('');
  // O WeFIND não pede nem guarda número de casa (privacidade)
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [fullAddressText, setFullAddressText] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Com o teclado aberto, o rodapé não precisa da margem da barra de navegação
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (radiusKm) {
      setCurrentRadiusKm(radiusKm);
    }
  }, [radiusKm]);

  // Sincroniza o texto completo quando os campos individuais mudam
  const updateAddressFields = (newFields) => {
    const updated = {
      street: newFields.street !== undefined ? newFields.street : street,
      district: newFields.district !== undefined ? newFields.district : district,
      city: newFields.city !== undefined ? newFields.city : city,
      stateUf: newFields.stateUf !== undefined ? newFields.stateUf : stateUf,
      postalCode: newFields.postalCode !== undefined ? newFields.postalCode : postalCode,
    };

    if (newFields.street !== undefined) setStreet(newFields.street);
    if (newFields.district !== undefined) setDistrict(newFields.district);
    if (newFields.city !== undefined) setCity(newFields.city);
    if (newFields.stateUf !== undefined) setStateUf(newFields.stateUf);
    if (newFields.postalCode !== undefined) setPostalCode(newFields.postalCode);

    const parts = [];
    if (updated.street) {
      parts.push(updated.street);
    }
    if (updated.district) parts.push(updated.district);
    if (updated.city && updated.stateUf) parts.push(`${updated.city} - ${updated.stateUf}`);
    else if (updated.city) parts.push(updated.city);
    else if (updated.stateUf) parts.push(updated.stateUf);

    setFullAddressText(parts.join(' - ') || [updated.street, updated.district, updated.city, updated.stateUf].filter(Boolean).join(', '));
  };

  const reverseGeocodeCoordinate = async (coord) => {
    if (!coord) return;
    setGeocoding(true);
    try {
      const addresses = await Location.reverseGeocodeAsync(coord);
      const addr = addresses?.[0];
      if (addr) {
        const rawRegion = String(addr.region || '').trim();
        const normRegion = normalizeRegionName(rawRegion);
        const resolvedUf = states.includes(rawRegion.toUpperCase())
          ? rawRegion.toUpperCase()
          : (normalizedRegionToUf[normRegion] || rawRegion);

        // Só o nome da rua: o número da casa nunca é preenchido
        const st = addr.street || (addr.name && !/^\d+$/.test(String(addr.name)) ? addr.name : '');
        const dist = addr.district || addr.subregion || '';
        const ct = addr.city || addr.subregion || '';
        const cep = addr.postalCode || '';

        setStreet(st);
        setDistrict(dist);
        setCity(ct);
        setStateUf(resolvedUf);
        setPostalCode(cep);

        const parts = [];
        if (st) {
          parts.push(st);
        }
        if (dist) parts.push(dist);
        if (ct && resolvedUf) parts.push(`${ct} - ${resolvedUf}`);
        else if (ct) parts.push(ct);
        else if (resolvedUf) parts.push(resolvedUf);

        setFullAddressText(parts.join(' - ') || [st, dist, ct, resolvedUf].filter(Boolean).join(', '));
      }
    } catch (error) {
      console.warn('[MapLocationPicker] Não foi possível identificar o endereço reverso:', error.message);
    } finally {
      setGeocoding(false);
    }
  };

  const loadCurrentLocation = async () => {
    setLoadingLocation(true);
    try {
      // 1. Tenta obter última localização conhecida instantaneamente para animação 0ms
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        const lastCoords = { latitude: Number(lastKnown.coords.latitude), longitude: Number(lastKnown.coords.longitude) };
        setCoordinate(lastCoords);
        reverseGeocodeCoordinate(lastCoords);
        if (mapRef.current) {
          mapRef.current.animateCamera({ center: lastCoords, zoom: 16.5 }, { duration: 400 });
          mapRef.current.animateToRegion({ ...lastCoords, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 400);
        }
      }

      // 2. Solicita permissão e busca GPS em tempo real com timeout de segurança
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
        const currentPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const result = await Promise.race([currentPromise, timeoutPromise]).catch(() => null);

        if (result?.coords) {
          const currentCoord = { latitude: Number(result.coords.latitude), longitude: Number(result.coords.longitude) };
          setCoordinate(currentCoord);
          reverseGeocodeCoordinate(currentCoord);
          if (mapRef.current) {
            mapRef.current.animateCamera({ center: currentCoord, zoom: 16.5 }, { duration: 500 });
            mapRef.current.animateToRegion({ ...currentCoord, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);
          }
        }
      }
    } catch (error) {
      console.warn('[MapLocationPicker] Não foi possível obter a localização atual:', error.message);
    } finally {
      setLoadingLocation(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const prepareMap = async () => {
      try {
        // Solicita a permissão ao abrir o seletor, mesmo quando já existe uma coordenada inicial.
        await Location.requestForegroundPermissionsAsync();
      } catch (error) {
        console.warn('[MapLocationPicker] Não foi possível solicitar permissão de localização:', error.message);
      }

      if (cancelled) return;
      setCoordinate(initialLocation || null);

      if (initialLocation?.latitude && initialLocation?.longitude) {
        reverseGeocodeCoordinate(initialLocation);
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.animateCamera({ center: initialLocation, zoom: 16.5 }, { duration: 400 });
            mapRef.current.animateToRegion({ ...initialLocation, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 400);
          }
        }, 200);
        return;
      }

      loadCurrentLocation();
    };

    prepareMap();
    return () => {
      cancelled = true;
    };
  }, [visible, initialLocation]);

  const handleMapPress = (event) => {
    const newCoord = event.nativeEvent.coordinate;
    setCoordinate(newCoord);
    reverseGeocodeCoordinate(newCoord);
    if (mapRef.current) {
      mapRef.current.animateCamera({ center: newCoord, zoom: 16.5 }, { duration: 300 });
    }
  };

  const handleConfirm = () => {
    if (!coordinate) return;

    const safeStreet = removeHouseNumberFromAddress(street.trim());
    const formatted = removeHouseNumberFromAddress(fullAddressText.trim()) || [safeStreet, district, city, stateUf].filter(Boolean).join(', ');

    const addressDetails = {
      street: safeStreet,
      number: '',
      district: district.trim(),
      city: city.trim(),
      state: stateUf.trim(),
      postalCode: postalCode.trim(),
      text: formatted,
    };

    const address = {
      street: safeStreet,
      name: safeStreet,
      houseNumber: '',
      district: district.trim(),
      city: city.trim(),
      region: stateUf.trim(),
      postalCode: postalCode.trim(),
    };

    const callback = onConfirm || onSelectLocation;
    if (callback) {
      callback({
        coordinate,
        address,
        addressDetails,
        addressText: formatted,
        street: safeStreet,
        houseNumber: '',
        district: district.trim(),
        neighborhood: district.trim(),
        city: city.trim(),
        state: stateUf.trim(),
        postalCode: postalCode.trim(),
        radiusKm: currentRadiusKm,
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* O teclado empurra o painel de endereço para cima (o mapa encolhe),
          em vez de cobrir os campos de rua, bairro e cidade. */}
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        {/* Cabeçalho Compacto */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.title}>
              {mode === 'profile' ? 'Atualize sua localização' : 'Escolha no mapa'}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {mode === 'profile'
                ? 'Toque no mapa para marcar seu local e ver o raio.'
                : 'Toque no mapa e confirme o endereço abaixo.'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
            <Text style={styles.closeText}>Fechar</Text>
          </TouchableOpacity>
        </View>

        {/* Mapa com Marcador e Círculo de Raio */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={coordinate ? { ...coordinate, latitudeDelta: 0.008, longitudeDelta: 0.008 } : BRAZIL_REGION}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {coordinate && (
              <>
                <Marker coordinate={coordinate} />
                <Circle
                  center={coordinate}
                  radius={currentRadiusKm * 1000}
                  fillColor="rgba(46, 86, 52, 0.16)"
                  strokeColor={COLORS.primary}
                  strokeWidth={2}
                />
              </>
            )}
          </MapView>

          {/* Botão GPS Flutuante no Mapa */}
          <TouchableOpacity
            style={styles.gpsFabButton}
            onPress={loadCurrentLocation}
            disabled={loadingLocation}
            activeOpacity={0.8}
            accessibilityLabel="Minha Localização / Marco Zero"
          >
            {loadingLocation ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <MaterialIcons name="my-location" size={22} color={COLORS.primary} />
            )}
          </TouchableOpacity>

          {(loadingLocation || geocoding) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.loadingText}>
                {loadingLocation ? 'Obtendo sua localização...' : 'Identificando endereço...'}
              </Text>
            </View>
          )}
        </View>

        {/* Painel Inferior de Endereço Editável (Mais Compacto e com Botão Fixo) */}
        <View style={[styles.bottomCard, keyboardOpen && { maxHeight: '72%' }]}>
          <View style={styles.bottomCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="edit-location-alt" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Endereço selecionado</Text>
            </View>
            {coordinate && (
              <View style={styles.coordBadge}>
                <Text style={styles.coordBadgeText}>Ponto Marcado</Text>
              </View>
            )}
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={{ paddingBottom: 10 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Seletor Visual de Raio no Mapa */}
            {showRadius && coordinate ? (
              <View style={styles.radiusSelectorBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <MaterialIcons name="radar" size={15} color={COLORS.primary} style={{ marginRight: 5 }} />
                  <Text style={styles.radiusLabel}>
                    Raio visível: <Text style={{ fontWeight: '800', color: COLORS.primary }}>{currentRadiusKm} km</Text>
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {SEARCH_RADIUS_OPTIONS_KM.map((r) => {
                    const isSel = currentRadiusKm === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.radiusChip, isSel && styles.radiusChipActive]}
                        onPress={() => setCurrentRadiusKm(r)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.radiusChipText, isSel && styles.radiusChipTextActive]}>
                          {r} km
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {coordinate ? (
              <>
                {/* Linha 1: Rua (sem número da casa, por privacidade) */}
                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Rua / Logradouro (sem número)</Text>
                    <TextInput
                      style={styles.inputField}
                      value={street}
                      onChangeText={(t) => updateAddressFields({ street: t })}
                      placeholder="Ex: Rua das Flores"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                {/* Linha 2: Bairro, Cidade e UF */}
                <View style={styles.inputRow}>
                  <View style={{ flex: 1.4, marginRight: 6 }}>
                    <Text style={styles.inputLabel}>Bairro</Text>
                    <TextInput
                      style={styles.inputField}
                      value={district}
                      onChangeText={(t) => updateAddressFields({ district: t })}
                      placeholder="Ex: Centro"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={{ flex: 1.4, marginRight: 6 }}>
                    <Text style={styles.inputLabel}>Cidade</Text>
                    <TextInput
                      style={styles.inputField}
                      value={city}
                      onChangeText={(t) => updateAddressFields({ city: t })}
                      placeholder="Ex: Curitiba"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={{ flex: 0.8 }}>
                    <Text style={styles.inputLabel}>UF</Text>
                    <TextInput
                      style={styles.inputField}
                      value={stateUf}
                      onChangeText={(t) => updateAddressFields({ stateUf: t.toUpperCase() })}
                      placeholder="PR"
                      maxLength={2}
                      autoCapitalize="characters"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                {/* Endereço completo formatado */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Endereço Completo Formatado</Text>
                  <TextInput
                    style={[styles.inputField, styles.multilineInput]}
                    value={fullAddressText}
                    onChangeText={setFullAddressText}
                    placeholder="Edite o endereço completo"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </>
            ) : (
              <View style={styles.emptyPromptBox}>
                <MaterialIcons name="touch-app" size={22} color={COLORS.primary} />
                <Text style={styles.emptyPromptText}>
                  Toque em qualquer ponto do mapa para marcar o local do animal.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Botão de Confirmação FIXO na Base (Com Safe Area Insets) */}
          <View style={[styles.bottomCardFooter, { paddingBottom: keyboardOpen ? 10 : Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={[styles.confirmButton, !coordinate && styles.disabledButton]}
              onPress={handleConfirm}
              disabled={!coordinate}
              activeOpacity={0.85}
            >
              <MaterialIcons name="check-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.confirmText}>Usar esta localização</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  subtitle: { marginTop: 1, color: '#64748B', fontSize: 12 },
  closeButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F1F5F9' },
  closeText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  mapContainer: { flex: 1, position: 'relative' },
  map: { width: '100%', height: '100%' },
  gpsFabButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  loadingText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  bottomCard: {
    maxHeight: '44%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  bottomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  coordBadge: {
    backgroundColor: '#EAF2EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coordBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primary,
  },
  // flexShrink: os campos rolam dentro do painel em vez de empurrar o botão
  // "Usar esta localização" para fora da tela
  formScroll: { paddingHorizontal: 16, flexGrow: 0, flexShrink: 1 },
  radiusSelectorBox: {
    backgroundColor: '#EAF2EB',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#CDE1D1',
  },
  radiusLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
  radiusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CDE1D1',
    backgroundColor: '#FFFFFF',
  },
  radiusChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  radiusChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
  radiusChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  inputGroup: {
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  inputField: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    height: 36,
  },
  multilineInput: {
    height: 44,
  },
  emptyPromptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF2EB',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
  },
  emptyPromptText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primaryDark,
    lineHeight: 16,
    fontWeight: '600',
  },
  bottomCardFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  confirmButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  disabledButton: { backgroundColor: '#94A3B8' },
  confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});

export default MapLocationPicker;
