import * as FileSystem from 'expo-file-system/legacy';
import { supabase, SUPABASE_URL } from '../lib/supabase';

// Criar uma reivindicação de item
export const createItemClaim = async ({
  itemId,
  claimantId,
  message,
  proofPhoto = null,
}) => {
  if (!itemId || !claimantId) {
    throw new Error('itemId e claimantId são obrigatórios');
  }

  if (!message || !message.trim()) {
    throw new Error('Mensagem é obrigatória');
  }

  try {
    console.log('[itemClaims] ============== INICIANDO REIVINDICAÇÃO ==============');
    console.log('[itemClaims] itemId:', itemId);
    console.log('[itemClaims] claimantId:', claimantId);
    console.log('[itemClaims] message:', message.substring(0, 50) + '...');
    console.log('[itemClaims] proofPhoto:', proofPhoto ? 'SIM' : 'NÃO');

    let proofPhotoUrl = null;

    // *** PRIMEIRO: CRIAR A REIVINDICAÇÃO SEM FOTO ***
    console.log('[itemClaims] *** INSERINDO NO BANCO DE DADOS (SEM FOTO) ***');
    console.log('[itemClaims] Payload:', {
      item_id: itemId,
      claimant_id: claimantId,
      message: message.substring(0, 30) + '...',
      proof_photo_url: null,
      status: 'pending',
    });
    
    const { data, error } = await supabase
      .from('item_claims')
      .insert({
        item_id: itemId,
        claimant_id: claimantId,
        message,
        proof_photo_url: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    console.log('[itemClaims] Resposta do insert - data:', data);
    console.log('[itemClaims] Resposta do insert - error:', error);

    if (error) {
      console.error('[itemClaims] ERRO AO CRIAR REIVINDICAÇÃO NO BANCO:', error);
      throw error;
    }

    console.log('[itemClaims] ✓ Reivindicação criada com ID:', data.id);

    // *** SEGUNDO: FAZER UPLOAD DA FOTO (OPCIONAL) ***
    if (proofPhoto && proofPhoto.uri) {
      console.log('[itemClaims] *** INICIANDO UPLOAD DE FOTO (OPCIONAL) ***');
      try {
        console.log('[itemClaims] Foto URI original:', proofPhoto.uri);
        console.log('[itemClaims] Foto type:', proofPhoto.type);
        
        const photoUri = proofPhoto.uri.startsWith('file://') 
          ? proofPhoto.uri 
          : `file://${proofPhoto.uri}`;
        
        console.log('[itemClaims] Foto URI processada:', photoUri);
        
        const filename = `${itemId}-${claimantId}-${Date.now()}.jpg`;
        const filepath = `item-claims/${itemId}/${filename}`;
        
        console.log('[itemClaims] Filename:', filename);
        console.log('[itemClaims] Filepath:', filepath);

        console.log('[itemClaims] Lendo arquivo...');
        const fileInfo = await FileSystem.getInfoAsync(photoUri, { size: true });
        if (!fileInfo.exists) {
          throw new Error('Arquivo de imagem não encontrado no dispositivo');
        }
        console.log('[itemClaims] Arquivo encontrado, tamanho:', fileInfo.size, 'bytes');

        const session = await supabase.auth.getSession();
        const accessToken = session?.data?.session?.access_token;
        if (!accessToken) {
          throw new Error('Sessão não encontrada para upload');
        }

        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/item-photos/${filepath}`;
        console.log('[itemClaims] Iniciando upload para storage via REST...', uploadUrl);

        const contentType = proofPhoto.type && proofPhoto.type.includes('/')
          ? proofPhoto.type
          : 'image/jpeg';

        const uploadResponse = await FileSystem.uploadAsync(uploadUrl, photoUri, {
          httpMethod: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': contentType,
            'x-upsert': 'false',
          },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });

        console.log('[itemClaims] Upload response status:', uploadResponse.status);
        console.log('[itemClaims] Upload response body:', uploadResponse.body);

        if (uploadResponse.status >= 400) {
          console.warn('[itemClaims] AVISO: Falha ao fazer upload de foto:', uploadResponse.body || uploadResponse.status);
          console.warn('[itemClaims] A reivindicação foi criada, mas a foto não foi salva');
        } else {
          console.log('[itemClaims] Gerando URL pública...');
          const { data: publicUrlData } = supabase.storage
            .from('item-photos')
            .getPublicUrl(filepath);

          proofPhotoUrl = publicUrlData?.publicUrl;
          console.log('[itemClaims] URL pública gerada:', proofPhotoUrl);

          console.log('[itemClaims] Atualizando reivindicação com URL da foto...');
          const { error: updateError } = await supabase
            .from('item_claims')
            .update({ proof_photo_url: proofPhotoUrl })
            .eq('id', data.id);

          if (updateError) {
            console.warn('[itemClaims] AVISO: Não foi possível atualizar URL da foto:', updateError.message);
          } else {
            console.log('[itemClaims] ✓ Foto atualizada na reivindicação');
          }
        }
        console.log('[itemClaims] *** FIM DO UPLOAD DE FOTO ***');
      } catch (photoErr) {
        console.warn('[itemClaims] AVISO AO PROCESSAR FOTO:', photoErr.message);
        console.warn('[itemClaims] A reivindicação foi criada, mas a foto não pôde ser salva');
      }
    }

    console.log('[itemClaims] ✓ SUCESSO GERAL! Reivindicação com ID:', data.id);
    console.log('[itemClaims] ============== FIM DA REIVINDICAÇÃO ==============');
    
    // Retornar a reivindicação (possivelmente com foto, se conseguir)
    if (proofPhotoUrl) {
      data.proof_photo_url = proofPhotoUrl;
    }
    return data;
  } catch (err) {
    console.error('[itemClaims] ❌ ERRO GERAL NA REIVINDICAÇÃO:', err.message);
    console.error('[itemClaims] Stack completo:', err.stack);
    console.error('[itemClaims] ============== FIM COM ERRO ==============');
    throw err;
  }
};

// Buscar a reivindicação mais recente de um usuário para um item
export const getClaimForItemByUser = async (itemId, claimantId) => {
  if (!itemId || !claimantId) return null;

  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*')
      .eq('item_id', itemId)
      .eq('claimant_id', claimantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[itemClaims] Erro ao buscar reivindicação do usuário:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[itemClaims] Exceção ao buscar reivindicação do usuário:', err);
    return null;
  }
};

// Buscar reivindicações pendentes para um item encontrado
export const getPendingClaimsForItem = async (itemId) => {
  if (!itemId) return [];

  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*, profiles!claimant_id(name)')
      .eq('item_id', itemId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[itemClaims] Erro ao buscar reivindicações:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[itemClaims] Exceção ao buscar reivindicações:', err);
    return [];
  }
};

// Buscar o histórico completo de solicitações de um item
export const getClaimsForItem = async (itemId) => {
  if (!itemId) return [];

  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*, profiles!claimant_id(name)')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[itemClaims] Erro ao buscar histórico de reivindicações:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[itemClaims] Exceção ao buscar histórico de reivindicações:', err);
    return [];
  }
};

// Buscar todas as reivindicações de um usuário (como claimant)
export const getMyItemClaims = async (userId) => {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*, items!item_id(*)')
      .eq('claimant_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[itemClaims] Erro ao buscar minhas reivindicações:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[itemClaims] Exceção ao buscar minhas reivindicações:', err);
    return [];
  }
};

// Aprovar uma reivindicação
export const approveClaim = async (claimId) => {
  if (!claimId) {
    throw new Error('claimId é obrigatório');
  }

  try {
    console.log('[itemClaims] Aprovando reivindicação:', claimId);

    const { data, error } = await supabase
      .from('item_claims')
      .update({ status: 'approved' })
      .eq('id', claimId)
      .select()
      .single();

    if (error) {
      console.error('[itemClaims] Erro ao aprovar reivindicação:', error);
      throw error;
    }

    console.log('[itemClaims] Reivindicação aprovada');
    return data;
  } catch (err) {
    console.error('[itemClaims] Exceção ao aprovar reivindicação:', err);
    throw err;
  }
};

// Rejeitar uma reivindicação
export const rejectClaim = async (claimId, reason = null) => {
  if (!claimId) {
    throw new Error('claimId é obrigatório');
  }

  try {
    console.log('[itemClaims] Rejeitando reivindicação:', claimId);

    const { data, error } = await supabase
      .from('item_claims')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', claimId)
      .select()
      .single();

    if (error) {
      console.error('[itemClaims] Erro ao rejeitar reivindicação:', error);
      throw error;
    }

    console.log('[itemClaims] Reivindicação rejeitada');
    return data;
  } catch (err) {
    console.error('[itemClaims] Exceção ao rejeitar reivindicação:', err);
    throw err;
  }
};

// Verificar se há reivindicação aprovada para um item
export const hasApprovedClaim = async (itemId) => {
  if (!itemId) return null;

  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*')
      .eq('item_id', itemId)
      .eq('status', 'approved')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[itemClaims] Erro ao verificar reivindicação aprovada:', error);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('[itemClaims] Exceção ao verificar reivindicação aprovada:', err);
    return null;
  }
};

// Buscar uma reivindicação específica
export const getClaimById = async (claimId) => {
  if (!claimId) return null;

  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*, profiles!claimant_id(name), items!item_id(*)')
      .eq('id', claimId)
      .single();

    if (error) {
      console.error('[itemClaims] Erro ao buscar reivindicação:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[itemClaims] Exceção ao buscar reivindicação:', err);
    return null;
  }
};
