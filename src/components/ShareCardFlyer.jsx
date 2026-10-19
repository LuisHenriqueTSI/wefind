import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import * as itemsService from '../services/items';
import COLORS from '../constants/theme';
import {
  getFlyerLocationSummary,
} from '../utils/locationPrivacy';
import { publicationUrl } from '../constants/links';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const APP_LOGO = require('../../assets/logo_outlined.png');

/**
 * Componente de Cartaz e Gerador de Post Visual do WeFIND
 * Suporta formatos:
 * - 'a4': Cartaz Tradicional de Impressão com QR Code grande
 * - 'stories': Formato 9:16 Vertical para Instagram Stories e WhatsApp Status
 * - 'feed': Formato 1:1 Quadrado para Feed do Instagram/Facebook e Grupos
 */
const ShareCardFlyer = React.forwardRef(({ item, imageUrl, format = 'a4', showPhone = false, contactPhone = null }, ref) => {
  if (!item) return null;

  const isAdoption = Boolean(
    item.extra_fields?.is_direct_adoption ||
    item.status === 'adoption' ||
    (item.status === 'found' && (item.extra_fields?.available_for_adoption || itemsService.isPetAvailableForAdoption(item)))
  );
  const isLost = !isAdoption && item.status === 'lost';
  const isFound = !isAdoption && item.status === 'found';
  const adoptionTotalCount = Math.max(1, Number(item.extra_fields?.adoption_total_count) || 1);
  const storedAdoptionAnimals = Array.isArray(item.extra_fields?.adoption_animals)
    ? item.extra_fields.adoption_animals
    : [];
  const hasIndividualAdoptionStatuses = storedAdoptionAnimals.length === adoptionTotalCount
    && storedAdoptionAnimals.every((animal) => ['available', 'adopted'].includes(animal?.adoption_status));
  const rawAdoptionRemainingCount = Number(item.extra_fields?.adoption_remaining_count);
  const adoptionRemainingCount = hasIndividualAdoptionStatuses
    ? storedAdoptionAnimals.filter((animal) => animal.adoption_status === 'available').length
    : item.extra_fields?.adoption_remaining_count != null && Number.isSafeInteger(rawAdoptionRemainingCount)
      ? Math.max(0, Math.min(adoptionTotalCount, rawAdoptionRemainingCount))
      : adoptionTotalCount;
  const availableAdoptionAnimals = hasIndividualAdoptionStatuses
    ? storedAdoptionAnimals
      .map((animal, index) => ({ ...animal, number: index + 1 }))
      .filter((animal) => animal.adoption_status === 'available')
    : [];
  const adoptionOriginLabels = {
    rescue: 'Animais resgatados ou encontrados',
    own_litter: 'Ninhada do animal do responsável',
    shelter: 'Abrigo, ONG ou protetor',
    other: 'Outra origem',
  };
  const adoptionOriginLabel = adoptionOriginLabels[item.extra_fields?.adoption_origin] || '';
  const hasAdoptionGroupDetails = Boolean(
    isAdoption && (
      item.extra_fields?.is_direct_adoption
      || item.status === 'adoption'
      || item.extra_fields?.adoption_origin
      || item.extra_fields?.adoption_total_count
    )
  );
  const formatAnimalValue = (value) => {
    const formatted = Array.isArray(value)
      ? value.filter(Boolean).join(' e ')
      : String(value || '').trim();
    return formatted && formatted !== 'Não informado' ? formatted : '';
  };
  const getAvailableAnimalDescription = (animal) => [
    formatAnimalValue(animal.gender),
    formatAnimalValue(animal.color),
    formatAnimalValue(animal.age),
    formatAnimalValue(animal.breed),
  ].filter(Boolean).join(' · ');
  const visibleAvailableAnimals = availableAdoptionAnimals
    .map((animal) => ({ ...animal, description: getAvailableAnimalDescription(animal) }))
    .filter((animal) => animal.description)
    .slice(0, 3);
  const hiddenAvailableAnimalCount = Math.max(0, availableAdoptionAnimals.length - visibleAvailableAnimals.length);

  const statusColor = isAdoption ? '#DB2777' : (isLost ? '#D64545' : '#15803D');

  // Cabeçalho dinâmico por espécie
  const speciesRaw = String(item.species || item.extra_fields?.species || '').trim();
  const getHeaderTitle = () => {
    if (isAdoption) {
      if (adoptionTotalCount > 1) {
        return 'ANIMAIS PARA ADOÇÃO';
      }
      if (speciesRaw) {
        const upper = speciesRaw.toUpperCase();
        return `${upper} PARA ADOÇÃO`;
      }
      return 'ANIMAL PARA ADOÇÃO';
    }
    if (speciesRaw) {
      const upper = speciesRaw.toUpperCase();
      if (upper === 'AVE') {
        return isLost ? 'AVE PERDIDA' : 'AVE ENCONTRADA';
      }
      return isLost ? `${upper} PERDIDO` : `${upper} ENCONTRADO`;
    }
    return isLost ? 'PROCURA-SE ANIMAL' : 'ANIMAL ENCONTRADO';
  };

  const statusHeaderTitle = getHeaderTitle();
  const locationLabel = isAdoption
    ? item.extra_fields?.adoption_origin === 'own_litter'
      ? 'LOCAL DA NINHADA:'
      : adoptionTotalCount > 1
        ? 'LOCAL ONDE ESTÃO OS ANIMAIS:'
        : 'ONDE O ANIMAL ESTÁ:'
    : (isLost ? 'LOCAL DO DESAPARECIMENTO:' : 'LOCAL ONDE FOI ENCONTRADO:');

  // Localização
  const flyerLocationText = getFlyerLocationSummary(item);

  // Formatação de data
  const formatDate = (rawDate) => {
    if (!rawDate) return '';
    try {
      const str = String(rawDate).trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T12:00:00`) : new Date(str);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      }
    } catch (e) {}
    return String(rawDate);
  };

  const formattedDate = formatDate(item.date);
  const photoUrl = imageUrl || (item.item_photos && item.item_photos[0]?.url) || null;

  // Recompensa ativa
  const activeReward = Array.isArray(item.rewards)
    ? item.rewards.find((r) => r?.status === 'active')
    : null;

  // Formatação de telefone
  const formatPhoneWithNine = (phone) => {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = cleaned.slice(0, 2) + '9' + cleaned.slice(2);
    }
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const thirdParty = item.extra_fields?.third_party_owner;
  const isThirdParty = Boolean(thirdParty && thirdParty.active && (thirdParty.name || thirdParty.phone));

  const rawPhone = (isThirdParty && thirdParty.phone)
    ? thirdParty.phone
    : (contactPhone || null);

  // O telefone só entra no cartaz quando o autor da publicação escolhe mostrá-lo
  const formattedPhone = showPhone ? formatPhoneWithNine(rawPhone) : null;
  const ownerName = (isThirdParty && thirdParty.name)
    ? thirdParty.name
    : (item.profiles?.name || item.owner_name || 'Tutor do Pet');
  const ownerLabel = isAdoption ? 'Responsável' : (isLost ? 'Tutor' : 'Encontrado por');
  const adoptionAvailabilityText = adoptionRemainingCount === 0
    ? 'Todos já foram adotados'
    : `${adoptionRemainingCount} ${adoptionRemainingCount === 1 ? 'animal disponível' : 'animais disponíveis'} para adoção`;

  const renderAdoptionInfo = (compact = false) => {
    if (!hasAdoptionGroupDetails) return null;

    if (compact) {
      const details = visibleAvailableAnimals
        .map((animal) => `#${animal.number}: ${animal.description}`)
        .join(' | ');
      return (
        <View style={styles.compactAdoptionInfo}>
          <Text style={styles.compactAdoptionCount}>{adoptionAvailabilityText}</Text>
          {adoptionOriginLabel ? (
            <Text style={styles.compactAdoptionOrigin} numberOfLines={1}>{adoptionOriginLabel}</Text>
          ) : null}
          {details ? (
            <Text style={styles.compactAdoptionAnimals} numberOfLines={2}>
              {details}{hiddenAvailableAnimalCount > 0 ? ` | +${hiddenAvailableAnimalCount} no app` : ''}
            </Text>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.adoptionInfoContainer}>
        <Text style={styles.adoptionAvailabilityText}>{adoptionAvailabilityText}</Text>
        {adoptionOriginLabel ? (
          <Text style={styles.adoptionOriginText}>Origem: {adoptionOriginLabel}</Text>
        ) : null}
        {visibleAvailableAnimals.length > 0 ? (
          <View style={styles.adoptionAnimalsList}>
            <Text style={styles.adoptionAnimalsTitle}>Animais ainda disponíveis</Text>
            {visibleAvailableAnimals.map((animal) => (
              <Text key={animal.number} style={styles.adoptionAnimalText} numberOfLines={1}>
                {animal.number}. {animal.description}
              </Text>
            ))}
            {hiddenAvailableAnimalCount > 0 ? (
              <Text style={styles.adoptionMoreText}>e mais {hiddenAvailableAnimalCount} no WeFIND</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  // URL do QR Code Dinâmico
  const petLink = publicationUrl(item.id);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(petLink)}&color=2E5634&bgcolor=FFFFFF&margin=1`;

  // ==========================================
  // FORMATO 2: STORIES / STATUS (9:16)
  // ==========================================
  if (format === 'stories') {
    return (
      <View ref={ref} collapsable={false} style={styles.storiesCanvasWrapper}>
        <View style={styles.storiesContainer}>
          <View style={[styles.storiesHeaderBanner, { backgroundColor: statusColor }]}>
            <View style={styles.storiesBrandRow}>
              <View style={styles.storiesHeaderPill}>
                <Text style={styles.storiesHeaderPillText}>{isAdoption ? 'ADOÇÃO' : 'ALERTA'}</Text>
              </View>
            </View>
            <Text style={styles.storiesStatusTitle}>{statusHeaderTitle}</Text>
          </View>

          <View style={styles.storiesImageContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.storiesPetImage} resizeMode="cover" />
            ) : (
              <View style={styles.noPhotoBox}>
                <MaterialIcons name="pets" size={54} color="#9CA3AF" />
                <Text style={styles.noPhotoText}>Sem foto</Text>
              </View>
            )}
            <View style={styles.storiesImageShade} />
            {formattedDate ? (
              <View style={styles.storiesDateBadge}>
                <MaterialIcons name="event" size={12} color="#FFFFFF" />
                <Text style={styles.storiesDateText}>{formattedDate}</Text>
              </View>
            ) : null}
            {activeReward && (
              <View style={styles.storiesRewardFloatingBadge}>
                <MaterialIcons name="volunteer-activism" size={14} color="#FFFFFF" />
                <Text style={styles.storiesRewardFloatingText}>
                  RECOMPENSA: R$ {parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.storiesContentBox}>
            <Text style={styles.storiesPetTitle} numberOfLines={1}>
              {item.title || 'Animal'}
            </Text>

            <View style={styles.storiesAttributesRow}>
              {!(hasAdoptionGroupDetails && adoptionTotalCount > 1) && (
                <>
                  {(item.breed || item.extra_fields?.breed) && (
                    <Text style={styles.storiesAttributeChip}>{item.breed || item.extra_fields?.breed}</Text>
                  )}
                  {(item.color || item.extra_fields?.color) && (
                    <Text style={styles.storiesAttributeChip}>{item.color || item.extra_fields?.color}</Text>
                  )}
                  {(item.gender || item.extra_fields?.gender) && (
                    <Text style={styles.storiesAttributeChip}>{item.gender || item.extra_fields?.gender}</Text>
                  )}
                </>
              )}
            </View>

            {renderAdoptionInfo(true)}

            <View style={styles.storiesLocationBox}>
              <View style={styles.storiesLocationIcon}>
                <MaterialIcons name="place" size={15} color={statusColor} />
              </View>
              <View style={styles.storiesLocationCopy}>
                <Text style={styles.storiesLocationLabel}>{locationLabel.replace(/:$/, '')}</Text>
                <Text style={styles.storiesLocationText} numberOfLines={2}>
                  {flyerLocationText || 'Local informado no app'}
                </Text>
              </View>
            </View>

            {formattedPhone && (
              <View style={styles.storiesPhoneBox}>
                <MaterialIcons name="phone" size={16} color="#FFFFFF" />
                <Text style={styles.storiesPhoneText}>{formattedPhone}</Text>
              </View>
            )}
          </View>

          <View style={styles.storiesFooter}>
            <Image source={APP_LOGO} style={styles.storiesFooterLogo} resizeMode="contain" />
          </View>
        </View>
      </View>
    );
  }

  // ==========================================
  // FORMATO 3: FEED QUADRADO (1:1)
  // ==========================================
  if (format === 'feed') {
    return (
      <View ref={ref} collapsable={false} style={styles.feedCanvasWrapper}>
        <View style={styles.feedContainer}>
          <View style={[styles.feedHeader, { backgroundColor: statusColor }]}>
            <View style={styles.feedBrandRow}>
              <View style={styles.feedStatusPill}>
                <Text style={styles.feedStatusPillText} numberOfLines={1} ellipsizeMode="tail">
                  {statusHeaderTitle}
                </Text>
              </View>
            </View>
            {activeReward && (
              <View style={styles.feedRewardBadge}>
                <MaterialIcons name="volunteer-activism" size={11} color="#FFFFFF" />
                <Text style={styles.feedRewardText}>
                  RECOMPENSA: R$ {parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.feedContent}>
            <View
              style={[
                styles.feedImageWrapper,
                { height: hasAdoptionGroupDetails ? 150 : 190 },
              ]}
            >
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.feedPetImage} resizeMode="contain" />
              ) : (
                <View style={styles.noPhotoBox}>
                  <MaterialIcons name="pets" size={40} color="#9CA3AF" />
                </View>
              )}
              <View style={styles.feedImageLabel}>
                <Text style={styles.feedImageLabelText}>{isAdoption ? 'ADOÇÃO' : isLost ? 'PERDIDO' : 'ENCONTRADO'}</Text>
              </View>
            </View>

            <View style={styles.feedDetailsWrapper}>
              <Text style={styles.feedPetTitle} numberOfLines={2} ellipsizeMode="tail">
                {item.title || 'Animal'}
              </Text>
              <View style={styles.feedInfoRow}>
                {!hasAdoptionGroupDetails ? (
                  <View style={styles.feedDetailLine}>
                    <MaterialIcons name="pets" size={12} color={statusColor} />
                    <Text style={styles.feedInfoLine} numberOfLines={1}>
                      {[item.species || 'Animal', item.breed || 'SRD'].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ) : renderAdoptionInfo(true)}
                <View style={styles.feedDetailLine}>
                  <MaterialIcons name="place" size={12} color={statusColor} />
                  <Text style={styles.feedInfoLine} numberOfLines={2}>
                    {flyerLocationText || 'Local informado'}
                  </Text>
                </View>
                {formattedDate ? (
                  <View style={styles.feedDetailLine}>
                    <MaterialIcons name="event" size={12} color="#64748B" />
                    <Text style={styles.feedInfoLine} numberOfLines={1}>{formattedDate}</Text>
                  </View>
                ) : null}
                {formattedPhone ? (
                  <View style={styles.feedPhoneBadge}>
                    <MaterialIcons name="phone" size={12} color="#FFFFFF" />
                    <Text style={styles.feedPhoneBadgeText}>{formattedPhone}</Text>
                  </View>
                ) : null}
                {!formattedPhone ? (
                  <View style={styles.feedContactHint}>
                    <MaterialIcons name="qr-code-2" size={12} color={statusColor} />
                    <Text style={styles.feedContactHintText}>Acesse pelo QR code do cartaz completo</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.feedFooter}>
            <Image source={APP_LOGO} style={styles.feedFooterLogo} resizeMode="contain" />
          </View>
        </View>
      </View>
    );
  }

  // ==========================================
  // FORMATO 1 (PADRÃO): CARTAZ A4 COM QR CODE
  // ==========================================
  return (
    <View ref={ref} collapsable={false} style={styles.canvasWrapper}>
      <View style={styles.cardContainer}>
        {/* Faixa Superior de Alerta */}
        <View style={[styles.headerBanner, { backgroundColor: statusColor }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.a4BrandRow}>
              <Text style={styles.headerAppBadge}>{isAdoption ? 'ADOÇÃO' : 'ALERTA'}</Text>
            </View>
            {formattedDate ? <Text style={styles.headerDate}>{formattedDate}</Text> : null}
          </View>
          <Text style={styles.headerStatusText}>{statusHeaderTitle}</Text>
        </View>

        {/* Conteúdo Central */}
        <View style={styles.contentBody}>
          {/* Foto do Pet */}
          <View style={styles.imageContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.petImage} resizeMode="cover" />
            ) : (
              <View style={styles.noPhotoBox}>
                <MaterialIcons name="pets" size={48} color="#9CA3AF" />
                <Text style={styles.noPhotoText}>Sem foto disponível</Text>
              </View>
            )}
          </View>

          {/* Título do Pet */}
          <Text style={styles.petTitle} numberOfLines={2}>
            {item.title || 'Animal sem identificação'}
          </Text>

          {/* Características do pet */}
          <View style={styles.attributesRow}>
            {!(hasAdoptionGroupDetails && adoptionTotalCount > 1) && (
              <>
            {(item.species || item.extra_fields?.species) && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeText}>{item.species || item.extra_fields?.species}</Text>
              </View>
            )}
            {(item.breed || item.extra_fields?.breed) && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeText}>{item.breed || item.extra_fields?.breed}</Text>
              </View>
            )}
            {(item.gender || item.extra_fields?.gender) && (item.gender || item.extra_fields?.gender) !== 'Não informado' && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeText}>{item.gender || item.extra_fields?.gender}</Text>
              </View>
            )}
            {(item.age || item.extra_fields?.age) && (item.age || item.extra_fields?.age) !== 'Não informado' && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeText}>{item.age || item.extra_fields?.age}</Text>
              </View>
            )}
            {(item.size || item.extra_fields?.size) && (item.size || item.extra_fields?.size) !== 'Não informado' && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeText}>{item.size || item.extra_fields?.size}</Text>
              </View>
            )}
            {(item.color || item.extra_fields?.color) && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeText}>{item.color || item.extra_fields?.color}</Text>
              </View>
            )}
              </>
            )}
          </View>

          {renderAdoptionInfo()}

          {/* Bloco de Localização */}
          <View style={styles.locationContainer}>
            <View style={styles.locationHeaderRow}>
              <MaterialIcons name="place" size={14} color={statusColor} />
              <Text style={[styles.locationLabel, { color: statusColor }]}>{locationLabel}</Text>
            </View>
            {flyerLocationText ? (
              <Text style={styles.streetText}>{flyerLocationText}</Text>
            ) : null}
          </View>

          {/* Descrição */}
          {item.description ? (
            <Text style={styles.descriptionText} numberOfLines={2}>
              "{item.description}"
            </Text>
          ) : null}

          {/* Recompensa Destacada */}
          {activeReward && (
            <View style={styles.rewardContainer}>
              <Text style={styles.rewardText}>
                {activeReward.amount
                  ? `RECOMPENSA OFERECIDA: R$ ${parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'RECOMPENSA OFERECIDA'}
              </Text>
            </View>
          )}

          {/* Contato com Telefone Gigante */}
          <View style={styles.minimalContactContainer}>
            <Text style={styles.contactOwnerText}>
              {ownerLabel}: <Text style={styles.contactOwnerName}>{ownerName}</Text>
            </Text>
            {formattedPhone ? (
              <View style={styles.phoneRow}>
                <MaterialIcons name="phone" size={18} color="#2E5634" />
                <Text style={styles.contactPhoneText}>{formattedPhone}</Text>
              </View>
            ) : null}
          </View>

          {/* SEÇÃO DO QR CODE DINÂMICO PARA IMPRESSÃO */}
          <View style={styles.qrSectionContainer}>
            <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} resizeMode="contain" />
            <View style={styles.qrTextWrapper}>
              <Text style={styles.qrTitle}>ESCANEIE COM O CELULAR</Text>
              <Text style={styles.qrSubtitle}>
                Aponte a câmera do celular para abrir a publicação, baixar o app e conversar com a pessoa pelo chat.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footerContainer}>
          <Image source={APP_LOGO} style={styles.a4FooterLogo} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // ==========================================
  // ESTILOS CARTAZ A4 (PADRÃO)
  // ==========================================
  canvasWrapper: {
    width: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  headerBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  a4BrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerAppBadge: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerDate: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.9,
  },
  headerStatusText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  contentBody: {
    padding: 14,
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginBottom: 10,
  },
  petImage: {
    width: '100%',
    height: '100%',
  },
  noPhotoBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  petTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  attributesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 10,
  },
  attributeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 4,
  },
  attributeEmoji: {
    fontSize: 11,
  },
  attributeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  locationContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  adoptionInfoContainer: {
    width: '100%',
    backgroundColor: '#FDF2F8',
    borderWidth: 1,
    borderColor: '#FBCFE8',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
    alignItems: 'center',
    marginBottom: 8,
  },
  adoptionAvailabilityText: {
    color: '#BE185D',
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  adoptionOriginText: {
    color: '#831843',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },
  adoptionAnimalsList: {
    width: '100%',
    marginTop: 5,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#FBCFE8',
  },
  adoptionAnimalsTitle: {
    color: '#9D174D',
    fontSize: 8.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  adoptionAnimalText: {
    color: '#4B2638',
    fontSize: 8.5,
    lineHeight: 12,
  },
  adoptionMoreText: {
    color: '#831843',
    fontSize: 8,
    fontStyle: 'italic',
    marginTop: 1,
  },
  compactAdoptionInfo: {
    backgroundColor: '#FDF2F8',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 5,
    gap: 2,
  },
  compactAdoptionCount: {
    color: '#BE185D',
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
  },
  compactAdoptionOrigin: {
    color: '#831843',
    fontSize: 7.5,
    lineHeight: 10,
  },
  compactAdoptionAnimals: {
    color: '#4B2638',
    fontSize: 7.5,
    lineHeight: 10,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  locationLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  cityStateText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  streetText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  descriptionText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 8,
  },
  rewardContainer: {
    width: '100%',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  rewardText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  minimalContactContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  contactOwnerText: {
    fontSize: 11,
    color: '#64748B',
  },
  contactOwnerName: {
    fontWeight: '800',
    color: '#0F172A',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  contactPhoneText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#2E5634',
    letterSpacing: 0.5,
  },
  qrSectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 8,
    gap: 10,
  },
  qrImage: {
    width: 58,
    height: 58,
    borderRadius: 6,
  },
  qrTextWrapper: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#166534',
    letterSpacing: 0.4,
  },
  qrSubtitle: {
    fontSize: 9.5,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 12,
  },
  footerContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  a4FooterLogo: {
    width: 50,
    height: 38,
  },

  // ==========================================
  // ESTILOS STORIES / STATUS (9:16)
  // ==========================================
  storiesCanvasWrapper: {
    width: 360,
    height: 640,
    backgroundColor: '#F4F7F3',
    borderRadius: 26,
    overflow: 'hidden',
  },
  storiesContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F4F7F3',
  },
  storiesHeaderBanner: {
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  storiesBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  storiesAppBadge: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    flex: 1,
  },
  storiesHeaderPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  storiesHeaderPillText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  storiesStatusTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginTop: 12,
    textAlign: 'left',
  },
  storiesImageContainer: {
    height: 272,
    position: 'relative',
    backgroundColor: '#E8F1E8',
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 20,
    overflow: 'hidden',
  },
  storiesPetImage: {
    width: '100%',
    height: '100%',
  },
  storiesImageShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  storiesDateBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.68)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  storiesDateText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  storiesRewardFloatingBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: '#F59E0B',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 9,
    gap: 6,
  },
  storiesRewardFloatingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  storiesContentBox: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  storiesPetTitle: {
    color: '#17351F',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  storiesAttributesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  storiesAttributeChip: {
    color: '#315B39',
    backgroundColor: '#E4EEE3',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    fontSize: 9,
    fontWeight: '700',
  },
  storiesLocationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAE1',
  },
  storiesLocationIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#F0F5EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storiesLocationCopy: {
    flex: 1,
  },
  storiesLocationLabel: {
    color: '#87928A',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  storiesLocationText: {
    color: '#34433A',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    flex: 1,
  },
  storiesPhoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2E5634',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 7,
    marginTop: 9,
  },
  storiesPhoneText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  storiesFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#E3EAE1',
  },
  storiesFooterLogo: {
    width: 46,
    height: 38,
  },

  // ==========================================
  // ESTILOS FEED QUADRADO (1:1)
  // ==========================================
  feedCanvasWrapper: {
    width: 360,
    height: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },
  feedContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAF8',
    borderWidth: 1,
    borderColor: '#E5EBE5',
  },
  feedHeader: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  feedBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  feedBrandName: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  feedStatusPill: {
    alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  feedStatusPillText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  feedRewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
    alignSelf: 'center',
  },
  feedRewardText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  feedContent: {
    flex: 1,
    padding: 7,
    gap: 6,
  },
  feedImageWrapper: {
    width: '100%',
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#E8ECE8',
    position: 'relative',
  },
  feedPetImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E8ECE8',
  },
  feedImageLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  feedImageLabelText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  feedDetailsWrapper: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 3,
    minWidth: 0,
    minHeight: 0,
  },
  feedPetTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 16,
  },
  feedInfoRow: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 3,
    minHeight: 0,
  },
  feedDetailLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    minWidth: 0,
  },
  feedInfoLine: {
    flex: 1,
    fontSize: 8.5,
    lineHeight: 10,
    color: '#526171',
    fontWeight: '600',
  },
  feedPhoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E5634',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 1,
  },
  feedPhoneBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  feedContactHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedContactHintText: {
    color: '#526171',
    fontSize: 7.5,
    fontWeight: '600',
  },
  feedFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5EBE5',
    paddingVertical: 4,
  },
  feedFooterLogo: {
    width: 42,
    height: 34,
  },
});

export default ShareCardFlyer;
