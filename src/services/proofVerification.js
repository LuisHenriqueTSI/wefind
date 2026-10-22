import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { createNotification } from './notifications';
import { sendMessage } from './messages';

const VERIFICATION_CACHE_PREFIX = '@wefind_proof_verification_';

/**
 * Faz o upload seguro de uma imagem de comprovação de posse
 */
export const uploadProofFile = async (itemId, claimantId, fileUri) => {
  try {
    if (!fileUri) return null;

    const uri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
    const filename = `proof-${itemId}-${claimantId}-${Date.now()}.jpg`;
    const filepath = `item-claims/${itemId}/${filename}`;

    const session = await supabase.auth.getSession();
    const accessToken = session?.data?.session?.access_token;
    const supabaseUrl = SUPABASE_URL;

    if (accessToken && supabaseUrl) {
      const uploadUrl = `${supabaseUrl}/storage/v1/object/item-photos/${filepath}`;
      const uploadResponse = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'false',
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      if (uploadResponse.status < 400) {
        const { data: publicUrlData } = supabase.storage
          .from('item-photos')
          .getPublicUrl(filepath);
        if (publicUrlData?.publicUrl) {
          return publicUrlData.publicUrl;
        }
      }
    }

    return fileUri;
  } catch (err) {
    console.warn('[proofVerification] Falha no upload de foto de comprovação:', err.message);
    return fileUri;
  }
};

/**
 * Envia pedido de comprovação de posse / tutor para autorizar a conversa de devolução
 */
export const submitOwnershipProof = async ({
  itemId,
  claimantId,
  message,
  proofPhotos = [],
  itemTitle = 'Animal',
  finderId = null,
  sendDirectMessage = true,
}) => {
  if (!itemId || !claimantId) {
    throw new Error('Identificação do pet e do usuário são obrigatórias.');
  }

  if (!message || !message.trim()) {
    throw new Error('Descreva como comprova ser o tutor (histórico, características, documentos).');
  }

  try {
    console.log('[proofVerification] Enviando comprovação de posse para item:', itemId);

    // Upload das fotos anexadas
    const uploadedUrls = [];
    for (const photo of proofPhotos) {
      const pUri = photo?.uri || photo;
      if (pUri) {
        const uploaded = await uploadProofFile(itemId, claimantId, pUri);
        if (uploaded) uploadedUrls.push(uploaded);
      }
    }

    const primaryPhotoUrl = uploadedUrls[0] || null;

    // 1. Tenta inserir na tabela item_claims do Supabase
    let claimRecord = null;
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .insert({
          item_id: itemId,
          claimant_id: claimantId,
          message: message.trim(),
          proof_photo_url: primaryPhotoUrl,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!error && data) {
        claimRecord = data;
      }
    } catch (dbErr) {
      console.warn('[proofVerification] Erro ao gravar em item_claims no banco:', dbErr.message);
    }

    // 2. Cache local persistente para garantir integridade e feedback imediato
    const localVerification = {
      id: claimRecord?.id || `local-${Date.now()}`,
      itemId,
      claimantId,
      message: message.trim(),
      proofPhotos: uploadedUrls,
      proof_photo_url: primaryPhotoUrl,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(
      `${VERIFICATION_CACHE_PREFIX}${itemId}_${claimantId}`,
      JSON.stringify(localVerification)
    );

    // 3. Informa o dono da publicação por notificação e mensagem direta
    if (finderId && finderId !== claimantId) {
      try {
        await createNotification({
          user_id: finderId,
          type: 'claim_received',
          title: 'Nova solicitação de devolução',
          message: `Um usuário enviou uma solicitação de devolução de ${itemTitle}. Abra o WeFIND para revisar a comprovação.`,
          item_id: itemId,
        });
      } catch (notifErr) {
        console.warn('[proofVerification] Falha ao enviar notificação de claim:', notifErr.message);
      }

      if (sendDirectMessage) {
        try {
          await sendMessage({
            sender_id: claimantId,
            receiver_id: finderId,
            item_id: itemId,
            content: `Olá! Enviei uma solicitação de devolução para ${itemTitle}. Compartilhei fotos e informações para comprovar que sou o tutor. Você pode revisar a solicitação na área "Solicitações de devolução".`,
          });
        } catch (messageErr) {
          console.warn('[proofVerification] Falha ao enviar mensagem sobre claim:', messageErr.message);
        }
      }
    }

    return localVerification;
  } catch (err) {
    console.error('[proofVerification] Erro geral ao submeter comprovação:', err);
    throw err;
  }
};

/**
 * Consulta o status de verificação de um usuário para um item específico
 */
export const getVerificationStatus = async (itemId, claimantId) => {
  if (!itemId || !claimantId) return { status: null, claim: null };

  try {
    // 1. Tenta buscar no banco Supabase
    const { data, error } = await supabase
      .from('item_claims')
      .select('*')
      .eq('item_id', itemId)
      .eq('claimant_id', claimantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      // Atualiza o cache local
      await AsyncStorage.setItem(
        `${VERIFICATION_CACHE_PREFIX}${itemId}_${claimantId}`,
        JSON.stringify(data)
      );
      return { status: data.status, claim: data };
    }

    // 2. Fallback para cache local se offline ou tabela restrita
    const cached = await AsyncStorage.getItem(`${VERIFICATION_CACHE_PREFIX}${itemId}_${claimantId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { status: parsed.status, claim: parsed };
    }

    return { status: null, claim: null };
  } catch (err) {
    console.warn('[proofVerification] Erro ao checar status de verificação:', err.message);
    try {
      const cached = await AsyncStorage.getItem(`${VERIFICATION_CACHE_PREFIX}${itemId}_${claimantId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return { status: parsed.status, claim: parsed };
      }
    } catch {}
    return { status: null, claim: null };
  }
};

/**
 * Lista todas as comprovações pendentes para moderação (Super Admin ou Responsável)
 */
export const listPendingVerifications = async () => {
  try {
    const { data, error } = await supabase
      .from('item_claims')
      .select('*, items:item_id(id, title, species, address, street, house_number, neighborhood, city, state, extra_fields), profiles:claimant_id(id, name, avatar_url)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[proofVerification] Erro ao listar comprovações do banco:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('[proofVerification] Falha ao listar pendentes:', err.message);
    return [];
  }
};

/**
 * Aprova a comprovação de tutor e libera o endereço
 */
export const approveVerification = async (claimId, { itemId, claimantId, itemTitle = 'o pet' } = {}) => {
  try {
    if (!claimId) throw new Error('ID da comprovação é obrigatório');

    const { data, error } = await supabase
      .from('item_claims')
      .update({ status: 'approved' })
      .eq('id', claimId)
      .select()
      .single();

    if (error) throw error;

    // Atualiza cache local
    if (itemId && claimantId) {
      await AsyncStorage.setItem(
        `${VERIFICATION_CACHE_PREFIX}${itemId}_${claimantId}`,
        JSON.stringify({ status: 'approved', id: claimId })
      );
    }

    // Notifica o tutor que a comprovação foi aceita
    if (claimantId) {
      createNotification({
        user_id: claimantId,
        type: 'claim_approved',
        title: 'Comprovação de tutela aprovada',
        message: `Sua comprovação de posse para ${itemTitle} foi aprovada. Combine a devolução pelo chat em um ponto público seguro; o endereço residencial continua protegido.`,
        item_id: itemId,
      }).catch((notificationError) => {
        console.warn('[proofVerification] Falha ao notificar aprovação:', notificationError.message);
      });
    }

    return data;
  } catch (err) {
    console.error('[proofVerification] Erro ao aprovar:', err);
    throw err;
  }
};

/**
 * Rejeita a comprovação de tutor
 */
export const rejectVerification = async (claimId, reason = '', { itemId, claimantId, itemTitle = 'o pet' } = {}) => {
  try {
    if (!claimId) throw new Error('ID da comprovação é obrigatório');

    const { data, error } = await supabase
      .from('item_claims')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', claimId)
      .select()
      .single();

    if (error) throw error;

    // Atualiza cache local
    if (itemId && claimantId) {
      await AsyncStorage.setItem(
        `${VERIFICATION_CACHE_PREFIX}${itemId}_${claimantId}`,
        JSON.stringify({ status: 'rejected', id: claimId, rejection_reason: reason })
      );
    }

    // Notifica o requerente
    if (claimantId) {
      createNotification({
        user_id: claimantId,
        type: 'claim_rejected',
        title: 'Comprovação de tutela não aprovada',
        message: `Sua solicitação de comprovação de tutor para ${itemTitle} não pôde ser aprovada.${reason ? ` Motivo: ${reason}` : ''}`,
        item_id: itemId,
      }).catch((notificationError) => {
        console.warn('[proofVerification] Falha ao notificar rejeição:', notificationError.message);
      });
    }

    return data;
  } catch (err) {
    console.error('[proofVerification] Erro ao rejeitar:', err);
    throw err;
  }
};
