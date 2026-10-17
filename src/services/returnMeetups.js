import { supabase } from '../lib/supabase';
import { createNotification } from './notifications';
import { sendMessage } from './messages';
import { approveVerification, getVerificationStatus } from './proofVerification';
import { removeHouseNumberFromAddress } from '../utils/locationPrivacy';

// Encontros de devolução combinados no chat (tabela public.return_meetups,
// criada por supabase/return_meetups.sql). Cada mudança de status também gera
// uma mensagem no chat e uma notificação para o outro participante.

export const MEETUP_ACTIVE_STATUSES = ['proposed', 'confirmed'];

// Marcadores usados nas mensagens do chat para renderizar os cards de encontro
export const MEETUP_MESSAGE_MARKERS = {
  proposed: '[ENCONTRO PROPOSTO]',
  countered: '[NOVA SUGESTÃO DE ENCONTRO]',
  confirmed: '[ENCONTRO CONFIRMADO]',
  declined: '[ENCONTRO RECUSADO]',
  cancelled: '[ENCONTRO CANCELADO]',
};

export const getMeetupMessageKind = (content) => {
  if (typeof content !== 'string') return null;
  return Object.keys(MEETUP_MESSAGE_MARKERS).find((kind) => content.includes(MEETUP_MESSAGE_MARKERS[kind])) || null;
};

const WEEKDAYS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const pad = (value) => String(value).padStart(2, '0');

// Formatação manual para não depender do Intl do Hermes: "sáb., 18/10 às 15:00"
export const formatMeetupDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAYS[date.getDay()]}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const buildGoogleMapsUrl = (meetup) => {
  const lat = Number(meetup?.latitude);
  const lng = Number(meetup?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

// A tabela ainda não existe no banco (migração não executada)
const isMissingTableError = (error) =>
  Boolean(error) && (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /return_meetups/i.test(String(error.message || '')) && /(does not exist|not find|schema cache)/i.test(String(error.message || ''))
  );

const MISSING_TABLE_MESSAGE = 'O agendamento de encontros ainda não está disponível no servidor. Tente novamente mais tarde.';

const normalizeError = (error) => {
  if (isMissingTableError(error)) {
    const friendly = new Error(MISSING_TABLE_MESSAGE);
    friendly.code = 'MEETUPS_UNAVAILABLE';
    return friendly;
  }
  return error;
};

/**
 * Busca o encontro mais recente entre quem está com o animal e o tutor.
 * Propostas substituídas por contraproposta são ignoradas.
 */
export const getLatestMeetup = async ({ itemId, finderId, claimantId }) => {
  if (!itemId || !finderId || !claimantId) return { meetup: null, unavailable: false };

  const { data, error } = await supabase
    .from('return_meetups')
    .select('*')
    .eq('item_id', itemId)
    .eq('finder_id', finderId)
    .eq('claimant_id', claimantId)
    .neq('status', 'superseded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return { meetup: null, unavailable: true };
    throw error;
  }
  return { meetup: data || null, unavailable: false };
};

const buildMeetupMessage = (kind, meetup, { responseNote = '' } = {}) => {
  const lines = [MEETUP_MESSAGE_MARKERS[kind]];
  if (kind === 'proposed' || kind === 'countered' || kind === 'confirmed') {
    lines.push(`🗓️ Quando: ${formatMeetupDate(meetup.meeting_at)}`);
    lines.push(`📍 Onde: ${meetup.address_text || 'Ponto marcado no mapa'}`);
    if (meetup.note) lines.push(`📝 Observação: ${meetup.note}`);
  } else {
    lines.push(`🗓️ Encontro de ${formatMeetupDate(meetup.meeting_at)}`);
  }
  if (responseNote) lines.push(`💬 ${responseNote}`);
  return lines.join('\n');
};

const NOTIFICATION_COPY = {
  proposed: (title) => ({ title: 'Proposta de encontro', message: `Você recebeu uma proposta de local e horário para a devolução de ${title}. Abra o chat no WeFIND para responder.` }),
  countered: (title) => ({ title: 'Nova sugestão de encontro', message: `Foi sugerido outro horário ou local para a devolução de ${title}. Abra o chat no WeFIND para responder.` }),
  confirmed: (title) => ({ title: 'Encontro confirmado', message: `O encontro para a devolução de ${title} foi confirmado. Os detalhes estão fixados no chat.` }),
  declined: (title) => ({ title: 'Horário recusado', message: `O horário proposto para a devolução de ${title} não pôde ser aceito. Combine um novo pelo chat.` }),
  cancelled: (title) => ({ title: 'Encontro cancelado', message: `O encontro para a devolução de ${title} foi cancelado. Combine um novo pelo chat.` }),
};

// Mensagem no chat + notificação ao outro participante (falhas não desfazem o encontro)
const announceMeetupChange = async (kind, meetup, { senderId, receiverId, itemTitle, responseNote }) => {
  let sentMessage = null;
  try {
    sentMessage = await sendMessage({
      sender_id: senderId,
      receiver_id: receiverId,
      item_id: meetup.item_id,
      content: buildMeetupMessage(kind, meetup, { responseNote }),
    });
  } catch (messageError) {
    console.warn('[returnMeetups] Falha ao enviar mensagem do encontro:', messageError.message);
  }

  const copy = NOTIFICATION_COPY[kind]?.(itemTitle || 'o pet');
  if (copy) {
    createNotification({
      user_id: receiverId,
      type: 'meetup_update',
      title: copy.title,
      message: copy.message,
      item_id: meetup.item_id,
    }).catch((notificationError) => {
      console.warn('[returnMeetups] Falha ao notificar encontro:', notificationError.message);
    });
  }

  return sentMessage;
};

/**
 * Quem está com o animal libera o local: aprova a comprovação pendente do tutor
 * (se houver) para que o chat seja desbloqueado para ele.
 */
export const approvePendingClaimForMeetup = async ({ itemId, claimantId, itemTitle }) => {
  try {
    const { claim } = await getVerificationStatus(itemId, claimantId);
    if (claim?.id && claim.status === 'pending' && !String(claim.id).startsWith('local-')) {
      await approveVerification(claim.id, { itemId, claimantId, itemTitle });
    }
  } catch (claimError) {
    console.warn('[returnMeetups] Não foi possível aprovar a comprovação pendente:', claimError.message);
  }
};

/**
 * Cria uma proposta de encontro. Quando `previousMeetup` está ativo, ele é
 * marcado como substituído (contraproposta ou remarcação).
 */
export const proposeMeetup = async ({
  itemId,
  finderId,
  claimantId,
  proposerId,
  meetingAt,
  coordinate,
  addressText,
  note = '',
  previousMeetup = null,
  itemTitle,
}) => {
  if (!itemId || !finderId || !claimantId || !proposerId) {
    throw new Error('Não foi possível identificar os participantes do encontro.');
  }
  if (proposerId !== finderId && proposerId !== claimantId) {
    throw new Error('Apenas os participantes da conversa podem propor um encontro.');
  }
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Escolha o ponto de encontro no mapa.');
  }
  const date = meetingAt instanceof Date ? meetingAt : new Date(meetingAt);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60 * 1000) {
    throw new Error('Escolha uma data e um horário no futuro.');
  }

  const isCounter = Boolean(previousMeetup && MEETUP_ACTIVE_STATUSES.includes(previousMeetup.status));

  const { data, error } = await supabase
    .from('return_meetups')
    .insert({
      item_id: itemId,
      finder_id: finderId,
      claimant_id: claimantId,
      proposed_by: proposerId,
      parent_id: isCounter ? previousMeetup.id : null,
      status: 'proposed',
      meeting_at: date.toISOString(),
      latitude,
      longitude,
      // Nunca grava número de casa
      address_text: removeHouseNumberFromAddress(String(addressText || '').trim()),
      note: String(note || '').trim() || null,
    })
    .select()
    .single();

  if (error) throw normalizeError(error);

  // Só depois de gravar a nova proposta a anterior é marcada como substituída
  if (isCounter) {
    const { error: supersedeError } = await supabase
      .from('return_meetups')
      .update({ status: 'superseded', responded_by: proposerId, responded_at: new Date().toISOString() })
      .eq('id', previousMeetup.id)
      .in('status', MEETUP_ACTIVE_STATUSES);
    if (supersedeError) console.warn('[returnMeetups] Falha ao substituir proposta anterior:', supersedeError.message);
  }

  const receiverId = proposerId === finderId ? claimantId : finderId;
  const sentMessage = await announceMeetupChange(isCounter ? 'countered' : 'proposed', data, {
    senderId: proposerId,
    receiverId,
    itemTitle,
  });

  return { meetup: data, message: sentMessage };
};

/**
 * Responde a um encontro: confirmar, recusar (não pode no horário) ou cancelar.
 */
export const respondToMeetup = async (meetup, action, { userId, responseNote = '', itemTitle } = {}) => {
  if (!meetup?.id || !userId) throw new Error('Encontro inválido.');

  const rules = {
    confirm: { from: ['proposed'], to: 'confirmed', kind: 'confirmed' },
    decline: { from: ['proposed'], to: 'declined', kind: 'declined' },
    cancel: { from: MEETUP_ACTIVE_STATUSES, to: 'cancelled', kind: 'cancelled' },
  };
  const rule = rules[action];
  if (!rule) throw new Error('Ação inválida para o encontro.');
  if (!rule.from.includes(meetup.status)) {
    throw new Error('Este encontro já foi atualizado. Atualize o chat para ver o status atual.');
  }
  if ((action === 'confirm' || action === 'decline') && meetup.proposed_by === userId) {
    throw new Error('Aguarde a resposta da outra pessoa para esta proposta.');
  }

  const { data, error } = await supabase
    .from('return_meetups')
    .update({
      status: rule.to,
      response_note: String(responseNote || '').trim() || null,
      responded_by: userId,
      responded_at: new Date().toISOString(),
    })
    .eq('id', meetup.id)
    .in('status', rule.from)
    .select()
    .maybeSingle();

  if (error) throw normalizeError(error);
  if (!data) throw new Error('Este encontro já foi atualizado. Atualize o chat para ver o status atual.');

  const receiverId = userId === data.finder_id ? data.claimant_id : data.finder_id;
  const sentMessage = await announceMeetupChange(rule.kind, data, {
    senderId: userId,
    receiverId,
    itemTitle,
    responseNote: String(responseNote || '').trim(),
  });

  return { meetup: data, message: sentMessage };
};
