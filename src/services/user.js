import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

const normalizeWhatsappForStorage = (whatsapp = '') => {
  const digits = String(whatsapp || '').replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;

  if (normalized.startsWith('55')) {
    normalized = normalized.slice(2);
  }

  if (normalized.length === 11 && normalized[2] === '9') {
    normalized = `${normalized.slice(0, 2)}${normalized.slice(3)}`;
  }

  return normalized;
};

export const getUser = async (userId) => {
  try {

    // O perfil completo (com e-mail, telefone e extra_fields) só é lido pelo próprio dono,
    // pela função get_my_profile do banco.
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData?.session?.user?.id;
    if (!authUserId || String(authUserId) !== String(userId)) {
      return await getUserById(userId);
    }
    const { data, error } = await supabase.rpc('get_my_profile');

    if (error) {
      console.log('[getUser] Error:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.log('[getUser] Exception:', error.message);
    return null;
  }
};

export const createProfileIfMissing = async (userId, profileData = {}) => {
  try {
    const existingProfile = await getUser(userId);
    const phoneToSet = profileData.whatsapp || profileData.phone || '';

    if (existingProfile) {
      if (phoneToSet && !existingProfile.whatsapp && !existingProfile.phone) {
        await supabase
          .from('profiles')
          .update({
            whatsapp: phoneToSet,
            phone: phoneToSet,
          })
          .eq('id', userId);
        return { ...existingProfile, whatsapp: phoneToSet, phone: phoneToSet };
      }
      return existingProfile;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        name: profileData.name || '',
        email: profileData.email || '',
        city: profileData.city || '',
        state: profileData.state || '',
        whatsapp: phoneToSet,
        phone: phoneToSet,
        points: 0,
        level: 1,
      });

    if (error) {
      if (error.code === '23505') {
        const concurrentlyCreatedProfile = await getUser(userId);
        if (concurrentlyCreatedProfile) {
          return concurrentlyCreatedProfile;
        }
      }

      console.log('[createProfileIfMissing] Error:', error.message);
      throw error;
    }

    return await getUser(userId);
  } catch (error) {
    console.log('[createProfileIfMissing] Exception:', error.message);
    throw error;
  }
};

export const getUserById = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, avatar_path, bio, city, state, neighborhood, created_at, role, adm')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.log('[getUserById] Error:', error.message);
      return null;
    }

    // avatar_url já é a url pública
    let avatarUrl = data?.avatar_url || null;
    return { ...data, avatarUrl };
  } catch (error) {
    console.log('[getUserById] Exception:', error.message);
    return null;
  }
};

export const updateProfile = async (userId, updates) => {
  try {
    console.log('[updateProfile] Atualizando perfil do usuário:', userId);

    // Whitelist apenas de colunas reais existentes na tabela 'profiles' no Supabase
    const allowedColumns = [
      'name',
      'email',
      'city',
      'state',
      'whatsapp',
      'phone',
      'instagram',
      'facebook',
      'whatsapp_notifications_enabled',
      'avatar_path',
      'avatar_url',
      'points',
      'level',
      // 'adm' e 'role' não podem ser alterados pelo próprio usuário (ver admin_set_user_role).
    ];

    const sanitizedUpdates = {};
    for (const key of Object.keys(updates || {})) {
      if (allowedColumns.includes(key)) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'whatsapp')) {
      sanitizedUpdates.whatsapp = normalizeWhatsappForStorage(sanitizedUpdates.whatsapp);
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'phone')) {
      sanitizedUpdates.phone = normalizeWhatsappForStorage(sanitizedUpdates.phone);
    }

    const { error } = await supabase
      .from('profiles')
      .update(sanitizedUpdates)
      .eq('id', userId);

    if (error) {
      console.log('[updateProfile] Error:', error.message);
      throw error;
    }

    console.log('[updateProfile] Perfil atualizado com sucesso');
    return await getUser(userId);
  } catch (error) {
    console.log('[updateProfile] Exception:', error.message);
    throw error;
  }
};

export const uploadAvatar = async (userId, photoUri) => {
  try {
    console.log('[uploadAvatar] Enviando avatar para:', userId);

    if (!photoUri) throw new Error('photoUri indefinido');

    // Garante que a URI está no formato correto
    let uri = photoUri;
    if (!uri.startsWith('file://')) uri = 'file://' + uri;

    const ext = photoUri.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const filepath = `${userId}/avatar_${timestamp}.${ext}`;

    // Usa expo-file-system para ler o arquivo como Uint8Array (base64 -> Uint8Array)
    let fileBuffer;
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) throw new Error('Arquivo não encontrado no caminho: ' + uri);
      const fileData = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      fileBuffer = Uint8Array.from(atob(fileData), c => c.charCodeAt(0));
      console.log('[uploadAvatar] File lido como Uint8Array, tamanho:', fileBuffer.length);
    } catch (fsErr) {
      console.log('[uploadAvatar] Erro ao ler arquivo com expo-file-system:', fsErr, 'URI:', uri);
      throw fsErr;
    }

    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .upload(filepath, fileBuffer, {
        upsert: true,
        contentType: `image/${ext}`,
      });

    if (error) {
      console.log('[uploadAvatar] Upload error:', error.message);
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(filepath);

    console.log('[uploadAvatar] URL pública gerada:', urlData?.publicUrl);

    // Atualiza o campo avatar_url no perfil do usuário
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: urlData?.publicUrl || null })
      .eq('id', userId);
    if (updateError) {
      console.log('[uploadAvatar] Erro ao atualizar avatar_url no perfil:', updateError.message);
      throw updateError;
    }

    console.log('[uploadAvatar] Avatar uploaded successfully');
    return urlData.publicUrl;
  } catch (error) {
    console.log('[uploadAvatar] Exception:', error.message);
    throw error;
  }
};

export const listAllProfiles = async (searchTerm = '', limit = 50) => {
  try {
    // Só administradores recebem a lista completa (função admin_list_profiles no banco).
    const { data, error } = await supabase.rpc('admin_list_profiles', {
      p_search: searchTerm && searchTerm.trim() ? searchTerm.trim() : null,
      p_limit: limit,
    });
    if (error) {
      console.log('[listAllProfiles] Error:', error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.log('[listAllProfiles] Exception:', error.message);
    return [];
  }
};

export const updateUserRole = async (userId, role) => {
  try {
    const { data, error } = await supabase.rpc('admin_set_user_role', {
      p_user_id: String(userId),
      p_role: role === 'admin' ? 'admin' : 'user',
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[updateUserRole] Erro ao atualizar cargo:', error.message);
    throw error;
  }
};

export const deleteUserProfile = async (userId) => {
  try {
    // 1. Exclui itens do usuário
    const { data: userItems } = await supabase
      .from('items')
      .select('id')
      .eq('user_id', userId);

    if (userItems && userItems.length > 0) {
      for (const item of userItems) {
        await supabase.from('item_photos').delete().eq('item_id', item.id);
        await supabase.from('sightings').delete().eq('item_id', item.id);
        await supabase.from('messages').delete().eq('item_id', item.id);
        await supabase.from('items').delete().eq('id', item.id);
      }
    }

    // 2. Exclui avaliações recebidas e enviadas
    await supabase.from('user_ratings').delete().or(`target_user_id.eq.${userId},reviewer_id.eq.${userId}`);

    // 3. Exclui perfil
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[deleteUserProfile] Erro ao excluir perfil:', error.message);
    throw error;
  }
};
