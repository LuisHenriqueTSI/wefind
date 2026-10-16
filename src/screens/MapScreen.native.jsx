import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Polyline } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as itemsService from '../services/items';
import * as sightingsService from '../services/sightings';
import SightingModal from '../components/SightingModal';
import PetMapMarker from '../components/PetMapMarker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';
import { canTraceRouteToItem, getPublicRouteTarget } from '../services/routeEligibility';
import {
  getPrivateLocationSummary,
  isResidentialAddressPrivate,
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
    return lastSighting.trim();
  }

  const directAddress = item.address || item.extra_fields?.address || item.extra_fields?.location_details?.fullAddressText;
  if (directAddress && typeof directAddress === 'string' && !directAddress.startsWith('{') && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(directAddress.trim())) {
    return directAddress.trim();
  }

  const street = item.street || item.extra_fields?.street || item.extra_fields?.location_details?.street || '';
  const number = item.house_number || item.number || item.extra_fields?.house_number || item.extra_fields?.location_details?.number || '';
  const neighborhood = item.neighborhood || item.extra_fields?.neighborhood || item.extra_fields?.location_details?.neighborhood || '';
  const city = item.city || item.extra_fields?.city || item.extra_fields?.location_details?.city || '';
  const state = item.state || item.extra_fields?.state || item.extra_fields?.location_details?.state || '';

  const parts = [];
  if (street) {
    parts.push(number ? `${street}, ${number}` : street);
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
    list.push({ key: 'breed', text: `🏷️ ${breed}` });
  }
  if (gender && gender !== 'Não informado') {
    list.push({
      key: 'gender',
      text: gender.toLowerCase().includes('f') ? '♀️ Fêmea' : '♂️ Macho',
    });
  }
  if (size && size !== 'Não informado') {
    list.push({ key: 'size', text: `📏 ${size.replace(/porte\s*/i, '')}` });
  }
  if (age && age !== 'Não informado') {
    list.push({
      key: 'age',
      text: age.toLowerCase().includes('filhote') ? '🍼 Filhote' : age.toLowerCase().includes('idoso') ? '👴 Idoso' : '🐕 Adulto',
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
    list.push({ key: 'collar', isCollar: true, text: '📿 Coleira' });
  }
  if (neutered) {
    list.push({ key: 'neutered', isNeutered: true, text: '✂️ Castrado' });
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
  const [isNavigating, setIsNavigating] = useState(false);
  const isNavigatingRef = useRef(false);
  const handledRouteParamRef = useRef(null);
  const [resolvedItemAddress, setResolvedItemAddress] = useState('');
  const selectedItemCanHaveRoute = canTraceRouteToItem(selectedItem);

  // Sighting Modal State
  const [sightingModalVisible, setSightingModalVisible] = useState(false);
  const [submittingSighting, setSubmittingSighting] = useState(false);
  const [targetSightingItem, setTargetSightingItem] = useState(null);
  const [selectedItemTrail, setSelectedItemTrail] = useState([]);
  const [cardHeight, setCardHeight] = useState(0);

  // Carrega o rastro de deslocamento do animal selecionado
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: selectedItem ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedItem, overlayOpacity]);

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

  // Auto-resolução do endereço completo do animal visto na rua
  useEffect(() => {
    if (!selectedItem) {
      setResolvedItemAddress('');
      return;
    }

    const staticAddr = formatItemFullAddress(selectedItem);
    setResolvedItemAddress(staticAddr);

    // Auto-resolução com número de rua APENAS se for animal avistado solto na via pública
    const routeTarget = getPublicRouteTarget(selectedItem);
    if (routeTarget) {
      const lat = routeTarget.latitude;
      const lng = routeTarget.longitude;

      if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
        sightingsService.resolveReadableAddress({ latitude: Number(lat), longitude: Number(lng) })
          .then((addr) => {
            if (addr && addr !== 'Localização marcada no mapa') {
              setResolvedItemAddress(addr);
            }
          })
          .catch(() => {});
      }
    }
  }, [selectedItem?.id, selectedItem?.latitude, selectedItem?.longitude, selectedItem?.status, selectedItem?.extra_fields?.found_custody]);

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

      const res = await sightingsService.recordSightingAndUpdateItemLocation({
        itemId: targetSightingItem.id,
        userId: user.id,
        location: form.coordinate || form.location_details || { address: form.location },
        description: form.description,
        contactInfo: form.contact_info,
        photoUrl,
      });

      setSightingModalVisible(false);
      Alert.alert('Avistamento Registrado! 🎯', 'A nova localização do pet foi atualizada no mapa e os voluntários e tutores foram avisados.');

      await loadItems();
      const newLat = res?.updatedLocation?.latitude ?? form.coordinate?.latitude;
      const newLng = res?.updatedLocation?.longitude ?? form.coordinate?.longitude;
      if (newLat && newLng) {
        const updatedItem = {
          ...targetSightingItem,
          latitude: Number(newLat),
          longitude: Number(newLng),
          address: res?.updatedLocation?.address || targetSightingItem.address,
        };
        setSelectedItem(updatedItem);
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
  const lastRouteCalcCoordRef = useRef(null);
  const lastRouteCalcTimeRef = useRef(0);

  const calculateRoute = useCallback(async (fromCoords, toCoords, autoFit = true) => {
    const fromLng = Number(fromCoords?.longitude);
    const fromLat = Number(fromCoords?.latitude);
    const toLng = Number(toCoords?.longitude);
    const toLat = Number(toCoords?.latitude);

    if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) return;

    setLoadingRoute(true);

    // Servidores de roteamento de alta disponibilidade (OSRM / OpenStreetMap)
    const endpoints = [
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`,
      `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`,
    ];

    let successData = null;

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WeFindApp/1.0 (React Native Mobile)',
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data?.routes?.[0]?.geometry?.coordinates && data.routes[0].geometry.coordinates.length > 1) {
            successData = data;
            break;
          }
        }
      } catch (err) {
        console.log(`[MapScreen] Aviso no servidor de rota (${url.split('/')[2]}):`, err?.message);
      }
    }

    if (successData?.routes?.[0]?.geometry?.coordinates) {
      const coords = successData.routes[0].geometry.coordinates.map(([lng, lat]) => ({
        latitude: Number(lat),
        longitude: Number(lng),
      }));

      setRouteCoordinates(coords);
      lastRouteCalcCoordRef.current = { latitude: fromLat, longitude: fromLng };
      lastRouteCalcTimeRef.current = Date.now();

      setRouteInfo({
        distanceKm: (successData.routes[0].distance / 1000).toFixed(1),
        durationMin: Math.max(1, Math.round(successData.routes[0].duration / 60)),
      });

      // Só ajusta visão geral se NÃO estiver no modo de navegação ativa
      if (autoFit && !isNavigatingRef.current && mapRef.current && coords.length > 0) {
        setTimeout(() => {
          if (!isNavigatingRef.current) {
            mapRef.current?.fitToCoordinates([{ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng }, ...coords], {
              edgePadding: { top: 140, right: 60, bottom: 440, left: 60 },
              animated: true,
            });
          }
        }, 300);
      }
    } else {
      console.log('[MapScreen] Servidores de rota indisponíveis no momento.');
    }

    setLoadingRoute(false);
  }, []);

  // Inicia a navegação aproximando a câmera do usuário automaticamente (estilo Google Maps)
  const startNavigation = useCallback(async (overrideCoords = null) => {
    isNavigatingRef.current = true;
    setIsNavigating(true);

    let coords = overrideCoords || userCoords;

    if (!coords) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (loc?.coords) {
          coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserCoords(coords);
        }
      } catch (e) {}
    }

    if (coords && mapRef.current) {
      let heading = 0;
      const routeTarget = getPublicRouteTarget(selectedItem);
      if (routeTarget) {
        const dLng = (routeTarget.longitude - coords.longitude) * (Math.PI / 180);
        const lat1 = coords.latitude * (Math.PI / 180);
        const lat2 = routeTarget.latitude * (Math.PI / 180);
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        heading = (Math.atan2(y, x) * 180) / Math.PI;
        if (heading < 0) heading += 360;
      }

      // Recentraliza e aproxima a câmera automaticamente na posição do usuário
      mapRef.current.animateToRegion({
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      }, 500);

      try {
        mapRef.current.animateCamera({
          center: {
            latitude: Number(coords.latitude),
            longitude: Number(coords.longitude),
          },
          pitch: 50,
          heading: Math.round(heading) || 0,
          zoom: 18,
        }, { duration: 600 });
      } catch (e) {}
    }
  }, [userCoords, selectedItem]);

  // Encerra o modo de navegação
  const stopNavigation = useCallback(() => {
    isNavigatingRef.current = false;
    setIsNavigating(false);
    setRouteCoordinates([]);
    setRouteInfo(null);
    if (mapRef.current && userCoords) {
      mapRef.current.animateToRegion({
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }, 600);
    }
  }, [userCoords]);

  const handleSelectItem = useCallback((item) => {
    setSelectedItem(item);
    isNavigatingRef.current = false;
    setIsNavigating(false);
    setRouteCoordinates([]);
    setRouteInfo(null);
  }, []);

  // Visão geral de toda a rota
  const fitRouteOverview = useCallback(() => {
    const routeTarget = getPublicRouteTarget(selectedItem);
    if (mapRef.current && userCoords && routeTarget) {
      mapRef.current.fitToCoordinates(
        [userCoords, routeTarget, ...routeCoordinates],
        {
          edgePadding: { top: 140, right: 60, bottom: isNavigating ? 260 : 440, left: 60 },
          animated: true,
        }
      );
    }
  }, [userCoords, selectedItem, routeCoordinates, isNavigating]);

  // Monitora a localização do usuário em tempo real quando uma rota estiver ativa
  useEffect(() => {
    const routeTarget = getPublicRouteTarget(selectedItem);
    const hasActiveRoute = (routeCoordinates.length > 0 || isNavigating) && routeTarget;
    if (hasActiveRoute && locationStatus === 'granted') {
      let isSubscribed = true;

      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2500,
          distanceInterval: 8, // Atualiza a cada 8 metros percorridos
        },
        (loc) => {
          if (!isSubscribed) return;
          const newCoord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserCoords(newCoord);

          // Se estiver navegando, acompanha a posição do usuário suavemente
          if (isNavigatingRef.current && mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: newCoord.latitude,
              longitude: newCoord.longitude,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            }, 600);
          }

          // Atualiza o traçado da rota e o tempo estimado de forma inteligente (a cada 25m ou 12s)
          const lastCoord = lastRouteCalcCoordRef.current;
          const timeSinceLast = Date.now() - (lastRouteCalcTimeRef.current || 0);

          let shouldRecalculate = false;
          if (!lastCoord || timeSinceLast > 12000) {
            shouldRecalculate = true;
          } else {
            const movedDistKm = sightingsService.calculateDistanceKm(lastCoord.latitude, lastCoord.longitude, newCoord.latitude, newCoord.longitude);
            if (movedDistKm != null && movedDistKm >= 0.025) { // 25 metros
              shouldRecalculate = true;
            }
          }

          if (shouldRecalculate) {
            calculateRoute(newCoord, {
              latitude: routeTarget.latitude,
              longitude: routeTarget.longitude,
            }, false);
          }
        }
      ).then((sub) => {
        locationSubRef.current = sub;
      }).catch((e) => console.log('[MapScreen] Erro no watchPosition:', e));

      return () => {
        isSubscribed = false;
        if (locationSubRef.current) {
          locationSubRef.current.remove();
          locationSubRef.current = null;
        }
      };
    } else {
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    }
  }, [routeCoordinates.length > 0, isNavigating, selectedItem?.id, locationStatus, calculateRoute]);

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

        if (showRoute && canTraceRouteToItem(target)) {
          (async () => {
            let current = userCoords;
            if (!current) {
              try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (loc?.coords) {
                  current = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                  };
                  setUserCoords(current);
                }
              } catch (e) {}
            }

            if (current) {
              calculateRoute(current, {
                latitude: getPublicRouteTarget(target).latitude,
                longitude: getPublicRouteTarget(target).longitude,
              }, true);
            } else {
              mapRef.current?.animateToRegion({
                latitude: Number(target.latitude),
                longitude: Number(target.longitude),
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }, 800);
            }
          })();
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
  }, [route?.params?.focusItemId, route?.params?.showRoute, items, calculateRoute, handleSelectItem]);

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
      const validItems = resolvedList.filter((item) => {
        if (!item) return false;
        const isSpotted = item.extra_fields?.found_custody === 'spotted';
        const isLost = item.status === 'lost';
        return isSpotted || isLost;
      });
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
    } catch (e) {
      console.warn('[MapScreen] Erro ao carregar itens para o mapa:', e?.message || e);
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
          'Permissão de Localização',
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
      {/* Barra de Pesquisa Flutuante de Animais */}
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
          top: Math.max(insets.top + 68, 104),
          right: 12,
          bottom: isNavigating ? 150 : (selectedItem ? 370 : 110),
          left: 12,
        }}
        customMapStyle={PETS_ONLY_MAP_STYLE}
      >
        {/* Traçado da Rota GPS */}
        {selectedItemCanHaveRoute && routeCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoordinates.filter(c => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude))}
              strokeColor="#1E3E24"
              strokeWidth={7}
            />
            <Polyline
              coordinates={routeCoordinates.filter(c => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude))}
              strokeColor={COLORS.primary}
              strokeWidth={4.5}
            />
          </>
        )}



        {filteredItems
          .filter(item => {
            const lat = Number(item.latitude);
            const lng = Number(item.longitude);
            return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
          })
          .map((item) => (
            <PetMapMarker
              key={String(item.id)}
              item={item}
              isSelected={selectedItem?.id === item.id}
              onPress={() => handleSelectItem(item)}
              onCalloutPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
            />
          ))}
      </MapView>

      {/* Banner Superior de Rota Ativa com botão Iniciar Navegação */}
      {routeInfo && !isNavigating && selectedItemCanHaveRoute && (
        <View style={[styles.activeRouteBanner, { top: Math.max(insets.top + 64, 100) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <MaterialIcons name="directions-car" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#1E293B' }} numberOfLines={1}>
                {routeInfo.distanceKm} km • ~{routeInfo.durationMin} min
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }} numberOfLines={1}>
                📍 {resolvedItemAddress || formatItemFullAddress(selectedItem)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => startNavigation()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#16A34A',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
              }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="navigation" size={15} color="#FFFFFF" style={{ marginRight: 3 }} />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11.5 }}>Iniciar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={stopNavigation}
              style={{ padding: 6, borderRadius: 10, backgroundColor: '#F1F5F9' }}
            >
              <MaterialIcons name="close" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Overlay escurecido animado sobre o mapa quando um item está selecionado */}
      <Animated.View
        pointerEvents={selectedItem ? 'auto' : 'none'}
        style={[styles.mapDimOverlay, { opacity: overlayOpacity }]}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        />
      </Animated.View>

      {selectedItem && !isNavigating && (
        <View
          style={styles.infoCard}
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height;
            if (h) setCardHeight(h);
          }}
        >
          <TouchableOpacity style={styles.infoClose} onPress={() => setSelectedItem(null)} activeOpacity={0.7}>
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
                <Text style={{ fontSize: 32 }}>🐾</Text>
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
                      🐾 {selectedSpecies}
                    </Text>
                  </View>
                ) : null}

                {/* Status na Rua: Perdido ou Visto na Rua */}
                {selectedItem.status === 'lost' && (
                  <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 10.5 }}>📍 Perdido na Rua</Text>
                  </View>
                )}

                {/* Custódia (se encontrado e não for adoção) */}
                {!isAdoption && selectedItem.status === 'found' && (
                  selectedItem.extra_fields?.found_custody === 'spotted' ? (
                    <View style={{ backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#B45309', fontWeight: '700', fontSize: 10.5 }}>👀 Visto na Rua</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#DCFCE7', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 10.5 }}>🏠 Em Lar Temp.</Text>
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
                🏆 {activeReward.amount ? `Recompensa: R$ ${parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Recompensa oferecida'}
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
                  ? `📍 ${selectedItem.extra_fields.sighting_count} avistamentos registrados pela comunidade`
                  : '📍 Avistado recentemente nesta localização'}
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
                Endereço do Animal Visto na Rua
              </Text>
              <Text style={{ fontSize: 12, color: '#1E293B', fontWeight: '700' }} numberOfLines={2}>
                {resolvedItemAddress || formatItemFullAddress(selectedItem)}
              </Text>
            </View>
          </View>

          {/* 7. Ações: Ver Detalhes, Informar Avistamento e Iniciar Rota com Aproximação Automática */}
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
                Vi o Pet
              </Text>
            </TouchableOpacity>

            {selectedItemCanHaveRoute && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: routeCoordinates.length > 0 ? '#16A34A' : COLORS.primary,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  shadowColor: routeCoordinates.length > 0 ? '#16A34A' : COLORS.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  elevation: 3,
                }}
                onPress={async () => {
                  let current = userCoords;
                  if (!current) {
                    current = await requestUserLocation();
                  }
                  if (current && getPublicRouteTarget(selectedItem)) {
                    // Se a rota ainda não foi calculada, calcula sem afastar a câmera e inicia navegação
                    if (routeCoordinates.length === 0) {
                      const routeTarget = getPublicRouteTarget(selectedItem);
                      if (!routeTarget) return;
                      await calculateRoute(current, {
                        latitude: routeTarget.latitude,
                        longitude: routeTarget.longitude,
                      }, false);
                    }
                    // Inicia navegação e recentraliza com aproximação direta na posição do usuário
                    startNavigation(current);
                  } else if (!current) {
                    Alert.alert('Localização necessária', 'Ative o GPS do seu dispositivo para iniciar a rota até o animal.');
                  }
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="navigation" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                  {isNavigating ? 'Navegando' : (routeCoordinates.length > 0 ? 'Iniciar' : 'Iniciar Rota')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* 8. HUD Flutuante de Navegação Ativa em Tempo Real (Estilo Google Maps) */}
      {isNavigating && selectedItemCanHaveRoute && (
        <View style={styles.navigationHudCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#16A34A' }}>
                  {routeInfo?.durationMin || 5} min
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B' }}>
                  ({routeInfo?.distanceKm || 1.2} km)
                </Text>
              </View>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1E293B', marginTop: 1 }} numberOfLines={1}>
                Indo até {selectedItem?.title || 'o animal'}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginTop: 2 }} numberOfLines={1}>
                📍 {resolvedItemAddress || formatItemFullAddress(selectedItem)}
              </Text>
            </View>

            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BBF7D0' }}>
              <MaterialIcons name="navigation" size={24} color="#16A34A" />
            </View>
          </View>

          {/* Botões de Ação da Navegação */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 12,
                paddingVertical: 10,
              }}
              onPress={() => startNavigation()}
              activeOpacity={0.75}
            >
              <MaterialIcons name="my-location" size={18} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.primaryDark }}>Recentralizar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 12,
                paddingVertical: 10,
              }}
              onPress={fitRouteOverview}
              activeOpacity={0.75}
            >
              <MaterialIcons name="map" size={18} color="#475569" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#334155' }}>Visão Geral</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FEF2F2',
                borderWidth: 1,
                borderColor: '#FECACA',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
              onPress={stopNavigation}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={18} color="#DC2626" style={{ marginRight: 3 }} />
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#DC2626' }}>Encerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Botão de Centralizar / Marco Zero na Localização do Usuário */}
      <TouchableOpacity
        style={[
          styles.centerLocationButton,
          {
            bottom: isNavigating
              ? 165
              : selectedItem
              ? (cardHeight ? cardHeight + 36 : 420)
              : Math.max(insets.bottom + 20, 28),
          },
        ]}
        onPress={handleCenterOnUser}
        disabled={centeringLoading}
        activeOpacity={0.8}
        accessibilityLabel="Centralizar na minha localização"
      >
        {centeringLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <MaterialIcons name="my-location" size={24} color={COLORS.primary} />
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
            <Text style={styles.emptyFeedButtonText}>Ver todos os pets no Feed</Text>
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
                <Text style={styles.modalHeaderTitle}>Mapa Interativo WeFIND</Text>
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
                  <Text style={{ fontSize: 16 }}>📍</Text>
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
                  <Text style={{ fontSize: 16 }}>🏠</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowTitle}>Privacidade e Lares Seguros</Text>
                  <Text style={styles.infoRowDesc}>
                    Animais já resgatados e acolhidos em lares temporários não têm seu endereço residencial divulgado no mapa para segurança de todos.
                  </Text>
                </View>
              </View>

              <View style={styles.infoRowItem}>
                <View style={[styles.infoRowIcon, { backgroundColor: COLORS.primaryLight }]}>
                  <Text style={{ fontSize: 16 }}>📋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowTitle}>Lista Completa no Feed</Text>
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
  navigationHudCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    zIndex: 60,
  },
  activeRouteBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
            Mapa Interativo WeFIND
          </Text>
          <Text style={{ fontSize: 13.5, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 300 }}>
            Para ativar o mapa no APK, certifique-se de configurar a chave da API do Google Maps ou consulte a lista no feed.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <MapScreen {...this.props} />;
  }
}

export default MapErrorBoundary;
