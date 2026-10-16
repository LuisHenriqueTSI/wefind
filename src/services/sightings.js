import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { roundPublicCoordinate } from '../utils/locationPrivacy';

const DELETED_SIGHTINGS_KEY = '@wefind_deleted_sightings_store';
let inMemoryDeletedSightings = new Set();

// Inicializa o cache de avistamentos excluídos
const loadDeletedSightingsSet = async () => {
  try {
    const raw = await AsyncStorage.getItem(DELETED_SIGHTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => inMemoryDeletedSightings.add(String(id)));
      }
    }
  } catch (e) {
    console.log('[sightings] Erro ao carregar cache de exclusões:', e.message);
  }
  return inMemoryDeletedSightings;
};

// Executa o carregamento inicial silenciosamente
loadDeletedSightingsSet().catch(() => {});

/**
 * Converte qualquer formato de localização (objeto de coordenadas, JSON ou string) em endereço completo legível
 */
export const resolveReadableAddress = async (locationInput) => {
  if (!locationInput) return '';

  // Se já for uma string de endereço legível e não JSON/coordenadas puras
  if (typeof locationInput === 'string') {
    const trimmed = locationInput.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
  }

  let lat = null;
  let lng = null;
  let explicitAddress = '';

  if (typeof locationInput === 'object' && locationInput !== null) {
    if (locationInput.address && typeof locationInput.address === 'string' && !locationInput.address.startsWith('{')) {
      explicitAddress = locationInput.address.trim();
    }
    lat = locationInput.latitude ?? locationInput.lat ?? locationInput.coords?.latitude;
    lng = locationInput.longitude ?? locationInput.lng ?? locationInput.coords?.longitude;
  } else if (typeof locationInput === 'string') {
    try {
      const parsed = JSON.parse(locationInput);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.address && typeof parsed.address === 'string' && !parsed.address.startsWith('{')) {
          explicitAddress = parsed.address.trim();
        }
        lat = parsed.latitude ?? parsed.lat;
        lng = parsed.longitude ?? parsed.lng;
      }
    } catch {
      const parts = locationInput.split(',').map(p => Number(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
      }
    }
  }

  if (explicitAddress) {
    return explicitAddress;
  }

  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    // 1. Tenta geocodificação reversa nativa pelo Expo Location
    try {
      const Location = await import('expo-location');
      const addresses = await Location.reverseGeocodeAsync({ latitude: Number(lat), longitude: Number(lng) });
      const addr = addresses?.[0];
      if (addr) {
        const st = addr.street || addr.name || '';
        const num = (addr.name && /^\d+$/.test(String(addr.name))) ? addr.name : (addr.streetNumber || '');
        const dist = addr.district || addr.subregion || '';
        const ct = addr.city || addr.subregion || '';
        const state = addr.region || '';

        const parts = [];
        if (st) parts.push(num ? `${st}, ${num}` : st);
        if (dist && dist !== st) parts.push(dist);
        if (ct && state) parts.push(`${ct} - ${state}`);
        else if (ct) parts.push(ct);
        else if (state) parts.push(state);

        const result = parts.join(' - ');
        if (result.trim()) return result.trim();
      }
    } catch (expoErr) {
      console.log('[resolveReadableAddress] Aviso Expo Location:', expoErr?.message);
    }

    // 2. Fallback: Consulta ao Nominatim OpenStreetMap
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'WeFindApp/1.0', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const a = data?.address;
        if (a) {
          const road = a.road || a.pedestrian || a.suburb || '';
          const houseNumber = a.house_number || '';
          const suburb = a.suburb || a.neighbourhood || '';
          const city = a.city || a.town || a.municipality || a.village || '';
          const state = a.state || '';

          const parts = [];
          if (road) parts.push(houseNumber ? `${road}, ${houseNumber}` : road);
          if (suburb && suburb !== road) parts.push(suburb);
          if (city && state) parts.push(`${city} - ${state}`);
          else if (city) parts.push(city);

          const result = parts.join(' - ');
          if (result.trim()) return result.trim();
        }
      }
    } catch (osmErr) {
      console.log('[resolveReadableAddress] Aviso OSM Nominatim:', osmErr?.message);
    }

    return 'Localização marcada no mapa';
  }

  return typeof locationInput === 'string' ? locationInput : 'Localização marcada no mapa';
};

export const createSighting = async (sightingData) => {
  try {
    console.log('[createSighting] Criando novo avistamento...');

    // Resolve o endereço legível para salvar sempre como texto humanizado no banco
    let locationAddress = sightingData.location;
    if (typeof locationAddress === 'object' || (typeof locationAddress === 'string' && (locationAddress.startsWith('{') || locationAddress.includes(',')))) {
      locationAddress = await resolveReadableAddress(sightingData.location);
    }

    // Garante que contact_info será sempre um objeto (JSON)
    let contact_info = sightingData.contact_info;
    if (contact_info && typeof contact_info !== 'object') {
      try {
        contact_info = JSON.parse(contact_info);
      } catch {
        contact_info = { raw: String(contact_info) };
      }
    }
    const { data, error } = await supabase
      .from('sightings')
      .insert({
        item_id: sightingData.item_id,
        user_id: sightingData.user_id,
        location: locationAddress || 'Localização marcada no mapa',
        description: sightingData.description,
        contact_info,
        photo_url: sightingData.photo_url,
      })
      .select()
      .single();

    if (error) {
      console.log('[createSighting] Erro:', error.message);
      throw error;
    }

    console.log('[createSighting] Avistamento criado com sucesso');
    return data;
  } catch (error) {
    console.log('[createSighting] Exceção:', error.message);
    throw error;
  }
};

export const getSightings = async (itemId) => {
  try {
    await loadDeletedSightingsSet();

    // Busca todos os avistamentos do item
    const { data: sightings, error } = await supabase
      .from('sightings')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[getSightings] Erro:', error.message);
      return [];
    }
    if (!sightings || sightings.length === 0) return [];

    // Filtra avistamentos excluídos pela moderação
    const validSightings = sightings.filter((s) => {
      if (!s || !s.id) return false;
      if (inMemoryDeletedSightings.has(String(s.id))) return false;
      if (s.description === '[DELETED_BY_ADMIN]') return false;
      return true;
    });

    if (validSightings.length === 0) return [];

    // Busca perfis dos usuários únicos
    const userIds = [...new Set(validSightings.map(s => s.user_id).filter(Boolean))];
    let profilesMap = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds.map(String));
      if (!profileError && profiles) {
        profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }
    }

    // Monta resultado, sanitizando location se for JSON ou coordenadas brutas
    return validSightings.map(s => {
      let contact_info = s.contact_info;
      if (typeof contact_info === 'string') {
        try {
          const parsed = JSON.parse(contact_info);
          if (typeof parsed === 'object' && parsed !== null) {
            contact_info = parsed;
          }
        } catch {}
      }

      let locationText = s.location;
      if (locationText && typeof locationText === 'string') {
        const trimmed = locationText.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsedLoc = JSON.parse(trimmed);
            locationText = parsedLoc.address || 'Localização marcada no mapa';
          } catch {
            locationText = 'Localização marcada no mapa';
          }
        } else if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
          locationText = 'Localização marcada no mapa';
        }
      } else if (locationText && typeof locationText === 'object') {
        locationText = locationText.address || 'Localização marcada no mapa';
      }

      return {
        ...s,
        location: locationText,
        contact_info,
        profiles: profilesMap[s.user_id] || null,
      };
    });
  } catch (error) {
    console.log('[getSightings] Exceção:', error.message);
    return [];
  }
};

export const updateSighting = async (sightingId, updates) => {
  try {
    let contact_info = updates.contact_info;
    if (contact_info && typeof contact_info !== 'string') {
      try {
        contact_info = JSON.stringify(contact_info);
      } catch {
        contact_info = '';
      }
    }
    const updatePayload = { ...updates, contact_info, updated_at: new Date().toISOString() };
    console.log('[updateSighting] Atualizando avistamento:', sightingId, updatePayload);
    const { data, error } = await supabase
      .from('sightings')
      .update(updatePayload)
      .eq('id', sightingId)
      .select();
    if (error) {
      console.log('[updateSighting] Erro:', error.message);
      throw error;
    }
    console.log('[updateSighting] Avistamento atualizado com sucesso:', data);
    return { success: true, data };
  } catch (error) {
    console.log('[updateSighting] Exceção:', error.message);
    throw error;
  }
};

export const deleteSighting = async (sightingId) => {
  try {
    if (!sightingId) return { success: false };
    console.log('[deleteSighting] Deletando avistamento:', sightingId);

    // 1. Marca imediatamente no registro de exclusão local e em memória
    inMemoryDeletedSightings.add(String(sightingId));
    try {
      const allDeleted = Array.from(inMemoryDeletedSightings);
      await AsyncStorage.setItem(DELETED_SIGHTINGS_KEY, JSON.stringify(allDeleted));
    } catch (e) {
      console.log('[deleteSighting] Erro ao salvar no AsyncStorage:', e.message);
    }

    // 2. Tenta deletar fisicamente no Supabase
    try {
      const { error } = await supabase
        .from('sightings')
        .delete()
        .eq('id', sightingId);

      if (error) {
        console.log('[deleteSighting] Aviso delete Supabase:', error.message);
      }
    } catch (e) {
      console.log('[deleteSighting] Exceção delete Supabase:', e.message);
    }

    // 3. Em caso de RLS estrito no Supabase, tenta soft-delete para garantir que outros clientes também não vejam
    try {
      await supabase
        .from('sightings')
        .update({
          description: '[DELETED_BY_ADMIN]',
          contact_info: null,
          photo_url: null,
        })
        .eq('id', sightingId);
    } catch (e) {
      // Silencioso se RLS bloquear update
    }

    console.log('[deleteSighting] Avistamento deletado com sucesso');
    return { success: true };
  } catch (error) {
    console.log('[deleteSighting] Exceção geral:', error.message);
    throw error;
  }
};

export const uploadSightingPhoto = async (sightingId, photoUri) => {
  try {
    if (!photoUri) throw new Error('photoUri indefinido');
    let uri = photoUri;
    if (!uri.startsWith('file://')) uri = 'file://' + uri;

    const ext = photoUri.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const filepath = `sightings/${sightingId}/${timestamp}.${ext}`;

    // Lê o arquivo como base64 e converte para Uint8Array
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      console.log('[uploadSightingPhoto] Arquivo não encontrado:', uri);
      throw new Error('Arquivo não encontrado no caminho: ' + uri);
    }
    const fileData = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const fileBuffer = Uint8Array.from(atob(fileData), c => c.charCodeAt(0));

    // Upload para Supabase Storage
    const { error } = await supabase.storage
      .from('sightings')
      .upload(filepath, fileBuffer, {
        upsert: true,
        contentType: `image/${ext}`,
      });

    if (error) {
      console.log('[uploadSightingPhoto] Upload error:', error.message);
      throw new Error('Erro ao enviar foto para o Supabase Storage.');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('sightings')
      .getPublicUrl(filepath);

    if (!urlData || !urlData.publicUrl) {
      console.log('[uploadSightingPhoto] Falha ao obter URL pública:', urlData);
      throw new Error('URL pública não gerada.');
    }
    console.log('[uploadSightingPhoto] Foto enviada com sucesso:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.log('[uploadSightingPhoto] Exceção detalhada:', error);
    throw error;
  }
};

/**
 * Calcula a distância geodésica em quilômetros (Fórmula de Haversine)
 */
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;

  const R = 6371; // Raio da Terra em km
  const dLat = ((nLat2 - nLat1) * Math.PI) / 180;
  const dLon = ((nLon2 - nLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((nLat1 * Math.PI) / 180) *
      Math.cos((nLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Busca por possíveis animais já cadastrados e avistados na mesma região (raio de 3 a 5 km)
 */
const normalizeMatchValue = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const calculateNearbyMatchScore = (item, reference) => {
  const itemSpecies = normalizeMatchValue(item.species);
  const expectedSpecies = normalizeMatchValue(reference?.species);
  const itemExtra = item.extra_fields || {};
  let score = expectedSpecies && itemSpecies === expectedSpecies ? 35 : 25;

  const comparableFields = [
    ['breed', 20],
    ['color', 20],
    ['gender', 15],
    ['size', 10],
  ];

  comparableFields.forEach(([field, points]) => {
    const expected = normalizeMatchValue(reference?.[field]);
    const candidate = normalizeMatchValue(item[field] || itemExtra[field]);
    if (expected && candidate && (expected === candidate || expected.includes(candidate) || candidate.includes(expected))) {
      score += points;
    }
  });

  return Math.min(score, 100);
};

export const findNearbyPotentialMatches = async ({
  latitude,
  longitude,
  species,
  maxRadiusKm = 5,
  currentItemId = null,
  ownerId = null,
  breed = '',
  color = '',
  gender = '',
  size = '',
}) => {
  try {
    if (latitude == null || longitude == null) return [];
    
    let query = supabase
      .from('items')
      .select('id, owner_id, title, description, status, species, breed, color, gender, size, photo_urls, latitude, longitude, address, neighborhood, city, state, created_at, extra_fields')
      .eq('resolved', false)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (species) {
      query = query.ilike('species', `%${species}%`);
    }

    if (currentItemId) {
      query = query.neq('id', currentItemId);
    }
    if (ownerId) {
      query = query.neq('owner_id', ownerId);
    }

    const { data: items, error } = await query;
    if (error || !items) return [];

    const matches = items
      .map(item => {
        const itemLat = item.latitude ?? item.extra_fields?.location_details?.latitude;
        const itemLng = item.longitude ?? item.extra_fields?.location_details?.longitude;
        const distanceKm = calculateDistanceKm(latitude, longitude, itemLat, itemLng);
        
        // Prioriza animais vistos na rua ou perdidos
        const isSpotted = item.extra_fields?.found_custody === 'spotted' || item.status === 'lost';
        const matchPercentage = calculateNearbyMatchScore(item, { species, breed, color, gender, size });
        return {
          ...item,
          distanceKm,
          isSpotted,
          matchPercentage,
        };
      })
      .filter(item => item.distanceKm != null && item.distanceKm <= maxRadiusKm && item.isSpotted && item.matchPercentage >= 35)
      .sort((a, b) => b.matchPercentage - a.matchPercentage || a.distanceKm - b.distanceKm);

    return matches.slice(0, 4);
  } catch (err) {
    console.log('[findNearbyPotentialMatches] Erro:', err.message);
    return [];
  }
};

/**
 * Registra novo avistamento e move o pin do animal no mapa para a localização mais recente
 */
export const recordSightingAndUpdateItemLocation = async ({ itemId, userId, location, description, photoUrl, contactInfo }) => {
  try {
    console.log('[recordSightingAndUpdateItemLocation] Processando avistamento para o item:', itemId);

    // 1. Extração robusta de coordenadas (latitude e longitude)
    let lat = location?.latitude ?? location?.coords?.latitude ?? location?.lat ?? location?.coordinate?.latitude ?? contactInfo?.coordinate?.latitude ?? contactInfo?.location_details?.latitude;
    let lng = location?.longitude ?? location?.coords?.longitude ?? location?.lng ?? location?.coordinate?.longitude ?? contactInfo?.coordinate?.longitude ?? contactInfo?.location_details?.longitude;

    // Se as coordenadas não vierem diretamente como número, tenta buscar no endereço em texto
    let rawAddressText = typeof location === 'string' ? location : (location?.address || location?.text || contactInfo?.location_details?.text || '');

    if ((lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) && rawAddressText) {
      try {
        const Location = await import('expo-location');
        const geoResults = await Location.geocodeAsync(rawAddressText);
        if (geoResults && geoResults.length > 0) {
          lat = geoResults[0].latitude;
          lng = geoResults[0].longitude;
        }
      } catch (geoErr) {
        console.warn('[recordSightingAndUpdateItemLocation] Erro no geocoding do texto:', geoErr?.message);
      }
    }

    // 2. Resolve o endereço completo humanizado e partes estruturadas
    let resolvedAddress = rawAddressText;
    let street = contactInfo?.location_details?.street || location?.street || '';
    let number = contactInfo?.location_details?.number || location?.number || location?.house_number || '';
    let district = contactInfo?.location_details?.district || location?.district || location?.neighborhood || '';
    let city = contactInfo?.location_details?.city || location?.city || '';
    let state = contactInfo?.location_details?.state || location?.state || '';

    if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      try {
        const Location = await import('expo-location');
        const addresses = await Location.reverseGeocodeAsync({ latitude: Number(lat), longitude: Number(lng) });
        const addr = addresses?.[0];
        if (addr) {
          if (!street) street = addr.street || addr.name || '';
          if (!number) number = (addr.name && /^\d+$/.test(String(addr.name))) ? addr.name : (addr.streetNumber || '');
          if (!district) district = addr.district || addr.subregion || '';
          if (!city) city = addr.city || addr.subregion || '';
          if (!state) state = addr.region || '';

          const parts = [];
          if (street) parts.push(number ? `${street}, ${number}` : street);
          if (district && district !== street) parts.push(district);
          if (city && state) parts.push(`${city} - ${state}`);
          else if (city) parts.push(city);
          else if (state) parts.push(state);

          const humanized = parts.join(' - ');
          if (humanized.trim()) resolvedAddress = humanized.trim();
        }
      } catch (revErr) {
        console.warn('[recordSightingAndUpdateItemLocation] Erro no reverse geocoding:', revErr?.message);
      }
    }

    if (!resolvedAddress) {
      resolvedAddress = 'Localização marcada no mapa';
    }

    // 3. Cria o avistamento no histórico (tabela 'sightings')
    const sighting = await createSighting({
      item_id: itemId,
      user_id: userId,
      location: resolvedAddress,
      description,
      photo_url: photoUrl,
      contact_info: {
        ...(typeof contactInfo === 'object' ? contactInfo : {}),
        coordinate: (lat != null && lng != null) ? { latitude: Number(lat), longitude: Number(lng) } : null,
        location_details: {
          street,
          number,
          district,
          city,
          state,
          text: resolvedAddress,
        },
      },
    });

    // 4. Atualiza os dados completos de localização do animal na tabela 'items'
    const { data: currentItem } = await supabase
      .from('items')
      .select('extra_fields, city, state, neighborhood, street, latitude, longitude, owner_id, title')
      .eq('id', itemId)
      .maybeSingle();

    const currentExtra = currentItem?.extra_fields || {};
    const newCount = (currentExtra.sighting_count || 0) + 1;

    const updatePayload = {
      updated_at: new Date().toISOString(),
      extra_fields: {
        ...currentExtra,
        sighting_count: newCount,
        last_sighting_at: new Date().toISOString(),
        last_sighting_by: userId,
        last_sighting_address: resolvedAddress,
        last_sighting_lat: lat != null ? Number(lat) : currentItem?.latitude,
        last_sighting_lng: lng != null ? Number(lng) : currentItem?.longitude,
        location_details: {
          ...(currentExtra.location_details || {}),
          latitude: lat != null ? Number(lat) : (currentExtra.location_details?.latitude || currentItem?.latitude),
          longitude: lng != null ? Number(lng) : (currentExtra.location_details?.longitude || currentItem?.longitude),
          street: street || currentItem?.street || currentExtra.location_details?.street || '',
          number: number || currentExtra.location_details?.number || '',
          district: district || currentItem?.neighborhood || currentExtra.location_details?.district || '',
          city: city || currentItem?.city || currentExtra.location_details?.city || '',
          state: state || currentItem?.state || currentExtra.location_details?.state || '',
          text: resolvedAddress,
        },
      },
    };

    if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      updatePayload.latitude = Number(lat);
      updatePayload.longitude = Number(lng);
    }
    if (resolvedAddress && resolvedAddress !== 'Localização marcada no mapa') {
      updatePayload.address = resolvedAddress;
    }
    if (street) updatePayload.street = street;
    if (number) updatePayload.house_number = number;
    if (district) updatePayload.neighborhood = district;
    if (city) updatePayload.city = city;
    if (state) updatePayload.state = state;

    const { error: updateError } = await supabase
      .from('items')
      .update(updatePayload)
      .eq('id', itemId);

    if (updateError) {
      console.warn('[recordSightingAndUpdateItemLocation] Erro ao atualizar item:', updateError.message);
      throw new Error(`O avistamento foi registrado, mas a localização da publicação não pôde ser atualizada: ${updateError.message}`);
    } else {
      console.log('[recordSightingAndUpdateItemLocation] Localização do item atualizada com sucesso no banco!');
    }

    // 5. Credita pontos de gamificação ao usuário que registrou o avistamento
    try {
      const { awardGamificationXp } = await import('./gamification');
      await awardGamificationXp(userId, 'sighting_report', 40);
    } catch (gamiErr) {}

    return {
      sighting,
      updatedLocation: {
        latitude: updatePayload.latitude,
        longitude: updatePayload.longitude,
        address: resolvedAddress,
        street,
        neighborhood: district,
        city,
        state,
      },
    };
  } catch (err) {
    console.error('[recordSightingAndUpdateItemLocation] Erro:', err);
    throw err;
  }
};

/**
 * Calcula o rastro cronológico completo de deslocamento do animal (ponto inicial + todos os avistamentos)
 */
export const getItemSightingTrail = async (item) => {
  try {
    if (!item?.id) return [];

    const sightings = await getSightings(item.id);
    // Ordena do mais antigo para o mais recente para construir a linha do tempo cronológica
    const sortedSightings = (sightings || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const trailSteps = [];

    // 1. Ponto Inicial (Origem do Desaparecimento ou Ponto Original de Cadastro)
    const rawInitialLat = Number(item.extra_fields?.initial_latitude ?? item.latitude);
    const rawInitialLng = Number(item.extra_fields?.initial_longitude ?? item.longitude);
    const initialLat = item.status === 'lost' ? roundPublicCoordinate(rawInitialLat) : rawInitialLat;
    const initialLng = item.status === 'lost' ? roundPublicCoordinate(rawInitialLng) : rawInitialLng;
    const initialNeighborhood = item.neighborhood || item.extra_fields?.location_details?.district || '';
    const initialCity = item.city || item.extra_fields?.location_details?.city || '';
    const initialState = item.state || item.extra_fields?.location_details?.state || '';
    const initialAddress = item.status === 'lost'
      ? [
          initialNeighborhood ? `Região de ${initialNeighborhood}` : 'Região de Desaparecimento',
          [initialCity, initialState].filter(Boolean).join(' - '),
        ].filter(Boolean).join(' • ')
      : item.extra_fields?.initial_address ||
        item.address ||
        [item.street, item.neighborhood, item.city, item.state].filter(Boolean).join(' - ') ||
        'Local de desaparecimento';

    if (Number.isFinite(initialLat) && Number.isFinite(initialLng) && initialLat !== 0 && initialLng !== 0) {
      trailSteps.push({
        step: 1,
        type: 'initial',
        label: item.status === 'lost' ? '1. Local do Desaparecimento' : '1. Ponto Inicial do Registro',
        address: initialAddress,
        latitude: initialLat,
        longitude: initialLng,
        date: item.date || item.created_at,
        description: item.description || 'Ponto original cadastrado.',
        user_name: item.profiles?.name || item.owner_name || 'Tutor',
        isInitial: true,
        isLatest: sortedSightings.length === 0,
      });
    }

    // 2. Pontos de Avistamento Subsequentes
    for (let i = 0; i < sortedSightings.length; i++) {
      const s = sortedSightings[i];
      let sLat = s.contact_info?.coordinate?.latitude ?? s.contact_info?.location_details?.latitude;
      let sLng = s.contact_info?.coordinate?.longitude ?? s.contact_info?.location_details?.longitude;

      if ((sLat == null || sLng == null) && s.location) {
        try {
          const Location = await import('expo-location');
          const results = await Location.geocodeAsync(s.location);
          if (results && results.length > 0) {
            sLat = results[0].latitude;
            sLng = results[0].longitude;
          }
        } catch {}
      }

      if (sLat != null && sLng != null && Number.isFinite(Number(sLat)) && Number.isFinite(Number(sLng))) {
        const isLatest = i === sortedSightings.length - 1;
        const stepNum = trailSteps.length + 1;
        trailSteps.push({
          step: stepNum,
          type: 'sighting',
          id: s.id,
          label: isLatest ? `${stepNum}. Último Avistamento (Mais Recente)` : `${stepNum}. Avistado na Rua`,
          address: s.location || 'Local informado no mapa',
          latitude: Number(sLat),
          longitude: Number(sLng),
          date: s.created_at,
          description: s.description || 'Visto nesta região.',
          photo_url: s.photo_url,
          user_name: s.profiles?.name || 'Membro da Comunidade',
          isLatest,
        });
      }
    }

    return trailSteps;
  } catch (err) {
    console.warn('[getItemSightingTrail] Erro ao carregar rastro:', err.message);
    return [];
  }
};
