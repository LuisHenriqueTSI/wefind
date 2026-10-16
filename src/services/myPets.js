import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import * as itemsService from './items';
import { broadcastLostPetAlertToNearbyUsers } from './pushNotifications';
import { processAndNotifyPetMatches } from './petMatching';
import { removeHouseNumberFromStreet } from '../utils/locationPrivacy';

const MY_PETS_STORAGE_KEY = '@wefind/my_registered_pets';

/**
 * Carrega a lista de pets domésticos do usuário
 * (Sincroniza entre perfil no Supabase e armazenamento local)
 */
export async function getMyPets(userId) {
  try {
    if (!userId) {
      const localData = await AsyncStorage.getItem(MY_PETS_STORAGE_KEY);
      return localData ? JSON.parse(localData) : [];
    }

    // 1. Tenta buscar no perfil do Supabase (extra_fields.my_pets)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('extra_fields')
      .eq('id', userId)
      .maybeSingle();

    if (!error && profile?.extra_fields?.my_pets) {
      const pets = profile.extra_fields.my_pets;
      await AsyncStorage.setItem(`${MY_PETS_STORAGE_KEY}_${userId}`, JSON.stringify(pets));
      return pets;
    }

    // 2. Fallback no armazenamento local
    const localData = await AsyncStorage.getItem(`${MY_PETS_STORAGE_KEY}_${userId}`);
    if (localData) {
      return JSON.parse(localData);
    }

    return [];
  } catch (error) {
    console.warn('[myPets] Erro ao buscar pets:', error.message);
    return [];
  }
}

/**
 * Salva ou atualiza um pet doméstico na lista do tutor
 */
export async function savePet(userId, petData) {
  try {
    if (!userId) throw new Error('Usuário não autenticado');

    const currentPets = await getMyPets(userId);
    const now = new Date().toISOString();

    let updatedPets = [];
    const isEditing = Boolean(petData.id);

    if (isEditing) {
      updatedPets = currentPets.map((p) =>
        p.id === petData.id ? { ...p, ...petData, updated_at: now } : p
      );
    } else {
      const newPet = {
        ...petData,
        id: `pet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        created_at: now,
        updated_at: now,
      };
      updatedPets = [newPet, ...currentPets];
    }

    // Salva localmente
    await AsyncStorage.setItem(`${MY_PETS_STORAGE_KEY}_${userId}`, JSON.stringify(updatedPets));

    // Salva no perfil do Supabase
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('extra_fields')
        .eq('id', userId)
        .maybeSingle();

      const existingExtra = profile?.extra_fields || {};
      await supabase
        .from('profiles')
        .update({
          extra_fields: {
            ...existingExtra,
            my_pets: updatedPets,
          },
        })
        .eq('id', userId);
    } catch (dbErr) {
      console.warn('[myPets] Aviso ao salvar no Supabase:', dbErr.message);
    }

    return updatedPets;
  } catch (error) {
    console.error('[myPets] Erro ao salvar pet:', error);
    throw error;
  }
}

/**
 * Exclui um pet cadastrado
 */
export async function deletePet(userId, petId) {
  try {
    if (!userId || !petId) return [];

    const currentPets = await getMyPets(userId);
    const updatedPets = currentPets.filter((p) => p.id !== petId);

    await AsyncStorage.setItem(`${MY_PETS_STORAGE_KEY}_${userId}`, JSON.stringify(updatedPets));

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('extra_fields')
        .eq('id', userId)
        .maybeSingle();

      const existingExtra = profile?.extra_fields || {};
      await supabase
        .from('profiles')
        .update({
          extra_fields: {
            ...existingExtra,
            my_pets: updatedPets,
          },
        })
        .eq('id', userId);
    } catch (dbErr) {
      console.warn('[myPets] Aviso ao excluir do Supabase:', dbErr.message);
    }

    return updatedPets;
  } catch (error) {
    console.error('[myPets] Erro ao excluir pet:', error);
    throw error;
  }
}

/**
 * ALERTA DE DESAPARECIMENTO: "🚨 Meu Pet Fugiu!"
 * Converte automaticamente o animal tutelado cadastrado em uma publicação de animal perdido no mapa,
 * dispara alerta por proximidade para a vizinhança e executa o motor de match inteligente!
 */
export async function declarePetLost(userId, pet, userProfile, locationOverride = null) {
  try {
    if (!userId || !pet) throw new Error('Dados do pet inválidos');

    const addressCity = locationOverride?.city || pet.city || userProfile?.city || '';
    const addressState = locationOverride?.state || pet.state || userProfile?.state || '';
    const addressNeighborhood = locationOverride?.neighborhood || pet.neighborhood || userProfile?.neighborhood || '';
    const addressStreet = removeHouseNumberFromStreet(locationOverride?.street || pet.street);
    const addressText = [addressStreet, addressNeighborhood, addressCity, addressState].filter(Boolean).join(' - ') || 'Local informado pelo tutor';
    const species = pet.species || 'Animal';
    const colorValue = String(pet.color || '').trim();
    const color = colorValue && colorValue.toLowerCase() !== 'não informado' ? colorValue.toLowerCase() : '';
    const statusLabel = species.toLowerCase() === 'ave' ? 'perdida' : 'perdido';
    const titleLocation = addressStreet || addressNeighborhood || addressCity;
    const locationPhrase = titleLocation
      ? (/^(rua|avenida|av\.|praça|praca|alameda|travessa|estrada|rodovia)\b/i.test(titleLocation)
        ? `na ${titleLocation}`
        : `em ${titleLocation}`)
      : '';
    const titleParts = [species, color, statusLabel, locationPhrase].filter(Boolean);
    const descriptionParts = [
      pet.name ? `Meu animal de estimação se chama ${pet.name} e desapareceu.` : 'Meu animal de estimação desapareceu.',
      pet.description?.trim(),
      pet.medical_notes ? `Observações médicas: ${pet.medical_notes}` : '',
    ].filter(Boolean);

    const itemData = {
      title: titleParts.join(' '),
      description: descriptionParts.join(' '),
      category: 'animal',
      status: 'lost',
      species: pet.species || 'Cachorro',
      breed: pet.breed || 'Sem raça definida',
      size: pet.size || 'Médio',
      color: pet.color || 'Não informado',
      gender: pet.gender || 'Macho',
      age: pet.age || 'Adulto',
      neutered: pet.neutered ? 'Sim' : 'Não',
      collar: 'Sim',
      owner_id: userId,
      city: addressCity,
      state: addressState,
      neighborhood: addressNeighborhood,
      street: addressStreet,
      address: addressText,
      latitude: locationOverride?.latitude || pet.latitude || userProfile?.extra_fields?.latitude || null,
      longitude: locationOverride?.longitude || pet.longitude || userProfile?.extra_fields?.longitude || null,
      extra_fields: {
        registered_pet_id: pet.id,
        pet_name: pet.name,
        species: pet.species,
        breed: pet.breed,
        size: pet.size,
        color: pet.color,
        gender: pet.gender,
        age: pet.age,
        microchip: pet.microchip,
        location_details: {
          city: addressCity,
          state: addressState,
          district: addressNeighborhood,
          street: addressStreet,
          text: addressText,
        },
      },
    };

    const photos = pet.photo_url ? [{ uri: pet.photo_url }] : [];

    // Cria a publicação no Supabase
    const resultItem = await itemsService.registerItem(itemData, photos);

    if (resultItem) {
      // 1. Dispara alerta comunitário por proximidade na mesma hora
      broadcastLostPetAlertToNearbyUsers(resultItem, userId).catch(() => {});

      // 2. Executa o motor de match inteligente
      processAndNotifyPetMatches(resultItem).catch(() => {});
    }

    return resultItem;
  } catch (error) {
    console.error('[myPets] Erro ao declarar fuga do pet:', error);
    throw error;
  }
}
