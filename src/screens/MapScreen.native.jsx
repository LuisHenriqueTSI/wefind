import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Linking, Modal, PixelRatio, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as itemsService from '../services/items';
import * as sightingsService from '../services/sightings';
import SightingModal from '../components/SightingModal';
import PetMapMarker from '../components/PetMapMarker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';
import {
  DEFAULT_ROUTE_MODE,
  ROUTE_MODES,
  ROUTE_MODE_ORDER,
  buildGoogleMapsUrl,
  describeRouteStatus,
  formatClueAge,
  getRouteMode,
  getRouteStatus,
  getSightingHistoryAreas,
} from '../services/routeEligibility';
import { fetchTransitItinerary } from '../services/transitRoute';
import {
  getPrivateLocationSummary,
  isResidentialAddressPrivate,
  removeHouseNumberFromAddress,
  removeHouseNumberFromStreet,
  roundPublicCoordinate,
} from '../utils/locationPrivacy';

const BRAZIL_REGION = {
  latitude: -14.235,
  longitude: -51.9253,
  latitudeDelta: 35,
  longitudeDelta: 35,
};

const PETS_ONLY_MAP_STYLE = [
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

// Cores da pista: quente (verde), morna (âmbar), fria (cinza), protegida (azul)
const ROUTE_TONE_COLORS = {
  hot: { stroke: '#16A34A', fill: 'rgba(22, 163, 74, 0.16)', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', icon: 'local-fire-department' },
  warm: { stroke: '#D97706', fill: 'rgba(217, 119, 6, 0.14)', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', icon: 'schedule' },
  cold: { stroke: '#94A3B8', fill: 'rgba(148, 163, 184, 0.14)', bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', icon: 'ac-unit' },
  protected: { stroke: '#0284C7', fill: 'rgba(2, 132, 199, 0.1)', bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1', icon: 'lock-outline' },
};

const ROUTE_MODE_STORAGE_KEY = '@wefind/route_mode';

// Número no centro de cada círculo do histórico. No Android o react-native-maps
// desenha o marcador num bitmap de 100 x 100 px (ver PetMapMarker), então a
// View mede exatamente isso e a bolinha fica centralizada nela.
const HISTORY_BOX_DP = (Platform.OS === 'android' ? 100 : Math.round(30 * PixelRatio.get())) / PixelRatio.get();
const HISTORY_DOT_DP = Math.min(24, HISTORY_BOX_DP - 4);

const SightingHistoryMarker = React.memo(({ area, index, onPress }) => {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), 500);
    return () => clearTimeout(timer);
  }, []);
  const tone = ROUTE_TONE_COLORS[area.freshness] || ROUTE_TONE_COLORS.cold;

  return (
    <Marker
      coordinate={{ latitude: area.latitude, longitude: area.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      title={`${formatClueAge(area.ageHours)}${area.isPrivate ? ' · em casa/quintal' : ''}`}
      description={`Publicado por ${area.userName}`}
      onPress={onPress}
      zIndex={3}
    >
      <View collapsable={false} style={{ width: HISTORY_BOX_DP, height: HISTORY_BOX_DP, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: HISTORY_DOT_DP, height: HISTORY_DOT_DP, borderRadius: HISTORY_DOT_DP / 2, backgroundColor: tone.stroke, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{index + 1}</Text>
        </View>
      </View>
    </Marker>
  );
});

// Cache em memória para geocodificação de cidades/estados
const geoCityCache = {};

const geocodeItemLocation = async (item) => {
  // 1. Tenta extrair coordenadas diretas já presentes
  const directLat = item.latitude ?? item.extra_fields?.location_details?.latitude ?? item.extra_fields?.latitude;
  const directLng = item.longitude ?? item.extra_fields?.location_details?.longitude ?? item.extra_fields?.longitude;

  if (Number.isFinite(Number(directLat)) && Number.isFinite(Number(directLng)) && Number(directLat) !== 0 && Number(directLng) !== 0) {
    const latitude = Number(directLat);
    const longitude = Number(directLng);

    return {
      latitude: item.status === 'lost' ? roundPublicCoordinate(latitude) : latitude,
      longitude: item.status === 'lost' ? roundPublicCoordinate(longitude) : longitude,
    };
  }

  // 2. Tenta geocodificar por Cidade e Estado
  const city = item.city || item.extra_fields?.city;
  const state = item.state || item.extra_fields?.state;
  if (!city || !state) return null;

  const cacheKey = `${city.trim()}-${state.trim()}`.toLowerCase();
  if (geoCityCache[cacheKey]) {
    return geoCityCache[cacheKey];
  }

  try {
    const query = `${city}, ${state}, Brasil`;
    const results = await Location.geocodeAsync(query);
    if (results && results.length > 0) {
      const coords = {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };
      geoCityCache[cacheKey] = coords;
      return coords;
    }
  } catch (err) {
    console.log('[MapScreen] Erro no geocoding do item:', err?.message || err);
  }

  return null;
};

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371;
  const dLat = ((numLat2 - numLat1) * Math.PI) / 180;
  const dLon = ((numLon2 - numLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((numLat1 * Math.PI) / 180) *
      Math.cos((numLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ---------------------------------------------------------------------------
// Geometria da navegação
// ---------------------------------------------------------------------------
const getDistanceM = (a, b) =>
  (calculateDistanceKm(a?.latitude, a?.longitude, b?.latitude, b?.longitude) || 0) * 1000;

const getPathLengthM = (coords) => {
  let total = 0;
  for (let i = 1; i < (coords?.length || 0); i += 1) total += getDistanceM(coords[i - 1], coords[i]);
  return total;
};

/**
 * Ponto da rota mais próximo do usuário: índice do início do trecho e a
 * distância até ele, em metros. Usa uma projeção plana local (equiretangular),
 * precisa o bastante nas distâncias de uma rota a pé ou de carro.
 */
const findNearestOnRoute = (point, coords) => {
  if (!point || !Array.isArray(coords) || coords.length < 2) return null;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((point.latitude * Math.PI) / 180);
  const toXY = (c) => ({
    x: (c.longitude - point.longitude) * metersPerDegLng,
    y: (c.latitude - point.latitude) * metersPerDegLat,
  });

  let best = null;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = toXY(coords[i]);
    const b = toXY(coords[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    // O usuário está na origem (0, 0): projeta a origem sobre o trecho a-b
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq)) : 0;
    const distanceM = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (!best || distanceM < best.distanceM) best = { index: i, distanceM };
  }
  return best;
};

/** Direção de a para b, em graus (0 = norte, sentido horário). */
const getBearing = (a, b) => {
  if (!a || !b) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return Number.isFinite(bearing) ? (bearing + 360) % 360 : 0;
};

const formatRouteDistance = (distanceM) =>
  distanceM < 1000 ? `${Math.max(10, Math.round(distanceM / 10) * 10)} m` : `${(distanceM / 1000).toFixed(1)} km`;

const formatItemDate = (value) => {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
};

const getColorHex = (colorName = '') => {
  const norm = String(colorName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('pret')) return '#1E293B';
  if (norm.includes('branc')) return '#FFFFFF';
  if (norm.includes('marrom') || norm.includes('marron')) return '#78350F';
  if (norm.includes('caramel') || norm.includes('dourad')) return '#D97706';
  if (norm.includes('cinza') || norm.includes('prat')) return '#94A3B8';
  if (norm.includes('laranja') || norm.includes('ruiv') || norm.includes('vermelh')) return '#EA580C';
  if (norm.includes('amarel')) return '#EAB308';
  if (norm.includes('bege') || norm.includes('crem')) return '#FDE68A';
  return '#64748B';
};

const formatItemFullAddress = (item) => {
  if (!item) return '';

  if (isResidentialAddressPrivate(item)) {
    return getPrivateLocationSummary(item);
  }

  const isLost = item.status === 'lost';

  // 1. ANIMAL PERDIDO: Exibe apenas Bairro / Referência sem número residencial
  if (isLost) {
    const neighborhood = item.neighborhood || item.extra_fields?.neighborhood || item.extra_fields?.location_details?.district || item.extra_fields?.location_details?.neighborhood || '';
    const reference = removeHouseNumberFromStreet(
      item.extra_fields?.location_details?.reference || item.extra_fields?.street || item.street
    );
    const city = item.city || item.extra_fields?.city || item.extra_fields?.location_details?.city || '';
    const state = item.state || item.extra_fields?.state || item.extra_fields?.location_details?.state || '';

    const parts = [];
    if (neighborhood) parts.push(`Região de ${neighborhood}`);
    if (reference && reference !== neighborhood) parts.push(`Próx. a ${reference}`);
    if (city && state) parts.push(`${city} - ${state}`);
    else if (city) parts.push(city);

    const composed = parts.join(' • ');
    if (composed.trim()) return composed.trim();

    return [neighborhood, city, state].filter(Boolean).join(' - ') || 'Região de Desaparecimento';
  }

  // ANIMAL VISTO NA RUA / AVISTAMENTO: Pode exibir rua e altura da via pública
  const lastSighting = item.extra_fields?.last_sighting_address;
  if (lastSighting && typeof lastSighting === 'string' && !lastSighting.startsWith('{') && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(lastSighting.trim())) {
    return removeHouseNumberFromAddress(lastSighting.trim());
  }

  const directAddress = item.address || item.extra_fields?.address || item.extra_fields?.location_details?.fullAddressText;
  if (directAddress && typeof directAddress === 'string' && !directAddress.startsWith('{') && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(directAddress.trim())) {
    return removeHouseNumberFromAddress(directAddress.trim());
  }

  const street = removeHouseNumberFromStreet(item.street || item.extra_fields?.street || item.extra_fields?.location_details?.street || '');
  const neighborhood = item.neighborhood || item.extra_fields?.neighborhood || item.extra_fields?.location_details?.neighborhood || '';
  const city = item.city || item.extra_fields?.city || item.extra_fields?.location_details?.city || '';
  const state = item.state || item.extra_fields?.state || item.extra_fields?.location_details?.state || '';

  const parts = [];
  if (street) {
    parts.push(street);
  }
  if (neighborhood && neighborhood !== street) {
    parts.push(neighborhood);
  }
  if (city && state) {
    parts.push(`${city} - ${state}`);
  } else if (city) {
    parts.push(city);
  } else if (state) {
    parts.push(state);
  }

  const composed = parts.join(' - ');
  if (composed.trim()) return composed.trim();

  return [item.neighborhood, item.city, item.state].filter(Boolean).join(' - ') || 'Localização na rua';
};

const buildSelectedChips = (item) => {
  if (!item) return [];
  const breed = String(item.breed || item.extra_fields?.breed || '').trim();
  const gender = String(item.gender || item.extra_fields?.gender || '').trim();
  const color = String(item.color || item.extra_fields?.color || '').trim();
  const size = String(item.size || item.extra_fields?.size || '').trim();
  const age = String(item.age || item.extra_fields?.age || '').trim();
  const collar = String(item.collar || item.extra_fields?.collar || '').toLowerCase() === 'sim' || Boolean(item.extra_fields?.has_collar);
  const neutered = String(item.neutered || item.extra_fields?.neutered || '').toLowerCase() === 'sim' || Boolean(item.extra_fields?.castrated || item.extra_fields?.is_neutered);

  const list = [];
  const isBreedUnknown = !breed ||
    /^(não informado|não informada|nao informado|nao informada|sem raça definida|sem raca definida|sem raça|sem raca|srd|desconhecido|desconhecida|outra|outro)$/i.test(breed.trim());

  if (!isBreedUnknown) {
    list.push({ key: 'breed', text: `${breed}` });
  }
  if (gender && gender !== 'Não informado') {
    list.push({
      key: 'gender',
      text: gender.toLowerCase().includes('f') ? 'Fêmea' : 'Macho',
    });
  }
  if (size && size !== 'Não informado') {
    list.push({ key: 'size', text: `${size.replace(/porte\s*/i, '')}` });
  }
  if (age && age !== 'Não informado') {
    list.push({
      key: 'age',
      text: age.toLowerCase().includes('filhote') ? 'Filhote' : age.toLowerCase().includes('idoso') ? 'Idoso' : 'Adulto',
    });
  }
  if (color && color !== 'Cor não informada') {
    list.push({
      key: 'color',
      isColor: true,
      colorHex: getColorHex(color),
      text: color,
    });
  }
  if (collar) {
    list.push({ key: 'collar', isCollar: true, text: 'Coleira' });
  }
  if (neutered) {
    list.push({ key: 'neutered', isNeutered: true, text: 'Castrado' });
  }
  const temperament = Array.isArray(item?.extra_fields?.temperament) ? item.extra_fields.temperament : [];
  temperament.forEach((trait, idx) => {
    list.push({ key: `trait-${idx}`, isTrait: true, text: trait });
  });
  return list;
};

const MapScreen = ({ route, navigation }) => {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationStatus, setLocationStatus] = useState('checking');
  const locationStatusRef = useRef('checking');
  const [region, setRegion] = useState(BRAZIL_REGION);
  const [userCoords, setUserCoords] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [searchTerm, setSearchTerm] = useState('');
  const [showMapInfoModal, setShowMapInfoModal] = useState(false);
  const [centeringLoading, setCenteringLoading] = useState(false);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase().trim();
    return items.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const species = (item.species || '').toLowerCase();
      const breed = (item.breed || '').toLowerCase();
      const city = (item.city || '').toLowerCase();
      const state = (item.state || '').toLowerCase();
      const neighborhood = (item.neighborhood || '').toLowerCase();
      const category = (item.category || '').toLowerCase();

      return (
        title.includes(term) ||
        desc.includes(term) ||
        species.includes(term) ||
        breed.includes(term) ||
        city.includes(term) ||
        state.includes(term) ||
        neighborhood.includes(term) ||
        category.includes(term)
      );
    });
  }, [items, searchTerm]);

  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeMode, setRouteMode] = useState(DEFAULT_ROUTE_MODE);
  // Trechos desenhados (um só para a pé/bicicleta/carro; um por perna no ônibus)
  const [routeSegments, setRouteSegments] = useState([]);
  // Navegação: a câmera acompanha o usuário e a rota encolhe conforme ele anda
  const [isNavigating, setIsNavigating] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [navProgress, setNavProgress] = useState(null);
  // Origem e destino da última rota, para recalcular ao trocar o meio de transporte
  const routeEndpointsRef = useRef(null);
  const routeRequestIdRef = useRef(0);
  // Card recolhido: a tela fica limpa só com a rota ou com o histórico no mapa
  const [cardCollapsed, setCardCollapsed] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const handledRouteParamRef = useRef(null);
  const [resolvedItemAddress, setResolvedItemAddress] = useState('');
  // Situação da pista do animal selecionado (quente / morna / fria / protegida)
  const selectedRouteStatus = useMemo(() => getRouteStatus(selectedItem), [selectedItem]);
  const selectedRouteDescription = useMemo(() => describeRouteStatus(selectedRouteStatus), [selectedRouteStatus]);
  const selectedItemCanHaveRoute = selectedRouteStatus.available;

  // Sighting Modal State
  const [sightingModalVisible, setSightingModalVisible] = useState(false);
  const [submittingSighting, setSubmittingSighting] = useState(false);
  const [targetSightingItem, setTargetSightingItem] = useState(null);
  const [selectedItemTrail, setSelectedItemTrail] = useState([]);
  const [cardHeight, setCardHeight] = useState(0);
  const isCardVisible = Boolean(selectedItem) && !cardCollapsed;
  const historyAreas = useMemo(
    () => getSightingHistoryAreas(selectedItem, selectedItemTrail),
    [selectedItem, selectedItemTrail]
  );
  const isRouteActive = selectedItemCanHaveRoute && routeCoordinates.length > 1 && !historyMode;

  // Último meio de transporte escolhido
  useEffect(() => {
    AsyncStorage.getItem(ROUTE_MODE_STORAGE_KEY)
      .then((saved) => {
        if (saved && ROUTE_MODES[saved]) setRouteMode(saved);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: isCardVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isCardVisible, overlayOpacity]);

  // Carrega o rastro de deslocamento do animal selecionado

  useEffect(() => {
    let isMounted = true;
    if (!selectedItem?.id) {
      setSelectedItemTrail([]);
      return;
    }

    sightingsService.getItemSightingTrail(selectedItem)
      .then((steps) => {
        if (isMounted) {
          setSelectedItemTrail(steps || []);
          if (route?.params?.showTrail && steps && steps.length > 1 && mapRef.current) {
            mapRef.current.fitToCoordinates(
              steps.map(s => ({ latitude: s.latitude, longitude: s.longitude })),
              { edgePadding: { top: 120, right: 60, bottom: 320, left: 60 }, animated: true }
            );
          }
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [selectedItem?.id, selectedItem?.latitude, selectedItem?.longitude, selectedItem?.extra_fields?.sighting_count, route?.params?.showTrail]);

  // Endereço exibido no cartão (sempre sem número de casa)
  useEffect(() => {
    setResolvedItemAddress(selectedItem ? formatItemFullAddress(selectedItem) : '');
  }, [selectedItem?.id, selectedItem?.latitude, selectedItem?.longitude, selectedItem?.status, selectedItem?.extra_fields?.found_custody, selectedItem?.extra_fields?.last_sighting_address]);

  const handleOpenSightingModal = (item) => {
    if (!user) {
      Alert.alert('Login necessário', 'Faça login para registrar um novo avistamento do pet.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Entrar', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }
    setTargetSightingItem(item);
    setSightingModalVisible(true);
  };

  const handleSubmitSighting = async (form) => {
    if (!targetSightingItem) return;
    setSubmittingSighting(true);
    try {
      let photoUrl = form.photo_url;
      if (photoUrl && (photoUrl.startsWith('file://') || photoUrl.startsWith('content://'))) {
        try {
          photoUrl = await sightingsService.uploadSightingPhoto(targetSightingItem.id, photoUrl);
        } catch (uploadErr) {
          console.warn('[MapScreen] Erro upload foto avistamento:', uploadErr);
        }
      }

      const res = await sightingsService.recordSighting({
        itemId: targetSightingItem.id,
        userId: user.id,
        location: form.coordinate || form.location_details || { address: form.location },
        description: form.description,
        contactInfo: form.contact_info,
        photoUrl,
        animalPlace: form.animal_place,
      });

      setSightingModalVisible(false);
      Alert.alert('Avistamento registrado', 'O avistamento foi registrado nas pistas do pet e os voluntários e tutores foram avisados.');

      // A publicação continua no local original; o avistamento entra no rastro.
      const refreshedItems = await loadItems();
      const refreshedItem = refreshedItems?.find((i) => i.id === targetSightingItem.id);
      if (refreshedItem) setSelectedItem(refreshedItem);

      const newLat = res?.sightingLocation?.latitude ?? form.coordinate?.latitude;
      const newLng = res?.sightingLocation?.longitude ?? form.coordinate?.longitude;
      if (newLat && newLng) {
        if (mapRef.current) {
          mapRef.current.animateCamera({
            center: { latitude: Number(newLat), longitude: Number(newLng) },
            zoom: 16.5,
          }, { duration: 600 });
          mapRef.current.animateToRegion({
            latitude: Number(newLat),
            longitude: Number(newLng),
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          }, 600);
        }
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível registrar o avistamento. Tente novamente.');
    } finally {
      setSubmittingSighting(false);
    }
  };

  const locationSubRef = useRef(null);
  const lastRerouteAtRef = useRef(0);
  // Valores atuais lidos dentro do watchPosition (sem recriar a assinatura)
  const routeCoordsRef = useRef([]);
  const routeInfoRef = useRef(null);
  const routeModeRef = useRef(routeMode);
  const followUserRef = useRef(true);
  const navTargetRef = useRef(null);
  useEffect(() => { routeCoordsRef.current = routeCoordinates; }, [routeCoordinates]);
  useEffect(() => { routeInfoRef.current = routeInfo; }, [routeInfo]);
  useEffect(() => { routeModeRef.current = routeMode; }, [routeMode]);
  useEffect(() => { followUserRef.current = followUser; }, [followUser]);

  // Busca o traçado no OSRM (a pé, bicicleta ou carro). O servidor do
  // OpenStreetMap tem um perfil para cada um; o servidor reserva (project-osrm)
  // só calcula rotas de carro, então dele só aproveitamos o traçado e o tempo
  // vem da distância e da velocidade média do meio escolhido.
  const fetchOsrmRoute = useCallback(async (from, to, mode) => {
    const coordsPath = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const osrmService = mode.osrmProfile === 'car' ? 'driving' : mode.osrmProfile;
    const endpoints = [
      { url: `https://routing.openstreetmap.de/routed-${mode.osrmProfile}/route/v1/${osrmService}/${coordsPath}?overview=full&geometries=geojson`, trustDuration: true },
      { url: `https://router.project-osrm.org/route/v1/driving/${coordsPath}?overview=full&geometries=geojson`, trustDuration: mode.key === 'car' },
    ];

    for (const { url, trustDuration } of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'WeFindApp/1.0 (React Native Mobile)' },
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const routeData = data?.routes?.[0];
          if (routeData?.geometry?.coordinates?.length > 1) {
            const durationTrusted = trustDuration && Number.isFinite(routeData.duration) && routeData.duration > 0;
            return {
              coords: routeData.geometry.coordinates.map(([lng, lat]) => ({ latitude: Number(lat), longitude: Number(lng) })),
              distanceM: routeData.distance,
              durationMin: Math.max(1, Math.round(durationTrusted ? routeData.duration / 60 : routeData.distance / mode.metersPerMin)),
            };
          }
        }
      } catch (err) {
        console.log(`[MapScreen] Aviso no servidor de rota (${url.split('/')[2]}):`, err?.message);
      }
    }
    return null;
  }, []);

  // Rota até o centro da área de busca no meio de transporte escolhido.
  //  - A pé, bicicleta e carro: OSRM. Se os servidores falharem, mostra uma
  //    linha reta com distância aproximada.
  //  - Ônibus: itinerário com linhas e horários (Transitous). Onde a cidade não
  //    publica dados de transporte, mostra a rota a pé e avisa.
  // `silent`: recálculo durante a navegação, sem spinner e sem mexer na câmera.
  const calculateRoute = useCallback(async (fromCoords, toCoords, autoFit = true, modeKey = DEFAULT_ROUTE_MODE, silent = false) => {
    const from = { latitude: Number(fromCoords?.latitude), longitude: Number(fromCoords?.longitude) };
    const to = { latitude: Number(toCoords?.latitude), longitude: Number(toCoords?.longitude) };
    const mode = getRouteMode(modeKey);

    if ([from.latitude, from.longitude, to.latitude, to.longitude].some((v) => !Number.isFinite(v))) return false;

    if (!silent) setLoadingRoute(true);
    routeRequestIdRef.current += 1;
    const requestId = routeRequestIdRef.current;
    routeEndpointsRef.current = { from, to };

    let segments = null;
    let info = null;

    if (!mode.osrmProfile) {
      const itinerary = await fetchTransitItinerary(from, to);
      if (itinerary) {
        segments = itinerary.segments;
        info = {
          durationMin: itinerary.durationMin,
          distanceText: '',
          approximate: false,
          modeKey: mode.key,
          travelKey: mode.key,
          transit: itinerary,
        };
      }
    }

    if (!info) {
      // Ônibus sem dados na cidade: a parte que dá para mostrar aqui é a pé
      const travelMode = mode.osrmProfile ? mode : getRouteMode('foot');
      const osrm = await fetchOsrmRoute(from, to, travelMode);
      const coords = osrm ? osrm.coords : [from, to];
      const distanceM = osrm ? osrm.distanceM : (calculateDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude) || 0) * 1000;
      segments = [{ key: 'route', mode: travelMode.key, coordinates: coords, color: COLORS.primary, dashed: !osrm }];
      info = {
        distanceText: formatRouteDistance(distanceM),
        durationMin: osrm ? osrm.durationMin : Math.max(1, Math.round(distanceM / travelMode.metersPerMin)),
        totalDistanceM: distanceM,
        approximate: !osrm,
        modeKey: mode.key,
        travelKey: travelMode.key,
        note: mode.osrmProfile ? '' : 'Sem horários de ônibus nesta cidade · rota a pé',
      };
    }

    // Trocou de meio de transporte enquanto esta rota carregava: vale a mais nova
    if (requestId !== routeRequestIdRef.current) return false;

    const coords = segments.flatMap((s) => s.coordinates);
    info.totalDurationMin = info.durationMin;
    setRouteSegments(segments);
    setRouteCoordinates(coords);
    setRouteInfo(info);
    setNavProgress(null);

    if (autoFit && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, {
          // O card fecha ao traçar a rota: sobra só a faixa de resumo no topo
          edgePadding: { top: 220, right: 60, bottom: 140, left: 60 },
          animated: true,
        });
      }, 250);
    }

    setLoadingRoute(false);
    return true;
  }, [fetchOsrmRoute]);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setFollowUser(true);
    setNavProgress(null);
    navTargetRef.current = null;
    mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 500 });
  }, []);

  const handleSelectItem = useCallback((item) => {
    setSelectedItem(item);
    setIsNavigating(false);
    setRouteSegments([]);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavProgress(null);
    routeEndpointsRef.current = null;
    setCardCollapsed(false);
    setHistoryMode(false);
  }, []);

  const clearRoute = useCallback(() => {
    routeRequestIdRef.current += 1;
    routeEndpointsRef.current = null;
    setIsNavigating(false);
    setRouteSegments([]);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavProgress(null);
    setLoadingRoute(false);
  }, []);

  // Fecha o card e sai da rota / do histórico
  const closeSelection = useCallback(() => {
    clearRoute();
    setSelectedItem(null);
    setCardCollapsed(false);
    setHistoryMode(false);
  }, [clearRoute]);

  // Navegação curva a curva com voz fica com o Google Maps, que recebe só o
  // centro da área de busca (nunca o ponto exato marcado).
  const openInGoogleMaps = useCallback((item, modeKey = DEFAULT_ROUTE_MODE) => {
    const status = getRouteStatus(item);
    if (!status.available) return;
    Linking.openURL(buildGoogleMapsUrl(status.area, modeKey)).catch(() => {
      Alert.alert('Não foi possível abrir o Google Maps', 'Verifique se há um aplicativo de mapas instalado.');
    });
  }, []);

  // Mostra no mapa a rota até a área de busca e recolhe o card
  const showRoutePreview = useCallback(async (item, knownCoords = null, modeKey = routeMode) => {
    const status = getRouteStatus(item);
    if (!status.available) return;

    setHistoryMode(false);
    setCardCollapsed(true);

    let current = knownCoords || userCoords;
    if (!current) {
      try {
        const { status: permission } = await Location.getForegroundPermissionsAsync();
        if (permission === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc?.coords) {
            current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setUserCoords(current);
          }
        }
      } catch (e) {}
    }

    if (!current) {
      // Sem a localização do usuário, o próprio Google Maps calcula o caminho
      setCardCollapsed(false);
      openInGoogleMaps(item, modeKey);
      return;
    }

    await calculateRoute(current, status.area, true, modeKey);
  }, [userCoords, routeMode, calculateRoute, openInGoogleMaps]);

  // Troca o meio de transporte e recalcula a rota (e o tempo) já traçada.
  // Navegando, recalcula a partir de onde o usuário está agora.
  const handleChangeRouteMode = useCallback((modeKey) => {
    if (!ROUTE_MODES[modeKey]) return;
    setRouteMode(modeKey);
    AsyncStorage.setItem(ROUTE_MODE_STORAGE_KEY, modeKey).catch(() => {});
    const endpoints = routeEndpointsRef.current;
    if (endpoints && routeCoordinates.length > 0) {
      calculateRoute(isNavigating && userCoords ? userCoords : endpoints.from, endpoints.to, !isNavigating, modeKey);
    }
  }, [routeCoordinates.length, isNavigating, userCoords, calculateRoute]);

  // Inicia a rota traçada: a câmera acompanha o usuário e a rota é atualizada
  // conforme ele anda, até chegar na área onde o pet foi visto.
  const startNavigation = useCallback(async () => {
    const status = getRouteStatus(selectedItem);
    if (!status.available || routeCoordinates.length < 2) return;

    let permission = 'denied';
    try {
      permission = (await Location.getForegroundPermissionsAsync()).status;
      if (permission !== 'granted') permission = (await Location.requestForegroundPermissionsAsync()).status;
    } catch (e) {}
    if (permission !== 'granted') {
      Alert.alert('Localização necessária', 'Permita o acesso à localização para acompanhar a rota em tempo real.');
      return;
    }

    navTargetRef.current = status.area;
    lastRerouteAtRef.current = Date.now();
    setCardCollapsed(true);
    setFollowUser(true);
    setIsNavigating(true);

    const here = userCoords || routeCoordinates[0];
    mapRef.current?.animateCamera({
      center: here,
      heading: Math.round(getBearing(here, routeCoordinates[Math.min(1, routeCoordinates.length - 1)])),
      pitch: 45,
      zoom: 17.5,
    }, { duration: 700 });
  }, [selectedItem, routeCoordinates, userCoords]);

  // Botão de centralizar durante a navegação: volta a seguir o usuário
  const resumeFollowingUser = useCallback(() => {
    setFollowUser(true);
    if (userCoords) {
      const nearest = findNearestOnRoute(userCoords, routeCoordinates);
      const nextPoint = nearest ? routeCoordinates[Math.min(nearest.index + 1, routeCoordinates.length - 1)] : null;
      mapRef.current?.animateCamera({
        center: userCoords,
        heading: Math.round(getBearing(userCoords, nextPoint || userCoords)),
        pitch: 45,
        zoom: 17.5,
      }, { duration: 500 });
    }
  }, [userCoords, routeCoordinates]);

  // A cada nova posição durante a navegação
  const handleNavigationFix = useCallback((loc) => {
    const here = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    setUserCoords(here);

    const target = navTargetRef.current;
    if (!target) return;

    // Chegou na área de busca
    const toTargetM = getDistanceM(here, target);
    if (toTargetM <= target.radiusM * 0.8) {
      stopNavigation();
      clearRoute();
      setCardCollapsed(false);
      Alert.alert(
        'Você chegou à área',
        'O pet foi visto por aqui. Procure com calma nos arredores e chame pelo nome. Viu o pet? Registre em "Vi o Pet".'
      );
      return;
    }

    const modeKey = routeModeRef.current;
    const info = routeInfoRef.current;
    const coords = routeCoordsRef.current;
    const isTransit = Boolean(info?.transit);
    const nearest = findNearestOnRoute(here, coords);

    // Saiu da rota: recalcula a partir de onde está (com intervalo mínimo)
    const offRouteM = isTransit ? 120 : (info?.travelKey === 'car' ? 50 : 35);
    const minRerouteMs = isTransit ? 45000 : 8000;
    if ((!nearest || nearest.distanceM > offRouteM) && Date.now() - lastRerouteAtRef.current > minRerouteMs) {
      lastRerouteAtRef.current = Date.now();
      calculateRoute(here, target, false, modeKey, true);
    } else if (nearest && !isTransit && info) {
      // Na rota: apaga o trecho já percorrido e atualiza distância e tempo
      const remaining = [here, ...coords.slice(nearest.index + 1)];
      const remainingM = getPathLengthM(remaining);
      setRouteCoordinates(remaining);
      setRouteSegments((segments) => (segments.length === 1 ? [{ ...segments[0], coordinates: remaining }] : segments));
      const total = info.totalDistanceM || remainingM || 1;
      setNavProgress({
        distanceText: formatRouteDistance(remainingM),
        durationMin: Math.max(1, Math.round((info.totalDurationMin || 1) * Math.min(1, remainingM / total))),
      });
    }

    if (followUserRef.current && mapRef.current) {
      const moving = Number(loc.coords.speed) > 1 && Number(loc.coords.heading) >= 0;
      const nextPoint = nearest ? coords[Math.min(nearest.index + 1, coords.length - 1)] : target;
      mapRef.current.animateCamera({
        center: here,
        heading: Math.round(moving ? loc.coords.heading : getBearing(here, nextPoint)),
        pitch: 45,
        zoom: 17.5,
      }, { duration: 900 });
    }
  }, [calculateRoute, clearRoute, stopNavigation]);

  const navigationFixRef = useRef(handleNavigationFix);
  useEffect(() => { navigationFixRef.current = handleNavigationFix; }, [handleNavigationFix]);

  // Acompanha a posição do usuário só enquanto navega
  useEffect(() => {
    if (!isNavigating) return undefined;
    let cancelled = false;

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 4 },
      (loc) => {
        if (!cancelled && loc?.coords) navigationFixRef.current(loc);
      }
    ).then((sub) => {
      if (cancelled) sub.remove();
      else locationSubRef.current = sub;
    }).catch((e) => console.log('[MapScreen] Erro no watchPosition:', e?.message || e));

    return () => {
      cancelled = true;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [isNavigating]);

  // Histórico: recolhe o card e mostra no mapa os círculos dos avistamentos
  const showSightingHistory = useCallback(() => {
    if (historyAreas.length === 0) return;
    clearRoute();
    setHistoryMode(true);
    setCardCollapsed(true);
    setTimeout(() => {
      const points = historyAreas.map((a) => ({ latitude: a.latitude, longitude: a.longitude }));
      if (points.length === 1) {
        mapRef.current?.animateToRegion({ ...points[0], latitudeDelta: 0.012, longitudeDelta: 0.012 }, 600);
      } else {
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 200, right: 70, bottom: 190, left: 70 },
          animated: true,
        });
      }
    }, 250);
  }, [historyAreas, clearRoute]);

  const exitSightingHistory = useCallback(() => {
    setHistoryMode(false);
    setCardCollapsed(false);
  }, []);

  // Fechar o card com uma rota ou o histórico na tela só o recolhe; para
  // encerrar, use o X da faixa no topo.
  const dismissCard = useCallback(() => {
    if (isRouteActive || historyMode) {
      setCardCollapsed(true);
      return;
    }
    closeSelection();
  }, [isRouteActive, historyMode, closeSelection]);

  // Ao receber focusItemId ou showRoute, centraliza e traça a rota UMA VEZ
  useEffect(() => {
    const focusId = route?.params?.focusItemId;
    const showRoute = route?.params?.showRoute;
    const targetCoordsParam = route?.params?.targetCoords;
    const routeKey = `${focusId || ''}-${showRoute ? '1' : '0'}`;

    if ((focusId || targetCoordsParam) && items.length > 0 && handledRouteParamRef.current !== routeKey) {
      handledRouteParamRef.current = routeKey;

      const target = items.find(i => String(i.id) === String(focusId)) || {
        id: focusId || 'temp',
        latitude: targetCoordsParam?.latitude,
        longitude: targetCoordsParam?.longitude,
      };

      if (target?.latitude && target?.longitude) {
        handleSelectItem(target);

        if (showRoute && getRouteStatus(target).available) {
          showRoutePreview(target);
        } else {
          mapRef.current?.animateToRegion({
            latitude: Number(target.latitude),
            longitude: Number(target.longitude),
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }, 800);
        }
      }
    }
  }, [route?.params?.focusItemId, route?.params?.showRoute, items, showRoutePreview, handleSelectItem]);

  // Ao buscar, recentraliza suavemente no primeiro animal correspondente encontrado
  useEffect(() => {
    if (searchTerm.trim() && filteredItems.length > 0 && mapRef.current) {
      const first = filteredItems[0];
      if (first?.latitude && first?.longitude) {
        mapRef.current.animateToRegion({
          latitude: Number(first.latitude),
          longitude: Number(first.longitude),
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }, 500);
      }
    }
  }, [searchTerm, filteredItems]);

  const requestUserLocation = useCallback(async (shouldAnimateToUser = true) => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      let isGranted = status === 'granted';

      if (!isGranted) {
        const req = await Location.requestForegroundPermissionsAsync();
        isGranted = req.status === 'granted';
      }

      if (!isGranted) {
        locationStatusRef.current = 'denied';
        setLocationStatus('denied');
        return null;
      }

      locationStatusRef.current = 'granted';
      setLocationStatus('granted');

      // 1. Tenta obter a última localização conhecida instantaneamente para resposta imediata
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        const initialCoords = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        };
        setUserCoords(initialCoords);
        setRegion({ ...initialCoords, latitudeDelta: 0.015, longitudeDelta: 0.015 });

        const hasFocusParam = route?.params?.focusItemId || route?.params?.targetCoords;
        if (shouldAnimateToUser && !hasFocusParam && mapRef.current) {
          mapRef.current.animateToRegion({
            ...initialCoords,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }, 600);
        }
      }

      // 2. Atualiza a posição via GPS em tempo real
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (current?.coords) {
        const liveCoords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
        setUserCoords(liveCoords);
        setRegion({ ...liveCoords, latitudeDelta: 0.015, longitudeDelta: 0.015 });

        const hasFocusParam = route?.params?.focusItemId || route?.params?.targetCoords;
        if (shouldAnimateToUser && !hasFocusParam && mapRef.current) {
          mapRef.current.animateToRegion({
            ...liveCoords,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }, 600);
        }
        return liveCoords;
      }

      return lastKnown?.coords || null;
    } catch (error) {
      console.warn('[MapScreen] Não foi possível obter a localização:', error.message);
      locationStatusRef.current = 'unavailable';
      setLocationStatus('unavailable');
      return null;
    }
  }, [route?.params?.focusItemId, route?.params?.targetCoords]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await itemsService.listItemsWithPhotosAndOwner({ resolved: false });

      // Resolve coordenadas de forma resiliente para todos os animais cadastrados
      const resolvedList = await Promise.all(
        (data || []).map(async (rawItem) => {
          const coords = await geocodeItemLocation(rawItem);
          if (coords) {
            return {
              ...rawItem,
              latitude: coords.latitude,
              longitude: coords.longitude,
            };
          }
          return null;
        })
      );

      // Apenas animais na rua aparecem no mapa (vistos na rua 'spotted' ou perdidos 'lost')
      const streetItems = resolvedList.filter((item) => {
        if (!item) return false;
        const isSpotted = item.extra_fields?.found_custody === 'spotted';
        const isLost = item.status === 'lost';
        return isSpotted || isLost;
      });
      // Contagem e último local visto vêm da tabela de avistamentos
      const validItems = await sightingsService.attachSightingSummaries(streetItems);
      setItems(validItems);

      // Se o usuário ainda não concedeu GPS, centraliza no primeiro animal encontrado ou região padrão
      if (validItems.length > 0 && locationStatusRef.current !== 'granted') {
        const first = validItems[0];
        setRegion({
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        });
      }
      return validItems;
    } catch (e) {
      console.warn('[MapScreen] Erro ao carregar itens para o mapa:', e?.message || e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCenterOnUser = async () => {
    setCenteringLoading(true);
    try {
      // 1. Se já temos coordenadas em memória, aproxima IMEDIATAMENTE com zoom de rua (0ms)
      if (userCoords?.latitude && userCoords?.longitude && mapRef.current) {
        const lat = Number(userCoords.latitude);
        const lng = Number(userCoords.longitude);
        mapRef.current.animateCamera({
          center: { latitude: lat, longitude: lng },
          zoom: 16.5,
        }, { duration: 500 });
        mapRef.current.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        }, 500);
      }

      // 2. Verifica / solicita permissão de localização
      const { status } = await Location.getForegroundPermissionsAsync();
      let hasPermission = status === 'granted';

      if (!hasPermission) {
        const req = await Location.requestForegroundPermissionsAsync();
        hasPermission = req.status === 'granted';
      }

      if (!hasPermission) {
        setLocationStatus('denied');
        locationStatusRef.current = 'denied';

        // Tenta fallback para localização salva no app
        const stored = await AsyncStorage.getItem('@wefind/saved_location');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.latitude && parsed?.longitude && mapRef.current) {
              const lat = Number(parsed.latitude);
              const lng = Number(parsed.longitude);
              setUserCoords({ latitude: lat, longitude: lng });
              mapRef.current.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: 16.5 }, { duration: 500 });
              mapRef.current.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);
              return;
            }
          } catch {}
        }

        Alert.alert(
          'Permissão de localização',
          'Ative a permissão de localização nas configurações do seu celular para centralizar o mapa na sua posição atual.'
        );
        return;
      }

      // 3. Tenta obter a última localização conhecida instantaneamente
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        const lastCoords = {
          latitude: Number(lastKnown.coords.latitude),
          longitude: Number(lastKnown.coords.longitude),
        };
        setUserCoords(lastCoords);
        if (mapRef.current) {
          mapRef.current.animateCamera({ center: lastCoords, zoom: 16.5 }, { duration: 500 });
          mapRef.current.animateToRegion({
            ...lastCoords,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }, 500);
        }
      }

      // 4. Busca a posição em tempo real com alta precisão com timeout de segurança
      const currentPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));

      const current = await Promise.race([currentPromise, timeoutPromise]).catch(() => null);

      if (current?.coords) {
        const liveCoords = {
          latitude: Number(current.coords.latitude),
          longitude: Number(current.coords.longitude),
        };
        setUserCoords(liveCoords);
        setLocationStatus('granted');
        locationStatusRef.current = 'granted';
        if (mapRef.current) {
          mapRef.current.animateCamera({ center: liveCoords, zoom: 16.5 }, { duration: 500 });
          mapRef.current.animateToRegion({
            ...liveCoords,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }, 500);
        }
      }
    } catch (error) {
      console.warn('[MapScreen] Não foi possível recentralizar no usuário:', error?.message || error);
      // Se não conseguiu nova coordenada mas tem a anterior, centraliza na anterior
      if (userCoords?.latitude && userCoords?.longitude && mapRef.current) {
        const lat = Number(userCoords.latitude);
        const lng = Number(userCoords.longitude);
        mapRef.current.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: 16.5 }, { duration: 500 });
        mapRef.current.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        }, 500);
      } else {
        Alert.alert(
          'GPS indisponível',
          'Verifique se a localização (GPS) do seu celular está ativada e tente novamente.'
        );
      }
    } finally {
      setCenteringLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      requestUserLocation(true);
      loadItems();
    }, [loadItems, requestUserLocation])
  );

  if (locationStatus === 'checking' && !userCoords) {
    return (
      <View style={styles.permissionState}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.permissionTitle}>Obtendo sua localização</Text>
        <Text style={styles.permissionText}>Precisamos dela para abrir o mapa perto de você.</Text>
      </View>
    );
  }

  const isAdoption = itemsService.isPetAvailableForAdoption(selectedItem);
  const isFound = !isAdoption && selectedItem?.status === 'found';
  const statusColor = isAdoption ? '#DB2777' : (isFound ? '#16A34A' : '#EA580C');
  const statusLabel = isAdoption ? 'Para Adoção' : (isFound ? 'Encontrado' : 'Perdido');
  const activeReward = Array.isArray(selectedItem?.rewards)
    ? selectedItem.rewards.find(r => r?.status === 'active')
    : null;
  const selectedChips = buildSelectedChips(selectedItem);
  const selectedSpecies = String(selectedItem?.species || selectedItem?.extra_fields?.species || '').trim();
  const selectedDistanceKm = calculateDistanceKm(userCoords?.latitude, userCoords?.longitude, selectedItem?.latitude, selectedItem?.longitude);
  const selectedDateFormatted = formatItemDate(selectedItem?.date || selectedItem?.created_at);
  const ownerName = selectedItem?.profiles?.name || selectedItem?.owner_name || 'Tutor';
  const ownerAvatar = selectedItem?.profiles?.avatar_url || selectedItem?.owner_avatar || null;

  return (
    <View style={styles.container}>
      {/* Barra de Pesquisa Flutuante de Animais (some com o card recolhido: tela limpa) */}
      {!cardCollapsed && (
      <View style={[styles.searchContainer, { top: Math.max(insets.top + 8, 44) }]}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color={COLORS.primary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Nome, raça, espécie ou cidade..."
            placeholderTextColor="#94A3B8"
            value={searchTerm}
            onChangeText={setSearchTerm}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchTerm.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearSearchBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          ) : (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredItems.length}</Text>
            </View>
          )}
        </View>

        {/* Pill Informativo: Apenas pets nas ruas */}
        <TouchableOpacity
          style={styles.streetNoticePill}
          onPress={() => setShowMapInfoModal(true)}
          activeOpacity={0.85}
        >
          <View style={styles.streetNoticeIconCircle}>
            <MaterialIcons name="pets" size={12} color={COLORS.primary} />
          </View>
          <Text style={styles.streetNoticeText} numberOfLines={1}>
            Apenas pets na rua (perdidos e avistamentos)
          </Text>
          <View style={styles.streetNoticeInfoBadge}>
            <MaterialIcons name="info-outline" size={13} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* Feedback visual caso nenhum animal seja encontrado */}
        {searchTerm.trim().length > 0 && filteredItems.length === 0 && (
          <View style={styles.noResultsBox}>
            <MaterialIcons name="info-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
            <Text style={styles.noResultsText}>
              Nenhum animal encontrado para "{searchTerm}"
            </Text>
          </View>
        )}
      </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={BRAZIL_REGION}
        showsUserLocation={locationStatus === 'granted'}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsCompass={true}
        mapPadding={{
          top: cardCollapsed ? Math.max(insets.top + 110, 140) : Math.max(insets.top + 68, 104),
          right: 12,
          bottom: isCardVisible ? 370 : 110,
          left: 12,
        }}
        customMapStyle={PETS_ONLY_MAP_STYLE}
        // Mexeu no mapa durante a navegação: para de seguir até recentralizar
        onPanDrag={() => {
          if (isNavigating && followUser) setFollowUser(false);
        }}
      >
        {/* Área de busca da pista (nunca o ponto exato) */}
        {selectedRouteStatus.area && !historyMode && (
          <Circle
            center={{ latitude: selectedRouteStatus.area.latitude, longitude: selectedRouteStatus.area.longitude }}
            radius={selectedRouteStatus.area.radiusM}
            strokeColor={ROUTE_TONE_COLORS[selectedRouteStatus.freshness]?.stroke || '#94A3B8'}
            fillColor={ROUTE_TONE_COLORS[selectedRouteStatus.freshness]?.fill || 'rgba(148, 163, 184, 0.15)'}
            strokeWidth={2}
          />
        )}

        {/* Rota até a área no meio de transporte escolhido */}
        {/* (no ônibus, um trecho por perna: a pé tracejado, linhas na cor da linha) */}
        {isRouteActive && routeSegments.map((segment) => (
          <Polyline
            key={segment.key}
            coordinates={segment.coordinates.filter(c => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude))}
            strokeColor={segment.color}
            strokeWidth={5}
            lineDashPattern={segment.dashed ? [8, 8] : undefined}
          />
        ))}

        {/* Histórico: um círculo por avistamento (mais antigos mais apagados) */}
        {historyMode && historyAreas.map((area, index) => {
          const tone = ROUTE_TONE_COLORS[area.freshness] || ROUTE_TONE_COLORS.cold;
          return (
            <Circle
              key={`history-circle-${area.id}`}
              center={{ latitude: area.latitude, longitude: area.longitude }}
              radius={area.radiusM}
              strokeColor={tone.stroke}
              fillColor={tone.fill}
              strokeWidth={index === 0 ? 2 : 1}
            />
          );
        })}
        {historyMode && historyAreas.map((area, index) => (
          <SightingHistoryMarker key={`history-marker-${area.id}`} area={area} index={index} />
        ))}

        {filteredItems
          .filter(item => {
            const lat = Number(item.latitude);
            const lng = Number(item.longitude);
            return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
          })
          // Com o card recolhido (rota ou histórico), só o animal selecionado fica no mapa
          .filter(item => !cardCollapsed || item.id === selectedItem?.id)
          .map((item) => (
            <PetMapMarker
              key={String(item.id)}
              item={item}
              isSelected={selectedItem?.id === item.id}
              onPress={() => (cardCollapsed && item.id === selectedItem?.id ? setCardCollapsed(false) : handleSelectItem(item))}
              onCalloutPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
            />
          ))}
      </MapView>

      {/* Resumo da rota: tempo, distância, meio de transporte, Iniciar e Google Maps */}
      {isRouteActive && routeInfo && (() => {
        const travelMode = getRouteMode(routeInfo.travelKey || routeInfo.modeKey);
        const transit = routeInfo.transit;
        const durationMin = (isNavigating && navProgress?.durationMin) || routeInfo.durationMin;
        const distanceText = (isNavigating && navProgress?.distanceText) || routeInfo.distanceText;
        const subtitle = routeInfo.note
          || (transit ? [transit.departureText, transit.arrivalText].filter(Boolean).join(' · ') : '')
          || (routeInfo.approximate ? 'Distância em linha reta até a área' : `Até a área onde ${selectedItem?.title || 'o pet'} foi visto`);
        return (
          <View style={[styles.activeRouteBanner, { top: cardCollapsed ? Math.max(insets.top + 8, 44) : Math.max(insets.top + 64, 100) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={styles.routeBannerIcon}>
                  {loadingRoute ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialIcons name={isNavigating ? 'navigation' : (transit ? getRouteMode('transit').icon : travelMode.icon)} size={19} color="#FFFFFF" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }} numberOfLines={1}>
                    {routeInfo.approximate ? '~' : ''}{durationMin} min {transit ? 'de ônibus' : travelMode.shortLabel}
                    {distanceText ? ` · ${distanceText}` : ''}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: routeInfo.note ? '#B45309' : '#64748B' }} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isNavigating ? (
                  <TouchableOpacity
                    onPress={stopNavigation}
                    style={[styles.routeBannerMapsBtn, { backgroundColor: '#DC2626' }]}
                    activeOpacity={0.85}
                    accessibilityLabel="Encerrar navegação"
                  >
                    <MaterialIcons name="stop" size={15} color="#FFFFFF" style={{ marginRight: 2 }} />
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11.5 }}>Encerrar</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={startNavigation}
                      disabled={loadingRoute}
                      style={styles.routeBannerMapsBtn}
                      activeOpacity={0.85}
                      accessibilityLabel="Iniciar a rota acompanhando sua localização"
                    >
                      <MaterialIcons name="play-arrow" size={16} color="#FFFFFF" style={{ marginRight: 1 }} />
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11.5 }}>Iniciar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openInGoogleMaps(selectedItem, routeInfo.modeKey)}
                      style={styles.routeBannerIconBtn}
                      accessibilityLabel="Abrir no Google Maps"
                    >
                      <MaterialIcons name="open-in-new" size={16} color="#475569" />
                    </TouchableOpacity>
                    {cardCollapsed && (
                      <TouchableOpacity
                        onPress={() => setCardCollapsed(false)}
                        style={styles.routeBannerIconBtn}
                        accessibilityLabel="Mostrar o card do animal"
                      >
                        <MaterialIcons name="expand-less" size={18} color="#475569" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        clearRoute();
                        setCardCollapsed(false);
                      }}
                      style={styles.routeBannerIconBtn}
                      accessibilityLabel="Encerrar rota"
                    >
                      <MaterialIcons name="close" size={16} color="#64748B" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {/* Ônibus: pernas do trajeto (a pé › linha › a pé) */}
            {transit?.legs?.length > 0 && (
              <View style={styles.transitLegsRow}>
                {transit.legs.map((leg, index) => (
                  <View key={`leg-${index}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {index > 0 && <MaterialIcons name="chevron-right" size={14} color="#CBD5E1" />}
                    {leg.mode === 'WALK' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name={leg.icon} size={14} color="#64748B" />
                        <Text style={styles.transitWalkText}>{leg.label}</Text>
                      </View>
                    ) : (
                      <View style={[styles.transitLineBadge, { backgroundColor: leg.color }]}>
                        <MaterialIcons name={leg.icon} size={12} color="#FFFFFF" style={{ marginRight: 2 }} />
                        <Text style={styles.transitLineText} numberOfLines={1}>{leg.label}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Meio de transporte: recalcula a rota e o tempo (escondido navegando, tela limpa) */}
            {!isNavigating && (
              <View style={styles.routeModeRow}>
                {ROUTE_MODE_ORDER.map((key) => {
                  const mode = ROUTE_MODES[key];
                  const active = routeInfo.modeKey === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleChangeRouteMode(key)}
                      disabled={active || loadingRoute}
                      style={[styles.routeModeChip, active && styles.routeModeChipActive]}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Rota ${mode.shortLabel}`}
                    >
                      <MaterialIcons name={mode.icon} size={15} color={active ? '#FFFFFF' : '#475569'} />
                      <Text style={[styles.routeModeChipText, active && { color: '#FFFFFF' }]}>{mode.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })()}

      {/* Histórico de avistamentos: faixa discreta no topo para voltar ao card ou sair */}
      {historyMode && selectedItem && (
        <View style={[styles.activeRouteBanner, { top: cardCollapsed ? Math.max(insets.top + 8, 44) : Math.max(insets.top + 64, 100) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <View style={[styles.routeBannerIcon, { backgroundColor: '#D97706' }]}>
                <MaterialIcons name="history" size={19} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }} numberOfLines={1}>
                  {historyAreas.length === 1 ? '1 avistamento' : `${historyAreas.length} avistamentos`} · {selectedItem.title || 'Animal'}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }} numberOfLines={1}>
                  Áreas aproximadas · 1 é o mais recente
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {cardCollapsed && (
                <TouchableOpacity
                  onPress={() => setCardCollapsed(false)}
                  style={styles.routeBannerIconBtn}
                  accessibilityLabel="Mostrar o card do animal"
                >
                  <MaterialIcons name="expand-less" size={18} color="#475569" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={exitSightingHistory}
                style={styles.routeBannerIconBtn}
                accessibilityLabel="Sair do histórico de avistamentos"
              >
                <MaterialIcons name="close" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Lista mínima do histórico: tempo e quem publicou; toque centraliza o círculo */}
      {historyMode && cardCollapsed && historyAreas.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.historyStrip, { bottom: Math.max(insets.bottom + 12, 18) }]}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {historyAreas.map((area, index) => {
            const tone = ROUTE_TONE_COLORS[area.freshness] || ROUTE_TONE_COLORS.cold;
            return (
              <TouchableOpacity
                key={`history-chip-${area.id}`}
                style={styles.historyChip}
                activeOpacity={0.85}
                onPress={() => mapRef.current?.animateToRegion({
                  latitude: area.latitude,
                  longitude: area.longitude,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }, 500)}
              >
                <View style={[styles.historyChipDot, { backgroundColor: tone.stroke }]}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{index + 1}</Text>
                </View>
                <View>
                  <Text style={styles.historyChipTitle}>{formatClueAge(area.ageHours)}</Text>
                  <Text style={styles.historyChipText} numberOfLines={1}>
                    {area.userName}{area.isPrivate ? ' · em casa' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Overlay escurecido animado sobre o mapa quando o card está aberto */}
      <Animated.View
        pointerEvents={isCardVisible ? 'auto' : 'none'}
        style={[styles.mapDimOverlay, { opacity: overlayOpacity }]}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={dismissCard}
        />
      </Animated.View>

      {isCardVisible && (
        <View
          style={styles.infoCard}
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height;
            if (h) setCardHeight(h);
          }}
        >
          <TouchableOpacity style={styles.infoClose} onPress={dismissCard} activeOpacity={0.7}>
            <MaterialIcons name="close" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* 1. Header do Tutor + Data + Distância */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingRight: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              {ownerAvatar ? (
                <Image
                  source={{ uri: ownerAvatar }}
                  style={{ width: 26, height: 26, borderRadius: 13, marginRight: 7, backgroundColor: '#E2E8F0' }}
                />
              ) : (
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11 }}>
                    {ownerName[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1E293B' }} numberOfLines={1}>
                {ownerName}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {selectedDistanceKm != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : COLORS.primaryLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <MaterialIcons name="near-me" size={11} color={colors.primary} style={{ marginRight: 2 }} />
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primaryDark }}>
                    {selectedDistanceKm < 1 ? '< 1 km' : `${selectedDistanceKm < 10 ? selectedDistanceKm.toFixed(1) : Math.round(selectedDistanceKm)} km`}
                  </Text>
                </View>
              )}
              {selectedDateFormatted ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="event" size={12} color="#94A3B8" style={{ marginRight: 2 }} />
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                    {selectedDateFormatted}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* 2. Foto + Título + Badges de Status, Espécie e Custódia */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
            {selectedItem.item_photos?.[0]?.url ? (
              <Image
                source={{ uri: selectedItem.item_photos[0].url }}
                style={{ width: 72, height: 72, borderRadius: 14, marginRight: 12, backgroundColor: '#E2E8F0' }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ width: 72, height: 72, borderRadius: 14, marginRight: 12, backgroundColor: statusColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="pets" size={30} color={statusColor} />
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle} numberOfLines={1}>
                {selectedItem.title || 'Animal'}
              </Text>

              {/* Badges Flutuantes */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {/* Status */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: statusColor + '18',
                  borderColor: statusColor + '40',
                  borderWidth: 1,
                  borderRadius: 7,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}>
                  <Text style={{ color: statusColor, fontWeight: '800', fontSize: 10.5 }}>
                    {statusLabel}
                  </Text>
                </View>

                {/* Espécie */}
                {selectedSpecies ? (
                  <View style={{
                    backgroundColor: '#F1F5F9',
                    borderRadius: 7,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}>
                    <Text style={{ color: '#475569', fontWeight: '700', fontSize: 10.5 }}>
                      {selectedSpecies}
                    </Text>
                  </View>
                ) : null}

                {/* Status na Rua: Perdido ou Visto na Rua */}
                {selectedItem.status === 'lost' && (
                  <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 10.5 }}>Perdido na rua</Text>
                  </View>
                )}

                {/* Custódia (se encontrado e não for adoção) */}
                {!isAdoption && selectedItem.status === 'found' && (
                  selectedItem.extra_fields?.found_custody === 'spotted' ? (
                    <View style={{ backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#B45309', fontWeight: '700', fontSize: 10.5 }}>Visto na rua</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#DCFCE7', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 10.5 }}>Em lar temporário</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          </View>

          {/* 3. Descrição Curta (se houver) */}
          {selectedItem.description?.trim() ? (
            <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 16.5, marginBottom: 8 }} numberOfLines={2}>
              {selectedItem.description.trim()}
            </Text>
          ) : null}

          {/* 4. Chips de Atributos Minimalistas com Emojis e Bolinha de Cor */}
          {selectedChips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {selectedChips.map((chip) => {
                if (chip.isColor) {
                  return (
                    <View
                      key={chip.key}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 7,
                        paddingHorizontal: 7,
                        paddingVertical: 2.5,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: chip.colorHex,
                          marginRight: 4,
                          borderWidth: chip.colorHex === '#FFFFFF' ? 1 : 0.5,
                          borderColor: '#94A3B8',
                        }}
                      />
                      <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>
                        {chip.text}
                      </Text>
                    </View>
                  );
                }

                if (chip.isCollar) {
                  return (
                    <View
                      key={chip.key}
                      style={{
                        backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : COLORS.primaryLight,
                        borderRadius: 7,
                        paddingHorizontal: 7,
                        paddingVertical: 2.5,
                        borderWidth: 1,
                        borderColor: isDark ? colors.primary : COLORS.primaryBorder,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.primaryDark, fontWeight: '600' }}>
                        {chip.text}
                      </Text>
                    </View>
                  );
                }

                if (chip.isNeutered) {
                  return (
                    <View
                      key={chip.key}
                      style={{
                        backgroundColor: '#ECFDF5',
                        borderRadius: 7,
                        paddingHorizontal: 7,
                        paddingVertical: 2.5,
                        borderWidth: 1,
                        borderColor: '#A7F3D0',
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#1E3E24', fontWeight: '600' }}>
                        {chip.text}
                      </Text>
                    </View>
                  );
                }

                if (chip.isTrait) {
                  return (
                    <View
                      key={chip.key}
                      style={{
                        backgroundColor: '#FDF2F8',
                        borderRadius: 7,
                        paddingHorizontal: 7,
                        paddingVertical: 2.5,
                        borderWidth: 1,
                        borderColor: '#FBCFE8',
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#BE185D', fontWeight: '700' }}>
                        {chip.text}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View
                    key={chip.key}
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: 7,
                      paddingHorizontal: 7,
                      paddingVertical: 2.5,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>
                      {chip.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* 5. Banner de Recompensa (se houver) */}
          {activeReward && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FEF3C7',
              borderColor: '#FCD34D',
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              marginBottom: 8,
            }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#B45309' }}>
                {activeReward.amount ? `Recompensa: R$ ${parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Recompensa oferecida'}
                {activeReward.description ? ` • ${activeReward.description}` : ''}
              </Text>
            </View>
          )}

          {/* Banner de Último Avistamento (se houver) */}
          {Boolean(selectedItem.extra_fields?.sighting_count > 0 || selectedItem.extra_fields?.last_sighting_at) && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FEF3C7',
              borderColor: '#FDE68A',
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4.5,
              marginBottom: 8,
            }}>
              <MaterialIcons name="visibility" size={14} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#B45309', flex: 1 }}>
                {selectedItem.extra_fields?.sighting_count > 1
                  ? `${selectedItem.extra_fields.sighting_count} avistamentos registrados`
                  : 'Avistado recentemente neste local'}
              </Text>
            </View>
          )}

          {/* 6. Endereço Completo do Animal Visto na Rua */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: COLORS.primaryLight,
            padding: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: COLORS.primaryBorder,
            marginBottom: 8,
          }}>
            <MaterialIcons name="place" size={17} color={COLORS.primary} style={{ marginRight: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1 }}>
                Endereço do animal visto na rua
              </Text>
              <Text style={{ fontSize: 12, color: '#1E293B', fontWeight: '700' }} numberOfLines={2}>
                {resolvedItemAddress || formatItemFullAddress(selectedItem)}
              </Text>
            </View>
          </View>

          {/* Situação da pista: explica quando há rota e quando não há */}
          {selectedRouteDescription && (
            <View style={[styles.clueCard, { backgroundColor: ROUTE_TONE_COLORS[selectedRouteDescription.tone]?.bg, borderColor: ROUTE_TONE_COLORS[selectedRouteDescription.tone]?.border }]}>
              <MaterialIcons
                name={ROUTE_TONE_COLORS[selectedRouteDescription.tone]?.icon || 'info-outline'}
                size={16}
                color={ROUTE_TONE_COLORS[selectedRouteDescription.tone]?.text}
                style={{ marginRight: 6, marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.clueTitle, { color: ROUTE_TONE_COLORS[selectedRouteDescription.tone]?.text }]}>
                  {selectedRouteDescription.title}
                </Text>
                <Text style={styles.clueText}>{selectedRouteDescription.text}</Text>
              </View>
            </View>
          )}

          {/* Meio de transporte da rota (o tempo é recalculado na escolha) */}
          {selectedItemCanHaveRoute && (
            <View style={[styles.routeModeRow, { marginTop: 0, marginBottom: 8 }]}>
              {ROUTE_MODE_ORDER.map((key) => {
                const mode = ROUTE_MODES[key];
                const active = routeMode === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => handleChangeRouteMode(key)}
                    disabled={loadingRoute}
                    style={[styles.routeModeChip, active && styles.routeModeChipActive]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Rota ${mode.shortLabel}`}
                  >
                    <MaterialIcons name={mode.icon} size={15} color={active ? '#FFFFFF' : '#475569'} />
                    <Text style={[styles.routeModeChipText, active && { color: '#FFFFFF' }]}>{mode.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Histórico: círculos dos avistamentos anteriores no mapa */}
          {historyAreas.length > 0 && (
            <TouchableOpacity
              style={styles.historyButton}
              onPress={showSightingHistory}
              activeOpacity={0.85}
              accessibilityLabel="Ver histórico de avistamentos no mapa"
            >
              <MaterialIcons name="history" size={16} color="#B45309" style={{ marginRight: 5 }} />
              <Text style={styles.historyButtonText}>
                Ver histórico de avistamentos ({historyAreas.length})
              </Text>
            </TouchableOpacity>
          )}

          {/* 7. Ações: Ver Detalhes, Informar Avistamento e Rota */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              style={[styles.detailsButton, { flex: 1, marginTop: 0, paddingVertical: 10 }]}
              onPress={() => navigation.navigate('ItemDetail', { itemId: selectedItem.id })}
              activeOpacity={0.85}
            >
              <Text style={[styles.detailsButtonText, { fontSize: 12.5 }]}>Detalhes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FEF3C7',
                borderColor: '#FDE68A',
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
              onPress={() => handleOpenSightingModal(selectedItem)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="add-location-alt" size={16} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>
                Vi o pet
              </Text>
            </TouchableOpacity>

            {selectedItemCanHaveRoute && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: COLORS.primary,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
                // Rota já traçada: só recolhe o card de novo para mostrar o mapa
                onPress={() => (isRouteActive ? setCardCollapsed(true) : showRoutePreview(selectedItem))}
                disabled={loadingRoute}
                activeOpacity={0.85}
              >
                {loadingRoute ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 4 }} />
                ) : (
                  <MaterialIcons name={isRouteActive ? 'map' : getRouteMode(routeMode).icon} size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                )}
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                  {isRouteActive ? 'Ver rota' : 'Traçar rota'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Botão de Centralizar / Marco Zero na Localização do Usuário */}
      <TouchableOpacity
        style={[
          styles.centerLocationButton,
          {
            bottom: isCardVisible
              ? (cardHeight ? cardHeight + 36 : 420)
              : (historyMode ? Math.max(insets.bottom + 12, 18) + 66 : Math.max(insets.bottom + 20, 28)),
          },
        ]}
        onPress={isNavigating ? resumeFollowingUser : handleCenterOnUser}
        disabled={centeringLoading}
        activeOpacity={0.8}
        accessibilityLabel={isNavigating ? 'Voltar a seguir minha posição' : 'Centralizar na minha localização'}
      >
        {centeringLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <MaterialIcons name={isNavigating && !followUser ? 'navigation' : 'my-location'} size={24} color={COLORS.primary} />
        )}
      </TouchableOpacity>

      {locationStatus !== 'granted' && (
        <View style={styles.locationNotice}>
          <Text style={styles.locationNoticeText}>
            {locationStatus === 'denied'
              ? 'Permita o acesso à localização para abrir o mapa perto de você.'
              : 'Não foi possível obter sua localização. Você pode navegar pelo mapa manualmente.'}
          </Text>
          <TouchableOpacity onPress={requestUserLocation} style={styles.retryButton}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && items.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <MaterialIcons name="location-off" size={26} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum pet na rua nesta região</Text>
          <Text style={styles.emptyText}>
            No mapa interativo são exibidos apenas animais perdidos ou avistados soltos em vias públicas.
          </Text>
          <TouchableOpacity
            style={styles.emptyFeedButton}
            onPress={() => navigation.navigate('HomeTab')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="grid-view" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.emptyFeedButtonText}>Ver todos os pets no feed</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && (
        <View style={styles.loadingState}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Carregando animais no mapa...</Text>
        </View>
      )}

      {/* Modal Explicativo: Por que apenas pets na rua aparecem no mapa? */}
      <Modal
        visible={showMapInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMapInfoModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMapInfoModal(false)}
        >
          <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderIconBox}>
                <MaterialIcons name="map" size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>Mapa do WeFIND</Text>
                <Text style={styles.modalHeaderSubtitle}>Foco em buscas ativas e resgates</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowMapInfoModal(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.infoRowItem}>
                <View style={[styles.infoRowIcon, { backgroundColor: '#FEF2F2' }]}>
                  <MaterialIcons name="place" size={18} color="#B91C1C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowTitle}>Apenas pets na rua</Text>
                  <Text style={styles.infoRowDesc}>
                    O mapa exibe exclusivamente animais desaparecidos e avistamentos de pets soltos nas ruas, agilizando rotas de socorro e buscas em tempo real.
                  </Text>
                </View>
              </View>

              <View style={styles.infoRowItem}>
                <View style={[styles.infoRowIcon, { backgroundColor: '#DCFCE7' }]}>
                  <MaterialIcons name="home" size={18} color="#15803D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowTitle}>Privacidade dos lares temporários</Text>
                  <Text style={styles.infoRowDesc}>
                    Animais já resgatados e acolhidos em lares temporários não têm seu endereço residencial divulgado no mapa para segurança de todos.
                  </Text>
                </View>
              </View>

              <View style={styles.infoRowItem}>
                <View style={[styles.infoRowIcon, { backgroundColor: COLORS.primaryLight }]}>
                  <MaterialIcons name="list" size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowTitle}>Lista completa no Início</Text>
                  <Text style={styles.infoRowDesc}>
                    Para ver a lista completa de todos os pets cadastrados (inclusive os acolhidos e para adoção), acesse a aba Início.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={() => setShowMapInfoModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalConfirmBtnText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal de Registro de Novo Avistamento com Atualização de Localização */}
      <SightingModal
        visible={sightingModalVisible}
        onClose={() => setSightingModalVisible(false)}
        onSubmit={handleSubmitSighting}
        loading={submittingSighting}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E5E7EB' },
  map: { flex: 1 },
  mapDimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    zIndex: 5,
  },
  searchContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  clearSearchBtn: {
    padding: 4,
    marginLeft: 4,
  },
  countBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    marginLeft: 4,
  },
  countBadgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  noResultsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  noResultsText: {
    color: '#991B1B',
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  clueCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 8,
  },
  clueTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  clueText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
    marginTop: 1,
  },
  activeRouteBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 50,
  },
  routeBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  routeBannerMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
  },
  routeBannerIconBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  transitLegsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 4,
    marginTop: 8,
  },
  transitWalkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 1,
  },
  transitLineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 140,
  },
  transitLineText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  routeModeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  routeModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  routeModeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  routeModeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    marginBottom: 6,
  },
  historyButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  historyStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
  },
  historyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 210,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  historyChipDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyChipTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  historyChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    maxWidth: 160,
  },
  centerLocationButton: {
    position: 'absolute',
    right: 16,
    bottom: 30,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 999,
  },
  centerLocationButtonRaised: {
    bottom: 420,
  },
  permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F9FAFB' },
  permissionTitle: { color: '#111827', fontSize: 18, fontWeight: '700', marginTop: 14 },
  permissionText: { color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  locationNotice: { position: 'absolute', left: 16, right: 16, bottom: 22, padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  locationNoticeText: { color: '#374151', lineHeight: 19 },
  retryButton: { alignSelf: 'flex-start', marginTop: 8 },
  retryText: { color: COLORS.primary, fontWeight: '700' },
  markerFallback: { fontSize: 22 },
  infoCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 10,
  },
  infoClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    zIndex: 10,
  },
  infoTitle: { color: '#0F172A', fontSize: 16.5, fontWeight: '800' },
  infoStatus: { fontWeight: '700', marginTop: 4 },
  infoLocation: { color: '#475569', marginTop: 7 },
  infoDescription: { color: '#64748B', marginTop: 6, lineHeight: 18 },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  detailsButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 },
  callout: { width: 190, padding: 4 },
  calloutTitle: { color: '#111827', fontWeight: '700', fontSize: 15 },
  calloutStatus: { color: COLORS.primary, marginTop: 3 },
  calloutAction: { color: '#6B7280', fontSize: 12, marginTop: 6 },
  emptyState: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#64748B', textAlign: 'center', marginTop: 4, fontSize: 12.5, lineHeight: 17 },
  emptyFeedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyFeedButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  streetNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  streetNoticeIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  streetNoticeText: {
    color: COLORS.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  streetNoticeInfoBadge: {
    marginLeft: 6,
    padding: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalBody: {
    gap: 14,
    marginBottom: 18,
  },
  infoRowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  infoRowTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 2,
  },
  infoRowDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  modalConfirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  modalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  loadingState: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  loadingText: { color: '#374151', fontWeight: '600', fontSize: 13 },
});

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[MapScreen] Erro capturado no mapa nativo:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#F6F8F6', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#EAF2EB', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <MaterialIcons name="map" size={34} color={COLORS.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 8 }}>
            Mapa do WeFIND
          </Text>
          <Text style={{ fontSize: 13.5, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 300 }}>
            Para ativar o mapa no APK, certifique-se de configurar a chave da API do Google Maps ou consulte a lista no feed.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <MapScreen {...this.props} />;
  }
}

export default MapErrorBoundary;
