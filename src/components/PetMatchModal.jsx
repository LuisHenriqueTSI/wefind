import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';
import OptimizedImage from './OptimizedImage';

const getItemPhotoUrl = (item) => {
  const photo = item?.item_photos?.[0]
    || item?.photoUrl
    || item?.photo_urls?.[0]
    || item?.photos?.[0]
    || item?.photo_url;

  return typeof photo === 'string' ? photo : photo?.url || photo?.uri || null;
};

/**
 * Modal visual que exibe uma lista de possíveis correspondências e comparador lado a lado
 */
export default function PetMatchModal({
  visible,
  onClose,
  newItem,
  matchedItem,
  matchedItems = [],
  initialIndex = 0,
  onViewDetails,
  onStartChat,
}) {
  const { colors, isDark } = useTheme();

  // Consolida lista de candidatos
  const candidates = (matchedItems && matchedItems.length > 0)
    ? matchedItems
    : (matchedItem ? [matchedItem] : []);

  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex || 0);
    }
  }, [visible, initialIndex]);

  if (!visible || candidates.length === 0) return null;

  const currentMatch = candidates[Math.min(currentIndex, candidates.length - 1)] || candidates[0];
  const matchData = currentMatch?.match || {};

  const isNewItemLost = newItem?.status === 'lost';
  const newItemPhoto = getItemPhotoUrl(newItem);
  const currentMatchPhoto = getItemPhotoUrl(currentMatch);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                <MaterialIcons name="compare-arrows" size={21} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.title, { color: colors.text }]}>
                  Possível correspondência
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {candidates.length > 1
                    ? `${candidates.length} anúncios parecidos encontrados`
                    : 'Encontramos um anúncio com características parecidas'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9' }]}
              accessibilityLabel="Fechar modal"
            >
              <MaterialIcons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {candidates.length > 1 && (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  onPress={handlePrev}
                  disabled={currentIndex === 0}
                  style={[styles.pageNavBtn, { opacity: currentIndex === 0 ? 0.35 : 1 }]}
                  accessibilityLabel="Correspondência anterior"
                >
                  <MaterialIcons name="chevron-left" size={24} color={colors.text} />
                </TouchableOpacity>

                <Text style={[styles.pageCounterText, { color: colors.textSecondary }]}>
                  Correspondência {currentIndex + 1} de {candidates.length}
                </Text>

                <TouchableOpacity
                  onPress={handleNext}
                  disabled={currentIndex === candidates.length - 1}
                  style={[styles.pageNavBtn, { opacity: currentIndex === candidates.length - 1 ? 0.35 : 1 }]}
                  accessibilityLabel="Próxima correspondência"
                >
                  <MaterialIcons name="chevron-right" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.compareContainer}>
              <View style={[styles.petCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.cardBorder }]}>
                <View style={styles.imageWrapper}>
                  {newItemPhoto ? (
                    <OptimizedImage uri={newItemPhoto} style={styles.petImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.placeholderImage, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                      <MaterialIcons name="pets" size={32} color={colors.primary} />
                    </View>
                  )}
                  <View style={[styles.statusTag, { backgroundColor: isNewItemLost ? '#EA580C' : '#16A34A' }]}>
                    <Text style={styles.statusTagText}>{isNewItemLost ? 'PERDIDO' : 'ENCONTRADO'}</Text>
                  </View>
                </View>

                <Text style={[styles.petCardName, { color: colors.text }]} numberOfLines={1}>
                  {newItem?.animal_name || newItem?.title || 'Seu Cadastro'}
                </Text>
                <Text style={[styles.petCardDetails, { color: colors.textSecondary }]} numberOfLines={2}>
                  {[newItem?.species, newItem?.breed].filter(Boolean).join(' • ') || 'Animal'}
                  {(newItem?.neighborhood || newItem?.city) ? `\n${newItem.neighborhood || newItem.city}` : ''}
                </Text>
              </View>

              <View style={[styles.petCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.cardBorder }]}>
                <View style={styles.imageWrapper}>
                  {currentMatchPhoto ? (
                    <OptimizedImage uri={currentMatchPhoto} style={styles.petImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.placeholderImage, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                      <MaterialIcons name="pets" size={32} color="#10B981" />
                    </View>
                  )}
                  <View style={[styles.statusTag, { backgroundColor: !isNewItemLost ? '#EA580C' : '#16A34A' }]}>
                    <Text style={styles.statusTagText}>{!isNewItemLost ? 'PERDIDO' : 'ENCONTRADO'}</Text>
                  </View>
                </View>

                <Text style={[styles.petCardName, { color: colors.text }]} numberOfLines={1}>
                  {currentMatch.animal_name || currentMatch.title || 'Pet Correspondente'}
                </Text>
                <Text style={[styles.petCardDetails, { color: colors.textSecondary }]} numberOfLines={2}>
                  {[currentMatch.species, currentMatch.breed].filter(Boolean).join(' • ') || 'Animal'}
                  {(currentMatch.neighborhood || currentMatch.city) ? `\n${currentMatch.neighborhood || currentMatch.city}` : ''}
                </Text>
              </View>
            </View>

            {matchData.reasons?.length > 0 && (
              <Text
                style={[
                  styles.commonTraits,
                  { color: colors.textSecondary, borderTopColor: colors.cardBorder },
                ]}
                numberOfLines={2}
              >
                Em comum: {matchData.reasons.slice(0, 2).join(' · ')}
              </Text>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: COLORS.primary }]}
              onPress={() => {
                onClose();
                if (typeof onViewDetails === 'function') {
                  onViewDetails(currentMatch.id);
                }
              }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="visibility" size={19} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.primaryActionBtnText}>Ver publicação</Text>
            </TouchableOpacity>

            {currentMatch.owner_id && (
              <TouchableOpacity
                style={[styles.secondaryActionBtn, { borderColor: COLORS.primary }]}
                onPress={() => {
                  onClose();
                  if (typeof onStartChat === 'function') {
                    onStartChat(currentMatch.owner_id, currentMatch.id, currentMatch.title);
                  }
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="chat" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryActionBtnText, { color: COLORS.primary }]}>
                  {isNewItemLost ? 'Conversar com quem encontrou' : 'Conversar com o Tutor'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.dismissBtnText, { color: colors.textMuted }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxHeight: '92%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  pageNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  pageCounterText: {
    fontSize: 12,
    fontWeight: '600',
  },

  body: {
    paddingHorizontal: 16,
    maxHeight: 460,
  },

  compareContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  petCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 7,
    alignItems: 'center',
  },
  imageWrapper: {
    width: '100%',
    height: 132,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 7,
  },
  petImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  statusTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  petCardName: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  petCardDetails: {
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 14,
  },
  commonTraits: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
  },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 6,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 11,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  secondaryActionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 5,
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
