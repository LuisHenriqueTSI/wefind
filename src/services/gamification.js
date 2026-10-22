import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const GAMIFICATION_STORAGE_KEY = '@wefind/gamification_data';

export const RANKS = [
  {
    level: 1,
    title: 'Amigo dos Animais',
    minXp: 0,
    maxXp: 149,
    color: '#64748B',
    badgeBg: '#F1F5F9',
    icon: 'pets',
    description: 'Iniciando sua jornada na comunidade de proteção e resgate animal.',
  },
  {
    level: 2,
    title: 'Protetor Local',
    minXp: 150,
    maxXp: 399,
    color: '#0284C7',
    badgeBg: '#E0F2FE',
    icon: 'shield',
    description: 'Participação ativa ajudando a divulgar e registrar animais.',
  },
  {
    level: 3,
    title: 'Observador da Comunidade',
    minXp: 400,
    maxXp: 799,
    color: '#15803D',
    badgeBg: '#DCFCE7',
    icon: 'location-on',
    description: 'Ajuda a registrar avistamentos e conectar a comunidade.',
  },
  {
    level: 4,
    title: 'Anjo da Guarda',
    minXp: 800,
    maxXp: 1499,
    color: '#7C3AED',
    badgeBg: '#F3E8FF',
    icon: 'volunteer-activism',
    description: 'Destaque comunitário com múltiplos resgates e apoio a tutores.',
  },
  {
    level: 5,
    title: 'Guardião Lendário',
    minXp: 1500,
    maxXp: 999999,
    color: '#D97706',
    badgeBg: '#FEF3C7',
    icon: 'workspace-premium',
    description: 'Herói supremo do WeFIND, pilar fundamental da proteção animal.',
  },
];

export const ALL_BADGES = [
  {
    id: 'welcome',
    title: 'Primeiro Passo',
    description: 'Criou sua conta e ingressou na rede de proteção WeFIND',
    icon: 'star',
    category: 'community',
    xpReward: 30,
  },
  {
    id: 'pet_rg',
    title: 'Tutor Exemplar',
    description: 'Cadastrou seus pets domésticos na carteirinha digital',
    icon: 'badge',
    category: 'pets',
    xpReward: 50,
  },
  {
    id: 'foster_volunteer',
    title: 'Portas Abertas',
    description: 'Disponibilizou seu lar como Lar Temporário Solidário',
    icon: 'home-work',
    category: 'foster',
    xpReward: 100,
  },
  {
    id: 'sighting_active',
    title: 'Apoio nas Ruas',
    description: 'Registrou ou acompanhou avistamentos de animais nas ruas',
    icon: 'location-on',
    category: 'sightings',
    xpReward: 75,
  },
  {
    id: 'pet_resolved',
    title: 'Herói do Reencontro',
    description: 'Ajudou a trazer um pet perdido de volta para sua família',
    icon: 'celebration',
    category: 'hero',
    xpReward: 250,
  },
  {
    id: 'sharer',
    title: 'Divulgação Solidária',
    description: 'Gerou e compartilhou cartazes de pets com QR Code nas redes',
    icon: 'campaign',
    category: 'share',
    xpReward: 40,
  },
  {
    id: 'legendary',
    title: 'Guardião Supremo',
    description: 'Atingiu a patente máxima de proteção animal na comunidade',
    icon: 'military-tech',
    category: 'rank',
    xpReward: 300,
  },
];

/**
 * Calcula o nível e a patente com base no XP total
 */
export function getRankFromXp(xp = 0) {
  const currentRank = RANKS.find((r) => xp >= r.minXp && xp <= r.maxXp) || RANKS[0];
  const nextRank = RANKS.find((r) => r.level === currentRank.level + 1) || null;

  let progress = 1;
  let xpForNext = 0;
  let currentLevelXp = xp - currentRank.minXp;

  if (nextRank) {
    const range = currentRank.maxXp - currentRank.minXp + 1;
    progress = Math.min(1, Math.max(0, currentLevelXp / range));
    xpForNext = currentRank.maxXp - xp + 1;
  }

  return {
    currentRank,
    nextRank,
    progress,
    xpForNext,
    level: currentRank.level,
    title: currentRank.title,
    color: currentRank.color,
    badgeBg: currentRank.badgeBg,
  };
}

/**
 * Carrega e calcula os dados completos de gamificação do usuário
 * (combina atividades reais: publicações, reencontros, lares e RG)
 */
export async function getUserGamificationData(userId, profileData = null) {
  try {
    if (!userId) {
      return {
        xp: 30,
        rank: getRankFromXp(30),
        unlockedBadges: [ALL_BADGES[0]],
        allBadges: ALL_BADGES,
      };
    }

    // 1. Busca perfil, publicações e lares do usuário no Supabase
    const [profileRes, itemsRes, fosterRes] = await Promise.allSettled([
      profileData
        ? Promise.resolve({ data: profileData })
        : supabase.rpc('get_public_gamification_profile', { p_user_id: String(userId) }),
      supabase.from('items').select('id, status, resolved').eq('owner_id', userId),
      supabase.from('foster_volunteers').select('id, is_active').eq('user_id', userId).maybeSingle(),
    ]);

    const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
    const items = itemsRes.status === 'fulfilled' ? itemsRes.value.data || [] : [];
    const foster = fosterRes.status === 'fulfilled' ? fosterRes.value.data : null;

    const extra = profile?.extra_fields || {};
    const bonusXp = extra.bonus_gamification_xp || 0;
    const myPets = extra.my_pets || [];

    const resolvedItemsCount = items.filter((it) => it.resolved || it.status === 'resolved').length;
    const activeItemsCount = items.filter((it) => !it.resolved && it.status !== 'resolved').length;
    const isFosterActive = Boolean(foster && foster.is_active !== false);

    // 2. Cálculo dinâmico e justo de XP baseado no impacto real
    let totalXp = 30; // XP de Boas-Vindas

    totalXp += activeItemsCount * 40; // 40 XP por cada publicação criada
    totalXp += resolvedItemsCount * 250; // 250 XP por cada animal reencontrado
    totalXp += myPets.length * 35; // 35 XP por pet cadastrado no RG
    if (isFosterActive) totalXp += 120; // 120 XP por ser voluntário de Lar Temporário
    if (extra.shared_flyers_count) totalXp += extra.shared_flyers_count * 20;
    totalXp += bonusXp;

    // 3. Avaliação de Medalhas Desbloqueadas
    const unlockedBadges = [];

    // Sempre desbloqueia Boas-Vindas
    unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'welcome'));

    if (myPets.length > 0) {
      unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'pet_rg'));
    }

    if (isFosterActive) {
      unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'foster_volunteer'));
    }

    if (items.length > 0) {
      unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'sighting_active'));
    }

    if (resolvedItemsCount > 0) {
      unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'pet_resolved'));
    }

    if (extra.shared_flyers_count && extra.shared_flyers_count > 0) {
      unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'sharer'));
    }

    const rankInfo = getRankFromXp(totalXp);
    if (rankInfo.level >= 5) {
      unlockedBadges.push(ALL_BADGES.find((b) => b.id === 'legendary'));
    }

    const cleanUnlocked = unlockedBadges.filter(Boolean);

    const result = {
      xp: totalXp,
      rank: rankInfo,
      unlockedBadges: cleanUnlocked,
      allBadges: ALL_BADGES.map((b) => ({
        ...b,
        isUnlocked: cleanUnlocked.some((u) => u.id === b.id),
      })),
      stats: {
        totalItems: items.length,
        resolvedItems: resolvedItemsCount,
        myPetsCount: myPets.length,
        isFoster: isFosterActive,
      },
    };

    // Cache local
    AsyncStorage.setItem(`${GAMIFICATION_STORAGE_KEY}_${userId}`, JSON.stringify(result)).catch(() => {});

    return result;
  } catch (error) {
    console.warn('[gamification] Erro ao calcular gamificação:', error.message);
    const fallbackXp = 50;
    return {
      xp: fallbackXp,
      rank: getRankFromXp(fallbackXp),
      unlockedBadges: [ALL_BADGES[0]],
      allBadges: ALL_BADGES,
    };
  }
}

/**
 * Atribui pontos de XP bônus por ações no app (ex: compartilhar cartaz)
 */
export async function awardGamificationXp(userId, actionType, xpAmount = 25) {
  try {
    if (!userId) return null;

    const { data: profile } = await supabase.rpc('get_my_profile');

    const extra = profile?.extra_fields || {};
    const currentBonus = extra.bonus_gamification_xp || 0;
    const sharedCount = extra.shared_flyers_count || 0;

    const updatedExtra = {
      ...extra,
      bonus_gamification_xp: currentBonus + xpAmount,
      shared_flyers_count: actionType === 'share_flyer' ? sharedCount + 1 : sharedCount,
    };

    await supabase
      .from('profiles')
      .update({ extra_fields: updatedExtra })
      .eq('id', userId);

    return true;
  } catch (err) {
    console.warn('[gamification] Erro ao creditar XP:', err.message);
    return false;
  }
}
