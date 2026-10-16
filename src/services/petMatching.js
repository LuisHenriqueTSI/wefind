import { supabase } from '../lib/supabase';
import { calculateDistanceKm } from './sightings';
import { sendPushNotification } from './pushNotifications';
import { dispatchSystemNotificationToWhatsApp } from './whatsappNotifications';

/**
 * Normaliza strings para comparação (remove acentos, espaços extras e converte para minúsculas)
 */
const normalizeText = (text = '') => {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Normaliza cores comuns de animais
 */
const extractColorKeywords = (colorText = '') => {
  const norm = normalizeText(colorText);
  const colors = [];
  const palette = [
    'preto', 'preta', 'negro',
    'branco', 'branca',
    'caramelo', 'amarelo', 'dourado', 'bege', 'creme',
    'marrom', 'castanho', 'chocolate',
    'cinza', 'cinzento', 'grafite',
    'laranja', 'ruivo', 'vermelho',
    'mesclado', 'rajado', 'tricolor', 'bicolor', 'tigrado', 'malhado', 'manchado'
  ];

  palette.forEach(c => {
    if (norm.includes(c)) colors.push(c);
  });

  return colors;
};

/**
 * Calcula a pontuação e porcentagem de similaridade entre dois pets (0% a 100%)
 * Sistema calibrado com critérios de eliminação estrita (deal breakers) e penalidades para evitar falsos positivos.
 * @param {Object} petA - Animal cadastrado (ex: Perdido)
 * @param {Object} petB - Animal candidato (ex: Encontrado)
 * @returns {Object} { score: number, percentage: number, level: string, reasons: Array, isMatch: boolean }
 */
export const calculatePetMatchScore = (petA, petB) => {
  if (!petA || !petB) {
    return { score: 0, percentage: 0, level: 'Sem Correspondência', reasons: [], isMatch: false };
  }

  // 1. ESPÉCIE (Eliminação Estrita)
  const speciesA = normalizeText(petA.species || petA.category || '');
  const speciesB = normalizeText(petB.species || petB.category || '');

  const isDogA = speciesA.includes('cao') || speciesA.includes('cachorro') || speciesA.includes('dog');
  const isDogB = speciesB.includes('cao') || speciesB.includes('cachorro') || speciesB.includes('dog');
  const isCatA = speciesA.includes('gato') || speciesA.includes('cat');
  const isCatB = speciesB.includes('gato') || speciesB.includes('cat');
  const isHorseA = speciesA.includes('caval') || speciesA.includes('equin');
  const isHorseB = speciesB.includes('caval') || speciesB.includes('equin');
  const isBirdA = speciesA.includes('ave') || speciesA.includes('passar');
  const isBirdB = speciesB.includes('ave') || speciesB.includes('passar');

  if (
    (isDogA && !isDogB && speciesB) ||
    (isCatA && !isCatB && speciesB) ||
    (isHorseA && !isHorseB && speciesB) ||
    (isBirdA && !isBirdB && speciesB)
  ) {
    return { score: 0, percentage: 0, level: 'Espécies Diferentes', reasons: ['Espécies incompatíveis'], isMatch: false };
  }

  let totalScore = 0;
  const reasons = [];

  if ((isDogA && isDogB) || (isCatA && isCatB) || (speciesA && speciesB && speciesA === speciesB)) {
    totalScore += 20;
    reasons.push('Mesma espécie');
  } else if (!speciesA || !speciesB) {
    totalScore += 10; // Espécie genérica/não informada
  } else {
    return { score: 0, percentage: 0, level: 'Espécies Diferentes', reasons: ['Espécies incompatíveis'], isMatch: false };
  }

  // 2. SEXO / GÊNERO (Eliminação Estrita para Macho vs Fêmea)
  const genderA = normalizeText(petA.gender || petA.extra_fields?.gender || '');
  const genderB = normalizeText(petB.gender || petB.extra_fields?.gender || '');

  const isMaleA = genderA.startsWith('m');
  const isMaleB = genderB.startsWith('m');
  const isFemaleA = genderA.startsWith('f');
  const isFemaleB = genderB.startsWith('f');

  if ((isMaleA && isFemaleB) || (isFemaleA && isMaleB)) {
    // Macho vs Fêmea confirmados = Impossível ser o mesmo animal
    return {
      score: 0,
      percentage: 0,
      level: 'Sexo Oposto',
      reasons: ['Sexos opostos incompatíveis (Macho vs Fêmea)'],
      isMatch: false,
    };
  } else if ((isMaleA && isMaleB) || (isFemaleA && isFemaleB)) {
    totalScore += 10;
    reasons.push(`Mesmo sexo (${isMaleA ? 'Macho' : 'Fêmea'})`);
  } else {
    totalScore += 3; // Um não informado
  }

  // 3. PORTE (Eliminação Estrita para Portes Opostos)
  const sizeA = normalizeText(petA.size || petA.extra_fields?.size || '');
  const sizeB = normalizeText(petB.size || petB.extra_fields?.size || '');

  if (sizeA && sizeB) {
    const isTinyA = sizeA.includes('pequen') || sizeA.includes('mini');
    const isTinyB = sizeB.includes('pequen') || sizeB.includes('mini');
    const isHugeA = sizeA.includes('grand') || sizeA.includes('gigant');
    const isHugeB = sizeB.includes('grand') || sizeB.includes('gigant');

    // Pequeno vs Grande/Gigante = Impossível ser o mesmo
    if ((isTinyA && isHugeB) || (isHugeA && isTinyB)) {
      return {
        score: 0,
        percentage: 0,
        level: 'Portes Incompatíveis',
        reasons: ['Portes totalmente divergentes (Pequeno vs Grande)'],
        isMatch: false,
      };
    }

    if (sizeA === sizeB) {
      totalScore += 15;
      reasons.push(`Mesmo porte (${petA.size})`);
    } else {
      // Pequeno vs Médio ou Médio vs Grande
      totalScore += 6;
      reasons.push('Portes aproximados');
    }
  } else {
    totalScore += 5; // Não informado
  }

  // 4. RAÇA (Ponderação Rigorosa + Penalidade para Raças Conflitantes de Raça Pura)
  const breedA = normalizeText(petA.breed || petA.extra_fields?.breed || '');
  const breedB = normalizeText(petB.breed || petB.extra_fields?.breed || '');

  const isSrdA = !breedA || breedA.includes('srd') || breedA.includes('sem raca') || breedA.includes('mestic') || breedA.includes('vira-lata');
  const isSrdB = !breedB || breedB.includes('srd') || breedB.includes('sem raca') || breedB.includes('mestic') || breedB.includes('vira-lata');

  if (!isSrdA && !isSrdB && breedA && breedB) {
    if (breedA === breedB) {
      totalScore += 25; // Raça específica idêntica = Forte peso!
      reasons.push(`Mesma raça específica (${petA.breed})`);
    } else if (breedA.includes(breedB) || breedB.includes(breedA)) {
      totalScore += 18;
      reasons.push('Raças altamente compatíveis');
    } else {
      // Duas raças puras diferentes (ex: Pitbull vs Pinscher)
      totalScore -= 20; // Penalidade
      reasons.push('Raças divergentes');
    }
  } else if (isSrdA && isSrdB) {
    // Ambos SRD: Pontuação base moderada (não inflaciona o score)
    totalScore += 8;
    reasons.push('Ambos sem raça definida (SRD)');
  } else {
    totalScore += 4; // Um SRD e outro não informado
  }

  // 5. COR / PELAGEM (Ponderação Precisa + Penalidade para Cores Opostas)
  const colorA = petA.color || petA.extra_fields?.color || petA.description || '';
  const colorB = petB.color || petB.extra_fields?.color || petB.description || '';

  const colorsA = extractColorKeywords(colorA);
  const colorsB = extractColorKeywords(colorB);

  const sharedColors = colorsA.filter(c => colorsB.includes(c));
  if (sharedColors.length >= 2) {
    totalScore += 20;
    reasons.push(`Cores compartilhadas: ${sharedColors.join(', ')}`);
  } else if (sharedColors.length === 1) {
    totalScore += 12;
    reasons.push(`Cor em comum: ${sharedColors[0]}`);
  } else if (colorsA.length > 0 && colorsB.length > 0 && sharedColors.length === 0) {
    // Cores explicitamente opostas (ex: Branco puro vs Preto puro)
    totalScore -= 25; // Penalidade severa
  } else {
    totalScore += 4; // Não informado
  }

  // 6. FAIXA ETÁRIA / IDADE (Bônus de Compatibilidade)
  const ageA = normalizeText(petA.age || petA.extra_fields?.age || '');
  const ageB = normalizeText(petB.age || petB.extra_fields?.age || '');

  if (ageA && ageB) {
    const isPuppyA = ageA.includes('filhote');
    const isPuppyB = ageB.includes('filhote');
    const isElderA = ageA.includes('idos') || ageA.includes('senior');
    const isElderB = ageB.includes('idos') || ageB.includes('senior');

    if ((isPuppyA && isElderB) || (isElderA && isPuppyB)) {
      totalScore -= 15; // Filhote vs Idoso
    } else if (ageA === ageB) {
      totalScore += 5;
      reasons.push(`Mesma faixa etária (${petA.age})`);
    }
  }

  // 7. PROXIMIDADE GEOGRÁFICA (Haversine Rigoroso)
  const latA = petA.latitude ?? petA.extra_fields?.location_details?.latitude;
  const lonA = petA.longitude ?? petA.extra_fields?.location_details?.longitude;
  const latB = petB.latitude ?? petB.extra_fields?.location_details?.latitude;
  const lonB = petB.longitude ?? petB.extra_fields?.location_details?.longitude;

  let distanceKm = null;
  if (latA != null && lonA != null && latB != null && lonB != null) {
    distanceKm = calculateDistanceKm(latA, lonA, latB, lonB);
    if (distanceKm != null) {
      if (distanceKm <= 1.2) {
        totalScore += 15;
        reasons.push(`Local imediato (${distanceKm.toFixed(1)} km)`);
      } else if (distanceKm <= 3.5) {
        totalScore += 10;
        reasons.push(`Mesma vizinhança (${distanceKm.toFixed(1)} km)`);
      } else if (distanceKm <= 8.0) {
        totalScore += 5;
        reasons.push(`Mesma região (${distanceKm.toFixed(1)} km)`);
      } else if (distanceKm <= 20.0) {
        totalScore += 2;
      } else {
        totalScore -= 15; // Distância excessiva
      }
    }
  } else {
    const cityA = normalizeText(petA.city || '');
    const cityB = normalizeText(petB.city || '');
    const neighA = normalizeText(petA.neighborhood || '');
    const neighB = normalizeText(petB.neighborhood || '');

    if (cityA && cityB && cityA === cityB) {
      if (neighA && neighB && neighA === neighB) {
        totalScore += 12;
        reasons.push('Mesmo bairro');
      } else {
        totalScore += 5;
        reasons.push('Mesma cidade');
      }
    } else if (cityA && cityB && cityA !== cityB) {
      totalScore -= 20; // Cidades diferentes
    }
  }

  const percentage = Math.min(100, Math.max(0, Math.round(totalScore)));

  let level = 'Semelhança Baixa';
  let badgeColor = '#94A3B8';

  if (percentage >= 85) {
    level = 'Altíssima Probabilidade 🎯';
    badgeColor = '#10B981'; // Verde Sucesso
  } else if (percentage >= 70) {
    level = 'Grande Chance 🔍';
    badgeColor = '#2E5634'; // Verde Floresta
  } else if (percentage >= 55) {
    level = 'Possível Semelhança 🐾';
    badgeColor = '#FEA937'; // Dourado
  }

  return {
    score: totalScore,
    percentage,
    level,
    badgeColor,
    distanceKm: distanceKm != null ? Number(distanceKm.toFixed(1)) : null,
    reasons,
    isMatch: percentage >= 55,
  };
};

/**
 * Busca na base todos os pets que dão match com o animal fornecido
 * @param {Object} petItem - Animal de referência (com status 'lost' ou 'found')
 * @param {Object} options - Configurações opcionais (maxRadiusKm, minScore)
 * @returns {Promise<Array>} Lista de candidatos ordenados por maior porcentagem de match
 */
export const findMatchesForPet = async (petItem, options = {}) => {
  try {
    if (!petItem || !petItem.id) return [];

    const minScore = options.minScore || 55;
    const targetStatus = petItem.status === 'lost' ? 'found' : (petItem.status === 'found' ? 'lost' : null);

    if (!targetStatus) return [];

    // Query otimizada buscando candidatos ativos do status oposto
    let query = supabase
      .from('items')
      .select('*, profiles!owner_id(name, avatar_url, avatar_path), item_photos(id, url)')
      .eq('resolved', false)
      .eq('status', targetStatus)
      .neq('id', petItem.id);

    // Se tiver espécie, filtra para economizar tráfego
    if (petItem.species) {
      query = query.ilike('species', `%${petItem.species.slice(0, 3)}%`);
    }

    const { data: candidates, error } = await query;
    if (error) {
      console.log('[findMatchesForPet] Erro na busca de candidatos:', error.message);
      return [];
    }

    if (!candidates || candidates.length === 0) return [];

    // Calcula a pontuação para cada candidato
    const matches = candidates
      .map(candidate => {
        const matchResult = calculatePetMatchScore(petItem, candidate);
        const photoUrl = candidate.item_photos?.[0]?.url || candidate.photo_urls?.[0] || null;
        
        return {
          ...candidate,
          match: matchResult,
          photoUrl,
        };
      })
      .filter(item => item.match.percentage >= minScore)
      .sort((a, b) => b.match.percentage - a.match.percentage);

    return matches;
  } catch (err) {
    console.error('[findMatchesForPet] Exceção:', err);
    return [];
  }
};

/**
 * Executa o motor de match automático logo após o cadastro de um animal
 * e dispara notificações no app / push para os usuários correspondentes.
 * @param {Object} newItem - Animal recém-cadastrado
 * @returns {Promise<Array>} Lista de matches encontrados com score >= 60%
 */
export const processAndNotifyPetMatches = async (newItem) => {
  try {
    if (!newItem || !newItem.id || !newItem.owner_id) return [];

    console.log(`[petMatching] Processando matches automáticos para o item #${newItem.id} (${newItem.status})...`);
    
    // Busca matches na base
    const matches = await findMatchesForPet(newItem, { minScore: 60 });
    if (!matches || matches.length === 0) {
      console.log('[petMatching] Nenhum match >= 60% encontrado no momento.');
      return [];
    }

    console.log(`[petMatching] Encontrados ${matches.length} matches potenciais!`);

    // Notifica os usuários envolvidos (quem cadastrou o novo pet e quem é o dono do pet correspondente)
    for (const matchedPet of matches.slice(0, 3)) {
      const matchScore = matchedPet.match.percentage;
      const matchLevel = matchedPet.match.level;

      const isNewItemLost = newItem.status === 'lost';
      const petNameA = newItem.animal_name || newItem.title || 'Seu pet';
      const petNameB = matchedPet.animal_name || matchedPet.title || 'um animal';
      const locationInfo = matchedPet.neighborhood || matchedPet.city || 'sua região';

      // 1. Notificação para quem cadastrou o novo item (usuário atual)
      const notifyTitleForCreator = `🎯 Possível Match (${matchScore}% de Semelhança)!`;
      const notifyMessageForCreator = isNewItemLost
        ? `Encontramos um animal compatível registrado como ENCONTRADO em ${locationInfo}. Toque para comparar as fotos!`
        : `Encontramos um relato de pet PERDIDO em ${locationInfo} com características parecidas. Toque para conferir!`;

      // 2. Notificação para o dono do pet já existente na base
      const notifyTitleForExistingOwner = `🎯 Alerta de Match (${matchScore}% de Semelhança)!`;
      const notifyMessageForExistingOwner = isNewItemLost
        ? `Um animal PERDIDO muito parecido com a sua publicação foi registrado em ${locationInfo}. Compare as fotos!`
        : `Um animal compatível foi registrado como ENCONTRADO em ${locationInfo}. Confira se é o seu pet!`;

      // Insere no banco para o dono do pet existente
      if (matchedPet.owner_id && matchedPet.owner_id !== newItem.owner_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: matchedPet.owner_id,
            title: notifyTitleForExistingOwner,
            message: notifyMessageForExistingOwner,
            type: 'pet_match',
            read: false,
            item_id: matchedPet.id,
            created_at: new Date().toISOString(),
          });

          // Dispara Push Notification móvel
          sendPushNotification(
            matchedPet.owner_id,
            notifyTitleForExistingOwner,
            notifyMessageForExistingOwner,
            { itemId: matchedPet.id, matchedItemId: newItem.id, type: 'pet_match' }
          ).catch(() => {});

          // Dispara WhatsApp caso configurado
          dispatchSystemNotificationToWhatsApp({
            userId: matchedPet.owner_id,
            title: notifyTitleForExistingOwner,
            message: notifyMessageForExistingOwner,
          }).catch(() => {});
        } catch (notifErr) {
          console.log('[petMatching] Erro ao notificar dono existente:', notifErr.message);
        }
      }

      // Insere no banco para o criador do novo pet
      try {
        await supabase.from('notifications').insert({
          user_id: newItem.owner_id,
          title: notifyTitleForCreator,
          message: notifyMessageForCreator,
          type: 'pet_match',
          read: false,
          item_id: newItem.id,
          created_at: new Date().toISOString(),
        });
      } catch (notifErr) {
        console.log('[petMatching] Erro ao notificar criador:', notifErr.message);
      }
    }

    return matches;
  } catch (err) {
    console.error('[processAndNotifyPetMatches] Erro no processamento:', err);
    return [];
  }
};
