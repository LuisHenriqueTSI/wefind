import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Location from 'expo-location';
import { states, citiesByState, neighborhoodsByCity } from '../lib/br-locations';
import * as userService from '../services/user';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as itemsService from '../services/items';
import { supabase } from '../lib/supabase';
import { getUser } from '../services/user';
import { sendMessage } from '../services/messages';
import * as notificationsService from '../services/notifications';
import * as claimsService from '../services/itemClaims';
import Card from '../components/Card';
import ShareButton from '../components/ShareButton';
import COLORS from '../constants/theme';
// Get screen width for carousel
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_IMAGE_HEIGHT = 340; // altura intermediária para a foto do card
import Button from '../components/Button';
import Input from '../components/Input';
import NotificationBell from '../components/NotificationBell';
import OptimizedImage from '../components/OptimizedImage';
import PetFallbackImage from '../components/PetFallbackImage';
import MapLocationPicker from '../components/MapLocationPicker';
import { WeFindText, WeFindLogo } from '../components/WeFindBrand';
import { MaterialIcons } from '@expo/vector-icons';
import AdvancedFiltersModal from '../components/AdvancedFiltersModal';
import LoginPillButton from '../components/LoginPillButton';

// Cálculo de distância geográfica precisa em KM (Fórmula de Haversine)
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // Raio médio da Terra em km
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

// Geocodificação de Cidade e Estado para Coordenadas
const geocodeCityState = async (cityName, stateUf) => {
  try {
    if (!cityName || !stateUf) return null;
    const query = `${cityName}, ${stateUf}, Brasil`;
    const results = await Location.geocodeAsync(query);
    if (results && results.length > 0) {
      return {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };
    }
  } catch (err) {
    console.log('[HomeScreen] Erro no geocoding da cidade:', err?.message || err);
  }
  return null;
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

const normalizeRegionName = (value) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const normalizedRegionToUf = Object.fromEntries(Object.entries(regionToUf).map(([name, uf]) => [normalizeRegionName(name), uf]));

const formatItemDate = (value) => {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const formatCityState = (item) => {
  const city = (item?.city || item?.extra_fields?.location_details?.city || '').trim();
  const state = (item?.state || item?.extra_fields?.location_details?.state || '').trim();
  const parts = [city, state].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' - ');
  }
  return item?.neighborhood || item?.extra_fields?.location_details?.district || 'Localização não informada';
};

const formatStreetNumberNeighborhood = (item) => {
  const isLost = item?.status === 'lost';
  const isFoundHome = item?.status === 'found' && item?.extra_fields?.found_custody !== 'spotted';
  const isSpotted = item?.extra_fields?.found_custody === 'spotted';
  const details = item?.extra_fields?.location_details;
  const district = (details?.district || item?.neighborhood || '').trim();

  // 1. ANIMAL PERDIDO: Exibe como Região de Desaparecimento (Bairro / Referência sem número)
  if (isLost) {
    const reference = (details?.reference || details?.street || item?.street || '').trim();
    if (reference && district && reference !== district) {
      const cleanRef = reference.replace(/,\s*\d+.*$/, '').replace(/Nº\s*\d+/i, '').trim();
      return cleanRef ? `Região de ${district} • Próx. a ${cleanRef}` : `Região do Bairro ${district}`;
    }
    if (district) {
      return `Região do Bairro ${district}`;
    }
    return 'Região de Desaparecimento';
  }

  // 2. ANIMAL ACOLHIDO EM LAR: Protege o endereço do lar temporário
  if (isFoundHome) {
    return district ? `Região do Bairro ${district} (Endereço protegido)` : 'Região de Acolhimento (Endereço protegido)';
  }

  // 3. ANIMAL VISTO NA RUA: Exibe rua e altura de via pública
  const street = (details?.street || item?.street || '').trim();
  const number = (details?.number || item?.house_number || item?.number || '').trim();

  const streetPart = street && number ? `${street}, ${number}` : street;
  const parts = [streetPart, district].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' - ');
  }

  const rawText = (details?.text || item?.address || '').trim();
  if (rawText && rawText !== formatCityState(item)) {
    return rawText.replace(/,\s*\d+.*$/, '').trim() || district || '';
  }

  return district || '';
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

// ItemCard agora é um componente fora do HomeScreen
const ItemCard = React.memo(({ item, user, userProfile, thumbnails, handleSendMessage, handleEditItem, handleDeleteItem, onPress, onPressOwner }) => {
  const { colors, isDark } = useTheme();
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const [cardWidth, setCardWidth] = React.useState(0);
  const [expandedAttributes, setExpandedAttributes] = React.useState(false);

  const isAdoption = Boolean(item.extra_fields?.is_direct_adoption || itemsService.isPetAvailableForAdoption(item));
  const isFound = !isAdoption && item.status === 'found';
  const isLost = !isAdoption && item.status === 'lost';

  const statusBg = isAdoption ? (isDark ? COLORS.secondaryLight : COLORS.secondaryLight) : isFound ? (isDark ? 'rgba(4, 120, 87, 0.2)' : '#ECFDF5') : (isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEF2F2');
  const statusBorder = isAdoption ? COLORS.secondaryBorder : isFound ? '#A7D8B0' : '#FECACA';
  const statusTextColor = isAdoption ? COLORS.secondaryDark : isFound ? '#2E5634' : '#DC2626';
  const statusIcon = isAdoption ? 'favorite' : isFound ? 'check-circle' : 'error-outline';
  const statusLabel = isAdoption ? 'Para Adoção' : isFound ? 'Encontrado' : 'Perdido';

  const animalSpecies = String(item.species || item.extra_fields?.species || '').trim();
  const animalBreed = String(item.breed || item.extra_fields?.breed || '').trim();
  const animalGender = String(item.gender || item.extra_fields?.gender || '').trim();
  const animalColor = String(item.color || item.extra_fields?.color || '').trim();
  const animalSize = String(item.size || item.extra_fields?.size || '').trim();
  const animalAge = String(item.age || item.extra_fields?.age || '').trim();
  const hasCollar = String(item.collar || item.extra_fields?.collar || '').toLowerCase() === 'sim' || Boolean(item.extra_fields?.has_collar);
  const isNeutered = String(item.neutered || item.extra_fields?.neutered || '').toLowerCase() === 'sim' || Boolean(item.extra_fields?.castrated || item.extra_fields?.is_neutered);

  const photos = item.item_photos && item.item_photos.length > 0 ? item.item_photos : (thumbnails[item.id] ? [{ url: thumbnails[item.id] }] : []);
  const IMAGE_HEIGHT = 215;

  const isOwner = Boolean(user && item.owner_id === user.id);
  const parsedExtraFields = (() => {
    if (!item?.extra_fields) return {};
    if (typeof item.extra_fields === 'object') return item.extra_fields;
    try {
      const parsed = JSON.parse(item.extra_fields);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.warn('Não foi possível interpretar os dados extras do card:', error);
      return {};
    }
  })();
  const anonymousValue = parsedExtraFields.help_network?.anonymous;
  const isAnonymousReport = [true, 1, 'true', '1', 'yes', 'sim'].includes(
    typeof anonymousValue === 'string' ? anonymousValue.toLowerCase() : anonymousValue
  );
  const ownerAvatar = isAnonymousReport
    ? null
    : (isOwner ? (userProfile?.avatar_url || userProfile?.avatarUrl) : null) || item.profiles?.avatar_url || item.profiles?.avatarUrl || item.owner_avatar || null;
  const safeTitle = item.title != null ? String(item.title) : (animalSpecies || 'Animal');
  const safeDescription = item.description != null ? String(item.description) : '';
  const safeOwnerName = isAnonymousReport
    ? 'Relato anônimo da comunidade'
    : (isOwner && userProfile?.name) ? userProfile.name : (item.owner_name != null ? String(item.owner_name) : (item.profiles?.name || 'Tutor'));
  const activeReward = Array.isArray(item.rewards)
    ? item.rewards.find(reward => reward?.status === 'active')
    : null;

  const petAttributeChips = React.useMemo(() => {
    const list = [];
    const isBreedUnknown = !animalBreed ||
      /^(não informado|não informada|nao informado|nao informada|sem raça definida|sem raca definida|sem raça|sem raca|srd|desconhecido|desconhecida|outra|outro)$/i.test(animalBreed.trim());

    if (!isBreedUnknown) {
      list.push({ key: 'breed', text: `🏷️ ${animalBreed}` });
    }
    if (animalGender && animalGender !== 'Não informado') {
      list.push({
        key: 'gender',
        text: animalGender.toLowerCase().includes('f') ? '♀️ Fêmea' : '♂️ Macho',
      });
    }
    if (animalSize && animalSize !== 'Não informado') {
      list.push({ key: 'size', text: `📏 ${animalSize.replace(/porte\s*/i, '')}` });
    }
    if (animalAge && animalAge !== 'Não informado') {
      list.push({
        key: 'age',
        text: animalAge.toLowerCase().includes('filhote') ? '🍼 Filhote' : animalAge.toLowerCase().includes('idoso') ? '👴 Idoso' : '🐕 Adulto',
      });
    }
    if (animalColor && animalColor !== 'Cor não informada') {
      list.push({
        key: 'color',
        isColor: true,
        colorHex: getColorHex(animalColor),
        text: animalColor,
      });
    }
    if (hasCollar) {
      list.push({ key: 'collar', isCollar: true, text: '📿 Coleira' });
    }
    if (isNeutered) {
      list.push({ key: 'neutered', isNeutered: true, text: '✂️ Castrado' });
    }
    const temperamentTraits = Array.isArray(item.extra_fields?.temperament) ? item.extra_fields.temperament : [];
    temperamentTraits.forEach((trait, idx) => {
      list.push({ key: `trait-${idx}`, isTrait: true, text: trait });
    });
    return list;
  }, [animalBreed, animalGender, animalSize, animalAge, animalColor, hasCollar, isNeutered, item.extra_fields?.temperament]);

  return (
    <Card style={{
      padding: 0,
      marginHorizontal: 14,
      marginVertical: 8,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: isDark ? '#161F30' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? '#243248' : '#E2E8F0',    }}>
      {/* 1. CARROSSEL DE FOTOS / IMAGEM HERO */}
      <View
        style={{ position: 'relative', width: '100%', height: IMAGE_HEIGHT, backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        {photos.length > 0 ? (
          photos.length > 1 && cardWidth > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
                setCarouselIndex(newIndex);
              }}
              style={{ width: cardWidth, height: IMAGE_HEIGHT }}
            >
              {photos.map((photo, index) => (
                <View key={photo.id || index} style={{ width: cardWidth, height: IMAGE_HEIGHT }}>
                  <OptimizedImage
                    uri={photo.url}
                    style={{ width: cardWidth, height: IMAGE_HEIGHT }}
                    resizeMode="cover"
                    resizeMethod="resize"
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <OptimizedImage
              uri={photos[0].url}
              style={{ width: '100%', height: IMAGE_HEIGHT }}
              resizeMode="cover"
              resizeMethod="resize"
            />
          )
        ) : (
          <PetFallbackImage
            species={item.species}
            breed={item.breed || item.animal_breed}
            color={item.color}
            size={item.size}
            style={{ width: '100%', height: IMAGE_HEIGHT }}
          />
        )}

        {/* Badges Flutuantes Superiores */}
        <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6, zIndex: 10, maxWidth: cardWidth > 0 ? cardWidth - 65 : 240 }}>
          {/* Status Badge Principal */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: statusBg,
            borderColor: statusBorder,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 4,          }}>
            <MaterialIcons name={statusIcon} size={13} color={statusTextColor} style={{ marginRight: 4 }} />
            <Text style={{ color: statusTextColor, fontWeight: '800', fontSize: 11.5 }}>
              {statusLabel}
            </Text>
          </View>

          {/* Espécie */}
          {animalSpecies ? (
            <View style={{
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.22)',
            }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11 }}>
                🐾 {animalSpecies}
              </Text>
            </View>
          ) : null}

          {/* Custódia (se encontrado e não for adoção) */}
          {!isAdoption && item.status === 'found' && (
            item.extra_fields?.found_custody === 'spotted' ? (
              <View style={{ backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: '#B45309', fontWeight: '700', fontSize: 11 }}>👀 Visto na Rua</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#DCFCE7', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 11 }}>🏠 Em Lar Temp.</Text>
              </View>
            )
          )}
        </View>

        {/* Botão de Compartilhar Glassmorphism */}
        <View style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}>
          <ShareButton item={item} imageUrl={photos[0]?.url} />
        </View>

        {/* Contador de fotos */}
        {photos.length > 1 && (
          <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0, 0, 0, 0.65)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, zIndex: 10 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' }}>
              📷 {carouselIndex + 1}/{photos.length}
            </Text>
          </View>
        )}

        {/* Indicadores de Paginação */}
        {photos.length > 1 && (
          <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, zIndex: 10 }}>
            {photos.map((_, dotIndex) => (
              <View
                key={dotIndex}
                style={{
                  width: carouselIndex === dotIndex ? 16 : 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: carouselIndex === dotIndex ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)',
                }}
              />
            ))}
          </View>
        )}
      </View>

      {/* 2. CONTEÚDO PRINCIPAL */}
      <View style={{ padding: 14 }}>
        {/* Título & Distância */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', letterSpacing: -0.2 }} numberOfLines={1}>
            {safeTitle}
          </Text>

          {item._distanceKm != null ? (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(5, 150, 105, 0.18)' : COLORS.primaryLight,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(5, 150, 105, 0.35)' : COLORS.primaryBorder,
              marginLeft: 8,
            }}>
              <MaterialIcons name="near-me" size={11} color={colors.primary} style={{ marginRight: 3 }} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? colors.primaryLight : colors.primaryDark }}>
                {item._distanceKm < 1 ? '< 1 km' : `${item._distanceKm < 10 ? item._distanceKm.toFixed(1) : Math.round(item._distanceKm)} km`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Chips de Atributos Minimalistas em Linha Única com Expansão '•••' */}
        {petAttributeChips.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            {(expandedAttributes ? petAttributeChips : petAttributeChips.slice(0, 3)).map((chip) => {
              if (chip.isColor) {
                return (
                  <View
                    key={chip.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3.5,
                      borderWidth: 1,
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    }}
                  >
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 4.5,
                        backgroundColor: chip.colorHex,
                        marginRight: 5,
                        borderWidth: chip.colorHex === '#FFFFFF' ? 1 : 0.5,
                        borderColor: isDark ? '#64748B' : '#94A3B8',
                      }}
                    />
                    <Text style={{ fontSize: 11.5, color: isDark ? '#CBD5E1' : '#475569', fontWeight: '600' }}>
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
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3.5,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(5, 150, 105, 0.3)' : COLORS.primaryBorder,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, color: isDark ? colors.primaryLight : colors.primaryDark, fontWeight: '600' }}>
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
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3.5,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                    }}
                  >
                    <Text style={{ fontSize: 11.5, color: isDark ? '#6EE7B7' : '#1E3E24', fontWeight: '600' }}>
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
                      backgroundColor: isDark ? 'rgba(219, 39, 119, 0.15)' : '#FDF2F8',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3.5,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(219, 39, 119, 0.3)' : '#FBCFE8',
                    }}
                  >
                    <Text style={{ fontSize: 11.5, color: isDark ? '#F472B6' : '#BE185D', fontWeight: '700' }}>
                      {chip.text}
                    </Text>
                  </View>
                );
              }
              return (
                <View
                  key={chip.key}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3.5,
                    borderWidth: 1,
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 11.5, color: isDark ? '#CBD5E1' : '#475569', fontWeight: '600' }}>
                    {chip.text}
                  </Text>
                </View>
              );
            })}

            {/* Botão de Ver Mais '•••' quando exceder a linha inicial */}
            {!expandedAttributes && petAttributeChips.length > 3 ? (
              <TouchableOpacity
                onPress={() => setExpandedAttributes(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3.5,
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#CBD5E1',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 11, color: isDark ? '#A7F3D0' : colors.primary, fontWeight: '800', letterSpacing: 1.5 }}>
                  •••
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Botão de Recolher '✕' quando estiver expandido */}
            {expandedAttributes && petAttributeChips.length > 3 ? (
              <TouchableOpacity
                onPress={() => setExpandedAttributes(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  borderRadius: 8,
                  paddingHorizontal: 7,
                  paddingVertical: 3.5,
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#CBD5E1',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700' }}>
                  ✕
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Descrição Curta (se houver) */}
        {safeDescription?.trim() ? (
          <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 18, marginBottom: 10 }} numberOfLines={2}>
            {safeDescription}
          </Text>
        ) : null}

        {/* Banner de Recompensa (se ativa) */}
        {activeReward && (
          <View style={[styles.rewardBadge, { marginBottom: 10, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8 }]}>
            <Text style={styles.rewardBadgeText}>
              🏆 {activeReward.amount ? `Recompensa: R$ ${parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Recompensa oferecida'}
              {activeReward.description ? ` • ${activeReward.description}` : ''}
            </Text>
          </View>
        )}

        {/* Card de Localização & Data */}
        <View style={{
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          borderRadius: 12,
          padding: 10,
          borderWidth: 1,
          borderColor: isDark ? '#243248' : '#E2E8F0',
          marginBottom: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 6 }}>
              <MaterialIcons name="place" size={15} color={colors.primary} />
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: isDark ? '#F8FAFC' : '#1E293B' }} numberOfLines={1}>
                {formatCityState(item)}
              </Text>
            </View>

            {item.date ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <MaterialIcons name="event" size={13} color={colors.textMuted} />
                <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontWeight: '600' }}>
                  {formatItemDate(item.date)}
                </Text>
              </View>
            ) : null}
          </View>

          {formatStreetNumberNeighborhood(item) ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 19 }} numberOfLines={1}>
              {formatStreetNumberNeighborhood(item)}
            </Text>
          ) : null}
        </View>

        {/* Informações do Tutor real (se publicado por terceiro) */}
        {item.extra_fields?.third_party_owner?.active && item.extra_fields?.third_party_owner?.name ? (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(22, 163, 74, 0.15)' : '#F0FDF4',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 5,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(22, 163, 74, 0.3)' : '#DCFCE7',
          }}>
            <MaterialIcons name="person-pin" size={14} color="#16A34A" />
            <Text style={{ fontSize: 11.5, color: isDark ? '#4ADE80' : '#166534', fontWeight: '700', marginLeft: 4 }}>
              {item.status === 'lost' ? 'Tutor:' : 'Responsável:'}{' '}
              <Text style={{ fontWeight: '600' }}>{item.extra_fields.third_party_owner.name}</Text>
              {item.extra_fields.third_party_owner.phone ? ` • 📞 ${item.extra_fields.third_party_owner.phone}` : ''}
            </Text>
          </View>
        ) : null}

        {/* Rodapé: Autor e Botão CTA */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
          <TouchableOpacity
            onPress={() => {
              if (!isAnonymousReport && onPressOwner && item.owner_id) {
                onPressOwner(item.owner_id, safeOwnerName, ownerAvatar);
              }
            }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8 }}
          >
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 6,
              borderWidth: 1,
              borderColor: isDark ? colors.cardBorder : COLORS.primaryBorder,
              overflow: 'hidden',
            }}>
              {ownerAvatar ? (
                <Image source={{ uri: ownerAvatar }} style={{ width: 28, height: 28, borderRadius: 14 }} />
              ) : (
                <MaterialIcons
                  name={isAnonymousReport ? 'visibility-off' : 'person'}
                  size={15}
                  color={isAnonymousReport ? colors.textMuted : colors.primary}
                />
              )}
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: 10.5, color: colors.textMuted }}>Publicado por</Text>
              <Text style={{ fontSize: 12.5, color: isAnonymousReport ? colors.textMuted : colors.primary, fontWeight: '700' }} numberOfLines={1}>
                {safeOwnerName}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onPress}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.primary,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 7,            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', marginRight: 2 }}>Ver Detalhes</Text>
            <MaterialIcons name="chevron-right" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
});

const HomeScreen = ({ navigation, route }) => {
  const { user, userProfile, isAdmin, refreshProfile, setUserProfile, signOut } = useAuth();
  const { colors, isDark } = useTheme();

  // Estados principais de filtros e itens
  const [filters, setFilters] = useState({
    status: 'all',
    category: 'animal',
    animalType: 'all',
    showMyItems: false,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [editNeighborhood, setEditNeighborhood] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Status dinâmico para raio de busca
  const radiusStatusText = useMemo(() => {
    const currentStatus = filters?.status || 'all';
    switch (currentStatus) {
      case 'lost':
        return 'animais perdidos';
      case 'found':
        return 'animais encontrados';
      case 'adoption':
        return 'animais para adoção';
      case 'resolved':
        return 'animais reencontrados';
      case 'all':
      default:
        return 'todos os animais';
    }
  }, [filters?.status]);

  // Corrige erro: garantir estado do modal de perfil
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  // Localidade do perfil e sessão com endereço completo
  const [showProfileLocationModal, setShowProfileLocationModal] = useState(false);
  const [sessionCity, setSessionCity] = useState('');
  const [sessionState, setSessionState] = useState('');
  const [sessionDistrict, setSessionDistrict] = useState('');
  const [sessionStreet, setSessionStreet] = useState('');
  const [sessionAddressText, setSessionAddressText] = useState('');

  const [profileEditState, setProfileEditState] = useState('');
  const [profileEditCity, setProfileEditCity] = useState('');
  const [profileEditDistrict, setProfileEditDistrict] = useState('');
  const [profileEditStreet, setProfileEditStreet] = useState('');
  const [profileEditAddressText, setProfileEditAddressText] = useState('');
  const [profileEditCoords, setProfileEditCoords] = useState(null);
  const [profileMapVisible, setProfileMapVisible] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [searchRadiusKm, setSearchRadiusKm] = useState(25);
  const [profileEditRadiusKm, setProfileEditRadiusKm] = useState(25);
  const [showQuickRadiusModal, setShowQuickRadiusModal] = useState(false);
  const [selectedQuickRadius, setSelectedQuickRadius] = useState(25);

  // Localidade padrão do usuário, mas permite alterar livremente
  const [locationFilter, setLocationFilter] = useState('');
  const [locationFilterTouched, setLocationFilterTouched] = useState(false);
  // Modal de edição de localidade
  const [editLocationModal, setEditLocationModal] = useState(false);
  // Estado e cidade do perfil, fixos para filtro
  const [editState, setEditState] = useState(userProfile?.state || '');
  const [editCity, setEditCity] = useState(userProfile?.city || '');

  // Limpa filtros ao sair da HomeScreen (para visitante, reseta localidade para Todo o Brasil)
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setFilters({ status: 'all', category: 'all', showMyItems: false });
      setSearchTerm('');
      setEditNeighborhood('');
      if (!user) {
        // Usuário deslogado: volta para "Todo o Brasil" ao sair da tela/fazer outra ação
        setSessionCity('');
        setSessionState('');
        setSessionDistrict('');
        setSessionStreet('');
        setSessionAddressText('');
        setProfileEditCity('');
        setProfileEditState('');
        setProfileEditDistrict('');
        setProfileEditStreet('');
        setProfileEditAddressText('');
        setProfileEditCoords(null);
        setUserCoords(null);
        setLocationFilter('');
        setLocationFilterTouched(false);
      }
    });
    return unsubscribe;
  }, [navigation, user, userProfile]);

  useEffect(() => {
    const loadInitialLocation = async () => {
      try {
        if (!user) {
          // Usuário deslogado: Sempre "Todo o Brasil" por padrão
          setSessionCity('');
          setSessionState('');
          setSessionDistrict('');
          setSessionStreet('');
          setSessionAddressText('');
          setProfileEditCity('');
          setProfileEditState('');
          setProfileEditDistrict('');
          setProfileEditStreet('');
          setProfileEditAddressText('');
          setProfileEditCoords(null);
          setUserCoords(null);
          setLocationFilter('');
          setLocationFilterTouched(false);
          return;
        }

        // Usuário autenticado: Carrega o raio e a localização salva
        const storedRadius = await AsyncStorage.getItem('@wefind/search_radius');
        if (storedRadius) {
          const r = Number(storedRadius);
          if (r > 0) {
            setSearchRadiusKm(r);
            setProfileEditRadiusKm(r);
          }
        }

        const storedLoc = await AsyncStorage.getItem('@wefind/saved_location');
        let parsed = null;
        if (storedLoc) {
          try {
            parsed = JSON.parse(storedLoc);
          } catch (e) {}
        }

        if (parsed?.addressText) setSessionAddressText(parsed.addressText);
        if (parsed?.street) setSessionStreet(parsed.street);
        if (parsed?.district || parsed?.neighborhood) setSessionDistrict(parsed.district || parsed.neighborhood);
        if (parsed?.radiusKm) {
          setSearchRadiusKm(Number(parsed.radiusKm));
          setProfileEditRadiusKm(Number(parsed.radiusKm));
        }

        if (userProfile?.state && userProfile?.city) {
          setSessionCity(userProfile.city);
          setSessionState(userProfile.state);
          if (userProfile.neighborhood) setSessionDistrict(userProfile.neighborhood);
          setProfileEditState(userProfile.state);
          setProfileEditCity(userProfile.city);
          setProfileEditDistrict(userProfile.neighborhood || parsed?.district || '');
          setProfileEditStreet(parsed?.street || '');
          setProfileEditAddressText(parsed?.addressText || '');
          setLocationFilter(`${userProfile.city}, ${userProfile.state}`);

          if (userProfile.latitude && userProfile.longitude) {
            const coords = { latitude: Number(userProfile.latitude), longitude: Number(userProfile.longitude) };
            setProfileEditCoords(coords);
            setUserCoords(coords);
          } else if (parsed?.coords) {
            setProfileEditCoords(parsed.coords);
            setUserCoords(parsed.coords);
          } else {
            const coords = await geocodeCityState(userProfile.city, userProfile.state);
            if (coords) {
              setProfileEditCoords(coords);
              setUserCoords(coords);
            }
          }
          return;
        }

        if (parsed?.city && parsed?.state) {
          setSessionCity(parsed.city);
          setSessionState(parsed.state);
          setSessionDistrict(parsed.district || parsed.neighborhood || '');
          setSessionStreet(parsed.street || '');
          setSessionAddressText(parsed.addressText || '');

          setProfileEditState(parsed.state);
          setProfileEditCity(parsed.city);
          setProfileEditDistrict(parsed.district || parsed.neighborhood || '');
          setProfileEditStreet(parsed.street || '');
          setProfileEditAddressText(parsed.addressText || '');
          setLocationFilter(`${parsed.city}, ${parsed.state}`);

          if (parsed.coords) {
            setProfileEditCoords(parsed.coords);
            setUserCoords(parsed.coords);
          } else {
            const coords = await geocodeCityState(parsed.city, parsed.state);
            if (coords) {
              setProfileEditCoords(coords);
              setUserCoords(coords);
            }
          }
        }
      } catch (err) {
        console.warn('[HomeScreen] Erro ao carregar localização inicial:', err.message);
      }
    };

    loadInitialLocation();
  }, [user, userProfile]);

  // Localidade ativa para exibição no cabeçalho (apenas Cidade - Estado)
  const activeCity = sessionCity;
  const activeState = sessionState;
  const activeStreet = sessionStreet;
  const headerCityState = (activeCity && activeState)
    ? `${activeCity} - ${activeState}`
    : (activeCity || activeState || 'Todo o Brasil');
  const headerLocationSummary = headerCityState;
  const displayLocation = headerCityState;

  const userFullLocation = useMemo(() => {
    const parts = [
      sessionStreet || profileEditStreet,
      sessionDistrict || profileEditDistrict,
      [sessionCity || profileEditCity, sessionState || profileEditState].filter(Boolean).join(' - '),
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    return sessionAddressText || profileEditAddressText || headerLocationSummary || 'Sua Localização';
  }, [sessionStreet, profileEditStreet, sessionDistrict, profileEditDistrict, sessionCity, profileEditCity, sessionState, profileEditState, sessionAddressText, profileEditAddressText, headerLocationSummary]);

  // Salvar localidade (perfil e armazenamento local)
  const handleSaveProfileLocation = async () => {
    if (!profileEditState || !profileEditCity) return;
    
    const chosenRadius = profileEditRadiusKm || 25;
    const fullText = profileEditAddressText || [
      profileEditStreet,
      profileEditDistrict,
      [profileEditCity, profileEditState].filter(Boolean).join(' - '),
    ].filter(Boolean).join(', ') || `${profileEditCity}, ${profileEditState}`;

    setSessionCity(profileEditCity);
    setSessionState(profileEditState);
    setSessionDistrict(profileEditDistrict);
    setSessionStreet(profileEditStreet);
    setSessionAddressText(fullText);
    setSearchRadiusKm(chosenRadius);
    setLocationFilter(`${profileEditCity}, ${profileEditState}`);
    setLocationFilterTouched(true);

    let coords = profileEditCoords;
    if (!coords || !coords.latitude) {
      coords = await geocodeCityState(profileEditCity, profileEditState);
    }
    setUserCoords(coords || null);

    // Salva no AsyncStorage para manter a preferência de localidade e raio
    try {
      await AsyncStorage.setItem(
        '@wefind/saved_location',
        JSON.stringify({
          addressText: fullText,
          street: profileEditStreet,
          district: profileEditDistrict,
          neighborhood: profileEditDistrict,
          city: profileEditCity,
          state: profileEditState,
          coords: coords || null,
          radiusKm: chosenRadius,
        })
      );
      await AsyncStorage.setItem('@wefind/search_radius', String(chosenRadius));
    } catch (e) {
      console.warn('[HomeScreen] Falha ao salvar localização no AsyncStorage:', e.message);
    }

    if (user?.id) {
      try {
        await userService.updateProfile(user.id, {
          state: profileEditState,
          city: profileEditCity,
          neighborhood: profileEditDistrict,
          search_radius_km: chosenRadius,
        });
        if (typeof setUserProfile === 'function') {
          setUserProfile((prev) => ({
            ...prev,
            state: profileEditState,
            city: profileEditCity,
            neighborhood: profileEditDistrict,
            search_radius_km: chosenRadius,
          }));
        }
        if (typeof refreshProfile === 'function') refreshProfile();
      } catch (err) {
        console.warn('[HomeScreen] Falha ao atualizar perfil no Supabase:', err.message);
      }
    }
    setShowProfileLocationModal(false);
  };

  const handleSaveQuickRadius = async (newRadius) => {
    const rawVal = (typeof newRadius === 'number' && !Number.isNaN(newRadius)) ? newRadius : selectedQuickRadius;
    const val = Number(rawVal);
    if (!val || Number.isNaN(val)) {
      setShowQuickRadiusModal(false);
      return;
    }
    setSearchRadiusKm(val);
    setProfileEditRadiusKm(val);
    setSelectedQuickRadius(val);
    try {
      await AsyncStorage.setItem('@wefind/search_radius', String(val));
      const storedLoc = await AsyncStorage.getItem('@wefind/saved_location');
      if (storedLoc) {
        try {
          const parsed = JSON.parse(storedLoc);
          await AsyncStorage.setItem(
            '@wefind/saved_location',
            JSON.stringify({ ...parsed, radiusKm: val })
          );
        } catch (_) {}
      }
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({
            search_radius_km: val,
            extra_fields: {
              ...(userProfile?.extra_fields || {}),
              search_radius_km: val,
            },
          })
          .eq('id', user.id);
      }
    } catch (e) {
      console.log('[HomeScreen] Erro ao salvar raio rápido:', e.message);
    }
    setShowQuickRadiusModal(false);
  };

  // Limpar filtro de localidade e voltar para "Brasil"
  const handleResetToBrazil = async () => {
    setSessionCity('');
    setSessionState('');
    setProfileEditCity('');
    setProfileEditState('');
    setProfileEditCoords(null);
    setUserCoords(null);
    setLocationFilter('');
    setLocationFilterTouched(true);
    try {
      await AsyncStorage.removeItem('@wefind/saved_location');
    } catch (e) {
      console.warn('[HomeScreen] Falha ao limpar localização no AsyncStorage:', e.message);
    }
    setShowProfileLocationModal(false);
  };

  // Carrega do cache E do servidor em paralelo, mas aplica o servidor como fonte de verdade
  // O cache serve apenas como warmup do estado sem acionar renderização separada de filtros
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      // 1. Tenta pre-popular do cache para reduzir o tempo de tela em branco
      try {
        const cached = await AsyncStorage.getItem('@wefind/cached_feed_items');
        if (cached && !cancelled) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = parsed.filter(item => item && !item.resolved && !itemsService.shouldHideItem?.(item));
            if (valid.length > 0 && !cancelled) {
              setItems(valid);
              setLoading(false);
            }
          }
        }
      } catch (e) {}

      // 2. Busca do servidor (substitui o cache silenciosamente)
      if (!cancelled) {
        await loadItems();
      }
    };
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // Sempre recarrega silenciosamente ao focar na HomeTab
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadItems(true);
    });
    return unsubscribe;
  }, [navigation]);

  // Ao focar na tela, sincroniza seletor interno caso o perfil possua cidade
  useFocusEffect(
    React.useCallback(() => {
      if (userProfile?.city && userProfile?.state) {
        setEditState(userProfile.state);
        setEditCity(userProfile.city);
        setEditNeighborhood(userProfile.neighborhood || '');
      }
    }, [userProfile])
  );
  const [expandedItem, setExpandedItem] = useState(null);
  const [expandedItemDetails, setExpandedItemDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [thumbnails, setThumbnails] = useState({});
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    animalType: 'all',
    size: 'all',
    gender: 'all',
    age: 'all',
    color: 'all',
    hasReward: false,
    sortBy: 'distance',
  });

  const activeAdvancedFiltersCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.animalType && advancedFilters.animalType !== 'all') count++;
    if (advancedFilters.size && advancedFilters.size !== 'all') count++;
    if (advancedFilters.gender && advancedFilters.gender !== 'all') count++;
    if (advancedFilters.age && advancedFilters.age !== 'all') count++;
    if (advancedFilters.color && advancedFilters.color !== 'all') count++;
    if (advancedFilters.hasReward) count++;
    if (advancedFilters.sortBy && advancedFilters.sortBy !== 'distance') count++;
    return count;
  }, [advancedFilters]);

  const handleResetAdvancedFilters = () => {
    setAdvancedFilters({
      animalType: 'all',
      size: 'all',
      gender: 'all',
      age: 'all',
      color: 'all',
      hasReward: false,
      sortBy: 'distance',
    });
    setFilters(prev => ({ ...prev, animalType: 'all' }));
  };

  const loadItems = async (isSilent = false) => {
    try {
      if (!isSilent && items.length === 0) {
        setLoading(true);
      }
      let allItems = [];
      if (searchTerm && searchTerm.trim().length > 0) {
        allItems = await itemsService.searchItems(searchTerm.trim());
      } else {
        const baseFilters = {};
        if (filters.status !== 'all' && filters.status !== 'adoption') baseFilters.status = filters.status;
        if (filters.category !== 'all') baseFilters.category = filters.category;
        if (filters.animalType && filters.animalType !== 'all') baseFilters.species = filters.animalType;
        if (filters.showMyItems && user) baseFilters.owner_id = user.id;

        allItems = await itemsService.listItemsWithPhotosAndOwner(baseFilters);
        allItems = (allItems || []).map(item => ({
          ...item,
          owner_name: item.profiles?.name || item.profiles?.email || item.owner_name || 'Usuário',
          item_photos: item.item_photos || [],
        }));
      }

      setItems(allItems);

      // Salva no cache local para abertura instantânea (0ms) subsequente
      if (!searchTerm && filters.status === 'all' && (!filters.animalType || filters.animalType === 'all') && !filters.showMyItems) {
        try {
          AsyncStorage.setItem('@wefind/cached_feed_items', JSON.stringify(allItems.slice(0, 40))).catch(() => {});
        } catch (e) {}
      }

      // Sincronização em background sem travar a interface
      if (user?.id) {
        notificationsService.syncRenewalNotifications(user.id, allItems).catch(() => {});
        notificationsService.syncFoundPetFollowUpNotifications(user.id, allItems).catch(() => {});
      }
    } catch (error) {
      console.error('[HomeScreen] Erro ao carregar itens:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Sempre recarregar itens ao mudar locationFilter
  useEffect(() => {
    if (locationFilter) {
      loadItems();
    }
  }, [locationFilter]);

  // Carregar detalhes do item quando expandir
  const handleExpandItem = async (itemId) => {
    if (expandedItem === itemId) {
      // Recolher
      setExpandedItem(null);
      setExpandedItemDetails(null);
      return;
    }

    // Expandir
    setExpandedItem(itemId);
    setLoadingDetails(true);

    try {
      const details = await itemsService.getItemDetails(itemId);
      setExpandedItemDetails(details);
    } catch (error) {
      console.log('[HomeScreen] Erro ao carregar detalhes:', error.message);
      setExpandedItemDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const normalizeText = (text = '') =>
    String(text || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  // filteredItems é derivado deterministicamente de items + todos os filtros.
  // Sendo um useMemo, qualquer mudança em items OU nos filtros produz exatamente
  // UM render consistente — sem competição entre cache e servidor.
  const filteredItems = React.useMemo(() => {
    let filtered = items || [];

    // Remove publicações fantasmas (resolvidas ou expiradas) do feed público
    if (!filters.showMyItems) {
      filtered = filtered.filter(item => item && !item.resolved && !itemsService.shouldHideItem?.(item));
    }

    // Filtro por status (Perdido / Encontrado / Adoção)
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'adoption') {
        filtered = filtered.filter(item => itemsService.isPetAvailableForAdoption(item));
      } else if (filters.status === 'found') {
        filtered = filtered.filter(item => item.status === 'found' && !itemsService.isPetAvailableForAdoption(item));
      } else if (filters.status === 'lost') {
        filtered = filtered.filter(item => item.status === 'lost' && !itemsService.isPetAvailableForAdoption(item));
      } else {
        filtered = filtered.filter(item => item.status === filters.status);
      }
    }

    // Filtro por categoria (animal, objeto, etc)
    if (filters.category && filters.category !== 'all') {
      filtered = filtered.filter(item => item.category === filters.category);
    }

    // Filtro por espécie (Cachorro, Gato, etc)
    if (filters.animalType && filters.animalType !== 'all') {
      const selected = normalizeText(filters.animalType);
      filtered = filtered.filter(item => {
        const species = normalizeText(item.species || item.extra_fields?.species || '');
        if (selected === 'outro') {
          return species && !['cachorro', 'gato', 'bovino', 'ave', 'cavalo'].some(t => species.includes(t));
        }
        return species.includes(selected) || selected.includes(species);
      });
    }

    // Filtro "Meus Itens"
    if (filters.showMyItems && user?.id) {
      filtered = filtered.filter(item => item.owner_id === user.id);
    }

    // Calcula distância de cada item em relação às coordenadas do usuário (se disponíveis)
    filtered = filtered.map(item => {
      const itemLat = item.latitude ?? item.extra_fields?.location_details?.latitude;
      const itemLng = item.longitude ?? item.extra_fields?.location_details?.longitude;
      let distanceKm = null;
      if (userCoords?.latitude && userCoords?.longitude && itemLat != null && itemLng != null) {
        distanceKm = calculateDistanceKm(userCoords.latitude, userCoords.longitude, itemLat, itemLng);
      }
      return { ...item, _distanceKm: distanceKm };
    });

    // Filtro por Localização com RAIO DE BUSCA
    if (locationFilter && locationFilter.trim().length > 0) {
      const maxRadius = searchRadiusKm || 25;
      const parts = locationFilter
        .split(',')
        .map(p => normalizeText(p))
        .filter(Boolean);

      const stateToken = parts.find(p =>
        states.some(uf => normalizeText(uf) === p) ||
        Object.keys(normalizedRegionToUf).some(reg => reg === p)
      );
      const targetUf = stateToken
        ? (states.find(uf => normalizeText(uf) === stateToken) || normalizedRegionToUf[stateToken] || stateToken).toUpperCase()
        : null;
      const cityToken = parts.find(p => p !== stateToken);

      filtered = filtered.filter(item => {
        if (item._distanceKm != null) return item._distanceKm <= maxRadius;

        const rawItemCity = item.city || item.extra_fields?.location_details?.city || '';
        const rawItemState = item.state || item.extra_fields?.location_details?.state || '';
        const itemCityNorm = normalizeText(rawItemCity);
        const itemStateNorm = normalizeText(rawItemState);
        const itemStateUf = (
          states.find(uf => normalizeText(uf) === itemStateNorm) ||
          normalizedRegionToUf[itemStateNorm] ||
          rawItemState
        ).toUpperCase();
        const matchesCity = !cityToken || itemCityNorm.includes(cityToken) || cityToken.includes(itemCityNorm);
        const matchesState = !targetUf || itemStateUf === targetUf;
        return matchesCity && matchesState;
      });
    }

    // Filtro por termo de busca
    const search = normalizeText(searchTerm);
    if (search.length > 0) {
      filtered = filtered.filter(item => {
        const extra = item.extra_fields || {};
        const locDetails = extra.location_details || {};
        const searchableFields = [
          item.title, item.description, item.species, item.breed,
          item.city, item.state, item.neighborhood,
          extra.species, extra.breed, extra.animal_name,
          extra.third_party_owner?.name,
          locDetails.city, locDetails.state, locDetails.district, locDetails.street,
        ];
        return searchableFields.some(val => normalizeText(val).includes(search));
      });
    }

    // ORDENAÇÃO: mais próximos primeiro (crescente), desempate por data mais recente
    const sorted = [...filtered].sort((a, b) => {
      const aDist = a._distanceKm;
      const bDist = b._distanceKm;
      if (aDist != null && bDist != null && Math.abs(aDist - bDist) > 0.05) {
        return aDist - bDist;
      }
      if (aDist != null && bDist == null) return -1;
      if (aDist == null && bDist != null) return 1;
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return bDate - aDate;
    });

    console.log('[HomeScreen] Itens após filtros:', sorted.length);
    return sorted;
  }, [items, filters, user, locationFilter, searchTerm, userCoords, searchRadiusKm]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  // Disable "Meus Itens" filter if not authenticated
  const handleMyItemsToggle = () => {
    if (!user) {
      alert('Faça login para ver seus itens');
      navigation.navigate('Login');
      return;
    }
    setFilters({ ...filters, showMyItems: !filters.showMyItems });
  };

  // Abre o chat com o dono do item
  // Preenche mensagem automática ao abrir o chat diretamente
  const handleSendMessage = async (ownerId, itemId, itemStatus, itemTitle, otherName, avatarUrl) => {
    if (!user) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para enviar mensagens ao tutor.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }
    if (ownerId === user.id) {
      Alert.alert('Aviso', 'Você é o autor desta publicação.');
      return;
    }
    navigation.navigate('ChatScreen', {
      conversation: {
        otherId: ownerId,
        itemId: itemId,
        otherName: otherName || 'Tutor',
        avatarUrl: avatarUrl || null,
        itemTitle: itemTitle || 'Animal',
        itemStatus: itemStatus,
        itemOwnerId: ownerId,
      },
    });
  };

  const handleReportSighting = () => {
    if (!user) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para compartilhar informações sobre o pet.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }
  };

  const handleEditItem = (item) => {
    navigation.navigate('RegisterItem', { editItem: item });
  };

  const handleDeleteItem = async (itemId) => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await itemsService.deleteItem(itemId);
              setItems((prev) => {
                const next = prev.filter((i) => i.id !== itemId);
                AsyncStorage.setItem('@wefind/cached_feed_items', JSON.stringify(next.slice(0, 40))).catch(() => {});
                return next;
              });
              Alert.alert('Sucesso', 'Item excluído com sucesso');
              loadItems(true);
            } catch (error) {
              Alert.alert('Erro', 'Falha ao excluir item: ' + error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkAsResolved = async (itemId) => {
    Alert.alert(
      'Marcar como Resolvido',
      'Confirma que este item foi encontrado/devolvido?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setLoading(true);
              await itemsService.markItemAsResolved(itemId);
              setItems((prev) => {
                const next = prev.filter((i) => i.id !== itemId);
                AsyncStorage.setItem('@wefind/cached_feed_items', JSON.stringify(next.slice(0, 40))).catch(() => {});
                return next;
              });
              Alert.alert('Sucesso', 'Item marcado como resolvido!');
              loadItems(true);
            } catch (error) {
              Alert.alert('Erro', 'Falha ao marcar como resolvido: ' + error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenItemDetail = (itemId) => {
    navigation.navigate('ItemDetail', { itemId });
  };

  const handleSendTestNotification = async () => {
    if (!user || !isAdmin) {
      Alert.alert('Acesso restrito', 'Apenas administradores podem testar o envio de notificações.');
      return;
    }

    try {
      await notificationsService.createNotification({
        user_id: user.id,
        type: 'test',
        title: 'Teste de WhatsApp',
        message: 'Esta é uma notificação de teste do app WeFIND.',
        item_id: null,
      });
      Alert.alert('Teste enviado', 'A notificação foi criada e o encaminhamento para WhatsApp foi acionado.');
    } catch (error) {
      Alert.alert('Erro', error?.message || 'Não foi possível enviar a notificação de teste.');
    }
  };

  const finalDisplayItems = useMemo(() => {
    let list = filteredItems.filter(item => {
      // 1. Espécie
      if (advancedFilters.animalType && advancedFilters.animalType !== 'all') {
        const targetSpecies = normalizeText(advancedFilters.animalType);
        const itemSpecies = normalizeText(item.species || item.extra_fields?.species || '');
        if (targetSpecies === 'outro') {
          const isStandard = ['cachorro', 'cao', 'gato', 'bovino', 'ave', 'passaro', 'cavalo'].some(t => itemSpecies.includes(t));
          if (isStandard) return false;
        } else if (!itemSpecies.includes(targetSpecies) && !targetSpecies.includes(itemSpecies)) {
          return false;
        }
      }

      // 2. Porte (Size)
      if (advancedFilters.size && advancedFilters.size !== 'all') {
        const targetSize = normalizeText(advancedFilters.size);
        const itemSize = normalizeText(item.size || item.extra_fields?.size || item.extra_fields?.porte || '');
        if (!itemSize.includes(targetSize) && !targetSize.includes(itemSize)) {
          return false;
        }
      }

      // 3. Sexo (Gender)
      if (advancedFilters.gender && advancedFilters.gender !== 'all') {
        const targetGender = normalizeText(advancedFilters.gender);
        const itemGender = normalizeText(item.gender || item.extra_fields?.gender || item.extra_fields?.sexo || '');
        if (targetGender === 'macho') {
          if (!itemGender.includes('macho') && itemGender !== 'm') return false;
        } else if (targetGender === 'femea') {
          if (!itemGender.includes('femea') && !itemGender.includes('fêmea') && itemGender !== 'f') return false;
        }
      }

      // 4. Idade (Age)
      if (advancedFilters.age && advancedFilters.age !== 'all') {
        const targetAge = normalizeText(advancedFilters.age);
        const itemAge = normalizeText(item.age || item.extra_fields?.age || item.extra_fields?.idade || item.extra_fields?.age_group || '');
        if (!itemAge.includes(targetAge) && !targetAge.includes(itemAge)) {
          return false;
        }
      }

      // 5. Cor
      if (advancedFilters.color && advancedFilters.color !== 'all') {
        const targetColor = normalizeText(advancedFilters.color);
        const itemColor = normalizeText(item.color || item.extra_fields?.color || item.extra_fields?.cor || '');
        if (!itemColor.includes(targetColor)) {
          return false;
        }
      }

      // 6. Recompensa Ativa
      if (advancedFilters.hasReward) {
        const hasActiveReward = Array.isArray(item.rewards) && item.rewards.some(r => r?.status === 'active');
        if (!hasActiveReward) return false;
      }

      return true;
    });

    // 7. Ordenação
    if (advancedFilters.sortBy === 'newest') {
      list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } else if (advancedFilters.sortBy === 'oldest') {
      list.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    } else {
      // 'distance': proximidade, desempate por mais recentes
      list.sort((a, b) => {
        const aDist = a._distanceKm;
        const bDist = b._distanceKm;
        if (aDist != null && bDist != null && Math.abs(aDist - bDist) > 0.05) {
          return aDist - bDist;
        }
        if (aDist != null && bDist == null) return -1;
        if (aDist == null && bDist != null) return 1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    }

    return list;
  }, [filteredItems, advancedFilters]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Overlay para fechar o menu ao clicar fora */}
      {user && showProfileMenu && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowProfileMenu(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
        >
          {/* TouchableOpacity precisa de filho, mesmo que vazio */}
          <View />
        </TouchableOpacity>
      )}
      {/* App Bar ajustada: nome WeFIND e localização à esquerda; sino/avatar ou logo do sistema à direita */}
      <View style={{ backgroundColor: colors.headerBg, paddingTop: 40, paddingBottom: 8, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <View style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', marginRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Image
                source={require('../../assets/logo_outlined.png')}
                style={{ width: 34, height: 34, marginRight: 8 }}
                resizeMode="contain"
              />
              <Text
                style={{
                  fontSize: 20,
                  letterSpacing: 1.4,
                  fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
                }}
              >
                <Text style={{ color: COLORS.weColor || '#B1734A', fontWeight: '600' }}>We</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '300' }}>FIND</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.16)',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 4,
                marginTop: 2,
                maxWidth: '100%',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.28)',
              }}
              onPress={() => {
                setProfileEditCity(activeCity);
                setProfileEditState(activeState);
                setProfileEditDistrict(sessionDistrict);
                setProfileEditStreet(sessionStreet);
                setProfileEditAddressText(sessionAddressText);
                setProfileEditRadiusKm(searchRadiusKm);
                setShowProfileLocationModal(true);
              }}
              accessibilityLabel={`Localidade: ${headerCityState}`}
              activeOpacity={0.75}
            >
              <MaterialIcons name="place" size={14} color="#FEA937" style={{ marginRight: 4, flexShrink: 0 }} />
              <Text
                style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginRight: 6, flexShrink: 1 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {headerCityState}
              </Text>
              <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', borderRadius: 10, padding: 2, flexShrink: 0 }}>
                <MaterialIcons name="edit" size={11} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          {user ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
              <NotificationBell />
              <TouchableOpacity
                onPress={() => setShowProfileMenu((prev) => !prev)}
                style={{ borderWidth: 2, borderColor: '#fff', borderRadius: 22, padding: 2, marginLeft: 4 }}
                accessibilityLabel="Abrir menu do perfil"
              >
                {userProfile?.avatar_url ? (
                  <Image source={{ uri: userProfile.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB' }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.secondary || '#B1734A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>{userProfile?.name ? userProfile.name[0].toUpperCase() : 'U'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <LoginPillButton onPress={() => navigation.navigate('Login')} />
          )}
          {user && showProfileMenu && (
            <View style={[styles.profileMenu, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={[styles.profileMenuHeader, { backgroundColor: colors.primaryLight, borderBottomColor: colors.border }]}>
                <View style={styles.profileMenuAvatar}>
                  {userProfile?.avatar_url ? (
                    <Image source={{ uri: userProfile.avatar_url }} style={styles.profileMenuAvatarImage} />
                  ) : (
                    <Text style={styles.profileMenuAvatarText}>{userProfile?.name ? userProfile.name[0].toUpperCase() : 'U'}</Text>
                  )}
                </View>
                <View style={styles.profileMenuIdentity}>
                  <Text style={[styles.profileMenuName, { color: colors.text }]} numberOfLines={1}>{userProfile?.name || 'Usuário'}</Text>
                  <Text style={[styles.profileMenuEmail, { color: colors.textSecondary }]} numberOfLines={1}>{user?.email || 'Conta WeFIND'}</Text>
                </View>
              </View>
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => {
                    setShowProfileMenu(false);
                    navigation.navigate('Admin');
                  }}
                  style={styles.profileMenuItem}
                >
                  <View style={[styles.profileMenuIcon, styles.profileMenuAdminIcon, { backgroundColor: colors.primaryLight }]}>
                    <MaterialIcons name="admin-panel-settings" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.profileMenuItemText, { color: colors.text }]}>Administração</Text>
                  <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setShowProfileMenu(false);
                  navigation.navigate('ProfileTab');
                }}
                style={styles.profileMenuItem}
              >
                <View style={[styles.profileMenuIcon, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="person-outline" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.profileMenuItemText, { color: colors.text }]}>Perfil</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity
                onPress={() => {
                  setShowProfileMenu(false);
                  if (typeof signOut === 'function') signOut();
                  else if (typeof navigation?.navigate === 'function') navigation.navigate('Login');
                }}
                style={styles.profileMenuItem}
              >
                <View style={[styles.profileMenuIcon, styles.profileMenuLogoutIcon]}>
                  <MaterialIcons name="logout" size={18} color="#DC2626" />
                </View>
                <Text style={styles.profileMenuLogoutText}>Sair</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Modal para atualizar localidade do perfil ou filtrar por região */}
        <Modal
          visible={!!showProfileLocationModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProfileLocationModal(false)}
        >
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 18, minWidth: 340, maxWidth: '95%', borderWidth: 1, borderColor: colors.cardBorder }}>
              <Text style={{ fontWeight:'bold', fontSize:17, color: colors.primary, marginBottom:4 }}>
                {user ? 'Atualizar Localidade' : 'Filtrar por Região'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize:13, marginBottom:14 }}>
                {user
                  ? 'Escolha sua cidade e estado para personalizar o feed e seu perfil:'
                  : 'Escolha uma cidade e estado para visualizar publicações dessa região:'}
              </Text>
              {/* Seletor Interativo de Raio de Busca (Apenas se houver cidade/estado selecionado) */}
              {Boolean(profileEditCity || profileEditState || sessionCity || sessionState) && (
                <View style={{
                  backgroundColor: isDark ? colors.card : COLORS.primaryLight,
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 14,
                  borderWidth: 1,
                  borderColor: isDark ? colors.cardBorder : COLORS.primaryBorder,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <MaterialIcons name="radar" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={{ color: isDark ? colors.primaryLight : colors.primaryDark, fontSize: 13, fontWeight: '700' }}>
                      Raio de Busca: <Text style={{ fontWeight: '900', color: colors.primary }}>{profileEditRadiusKm} km</Text>
                    </Text>
                  </View>
                  <Text style={{ color: isDark ? colors.textSecondary : '#475569', fontSize: 11.5, marginBottom: 10 }}>
                    Selecione a distância máxima para filtrar publicações ao redor de você:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[5, 10, 20, 35, 50, 80].map((r) => {
                      const isSelected = profileEditRadiusKm === r;
                      return (
                        <TouchableOpacity
                          key={r}
                          onPress={() => setProfileEditRadiusKm(r)}
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
              )}

              <TouchableOpacity
                onPress={() => {
                  setShowProfileLocationModal(false);
                  setProfileMapVisible(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 12, marginBottom: 14 }}
              >
                <MaterialIcons name="map" size={19} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 8 }}>Escolher no mapa</Text>
              </TouchableOpacity>
              {(profileEditAddressText || profileEditCity || profileEditState) ? (
                <View style={{ backgroundColor: isDark ? colors.card : '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: colors.cardBorder }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: '700', marginBottom: 3 }}>
                    ENDEREÇO SELECIONADO:
                  </Text>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '800', lineHeight: 19 }}>
                    {profileEditAddressText || [profileEditStreet, profileEditDistrict, [profileEditCity, profileEditState].filter(Boolean).join(' - ')].filter(Boolean).join(', ') || [profileEditCity, profileEditState].filter(Boolean).join(', ')}
                  </Text>
                  {profileEditDistrict ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                      Bairro: <Text style={{ fontWeight: '700', color: colors.text }}>{profileEditDistrict}</Text>
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 }}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setShowProfileLocationModal(false)}
                  style={{ flex: 1, minHeight: 46 }}
                />
                <Button
                  title="Salvar"
                  variant="primary"
                  onPress={handleSaveProfileLocation}
                  disabled={!profileEditState || !profileEditCity}
                  style={{ flex: 1, minHeight: 46 }}
                />
              </View>
            </View>
          </View>
        </Modal>
        <MapLocationPicker
          visible={profileMapVisible}
          mode="profile"
          initialLocation={profileEditCoords || userCoords}
          radiusKm={profileEditRadiusKm || searchRadiusKm}
          showRadius={true}
          onRadiusChange={(r) => setProfileEditRadiusKm(r)}
          onClose={() => setProfileMapVisible(false)}
          onConfirm={({ address, addressDetails, addressText, street, houseNumber, district, neighborhood, city, state, coordinate, radiusKm }) => {
            const region = String(addressDetails?.state || address?.region || state || '').trim();
            const stateValue = states.includes(region.toUpperCase())
              ? region.toUpperCase()
              : (normalizedRegionToUf[normalizeRegionName(region)] || region);
            const cityValue =
              addressDetails?.city || address?.city || city || '';
            const distValue = addressDetails?.district || district || neighborhood || '';
            const stValue = addressDetails?.street || street || '';

            setProfileEditState(stateValue);
            setProfileEditCity(cityValue);
            setProfileEditDistrict(distValue);
            setProfileEditStreet(stValue);
            setProfileEditAddressText(addressText || '');
            if (radiusKm) setProfileEditRadiusKm(radiusKm);
            if (coordinate && coordinate.latitude && coordinate.longitude) {
              setProfileEditCoords(coordinate);
              setUserCoords(coordinate);
            }
            setProfileMapVisible(false);
            setShowProfileLocationModal(true);
          }}
        />
      </View>

      {/* Busca de animais acima dos filtros */}
      <View style={{ marginTop: 12, marginHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 48 }}>
          <MaterialIcons name="search" size={22} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Nome, raça, espécie ou cidade..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={{ flex: 1, backgroundColor: colors.surface, fontSize: 15, color: colors.text, paddingVertical: 0, paddingHorizontal: 0 }}
            placeholderTextColor={colors.textMuted}
          />
          {searchTerm ? (
            <TouchableOpacity onPress={() => setSearchTerm('')} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Modal de edição de localidade */}
      <Modal
        visible={editLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setEditLocationModal(false)}
      >
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 24, paddingHorizontal: 16, minWidth: 360, maxWidth: '95%', borderWidth: 1, borderColor: colors.cardBorder }}>
            {user ? (
              <>
                <Text style={{ fontWeight:'bold', fontSize:16, color: colors.primary, marginBottom:8 }}>Filtrar por Bairro</Text>
                <Text style={{ color: colors.textSecondary, marginBottom:8 }}>Selecione o bairro para filtrar. Cidade e estado são do seu perfil.</Text>
                <Text style={{ marginBottom: 6, color: colors.text }}>Estado</Text>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 12, minWidth: 320, maxWidth: '100%', width: '100%', height: 56, justifyContent: 'center', backgroundColor: colors.inputBg }}>
                  <Text style={{ paddingLeft: 12, paddingTop: 16, fontSize: 16, color: colors.textSecondary }}>{editState}</Text>
                </View>
                <Text style={{ marginBottom: 6, color: colors.text }}>Cidade</Text>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 12, minWidth: 320, maxWidth: '100%', width: '100%', height: 56, justifyContent: 'center', backgroundColor: colors.inputBg }}>
                  <Text style={{ paddingLeft: 12, paddingTop: 16, fontSize: 16, color: colors.textSecondary }}>{editCity}</Text>
                </View>
                <Text style={{ marginBottom: 6, color: colors.text }}>Bairro</Text>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 16, minWidth: 320, maxWidth: '100%', width: '100%', height: 56, justifyContent: 'center', backgroundColor: colors.inputBg }}>
                  <Picker
                    selectedValue={editNeighborhood}
                    onValueChange={setEditNeighborhood}
                    enabled={!!editCity}
                    style={{ height: 56, minWidth: 320, color: colors.text }}
                    dropdownIconColor={colors.textSecondary}
                  >
                    <Picker.Item label="Selecione o bairro" value="" />
                    {(neighborhoodsByCity[editCity] || []).map(bairro => (
                      <Picker.Item key={bairro} label={bairro} value={bairro} />
                    ))}
                  </Picker>
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontWeight:'bold', fontSize:16, color: colors.primary, marginBottom:8 }}>Filtrar por Localidade</Text>
                <Text style={{ color: colors.textSecondary, marginBottom:8 }}>Selecione estado, cidade e bairro para filtrar.</Text>
                <Text style={{ marginBottom: 6, color: colors.text }}>Estado</Text>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 12, minWidth: 320, maxWidth: '100%', width: '100%', height: 56, justifyContent: 'center', backgroundColor: colors.inputBg }}>
                  <Picker
                    selectedValue={editState}
                    onValueChange={uf => {
                      setEditState(uf);
                      setEditCity('');
                      setEditNeighborhood('');
                    }}
                    style={{ height: 56, minWidth: 320, color: colors.text }}
                    dropdownIconColor={colors.textSecondary}
                  >
                    <Picker.Item label="Selecione o estado" value="" />
                    {states.map(uf => (
                      <Picker.Item key={uf} label={uf} value={uf} />
                    ))}
                  </Picker>
                </View>
                <Text style={{ marginBottom: 6, color: colors.text }}>Cidade</Text>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 12, minWidth: 320, maxWidth: '100%', width: '100%', height: 56, justifyContent: 'center', backgroundColor: colors.inputBg }}>
                  <Picker
                    selectedValue={editCity}
                    onValueChange={city => {
                      setEditCity(city);
                      setEditNeighborhood('');
                    }}
                    enabled={!!editState}
                    style={{ height: 56, minWidth: 320, color: colors.text }}
                    dropdownIconColor={colors.textSecondary}
                  >
                    <Picker.Item label="Selecione a cidade" value="" />
                    {(citiesByState[editState] || []).map(city => (
                      <Picker.Item key={city} label={city} value={city} />
                    ))}
                  </Picker>
                </View>
                <Text style={{ marginBottom: 6, color: colors.text }}>Bairro</Text>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 16, minWidth: 320, maxWidth: '100%', width: '100%', height: 56, justifyContent: 'center', backgroundColor: colors.inputBg }}>
                  <Picker
                    selectedValue={editNeighborhood}
                    onValueChange={setEditNeighborhood}
                    enabled={!!editCity}
                    style={{ height: 56, minWidth: 320, color: colors.text }}
                    dropdownIconColor={colors.textSecondary}
                  >
                    <Picker.Item label="Selecione o bairro" value="" />
                    {(neighborhoodsByCity[editCity] || []).map(bairro => (
                      <Picker.Item key={bairro} label={bairro} value={bairro} />
                    ))}
                  </Picker>
                </View>
              </>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setEditState(user ? editState : '');
                  setEditCity(user ? editCity : '');
                  setEditNeighborhood('');
                }}
                style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }}>Limpar Filtro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditLocationModal(false)}
                style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: isDark ? '#1E293B' : '#E5E7EB', borderRadius: 8 }}
              >
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  setLocationFilterTouched(true);
                  setEditLocationModal(false);
                  setLocationFilter(`${editCity}, ${editState}${editNeighborhood ? ', ' + editNeighborhood : ''}`);
                  loadItems(); // Carrega imediatamente após salvar
                  // Atualiza localidade no perfil do usuário
                  try {
                    if (user && user.id) {
                    await userService.updateProfile(user.id, { neighborhood: editNeighborhood });
                  }
                } catch (e) {
                  console.log('[HomeScreen] Erro ao atualizar localidade no perfil:', e.message);
                }
              }} style={{ paddingVertical:8, paddingHorizontal:16 }}>
                <Text style={{ color: colors.primary, fontWeight:'bold' }}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Filtros rápidos */}
      <View style={[styles.filterToolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterToolbarContent}>
          <TouchableOpacity
            style={[
              styles.filterToggle,
              { backgroundColor: isDark ? '#1E293B' : COLORS.primaryLight, borderColor: isDark ? '#334155' : COLORS.primaryBorder, position: 'relative' },
              showAdvancedFilters && styles.filterToggleActive,
            ]}
            onPress={() => setShowAdvancedFilters(v => !v)}
            accessibilityLabel="Abrir filtros avançados"
          >
            <MaterialIcons name="tune" size={20} color={showAdvancedFilters ? '#fff' : colors.primary} />
            {activeAdvancedFiltersCount > 0 && (
              <View style={{
                position: 'absolute',
                top: -4,
                right: -4,
                backgroundColor: colors.primary,
                borderRadius: 10,
                minWidth: 18,
                height: 18,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
                borderWidth: 2,
                borderColor: colors.surface,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>{activeAdvancedFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? '#1E293B' : '#E5E7EB', borderColor: isDark ? '#334155' : '#E5E7EB' },
              filters.status === 'all' && styles.filterChipActive,
            ]}
            onPress={() => setFilters({ ...filters, status: 'all' })}
            activeOpacity={0.85}
          >
            <MaterialIcons name="grid-view" size={13.5} color={filters.status === 'all' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#4B5563')} style={{ marginRight: 4 }} />
            <Text style={[styles.filterChipText, { color: isDark ? '#94A3B8' : '#1F2937' }, filters.status === 'all' && styles.filterChipTextActive]}>Todos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? '#1E293B' : '#E5E7EB', borderColor: isDark ? '#334155' : '#E5E7EB' },
              filters.status === 'lost' && styles.filterChipActive,
            ]}
            onPress={() => setFilters({ ...filters, status: 'lost' })}
            activeOpacity={0.85}
          >
            <MaterialIcons name="priority-high" size={14} color={filters.status === 'lost' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#4B5563')} style={{ marginRight: 2 }} />
            <Text style={[styles.filterChipText, { color: isDark ? '#94A3B8' : '#1F2937' }, filters.status === 'lost' && styles.filterChipTextActive]}>Perdidos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? '#1E293B' : '#E5E7EB', borderColor: isDark ? '#334155' : '#E5E7EB' },
              filters.status === 'found' && styles.filterChipActive,
            ]}
            onPress={() => setFilters({ ...filters, status: 'found' })}
            activeOpacity={0.85}
          >
            <MaterialIcons name="search" size={15} color={filters.status === 'found' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#4B5563')} style={{ marginRight: 4 }} />
            <Text style={[styles.filterChipText, { color: isDark ? '#94A3B8' : '#1F2937' }, filters.status === 'found' && styles.filterChipTextActive]}>Encontrados</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? '#1E293B' : '#E5E7EB', borderColor: isDark ? '#334155' : '#E5E7EB' },
              filters.status === 'adoption' && styles.filterChipActive,
            ]}
            onPress={() => setFilters({ ...filters, status: 'adoption' })}
            activeOpacity={0.85}
          >
            <MaterialIcons name="favorite-border" size={13.5} color={filters.status === 'adoption' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#4B5563')} style={{ marginRight: 4 }} />
            <Text style={[styles.filterChipText, { color: isDark ? '#94A3B8' : '#1F2937' }, filters.status === 'adoption' && styles.filterChipTextActive]}>Para Adoção</Text>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: isDark ? '#1E293B' : '#E5E7EB', borderColor: isDark ? '#334155' : '#E5E7EB' },
                filters.showMyItems && styles.filterChipActive,
              ]}
              onPress={handleMyItemsToggle}
              activeOpacity={0.85}
              accessibilityLabel="Minhas publicações"
            >
              <MaterialIcons
                name="person-outline"
                size={15}
                color={filters.showMyItems ? '#FFFFFF' : (isDark ? '#94A3B8' : '#4B5563')}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: isDark ? '#94A3B8' : '#1F2937' },
                  filters.showMyItems && styles.filterChipTextActive,
                ]}
              >
                Minhas Publicações
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* MODAL DE FILTROS AVANÇADOS */}
      <AdvancedFiltersModal
        visible={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        currentFilters={advancedFilters}
        onApply={(newFilters) => {
          setAdvancedFilters(newFilters);
          setFilters(prev => ({ ...prev, ...newFilters }));
        }}
      />
      {/* Banner Informativo do Raio de Busca (Apenas quando houver cidade/estado específico) */}
      {Boolean(locationFilter && locationFilter.trim().length > 0 && headerLocationSummary !== 'Todo o Brasil') && (
        <View style={[styles.radiusBanner, { backgroundColor: isDark ? '#091512' : COLORS.primaryLight, borderColor: isDark ? '#1C362D' : COLORS.primaryBorder }]}>
          <View style={styles.radiusBannerLeft}>
            <View style={[styles.radarIconContainer, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
              <MaterialIcons name="radar" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.radiusBannerTitle, { color: isDark ? colors.primaryLight : colors.primaryDark }]}>
                Raio de {searchRadiusKm} km ativo
              </Text>
              <Text style={[styles.radiusBannerSubtitle, { color: isDark ? '#34D399' : '#1E3E24' }]} numberOfLines={1}>
                Exibindo {radiusStatusText} próximos a sua localização
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              setSelectedQuickRadius(searchRadiusKm);
              setShowQuickRadiusModal(true);
            }}
            style={[styles.radiusResetButton, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#1C362D' : '#A7F3D0', flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            activeOpacity={0.8}
          >
            <MaterialIcons name="tune" size={14} color={colors.primary} />
            <Text style={[styles.radiusResetText, { color: isDark ? '#34D399' : colors.primary }]}>Ajustar Raio</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal Rápida de Ajuste do Raio de Busca */}
      <Modal
        visible={showQuickRadiusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuickRadiusModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: colors.cardBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <MaterialIcons name="radar" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 17, color: colors.text }}>
                  Ajustar Raio de Busca
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Alcance atual: <Text style={{ fontWeight: '800', color: colors.primary }}>{selectedQuickRadius} km</Text>
                </Text>
              </View>
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 10, marginBottom: 6, lineHeight: 18 }}>
              Escolha a distância máxima para exibir os pets cadastrados nesta região:
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }}>
              {[5, 10, 20, 35, 50, 80].map((r) => {
                const isSelected = selectedQuickRadius === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setSelectedQuickRadius(r)}
                    activeOpacity={0.75}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected ? colors.primary : (isDark ? colors.surface : '#FFFFFF'),
                      minWidth: 70,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: isSelected ? '800' : '600',
                      color: isSelected ? '#FFFFFF' : colors.text,
                    }}>
                      {r} km
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setShowQuickRadiusModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                activeOpacity={0.75}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSaveQuickRadius(selectedQuickRadius)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Aplicar Raio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lista de Itens com Virtualização de Alta Performance */}
      <FlatList
        data={finalDisplayItems}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            user={user}
            userProfile={userProfile}
            thumbnails={thumbnails}
            handleSendMessage={handleSendMessage}
            handleEditItem={handleEditItem}
            handleDeleteItem={handleDeleteItem}
            onPress={() => {
              navigation.navigate('ItemDetail', { itemId: item.id });
            }}
            onPressOwner={(ownerId, ownerName, ownerAvatar) => {
              navigation.navigate('UserProfile', {
                userId: ownerId,
                userName: ownerName,
                avatarUrl: ownerAvatar,
              });
            }}
          />
        )}
        keyExtractor={item => {
          if (item && item.id !== undefined && item.id !== null) {
            return String(item.id);
          }
          return `item-${Math.random().toString(36).slice(2, 9)}`;
        }}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="pets" size={46} color={isDark ? '#334155' : '#CBD5E1'} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {locationFilter && headerLocationSummary !== 'Todo o Brasil'
                ? `Nenhum animal encontrado em um raio de ${searchRadiusKm} km de ${headerLocationSummary}.`
                : 'Nenhum animal cadastrado nesta categoria.'}
            </Text>
            {locationFilter && headerLocationSummary !== 'Todo o Brasil' ? (
              <TouchableOpacity
                onPress={handleResetToBrazil}
                style={{
                  marginTop: 12,
                  backgroundColor: isDark ? '#11221C' : '#ECFDF5',
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isDark ? '#1C362D' : '#A7F3D0',
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: isDark ? '#34D399' : colors.primary, fontWeight: 'bold', fontSize: 13 }}>
                  Ver animais de todo o Brasil
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  profileMenu: {
    position: 'absolute',
    top: 56,
    right: 18,
    width: 236,
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,    zIndex: 100,
  },
  profileMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
  },
  profileMenuAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary || '#B1734A',
    overflow: 'hidden',
  },
  profileMenuAvatarImage: { width: 36, height: 36 },
  profileMenuAvatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  profileMenuIdentity: { flex: 1, marginLeft: 10 },
  profileMenuName: { color: '#111827', fontSize: 14, fontWeight: '800' },
  profileMenuEmail: { color: '#6B7280', fontSize: 11, marginTop: 2 },
  profileMenuItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  profileMenuIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
  },
  profileMenuAdminIcon: { backgroundColor: COLORS.primaryLight },
  profileMenuLogoutIcon: { backgroundColor: '#FEF2F2' },
  profileMenuItemText: { flex: 1, marginLeft: 10, color: '#1F2937', fontSize: 14, fontWeight: '700' },
  profileMenuLogoutText: { flex: 1, marginLeft: 10, color: '#DC2626', fontSize: 14, fontWeight: '700' },
  profileMenuDivider: { height: 1, marginVertical: 4, backgroundColor: '#E5E7EB' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  filterToolbar: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
  },
  filterToolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  filterToggle: {
    width: 38,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  filterToggleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  advancedFiltersPanel: {
    padding: 16,
    marginHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 12,  },
  advHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  advPanelTitle: {
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  profileMenuIconBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  profileMenuText: { fontSize: 13.5, color: '#1F2937', fontWeight: '600' },
  profileMenuDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 4 },
  advFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  advFilterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  advFilterBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  advSection: {
    gap: 6,
  },
  advSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  advPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  advPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  advPillActive: {  },
  advPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  advPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  locationFilterRow: {
    marginTop: 14,
  },
  locationFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
  },
  locationFilterText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  searchContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 12,
  },
  searchInputWrapper: {
    flex: 1,
  },
  searchLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '600',
  },
  searchActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 0,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: 14,
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  itemsList: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  itemCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  itemImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  itemImagePlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemImagePlaceholderText: {
    color: '#6B7280',
    fontSize: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  itemDescription: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 8,
    lineHeight: 18,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemLocation: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemCategory: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemDate: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  ownerInfo: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  ownerName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  ownerEmail: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  ownerInfoExpanded: {
    paddingVertical: 8,
    marginVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  expandedContent: {
    marginVertical: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 8,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
  },
  expandButton: {
    marginTop: 8,
  },
  photoThumb: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#E5E7EB',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  radiusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryLight,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  radiusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  radarIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  radiusBannerSubtitle: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 1,
  },
  radiusResetButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  radiusResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  fabButton: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,  },
});

export default HomeScreen;
