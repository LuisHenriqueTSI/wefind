// Remove todas as fotos de um item (banco e storage)
export const removeAllItemPhotos = async (itemId) => {
  try {
    const { data: photos, error: photosError } = await supabase
      .from('item_photos')
      .select('id, url')
      .eq('item_id', itemId);
    if (!photosError && photos && photos.length > 0) {
      for (const photo of photos) {
        try {
          // Extrai o caminho do arquivo do storage
          const url = new URL(photo.url);
          const filepath = url.pathname.split('/item-photos/')[1];
          if (filepath) {
            await supabase.storage.from('item-photos').remove([filepath]);
          }
        } catch (err) {
          console.error('[removeAllItemPhotos] Erro ao remover foto do storage:', err);
        }
      }
      // Remove registros do banco
      await supabase.from('item_photos').delete().eq('item_id', itemId);
    }
  } catch (err) {
    console.error('[removeAllItemPhotos] Erro geral:', err);
  }
};
const CLEANUP_THROTTLE_MS = 60 * 60 * 1000; // 1 hora
let lastCleanupTimestamp = 0;


const ensureCleanupExpiredItems = async () => {
  try {
    const now = Date.now();
    if (now - lastCleanupTimestamp < CLEANUP_THROTTLE_MS) {
      return { skipped: true };
    }

    lastCleanupTimestamp = now;
    return await cleanupExpiredItems();
  } catch (error) {
    console.log('[ensureCleanupExpiredItems] Falha ao verificar limpeza:', error.message);
    return { skipped: false, removed: 0, ids: [] };
  }
};

const getOwnerProfileSelection = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;

  return session?.user
    ? 'profiles!owner_id(name, email, whatsapp, phone, avatar_url, avatar_path)'
    : '';
};

const attachPublicItemRelations = async (items = []) => {
  if (!items.length) return [];

  const itemIds = items.map(item => item.id).filter(Boolean);
  const [{ data: photos, error: photosError }, { data: rewards, error: rewardsError }] = await Promise.all([
    supabase.from('item_photos').select('id, item_id, url').in('item_id', itemIds),
    supabase.from('rewards').select('id, item_id, amount, currency, status, description').in('item_id', itemIds),
  ]);

  if (photosError) {
    console.error('[attachPublicItemRelations] Não foi possível carregar fotos:', photosError.message);
  }
  if (rewardsError) {
    console.error('[attachPublicItemRelations] Não foi possível carregar recompensas:', rewardsError.message);
  }

  const photosByItem = (photos || []).reduce((groups, photo) => {
    if (!groups[photo.item_id]) groups[photo.item_id] = [];
    groups[photo.item_id].push({ id: photo.id, url: photo.url });
    return groups;
  }, {});
  const rewardsByItem = (rewards || []).reduce((groups, reward) => {
    if (!groups[reward.item_id]) groups[reward.item_id] = [];
    groups[reward.item_id].push(reward);
    return groups;
  }, {});

  return items.map(item => ({
    ...item,
    profiles: null,
    owner_name: 'Tutor',
    item_photos: photosByItem[item.id] || [],
    rewards: normalizeItemRewards({ ...item, rewards: rewardsByItem[item.id] || [] }),
    renewalInfo: getRenewalInfo(item),
  }));
};

const listPublicFeedItems = async (filters = {}) => {
  const { data, error } = await supabase.rpc('get_public_feed_items', {
    p_item_id: filters.id || null,
    p_category: filters.category || null,
    p_status: filters.status || null,
    p_species: filters.species || null,
    p_state: filters.state || null,
    p_city: filters.city || null,
    p_neighborhood: filters.neighborhood || null,
    p_search_term: filters.searchTerm || null,
    p_limit: filters.limit || 100,
  });
  if (error) throw error;

  return attachPublicItemRelations((data || []).filter(item => item && !shouldHideItem(item)));
};

// Busca itens já com fotos, dono e recompensas em uma ÚNICA query otimizada (para Home)
export const listItemsWithPhotosAndOwner = async (filters = {}) => {
  try {
    const ownerProfileSelection = await getOwnerProfileSelection();
    if (!ownerProfileSelection) {
      console.log('[listItemsWithPhotosAndOwner] Carregando feed público:', filters);
      return await listPublicFeedItems(filters);
    }

    // Executa limpeza em background sem travar o carregamento do feed
    ensureCleanupExpiredItems().catch(() => {});
    console.log('[listItemsWithPhotosAndOwner] Carregando itens otimizados:', filters);
    const profileSelection = ownerProfileSelection ? `, ${ownerProfileSelection}` : '';

    let query = supabase
      .from('items')
      .select(`*${profileSelection}, item_photos(id, url), rewards(id, amount, currency, status, description)`)
      .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    } else if (!filters.owner_id) {
      query = query.eq('resolved', false);
    }
    if (filters.owner_id) query = query.eq('owner_id', filters.owner_id);
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.neighborhood) query = query.eq('neighborhood', filters.neighborhood);

    const { data, error } = await query;
    if (error) {
      console.log('[listItemsWithPhotosAndOwner] Erro na query única, usando fallback:', error.message);
      return await listItemsWithPhotosAndOwnerFallback(filters);
    }

    const visibleItems = (data || []).filter(item => {
      if (filters.owner_id) return true;
      return !shouldHideItem(item);
    });

    return visibleItems
      .map(item => {
        const itemPhotos = Array.isArray(item.item_photos)
          ? item.item_photos
          : item.item_photos ? [item.item_photos] : [];
        const itemRewards = Array.isArray(item.rewards)
          ? item.rewards
          : item.rewards ? [item.rewards] : [];

        return {
          ...item,
          item_photos: itemPhotos.filter(p => p && p.url),
          rewards: normalizeItemRewards({
            ...item,
            rewards: itemRewards,
          }),
          renewalInfo: getRenewalInfo(item),
        };
      })
      .sort((a, b) => {
        const aDate = new Date(a.created_at || 0).getTime();
        const bDate = new Date(b.created_at || 0).getTime();
        return bDate - aDate;
      });
  } catch (error) {
    console.error('[listItemsWithPhotosAndOwner] Exceção ao carregar publicações:', error.message);
    const ownerProfileSelection = await getOwnerProfileSelection().catch((sessionError) => {
      console.error('[listItemsWithPhotosAndOwner] Não foi possível verificar a sessão:', sessionError.message);
      return null;
    });
    if (ownerProfileSelection === '') return [];
    if (ownerProfileSelection === null) return [];
    // Fallback final: tenta sem join de profiles (para usuários não autenticados / RLS)
    return await listItemsWithoutProfiles(filters).catch(() => []);
  }
};

// Export getItems para o Painel Administrativo e consultas completas
export const getItems = async (filters = {}) => {
  try {
    let query = supabase
      .from('items')
      .select('*, profiles!owner_id(name, email, whatsapp, phone, avatar_url, avatar_path), item_photos(id, url), rewards(id, amount, currency, status, description)')
      .order('created_at', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }

    const { data, error } = await query;
    if (error) {
      console.log('[getItems] Erro query:', error.message);
      return [];
    }

    return (data || []).map((item) => {
      const itemPhotos = Array.isArray(item.item_photos)
        ? item.item_photos
        : item.item_photos
        ? [item.item_photos]
        : [];
      return {
        ...item,
        item_photos: itemPhotos.filter((p) => p && p.url),
        rewards: normalizeItemRewards(item),
        renewalInfo: getRenewalInfo(item),
      };
    });
  } catch (error) {
    console.log('[getItems] Exceção:', error.message);
    return [];
  }
};

const listItemsWithPhotosAndOwnerFallback = async (filters = {}) => {
  try {
    const ownerProfileSelection = await getOwnerProfileSelection();
    let query = supabase
      .from('items')
      .select(ownerProfileSelection ? `*, ${ownerProfileSelection}` : '*')
      .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    } else if (!filters.owner_id) {
      query = query.eq('resolved', false);
    }
    if (filters.owner_id) query = query.eq('owner_id', filters.owner_id);
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.city) query = query.eq('city', filters.city);

    const { data, error } = await query;
    if (error) {
      console.log('[listItemsWithPhotosAndOwnerFallback] Erro com profiles, tentando sem profiles:', error.message);
      return await listItemsWithoutProfiles(filters);
    }

    const itemIds = (data || []).map((item) => item.id).filter(Boolean);
    if (itemIds.length > 0) {
      const [{ data: photoRows }, { data: rewardsData }] = await Promise.all([
        supabase.from('item_photos').select('id, item_id, url').in('item_id', itemIds),
        supabase.from('rewards').select('id, item_id, amount, currency, status, description').in('item_id', itemIds),
      ]);

      const photosByItemId = (photoRows || []).reduce((groups, photo) => {
        if (!groups[photo.item_id]) groups[photo.item_id] = [];
        groups[photo.item_id].push({ id: photo.id, url: photo.url });
        return groups;
      }, {});

      const rewardsByItemId = (rewardsData || []).reduce((groups, reward) => {
        if (!groups[reward.item_id]) groups[reward.item_id] = [];
        groups[reward.item_id].push(reward);
        return groups;
      }, {});

      data.forEach((item) => {
        item.item_photos = photosByItemId[item.id] || [];
        item.rewards = normalizeItemRewards({ ...item, rewards: rewardsByItemId[item.id] || [] });
        item.renewalInfo = getRenewalInfo(item);
      });
    }

    return (data || []).filter(item => filters.owner_id || !shouldHideItem(item));
  } catch (e) {
    console.log('[listItemsWithPhotosAndOwnerFallback] Exceção, tentando sem profiles:', e.message);
    return await listItemsWithoutProfiles(filters).catch(() => []);
  }
};

// Fallback final: busca itens SEM join de profiles (funciona para usuários não autenticados / RLS)
const listItemsWithoutProfiles = async (filters = {}) => {
  try {
    console.log('[listItemsWithoutProfiles] Carregando itens sem perfil (visitante):', filters);
    let query = supabase
      .from('items')
      .select('*, item_photos(id, url), rewards(id, amount, currency, status, description)')
      .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    } else if (!filters.owner_id) {
      query = query.eq('resolved', false);
    }
    if (filters.owner_id) query = query.eq('owner_id', filters.owner_id);
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.neighborhood) query = query.eq('neighborhood', filters.neighborhood);

    const { data, error } = await query;
    if (error) {
      console.log('[listItemsWithoutProfiles] Erro:', error.message);
      return [];
    }

    return (data || [])
      .filter(item => filters.owner_id || !shouldHideItem(item))
      .map(item => {
        const itemPhotos = Array.isArray(item.item_photos)
          ? item.item_photos
          : item.item_photos ? [item.item_photos] : [];
        const itemRewards = Array.isArray(item.rewards)
          ? item.rewards
          : item.rewards ? [item.rewards] : [];

        return {
          ...item,
          profiles: null,
          owner_name: item.owner_name || 'Tutor',
          item_photos: itemPhotos.filter(p => p && p.url),
          rewards: normalizeItemRewards({ ...item, rewards: itemRewards }),
          renewalInfo: getRenewalInfo(item),
        };
      })
      .sort((a, b) => {
        const aDate = new Date(a.created_at || 0).getTime();
        const bDate = new Date(b.created_at || 0).getTime();
        return bDate - aDate;
      });
  } catch (error) {
    console.log('[listItemsWithoutProfiles] Exceção:', error.message);
    return [];
  }
};
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { removeItemPhoto } from './removeItemPhoto';
import { shouldHideItem, getExpiredItemIds, getExpirationDays, getRenewalInfo, getPermanentDeleteDays, shouldDeletePermanently } from './itemExpiration';
import { createItemRemovedNotification } from './notifications';
export { removeItemPhoto };
import * as FileSystem from 'expo-file-system/legacy';

const supabaseUrl = SUPABASE_URL;

const getCleanupFunctionUrl = () => {
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/cleanup-expired-items`;
};

const normalizeItemRewards = (item = {}) => {
  const explicitRewards = Array.isArray(item.rewards) ? item.rewards : [];
  if (explicitRewards.length > 0) {
    return explicitRewards;
  }

  const extraFields = item.extra_fields || {};
  const hasReward = Boolean(extraFields.offer_reward || extraFields.reward_amount || extraFields.reward_description);
  if (!hasReward) {
    return [];
  }

  return [{
    id: `extra-${item.id || 'item'}`,
    item_id: item.id,
    amount: extraFields.reward_amount || null,
    description: extraFields.reward_description || null,
    currency: 'BRL',
    status: 'active',
  }];
};

const isJwtClockSkewError = (error = null) => {
  const message = String(error?.message || error || '');
  return message.toLowerCase().includes('jwt issued at future') || message.toLowerCase().includes('issued at future');
};

const getAuthAccessToken = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch (error) {
    return '';
  }
};

const getMimeTypeFromExt = (extension) => {
  const normalizedExt = String(extension || '').toLowerCase();
  const mimeTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };

  return mimeTypes[normalizedExt] || 'application/octet-stream';
};

const getNextItemId = async () => {
  const { data, error } = await supabase
    .from('items')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const lastId = Array.isArray(data) && data.length > 0 ? Number(data[0].id) : 0;
  return Number.isFinite(lastId) ? lastId + 1 : 1;
};

const getNextItemPhotoId = async () => {
  const { data, error } = await supabase
    .from('item_photos')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const lastId = Array.isArray(data) && data.length > 0 ? Number(data[0].id) : 0;
  return Number.isFinite(lastId) ? lastId + 1 : 1;
};

const trySetItemExpiry = async (itemId, date = new Date()) => {
  try {
    const expiresAt = new Date(date);
    expiresAt.setDate(expiresAt.getDate() + getExpirationDays());

    const { error } = await supabase
      .from('items')
      .update({ expires_at: expiresAt.toISOString() })
      .eq('id', itemId);

    if (error) {
      console.log('[trySetItemExpiry] Campo expires_at não disponível ou indisponível:', error.message);
    }
  } catch (error) {
    console.log('[trySetItemExpiry] Exceção:', error.message);
  }
};

export const registerItem = async (itemData, photos = []) => {
  try {
    console.log('[registerItem] Registrando novo item...');
    console.log('[registerItem] Dados do item:', itemData);

    const nextItemId = await getNextItemId();
    console.log('[registerItem] Próximo ID calculado:', nextItemId);

    const { data, error } = await supabase
      .from('items')
      .insert({
        id: nextItemId,
        owner_id: itemData.owner_id,
        title: itemData.title,
        description: itemData.description,
        category: itemData.category,
        item_type: itemData.item_type,
        status: itemData.status,
        state: itemData.state,
        city: itemData.city,
        neighborhood: itemData.neighborhood,
        latitude: itemData.latitude,
        longitude: itemData.longitude,
        date: itemData.date,
        // Campos de animal salvos em colunas separadas
        species: itemData.species,
        breed: itemData.breed,
        size: itemData.size,
        age: itemData.age,
        collar: itemData.collar,
        animal_name: itemData.animal_name,
        // Campos genéricos
        brand: itemData.brand,
        color: itemData.color,
        serial_number: itemData.serial_number,
        extra_fields: itemData.extra_fields || null,
        resolved: false,
      })
      .select();

    if (error) {
      console.log('[registerItem] Erro ao criar item:', error.message);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('Item não foi criado');
    }

    const createdItem = data[0];
    console.log('[registerItem] Item criado com ID:', createdItem.id);
    const itemId = createdItem.id;

    await trySetItemExpiry(itemId, new Date());

    const uploadedPhotos = [];
    for (const photo of photos) {
      const url = await saveItemPhoto(itemId, photo);
      uploadedPhotos.push({ url });
    }

    createdItem.item_photos = uploadedPhotos;
    return createdItem;
  } catch (error) {
    console.log('[registerItem] Exceção:', error.message);
    throw error;
  }
};

export const updateItem = async (itemId, itemData) => {
  try {
    console.log('[updateItem] Atualizando item:', itemId);

    const { data, error } = await supabase
      .from('items')
      .update({
        title: itemData.title,
        description: itemData.description,
        category: itemData.category,
        item_type: itemData.item_type,
        status: itemData.status,
        state: itemData.state,
        city: itemData.city,
        neighborhood: itemData.neighborhood,
        latitude: itemData.latitude,
        longitude: itemData.longitude,
        date: itemData.date,
        // Campos de animal salvos em colunas separadas
        species: itemData.species,
        breed: itemData.breed,
        size: itemData.size,
        age: itemData.age,
        collar: itemData.collar,
        animal_name: itemData.animal_name,
        // Campos genéricos
        brand: itemData.brand,
        color: itemData.color,
        serial_number: itemData.serial_number,
        extra_fields: itemData.extra_fields || null,
      })
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      console.log('[updateItem] Erro:', error.message);
      throw error;
    }

    await trySetItemExpiry(itemId, new Date());

    console.log('[updateItem] Item atualizado com sucesso');
    return data;
  } catch (error) {
    console.log('[updateItem] Exceção:', error.message);
    throw error;
  }
};

export const saveItemPhoto = async (itemId, photo) => {
  try {
    console.log('[saveItemPhoto] Salvando foto para item:', itemId);
    console.log('[saveItemPhoto] Photo object:', photo);

    const photoUri = photo.uri || photo;
    const photoName = photo.name || `photo_${Date.now()}.jpg`;
    const ext = photoName.split('.').pop() || 'jpg';
    const filepath = `${itemId}/${Date.now()}.${ext}`;
    const contentType = getMimeTypeFromExt(ext);

    console.log('[saveItemPhoto] Photo URI:', photoUri);
    console.log('[saveItemPhoto] File path:', filepath);

    // Check file info (size) for debugging
    const info = await FileSystem.getInfoAsync(photoUri, { size: true });
    console.log('[saveItemPhoto] File exists:', info.exists, 'Size:', info.size);

    // Upload via REST using expo-file-system to avoid Blob issues on RN/Hermes
    console.log('[saveItemPhoto] Fetching auth token...');
    const session = await supabase.auth.getSession();
    const accessToken = session?.data?.session?.access_token;
    if (!accessToken) {
      throw new Error('Sessão não encontrada para upload');
    }

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/item-photos/${filepath}`;
    console.log('[saveItemPhoto] Uploading via FileSystem to:', uploadUrl);

    const uploadResponse = await FileSystem.uploadAsync(uploadUrl, photoUri, {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    console.log('[saveItemPhoto] Upload response status:', uploadResponse.status);
    if (uploadResponse.status >= 400) {
      console.error('[saveItemPhoto] Upload failed body:', uploadResponse.body);
      throw new Error(`Upload falhou: ${uploadResponse.status}`);
    }

    console.log('[saveItemPhoto] Upload successful');

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('item-photos')
      .getPublicUrl(filepath);

    console.log('[saveItemPhoto] Public URL:', urlData.publicUrl);

    // Save reference to database
    const nextPhotoId = await getNextItemPhotoId();
    console.log('[saveItemPhoto] Próximo ID da foto calculado:', nextPhotoId);
    const { error: dbError } = await supabase
      .from('item_photos')
      .insert({
        id: nextPhotoId,
        item_id: itemId,
        url: urlData.publicUrl,
      });

    if (dbError) {
      console.error('[saveItemPhoto] Database error:', dbError);
      throw dbError;
    }

    console.log('[saveItemPhoto] Photo saved successfully');
    return urlData.publicUrl;
  } catch (error) {
    console.error('[saveItemPhoto] Exception:', error.message);
    console.error('[saveItemPhoto] Full error:', error);
    throw error;
  }
};

export const deleteItem = async (itemId, options = {}) => {
  try {
    console.log('[deleteItem] Deleting item:', itemId, options.actorIsAdmin ? 'as admin' : 'as owner');

    // First delete photos from storage and database
    const { data: photos, error: photosError } = await supabase
      .from('item_photos')
      .select('url')
      .eq('item_id', itemId);

    if (!photosError && photos) {
      for (const photo of photos) {
        try {
          // Extract filepath from URL
          const url = new URL(photo.url);
          const filepath = url.pathname.split('/item-photos/')[1];
          if (filepath) {
            await supabase.storage.from('item-photos').remove([filepath]);
          }
        } catch (err) {
          console.error('[deleteItem] Error deleting photo:', err);
        }
      }

      // Delete photo records
      await supabase.from('item_photos').delete().eq('item_id', itemId);
    }

    // ATENÇÃO: As mensagens NÃO são excluídas para manter o histórico ativo para os usuários,
    // exibindo o aviso de que a publicação associada foi excluída/encerrada.

    // Delete sightings
    await supabase.from('sightings').delete().eq('item_id', itemId);

    // Delete rewards
    await supabase.from('rewards').delete().eq('item_id', itemId);

    // Delete notifications that still reference the item
    await supabase.from('notifications').delete().eq('item_id', itemId);

    // Finally delete the item
    const { data: deletedItem, error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[deleteItem] Error:', error);
      throw error;
    }

    if (!deletedItem?.id) {
      throw new Error(
        options.actorIsAdmin
          ? 'O Supabase bloqueou a exclusão administrativa. Verifique a policy/RPC de admin para a tabela items.'
          : 'A publicação não foi encontrada ou não pertence ao usuário atual.'
      );
    }

    console.log('[deleteItem] Item deleted successfully');
    return true;
  } catch (error) {
    console.error('[deleteItem] Exception:', error);
    throw error;
  }
};

export const getItemById = async (itemId) => {
  try {
    console.log('[getItemById] Carregando item:', itemId);

    // Get item data
    const { data: itemData, error: itemError } = await supabase
      .from('items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !itemData) {
      console.log('[getItemById] Erro ao carregar item:', itemError?.message);
      return null;
    }

    // Get photos separately
    const { data: photos } = await supabase
      .from('item_photos')
      .select('id, url')
      .eq('item_id', itemId);


    // Get owner profile separately
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, email, created_at')
      .eq('id', itemData.owner_id)
      .single();

    // Combine data
    const result = {
      ...itemData,
      item_photos: photos || [],
      profiles: ownerProfile || null,
    };

    console.log('[getItemById] Item carregado com sucesso');
    return result;
  } catch (error) {
    console.log('[getItemById] Exceção:', error.message);
    return null;
  }
};

export const listItems = async (filters = {}) => {
  try {
    await ensureCleanupExpiredItems();
    console.log('[listItems] Carregando itens com filtros:', filters);
    
    // Query básica sem joins para evitar erro 400 de RLS
    let query = supabase
      .from('items')
      .select('*');

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    }
    if (filters.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.log('[listItems] Erro na query:', error.message);
      return [];
    }

    const visibleItems = (data || []).filter(item => {
      if (filters.owner_id) return true;
      return !shouldHideItem(item);
    });
    const sortedItems = visibleItems
      .map(item => ({ ...item, renewalInfo: getRenewalInfo(item) }))
      .sort((a, b) => {
        const aDate = new Date(a.created_at || 0).getTime();
        const bDate = new Date(b.created_at || 0).getTime();
        return bDate - aDate;
      });

    console.log('[listItems] Itens carregados:', sortedItems.length);
    return sortedItems;
  } catch (error) {
    console.log('[listItems] Exceção:', error.message);
    return [];
  }
};

// Carregar detalhes completos de um item (inclui fotos, perfil, recompensas)
export const getItemDetails = async (itemId) => {
  try {
    console.log('[getItemDetails] Carregando detalhes do item:', itemId);
    const ownerProfileSelection = await getOwnerProfileSelection();
    const isPublicRequest = !ownerProfileSelection;
    let item;
    let itemError;
    if (isPublicRequest) {
      const { data, error } = await supabase.rpc('get_public_feed_items', {
        p_item_id: Number(itemId),
        p_category: null,
        p_status: null,
        p_species: null,
        p_state: null,
        p_city: null,
        p_neighborhood: null,
        p_search_term: null,
        p_limit: 1,
      });
      item = data?.[0] || null;
      itemError = error;
    } else {
      const result = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .single();
      item = result.data;
      itemError = result.error;
    }

    if (itemError || !item) {
      console.log('[getItemDetails] Erro ao carregar item:', itemError?.message);
      return null;
    }

    // Get photos
    const { data: photos } = await supabase
      .from('item_photos')
      .select('id, url')
      .eq('item_id', itemId);

    let profile = null;
    if (!isPublicRequest) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, email, whatsapp, phone, created_at')
        .eq('id', item.owner_id)
        .single();
      profile = ownerProfile;
    }

    // Get rewards
    const { data: rewards } = await supabase
      .from('rewards')
      .select('id, amount, currency, status, description')
      .eq('item_id', itemId);

    return {
      ...item,
      item_photos: photos || [],
      profiles: profile,
      rewards: normalizeItemRewards({
        ...item,
        rewards: rewards || [],
      })
    };
  } catch (error) {
    console.log('[getItemDetails] Exceção:', error.message);
    return null;
  }
};

export const searchItems = async (searchTerm) => {
  try {
    const term = (searchTerm || '').trim();
    if (!term) return [];
    const ownerProfileSelection = await getOwnerProfileSelection();

    if (!ownerProfileSelection) {
      const publicItems = await listPublicFeedItems({ searchTerm: term, limit: 100 });
      return publicItems;
    }

    const { data, error } = await supabase
      .from('items')
      .select(`*, ${ownerProfileSelection}, item_photos(id, url), rewards(id, amount, currency, status, description)`)
      .eq('resolved', false)
      .or(`title.ilike.%${term}%,description.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%,neighborhood.ilike.%${term}%,species.ilike.%${term}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[searchItems] Erro na busca autenticada:', error.message);
      return await searchItemsWithoutProfiles(term);
    }

    return (data || [])
      .filter((item) => !shouldHideItem(item))
      .map((item) => ({
        ...item,
        owner_name: item.profiles?.name || item.profiles?.email || 'Usuário',
        item_photos: Array.isArray(item.item_photos) ? item.item_photos.filter((p) => p && p.url) : [],
        rewards: normalizeItemRewards({ ...item, rewards: item.rewards || [] }),
        renewalInfo: getRenewalInfo(item),
      }));
  } catch (error) {
    console.log('[searchItems] Exceção:', error.message);
    // Fallback final: tenta sem profiles
    const term = (searchTerm || '').trim();
    const ownerProfileSelection = await getOwnerProfileSelection().catch((sessionError) => {
      console.error('[searchItems] Não foi possível verificar a sessão:', sessionError.message);
      return null;
    });
    if (term && ownerProfileSelection) return await searchItemsWithoutProfiles(term).catch(() => []);
    return [];
  }
};

// Fallback de busca sem join de profiles (para visitantes não autenticados / RLS)
const searchItemsWithoutProfiles = async (term) => {
  try {
    console.log('[searchItemsWithoutProfiles] Buscando sem perfil (visitante):', term);
    const { data, error } = await supabase
      .from('items')
      .select('*, item_photos(id, url), rewards(id, amount, currency, status, description)')
      .eq('resolved', false)
      .or(`title.ilike.%${term}%,description.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%,neighborhood.ilike.%${term}%,species.ilike.%${term}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[searchItemsWithoutProfiles] Erro:', error.message);
      return [];
    }

    return (data || [])
      .filter((item) => !shouldHideItem(item))
      .map((item) => ({
        ...item,
        profiles: null,
        owner_name: item.owner_name || 'Tutor',
        item_photos: Array.isArray(item.item_photos) ? item.item_photos.filter((p) => p && p.url) : [],
        rewards: normalizeItemRewards({ ...item, rewards: item.rewards || [] }),
        renewalInfo: getRenewalInfo(item),
      }));
  } catch (error) {
    console.log('[searchItemsWithoutProfiles] Exceção:', error.message);
    return [];
  }
};

// Fetch first photo URL for a list of item IDs to use as thumbnails
export const getItemThumbnails = async (itemIds = []) => {
  try {
    if (!itemIds || itemIds.length === 0) return {};

    // Query photos for these items
    const { data, error } = await supabase
      .from('item_photos')
      .select('item_id, url')
      .in('item_id', itemIds);

    if (error) {
      console.log('[getItemThumbnails] Erro:', error.message);
      return {};
    }

    // Build map of item_id -> first url
    const map = {};
    for (const row of data || []) {
      if (!map[row.item_id]) {
        map[row.item_id] = row.url;
      }
    }
    return map;
  } catch (error) {
    console.log('[getItemThumbnails] Exceção:', error.message);
    return {};
  }
};

export const getUserItems = async (userId) => {
  try {
    await ensureCleanupExpiredItems();

    const { data, error } = await supabase
      .from('items')
      .select(`
        *,
        item_photos(id, url)
      `)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[getUserItems] Erro:', error.message);
      return [];
    }

    const itemIds = (data || []).map(item => item.id).filter(Boolean);
    const rewardsByItemId = {};

    if (itemIds.length > 0) {
      const { data: rewardsData, error: rewardsError } = await supabase
        .from('rewards')
        .select('id, item_id, amount, currency, status, description')
        .in('item_id', itemIds);

      if (rewardsError) {
        console.log('[getUserItems] Erro ao buscar rewards:', rewardsError.message);
      } else {
        for (const reward of rewardsData || []) {
          if (!rewardsByItemId[reward.item_id]) {
            rewardsByItemId[reward.item_id] = [];
          }
          rewardsByItemId[reward.item_id].push(reward);
        }
      }
    }

    return (data || []).map(item => ({
      ...item,
      rewards: normalizeItemRewards({
        ...item,
        rewards: rewardsByItemId[item.id] || [],
      }),
    }));
  } catch (error) {
    console.log('[getUserItems] Exceção:', error.message);
    return [];
  }
};

export const renewItem = async (itemId) => {
  try {
    console.log('[renewItem] Renovando item:', itemId);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('items')
      .update({
        created_at: now,
      })
      .eq('id', itemId);

    if (error) {
      console.log('[renewItem] Erro:', error.message);
      throw error;
    }

    await trySetItemExpiry(itemId, new Date());
    return { success: true };
  } catch (error) {
    console.log('[renewItem] Exceção:', error.message);
    throw error;
  }
};

const cleanupExpiredItemsClientSide = async () => {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData?.user;
    if (!currentUser?.id) {
      // Usuário não autenticado não pode deletar itens no banco
      return { removed: 0, ids: [], skipped: true };
    }

    console.log('[cleanupExpiredItemsClientSide] Buscando itens expirados do usuário logado para remoção...');

    const cutoffDate = new Date(Date.now() - getPermanentDeleteDays() * 24 * 60 * 60 * 1000).toISOString();

    // No cliente, apenas busca e remove os itens pertencentes ao usuário logado
    const { data, error } = await supabase
      .from('items')
      .select('id, owner_id, title, created_at, expires_at, resolved')
      .eq('owner_id', currentUser.id)
      .lte('created_at', cutoffDate);

    if (error) {
      if (isJwtClockSkewError(error)) {
        console.log('[cleanupExpiredItemsClientSide] Sessão Supabase inválida por descompasso de relógio do dispositivo. Pulando limpeza local.');
        return { removed: 0, ids: [], skipped: true };
      }

      console.log('[cleanupExpiredItemsClientSide] Erro ao buscar itens:', error.message);
      throw error;
    }

    const expiredItems = (data || []).filter(item => item && item.id && shouldDeletePermanently(item));
    if (expiredItems.length === 0) {
      return { removed: 0, ids: [] };
    }

    const expiredIds = expiredItems.map(item => item.id).filter(Boolean);
    console.log('[cleanupExpiredItemsClientSide] Itens permanentes do usuário encontrados para remoção:', expiredIds);

    for (const item of expiredItems) {
      try {
        if (item.owner_id) {
          await createItemRemovedNotification(item, item.owner_id);
        }
        await deleteItem(item.id);
      } catch (cleanupError) {
        console.log('[cleanupExpiredItemsClientSide] Erro ao remover item', item.id, cleanupError.message);
      }
    }

    return { removed: expiredIds.length, ids: expiredIds };
  } catch (error) {
    console.log('[cleanupExpiredItemsClientSide] Exceção:', error.message);
    throw error;
  }
};

export const cleanupExpiredItems = async () => {
  const functionUrl = getCleanupFunctionUrl();
  if (!functionUrl) {
    console.log('[cleanupExpiredItems] Supabase URL não configurada, usando fallback local.');
    return cleanupExpiredItemsClientSide();
  }

  try {
    const accessToken = await getAuthAccessToken();
    if (!accessToken) {
      return cleanupExpiredItemsClientSide();
    }

    console.log('[cleanupExpiredItems] Chamando Edge Function de limpeza permanente...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      if (isJwtClockSkewError(result?.error || result)) {
        console.log('[cleanupExpiredItems] Token Supabase rejeitado por descompasso de relógio do dispositivo. Pulando limpeza remota.');
        return { removed: 0, ids: [], skipped: true };
      }

      console.log('[cleanupExpiredItems] Erro na função de limpeza:', result.error || response.status);
      if (response.status === 404) {
        console.log('[cleanupExpiredItems] Função não encontrada, usando fallback local.');
        return cleanupExpiredItemsClientSide();
      }
      throw new Error(result.error || 'Erro ao executar cleanupExpiredItems');
    }

    console.log('[cleanupExpiredItems] Itens removidos pela função:', result.ids || []);
    return result;
  } catch (error) {
    if (isJwtClockSkewError(error)) {
      console.log('[cleanupExpiredItems] Descompasso de relógio do dispositivo bloqueou a limpeza remota.');
      return { removed: 0, ids: [], skipped: true };
    }

    console.log('[cleanupExpiredItems] Exceção:', error.message);
    console.log('[cleanupExpiredItems] Usando fallback local de exclusão.');
    return cleanupExpiredItemsClientSide();
  }
};

export const markItemAsResolved = async (itemId, userId) => {
  try {
    console.log('[markItemAsResolved] Marcando item como resolvido:', itemId);

    // Update item
    const { error: updateError } = await supabase
      .from('items')
      .update({
        resolved: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (updateError) {
      console.log('[markItemAsResolved] Update error:', updateError.message);
      throw updateError;
    }

    // Increment user points
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('points, level')
      .eq('id', userId)
      .single();

    if (!fetchError && profile) {
      const newPoints = profile.points + 10;
      const newLevel = Math.floor(newPoints / 100) + 1;

      await supabase
        .from('profiles')
        .update({
          points: newPoints,
          level: newLevel,
        })
        .eq('id', userId);
    }

    console.log('[markItemAsResolved] Item marcado como resolvido');
    return { success: true };
  } catch (error) {
    console.log('[markItemAsResolved] Exceção:', error.message);
    throw error;
  }
};

export const bumpItemFeedPriority = async (itemId, currentExtraFields = {}) => {
  try {
    const nowIso = new Date().toISOString();
    console.log('[bumpItemFeedPriority] Impulsionando item para o topo do feed:', itemId);

    const updatedExtraFields = {
      ...(currentExtraFields || {}),
      last_prompted_at: nowIso,
      last_bumped_at: nowIso,
      bump_count: ((currentExtraFields && currentExtraFields.bump_count) || 0) + 1,
    };

    const { error } = await supabase
      .from('items')
      .update({
        created_at: nowIso,
        extra_fields: updatedExtraFields,
      })
      .eq('id', itemId);

    if (error) {
      console.log('[bumpItemFeedPriority] Erro ao impulsionar item:', error.message);
      throw error;
    }

    console.log('[bumpItemFeedPriority] Item impulsionado com sucesso para o topo do feed');
    return { success: true, bumped_at: nowIso };
  } catch (error) {
    console.log('[bumpItemFeedPriority] Exceção:', error.message);
    throw error;
  }
};

export const getResolvedStatistics = async () => {
  try {
    console.log('[getResolvedStatistics] Buscando estatísticas de itens resolvidos...');
    
    const { data: items, error } = await supabase
      .from('items')
      .select('category')
      .eq('resolved', true);
    
    if (error) throw error;
    
    // Contar por categoria
    const categoryCount = {};
    items.forEach(item => {
      const cat = item.category || 'object';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    const by_category = Object.entries(categoryCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    
    const total_resolved = items.length;
    
    // Calcular animais (category === 'animal')
    const animalsReunited = categoryCount['animal'] || 0;
    
    // Estimar pessoas conectadas (2.5 x total de itens resolvidos)
    const peopleConnected = Math.floor(total_resolved * 2.5);
    
    const result = {
      total_resolved,
      animalsReunited,
      peopleConnected,
      by_category
    };
    
    console.log('[getResolvedStatistics] Estatísticas:', result);
    return result;
  } catch (error) {
    console.error('[getResolvedStatistics] Erro:', error.message);
    throw error;
  }
};

export const listRecoveredPets = async (limit = 10) => {
  try {
    let query = supabase
      .from('items')
      .select('*, profiles!owner_id(name, email, whatsapp, phone, avatar_url, avatar_path)')
      .eq('resolved', true)
      .order('updated_at', { ascending: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    const itemIds = (data || []).map((item) => item.id).filter(Boolean);
    if (itemIds.length > 0) {
      const { data: photoRows } = await supabase
        .from('item_photos')
        .select('id, item_id, url')
        .in('item_id', itemIds);

      if (photoRows) {
        const photosByItemId = photoRows.reduce((groups, photo) => {
          if (!groups[photo.item_id]) groups[photo.item_id] = [];
          groups[photo.item_id].push({ id: photo.id, url: photo.url });
          return groups;
        }, {});

        data.forEach((item) => {
          const nestedPhotos = Array.isArray(item.item_photos)
            ? item.item_photos
            : item.item_photos ? [item.item_photos] : [];
          item.item_photos = (nestedPhotos.length > 0
            ? nestedPhotos
            : photosByItemId[item.id] || [])
            .filter((photo) => photo?.url);
        });
      }
    }

    return (data || []).map(item => ({
      ...item,
      owner_name: item.profiles?.name || item.profiles?.email || 'Tutor',
      item_photos: item.item_photos || [],
    }));
  } catch (error) {
    console.warn('[listRecoveredPets] Erro ao carregar pets recuperados:', error.message);
    return [];
  }
};

export const getCommunityImpactStats = async () => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayISO = startOfToday.toISOString();

    const [
      { count: totalResolved },
      { count: resolvedToday },
      { count: totalLost },
      { count: totalFound },
      { count: totalSightings },
    ] = await Promise.all([
      supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', true),
      supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', true)
        .gte('updated_at', startOfTodayISO),
      supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', false)
        .eq('status', 'lost'),
      supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', false)
        .eq('status', 'found'),
      supabase
        .from('sightings')
        .select('id', { count: 'exact', head: true }),
    ]);

    return {
      resolved_count: totalResolved || 0,
      resolved_today_count: resolvedToday || 0,
      lost_count: totalLost || 0,
      found_count: totalFound || 0,
      sightings_count: totalSightings || 0,
    };
  } catch (error) {
    console.warn('[getCommunityImpactStats] Erro ao buscar métricas comunitárias:', error.message);
    return {
      resolved_count: 0,
      resolved_today_count: 0,
      lost_count: 0,
      found_count: 0,
      sightings_count: 0,
    };
  }
};

export const isPetAvailableForAdoption = (item) => {
  if (!item) return false;
  if (item.status === 'adoption' || item.extra_fields?.is_direct_adoption) {
    return true;
  }
  return Boolean(item.extra_fields?.available_for_adoption);
};

export const getAdoptionWaitingDays = (item) => {
  if (!item) return 0;
  if (item.status === 'adoption' || item.extra_fields?.is_direct_adoption) return 0;
  if (item.status !== 'found' || item.extra_fields?.found_custody !== 'with_me' || !item.created_at) return 0;

  const startedAt = item.extra_fields?.recovery_search?.started_at || item.created_at;
  const created = new Date(startedAt).getTime();
  const now = Date.now();
  const minimumDays = Number(item.extra_fields?.recovery_search?.minimum_days) || 7;
  const daysPassed = (now - created) / (1000 * 60 * 60 * 24);
  const remaining = Math.ceil(minimumDays - daysPassed);
  return remaining > 0 ? remaining : 0;
};

export const toggleItemAdoption = async (itemId, currentExtraFields = {}, availableForAdoption = true) => {
  try {
    const updatedExtraFields = {
      ...(currentExtraFields || {}),
      available_for_adoption: Boolean(availableForAdoption),
      recovery_search: currentExtraFields?.recovery_search
        ? {
          ...currentExtraFields.recovery_search,
          status: availableForAdoption ? 'adoption_eligible' : 'searching',
        }
        : currentExtraFields?.recovery_search,
    };
    const { data, error } = await supabase
      .from('items')
      .update({ extra_fields: updatedExtraFields })
      .eq('id', itemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[toggleItemAdoption] Erro ao alterar status de adoção:', error);
    throw error;
  }
};

/**
 * Autorização do tutor para o WhatsApp aparecer nos cartazes da publicação.
 * Fica gravada na própria publicação e vale para qualquer pessoa que gerar o cartaz.
 */
export const isFlyerPhoneAllowed = (item) => Boolean(item?.extra_fields?.share_phone_on_flyer);

export const setFlyerPhoneAllowed = async (itemId, currentExtraFields = {}, allowed = false) => {
  const updatedExtraFields = {
    ...(currentExtraFields || {}),
    share_phone_on_flyer: Boolean(allowed),
  };
  const { data, error } = await supabase
    .from('items')
    .update({ extra_fields: updatedExtraFields })
    .eq('id', itemId)
    .select('id, extra_fields')
    .single();
  if (error) {
    console.error('[setFlyerPhoneAllowed] Erro ao salvar autorização do WhatsApp:', error);
    throw error;
  }
  return data;
};
