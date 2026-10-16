import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import * as itemsService from '../services/items';
import COLORS from '../constants/theme';
import {
  getPrivateLocationSummary,
  isResidentialAddressPrivate,
  removeHouseNumberFromStreet,
  shouldHideHouseNumber,
} from '../utils/locationPrivacy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Componente de Cartaz e Gerador de Post Visual do WeFIND
 * Suporta formatos:
 * - 'a4': Cartaz Tradicional de Impressão com QR Code grande
 * - 'stories': Formato 9:16 Vertical para Instagram Stories e WhatsApp Status
 * - 'feed': Formato 1:1 Quadrado para Feed do Instagram/Facebook e Grupos
 */
const ShareCardFlyer = React.forwardRef(({ item, imageUrl, format = 'a4', showPhone = false }, ref) => {
  if (!item) return null;

  const isAdoption = Boolean(
    item.extra_fields?.is_direct_adoption ||
    item.status === 'adoption' ||
    (item.status === 'found' && (item.extra_fields?.available_for_adoption || itemsService.isPetAvailableForAdoption(item)))
  );
  const isLost = !isAdoption && item.status === 'lost';
  const isFound = !isAdoption && item.status === 'found';

  const statusColor = isAdoption ? '#DB2777' : (isLost ? '#D64545' : '#15803D');

  // Cabeçalho dinâmico por espécie
  const speciesRaw = String(item.species || item.extra_fields?.species || '').trim();
  const getHeaderTitle = () => {
    if (isAdoption) {
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
  const locationLabel = isAdoption ? 'ONDE O ANIMAL ESTÁ:' : (isLost ? 'LOCAL DO DESAPARECIMENTO:' : 'LOCAL ONDE FOI ENCONTRADO:');

  // Localização
  const hasPrivateAddress = isResidentialAddressPrivate(item);
  const city = item.city || item.extra_fields?.location_details?.city || '';
  const state = item.state || item.extra_fields?.location_details?.state || '';
  const hideHouseNumber = shouldHideHouseNumber(item);
  const cityState = hasPrivateAddress ? '' : [city, state].filter(Boolean).join(' - ');
  const rawStreet = item.street || item.extra_fields?.location_details?.street || '';
  const street = hasPrivateAddress
    ? ''
    : item.status === 'lost'
      ? removeHouseNumberFromStreet(rawStreet)
      : rawStreet;
  const houseNumber = hideHouseNumber ? '' : item.house_number || item.extra_fields?.location_details?.number || '';
  const neighborhood = item.neighborhood || item.extra_fields?.location_details?.district || '';
  const streetPart = [street, houseNumber].filter(Boolean).join(', ');
  const streetNeighborhood = hasPrivateAddress
    ? getPrivateLocationSummary(item)
    : [streetPart, neighborhood].filter(Boolean).join(' - ');

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
    : (
        item.profiles?.whatsapp ||
        item.profiles?.phone ||
        item.contact_phone ||
        item.phone ||
        item.extra_fields?.contact_phone ||
        null
      );

  // O telefone só entra no cartaz quando o autor da publicação escolhe mostrá-lo
  const formattedPhone = showPhone ? formatPhoneWithNine(rawPhone) : null;
  const ownerName = (isThirdParty && thirdParty.name)
    ? thirdParty.name
    : (item.profiles?.name || item.owner_name || 'Tutor do Pet');
  const ownerLabel = isAdoption ? 'Responsável' : (isLost ? 'Tutor' : 'Encontrado por');

  // URL do QR Code Dinâmico
  const petLink = `https://wefind.app/pet/${item.id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(petLink)}&color=2E5634&bgcolor=FFFFFF&margin=1`;

  // ==========================================
  // FORMATO 2: STORIES / STATUS (9:16)
  // ==========================================
  if (format === 'stories') {
    return (
      <View ref={ref} collapsable={false} style={styles.storiesCanvasWrapper}>
        <View style={styles.storiesContainer}>
          {/* Header Superior dos Stories */}
          <View style={[styles.storiesHeaderBanner, { backgroundColor: statusColor }]}>
            <Text style={styles.storiesAppBadge}>🐾 WeFIND ALERTA</Text>
            <Text style={styles.storiesStatusTitle}>{statusHeaderTitle}</Text>
          </View>

          {/* Imagem Central Otimizada */}
          <View style={styles.storiesImageContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.storiesPetImage} resizeMode="cover" />
            ) : (
              <View style={styles.noPhotoBox}>
                <MaterialIcons name="pets" size={54} color="#9CA3AF" />
                <Text style={styles.noPhotoText}>Sem foto</Text>
              </View>
            )}
            {activeReward && (
              <View style={styles.storiesRewardFloatingBadge}>
                <Text style={styles.storiesRewardFloatingText}>
                  💰 RECOMPENSA: R$ {parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          {/* Card Flutuante de Informações Rápidas */}
          <View style={styles.storiesContentBox}>
            <Text style={styles.storiesPetTitle} numberOfLines={1}>
              {item.title || 'Animal'}
            </Text>

            <View style={styles.storiesAttributesRow}>
              {(item.breed || item.extra_fields?.breed) && (
                <Text style={styles.storiesAttributeChip}>🏷️ {item.breed || item.extra_fields?.breed}</Text>
              )}
              {(item.color || item.extra_fields?.color) && (
                <Text style={styles.storiesAttributeChip}>🎨 {item.color || item.extra_fields?.color}</Text>
              )}
              {(item.gender || item.extra_fields?.gender) && (
                <Text style={styles.storiesAttributeChip}>⚧ {item.gender || item.extra_fields?.gender}</Text>
              )}
            </View>

            <View style={styles.storiesLocationBox}>
              <MaterialIcons name="place" size={16} color={statusColor} />
              <Text style={styles.storiesLocationText} numberOfLines={2}>
                {streetNeighborhood ? `${streetNeighborhood} - ` : ''}{cityState || 'Local informado no app'}
              </Text>
            </View>

            {formattedPhone && (
              <View style={styles.storiesPhoneBox}>
                <MaterialIcons name="phone" size={18} color="#FFFFFF" />
                <Text style={styles.storiesPhoneText}>{formattedPhone}</Text>
              </View>
            )}
          </View>

          {/* Rodapé social, sem QR Code */}
          <View style={styles.storiesFooter}>
            <MaterialIcons name="share" size={18} color={statusColor} />
            <Text style={styles.storiesFooterText}>Ajude compartilhando • wefind.app</Text>
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
          {/* Topo Feed */}
          <View style={[styles.feedHeader, { backgroundColor: statusColor }]}>
            <Text style={styles.feedHeaderTitle}>{statusHeaderTitle}</Text>
            {activeReward && (
              <Text style={styles.feedRewardBadge}>
                💰 RECOMPENSA: R$ {parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </Text>
            )}
          </View>

          {/* Linha Principal Feed: Imagem + Detalhes */}
          <View style={styles.feedMainRow}>
            <View style={styles.feedImageWrapper}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.feedPetImage} resizeMode="cover" />
              ) : (
                <View style={styles.noPhotoBox}>
                  <MaterialIcons name="pets" size={40} color="#9CA3AF" />
                </View>
              )}
            </View>

            <View style={styles.feedDetailsWrapper}>
              <Text style={styles.feedPetTitle} numberOfLines={2}>{item.title || 'Animal'}</Text>
              
              <Text style={styles.feedInfoLine}>
                🐾 {item.species || 'Animal'} • {item.breed || 'SRD'}
              </Text>
              <Text style={styles.feedInfoLine}>
                📍 {streetNeighborhood || cityState || 'Local informado'}
              </Text>
              {formattedDate ? (
                <Text style={styles.feedInfoLine}>📅 {formattedDate}</Text>
              ) : null}

              {formattedPhone ? (
                <View style={styles.feedPhoneBadge}>
                  <MaterialIcons name="phone" size={14} color="#FFFFFF" />
                  <Text style={styles.feedPhoneBadgeText}>{formattedPhone}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Rodapé Feed sem QR Code */}
          <View style={styles.feedFooter}>
            <MaterialIcons name="share" size={16} color="#2E5634" />
            <Text style={styles.feedFooterQrText}>Ajude compartilhando • wefind.app</Text>
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
            <Text style={styles.headerAppBadge}>{isAdoption ? '💖 WeFIND ADOÇÃO' : '🐾 WeFIND ALERTA'}</Text>
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

          {/* Badges minimalistas das características do pet com emojis */}
          <View style={styles.attributesRow}>
            {(item.species || item.extra_fields?.species) && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeEmoji}>🐾</Text>
                <Text style={styles.attributeText}>{item.species || item.extra_fields?.species}</Text>
              </View>
            )}
            {(item.breed || item.extra_fields?.breed) && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeEmoji}>🏷️</Text>
                <Text style={styles.attributeText}>{item.breed || item.extra_fields?.breed}</Text>
              </View>
            )}
            {(item.gender || item.extra_fields?.gender) && (item.gender || item.extra_fields?.gender) !== 'Não informado' && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeEmoji}>⚧</Text>
                <Text style={styles.attributeText}>{item.gender || item.extra_fields?.gender}</Text>
              </View>
            )}
            {(item.age || item.extra_fields?.age) && (item.age || item.extra_fields?.age) !== 'Não informado' && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeEmoji}>🎂</Text>
                <Text style={styles.attributeText}>{item.age || item.extra_fields?.age}</Text>
              </View>
            )}
            {(item.size || item.extra_fields?.size) && (item.size || item.extra_fields?.size) !== 'Não informado' && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeEmoji}>📏</Text>
                <Text style={styles.attributeText}>{item.size || item.extra_fields?.size}</Text>
              </View>
            )}
            {(item.color || item.extra_fields?.color) && (
              <View style={styles.attributeBadge}>
                <Text style={styles.attributeEmoji}>🎨</Text>
                <Text style={styles.attributeText}>{item.color || item.extra_fields?.color}</Text>
              </View>
            )}
          </View>

          {/* Bloco de Localização */}
          <View style={styles.locationContainer}>
            <View style={styles.locationHeaderRow}>
              <MaterialIcons name="place" size={14} color={statusColor} />
              <Text style={[styles.locationLabel, { color: statusColor }]}>{locationLabel}</Text>
            </View>
            {cityState ? <Text style={styles.cityStateText}>{cityState}</Text> : null}
            {streetNeighborhood ? (
              <Text style={styles.streetText}>{streetNeighborhood}</Text>
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
                  ? `💰 RECOMPENSA OFERECIDA: R$ ${parseFloat(activeReward.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '💰 RECOMPENSA OFERECIDA'}
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
            ) : (
              <Text style={styles.contactOwnerText}>Fale com o responsável pelo chat do WeFIND, pelo código QR abaixo.</Text>
            )}
          </View>

          {/* SEÇÃO DO QR CODE DINÂMICO PARA IMPRESSÃO */}
          <View style={styles.qrSectionContainer}>
            <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} resizeMode="contain" />
            <View style={styles.qrTextWrapper}>
              <Text style={styles.qrTitle}>ESCANEIE COM O CELULAR</Text>
              <Text style={styles.qrSubtitle}>
                Aponte a câmera para abrir fotos, mapa e falar no chat direto do app WeFIND.
              </Text>
            </View>
          </View>
        </View>

        {/* Rodapé Oficial WeFIND */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerBrandText}>
            <Text style={{ color: COLORS.weColor || '#B1734A' }}>We</Text>
            <Text style={{ color: '#FFFFFF' }}>FIND</Text> • Juntos trazemos quem amamos de volta
          </Text>
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
    backgroundColor: '#2E5634',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBrandText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ==========================================
  // ESTILOS STORIES / STATUS (9:16)
  // ==========================================
  storiesCanvasWrapper: {
    width: 320,
    height: 568, // Proporção exata 9:16
    backgroundColor: '#F7FBF7',
    borderRadius: 24,
    overflow: 'hidden',
  },
  storiesContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F7FBF7',
    justifyContent: 'space-between',
  },
  storiesHeaderBanner: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  storiesAppBadge: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    opacity: 0.9,
  },
  storiesStatusTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  storiesImageContainer: {
    width: '100%',
    height: 230,
    position: 'relative',
    backgroundColor: '#E8F1E8',
    marginHorizontal: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  storiesPetImage: {
    width: '100%',
    height: '100%',
  },
  storiesRewardFloatingBadge: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    backgroundColor: '#F59E0B',
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: 'center',
  },
  storiesRewardFloatingText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
  },
  storiesContentBox: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  storiesPetTitle: {
    color: '#17351F',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  storiesAttributesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  storiesAttributeChip: {
    color: '#2E5634',
    backgroundColor: '#E2F0E3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '700',
  },
  storiesLocationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  storiesLocationText: {
    color: '#52665A',
    fontSize: 11,
    textAlign: 'center',
    flex: 1,
  },
  storiesPhoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E5634',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
  },
  storiesPhoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  storiesFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2F0E3',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#C5DEC8',
  },
  storiesFooterText: {
    color: '#2E5634',
    fontSize: 10.5,
    fontWeight: '800',
    marginLeft: 6,
  },

  // ==========================================
  // ESTILOS FEED QUADRADO (1:1)
  // ==========================================
  feedCanvasWrapper: {
    width: 320,
    height: 320, // Proporção exata 1:1
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
  },
  feedContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  feedHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  feedHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  feedRewardBadge: {
    color: '#FEF3C7',
    fontSize: 9.5,
    fontWeight: '900',
    marginTop: 1,
  },
  feedMainRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
    flex: 1,
    alignItems: 'center',
  },
  feedImageWrapper: {
    width: 120,
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  feedPetImage: {
    width: '100%',
    height: '100%',
  },
  feedDetailsWrapper: {
    flex: 1,
    gap: 3,
  },
  feedPetTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  feedInfoLine: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '600',
  },
  feedPhoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E5634',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 4,
  },
  feedPhoneBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  feedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedFooterQrText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  feedBrandText: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
  },
});

export default ShareCardFlyer;
