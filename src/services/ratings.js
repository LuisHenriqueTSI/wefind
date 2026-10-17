import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNotification } from './notifications';
import { sendPushNotification } from './pushNotifications';

const LOCAL_RATINGS_KEY = '@wefind_user_ratings_store';

export const POPULAR_RATING_TAGS = [
  '❤️ Muito Atencioso(a)',
  '⚡ Respondeu Rápido',
  '🛡️ Tutor Confiável',
  '🐾 Ajudou no Resgate',
  '💬 Ótima Comunicação',
  '🤝 Muito Pontual',
  '⭐ Recomendo a Todos',
];

const RATING_INACTIVITY_MS = 24 * 60 * 60 * 1000;
const RATING_NOTIFICATION_TYPE = 'rating_available';

export const canRateUser = async (reviewerId, targetUserId) => {
  if (!reviewerId || !targetUserId || reviewerId === targetUserId) return false;

  try {
    const [sentResult, receivedResult] = await Promise.all([
      supabase
        .from('messages')
        .select('sent_at')
        .eq('sender_id', reviewerId)
        .eq('receiver_id', targetUserId)
        .order('sent_at', { ascending: false })
        .limit(1),
      supabase
        .from('messages')
        .select('sent_at')
        .eq('sender_id', targetUserId)
        .eq('receiver_id', reviewerId)
        .order('sent_at', { ascending: false })
        .limit(1),
    ]);

    if (sentResult.error) throw sentResult.error;
    if (receivedResult.error) throw receivedResult.error;

    const timestamps = [
      sentResult.data?.[0]?.sent_at,
      receivedResult.data?.[0]?.sent_at,
    ]
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);

    if (timestamps.length === 0) return false;
    return Date.now() - Math.max(...timestamps) >= RATING_INACTIVITY_MS;
  } catch (error) {
    console.warn('[ratings] Não foi possível verificar a conclusão da conversa:', error.message);
    return false;
  }
};

export const syncRatingNotifications = async (userId) => {
  if (!userId) return [];

  const { data: messages, error } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, sent_at')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('sent_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  const latestByUser = new Map();
  (messages || []).forEach((message) => {
    const otherUserId = message.sender_id === userId ? message.receiver_id : message.sender_id;
    if (!otherUserId || latestByUser.has(otherUserId)) return;
    latestByUser.set(otherUserId, message.sent_at);
  });

  const notificationTypes = Array.from(latestByUser.keys())
    .map((otherUserId) => `${RATING_NOTIFICATION_TYPE}:${otherUserId}`);
  const { data: existingNotifications, error: notificationsError } = await supabase
    .from('notifications')
    .select('type')
    .eq('user_id', userId)
    .in('type', notificationTypes.length > 0 ? notificationTypes : [RATING_NOTIFICATION_TYPE]);

  if (notificationsError) throw notificationsError;

  const existingTypes = new Set((existingNotifications || []).map((notification) => notification.type));
  const created = [];

  for (const [otherUserId, sentAt] of latestByUser.entries()) {
    if (Date.now() - new Date(sentAt).getTime() < RATING_INACTIVITY_MS) continue;

    const notificationType = `${RATING_NOTIFICATION_TYPE}:${otherUserId}`;
    if (existingTypes.has(notificationType)) continue;

    const notification = await createNotification({
      user_id: userId,
      type: notificationType,
      title: 'Classificação disponível',
      message: 'Sua conversa foi concluída. Você já pode registrar uma classificação.',
    });
    if (notification) {
      created.push(notification);
      await sendPushNotification(
        userId,
        'Classificação disponível',
        'Sua conversa foi concluída. Aproveite para classificar sua experiência.',
        { type: RATING_NOTIFICATION_TYPE, targetUserId: otherUserId }
      );
    }
  }

  return created;
};

// Sem classificações a média é null (e não 5,0): a tela mostra "Sem classificações".
const emptyRatings = () => ({ ratings: [], average: null, total: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });

const parseTags = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Nota válida de 1 a 5; qualquer outra coisa não entra na média
const parseStars = (value) => {
  const stars = Math.round(Number(value));
  return Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null;
};

/**
 * Classificações recebidas por um membro, com média e distribuição.
 * A tabela `user_ratings` do Supabase é a única fonte: antes cada celular
 * guardava também uma cópia local (com outro id), e quem classificava via a
 * própria nota contada duas vezes; notas que falhavam no servidor só
 * existiam naquele aparelho.
 */
export const getUserRatings = async (targetUserId) => {
  if (!targetUserId) return emptyRatings();

  try {
    const { data, error } = await supabase
      .from('user_ratings')
      .select('*')
      .eq('target_user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[ratings] Erro ao buscar user_ratings:', error.message);
      return emptyRatings();
    }

    // Uma classificação por avaliador (a mais recente), sempre com nota válida
    const seenReviewers = new Set();
    const ratings = [];
    (data || []).forEach((r) => {
      const stars = parseStars(r.stars);
      if (stars == null) return;
      const reviewerKey = String(r.reviewer_id || r.id);
      if (seenReviewers.has(reviewerKey)) return;
      seenReviewers.add(reviewerKey);
      ratings.push({
        id: r.id,
        targetUserId: r.target_user_id,
        reviewerId: r.reviewer_id,
        reviewerName: r.reviewer_name || 'Membro da Comunidade',
        reviewerAvatar: r.reviewer_avatar || null,
        stars,
        tags: parseTags(r.tags),
        comment: r.comment || '',
        createdAt: r.created_at,
      });
    });

    const total = ratings.length;
    if (total === 0) return emptyRatings();

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    ratings.forEach((r) => {
      breakdown[r.stars] += 1;
      sum += r.stars;
    });

    return {
      ratings,
      average: Math.round((sum / total) * 10) / 10,
      total,
      breakdown,
    };
  } catch (error) {
    console.warn('[ratings] Erro ao buscar avaliações:', error.message);
    return emptyRatings();
  }
};

export const submitUserRating = async ({
  targetUserId,
  reviewerId,
  reviewerName,
  reviewerAvatar,
  stars,
  tags = [],
  comment = '',
}) => {
  if (!targetUserId || !reviewerId) {
    throw new Error('Usuário avaliado e avaliador são obrigatórios.');
  }

  if (targetUserId === reviewerId) {
    throw new Error('Você não pode avaliar seu próprio perfil.');
  }

  const safeStars = parseStars(stars);
  if (safeStars == null) {
    throw new Error('Escolha uma nota de 1 a 5 estrelas.');
  }

  if (!(await canRateUser(reviewerId, targetUserId))) {
    throw new Error('A classificação será liberada após 24 horas sem novas mensagens entre vocês.');
  }

  // limit(1): com registros duplicados antigos, maybeSingle() dava erro
  const { data: existingRemoteRating, error: existingRemoteError } = await supabase
    .from('user_ratings')
    .select('id')
    .eq('target_user_id', targetUserId)
    .eq('reviewer_id', reviewerId)
    .limit(1);

  if (existingRemoteError) throw existingRemoteError;
  if (existingRemoteRating?.length > 0) {
    throw new Error('Você já enviou sua classificação para este membro. Ela não pode ser editada.');
  }

  const newRating = {
    target_user_id: targetUserId,
    reviewer_id: reviewerId,
    reviewer_name: reviewerName || 'Membro WeFIND',
    reviewer_avatar: reviewerAvatar || null,
    stars: safeStars,
    tags: Array.isArray(tags) ? tags : [],
    comment: String(comment || '').trim(),
    created_at: new Date().toISOString(),
  };

  // Se o servidor recusar, a classificação NÃO é dada como enviada
  const { data, error } = await supabase.from('user_ratings').insert(newRating).select().maybeSingle();
  if (error) {
    console.log('[ratings] Erro ao salvar no Supabase:', error.message);
    throw new Error('Não foi possível enviar a classificação agora. Verifique sua conexão e tente novamente.');
  }

  return data || newRating;
};

export const deleteUserRating = async (ratingId) => {
  if (!ratingId) return false;

  const { error } = await supabase
    .from('user_ratings')
    .delete()
    .eq('id', ratingId);

  if (error) {
    console.error('[ratings] Erro ao excluir avaliação:', error.message);
    throw error;
  }

  // Limpa a cópia local antiga, se ainda existir neste aparelho
  try {
    const raw = await AsyncStorage.getItem(LOCAL_RATINGS_KEY);
    if (raw) {
      const filtered = (JSON.parse(raw) || []).filter((r) => String(r.id) !== String(ratingId));
      await AsyncStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(filtered));
    }
  } catch {}

  return true;
};
