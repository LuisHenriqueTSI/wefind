import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Share,
  Switch,
} from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as itemsService from '../services/items';
import ShareCardFlyer from './ShareCardFlyer';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import COLORS from '../constants/theme';
import {
  getPrivateLocationSummary,
  isResidentialAddressPrivate,
  removeHouseNumberFromStreet,
} from '../utils/locationPrivacy';
import { publicationUrl } from '../constants/links';

/**
 * Modal Completo de Divulgação:
 * Permite selecionar entre Cartaz A4 para impressão com QR Code, Stories 9:16 e Feed 1:1
 */
const ShareFlyerModal = ({ visible, onClose, item, imageUrl }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const flyerRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('a4'); // 'a4' | 'stories' | 'feed'
  const { user, userProfile } = useAuth();
  // Privacidade por padrão: o telefone fica fora do cartaz até o autor autorizar.
  // A autorização fica gravada na publicação e vale para quem compartilhar depois.
  const [phoneAllowed, setPhoneAllowed] = useState(itemsService.isFlyerPhoneAllowed(item));
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    setPhoneAllowed(itemsService.isFlyerPhoneAllowed(item));
  }, [item?.id, item?.extra_fields?.share_phone_on_flyer]);

  // O número não vem mais junto com o mural: é pedido ao banco só quando o
  // autor autorizou mostrá-lo no cartaz.
  const [contactPhone, setContactPhone] = useState(null);
  useEffect(() => {
    let active = true;
    if (!item?.id || !phoneAllowed) {
      setContactPhone(null);
      return undefined;
    }
    const ownPhone = user?.id && item.owner_id === user.id
      ? (userProfile?.whatsapp || userProfile?.phone || null)
      : null;
    if (ownPhone) {
      setContactPhone(ownPhone);
      return undefined;
    }
    itemsService.getFlyerContact(item.id).then((phone) => {
      if (active) setContactPhone(phone);
    });
    return () => { active = false; };
  }, [item?.id, phoneAllowed, user?.id, userProfile?.whatsapp, userProfile?.phone]);

  if (!item) return null;

  const isOwner = Boolean(user?.id && item.owner_id === user.id);
  const includePhone = phoneAllowed;

  const handleTogglePhone = async (value) => {
    if (!isOwner || savingPhone) return;
    setPhoneAllowed(value);
    setSavingPhone(true);
    try {
      const saved = await itemsService.setFlyerPhoneAllowed(item.id, item.extra_fields, value);
      // mantém o objeto da publicação em memória igual ao que foi salvo
      item.extra_fields = saved?.extra_fields || { ...(item.extra_fields || {}), share_phone_on_flyer: value };
    } catch (error) {
      setPhoneAllowed(!value);
      Alert.alert('Não foi possível salvar', 'Tente novamente em alguns instantes.');
    } finally {
      setSavingPhone(false);
    }
  };

  const FORMATS = [
    { id: 'a4', label: 'Cartaz com QR', icon: 'description', desc: 'Impressão e Postes' },
    { id: 'stories', label: 'Stories / status', icon: 'smartphone', desc: '9:16 Vertical' },
    { id: 'feed', label: 'Feed quadrado', icon: 'crop-square', desc: '1:1 Instagram' },
  ];

  const getShareTextMessage = () => {
    const isAdoption = Boolean(
      item.extra_fields?.is_direct_adoption ||
      item.status === 'adoption' ||
      (item.status === 'found' && (item.extra_fields?.available_for_adoption || itemsService.isPetAvailableForAdoption(item)))
    );

    const status = isAdoption
      ? 'PARA ADOÇÃO'
      : (item.status === 'found' ? 'ENCONTRADO' : 'PROCURA-SE');

    const locationLabel = isAdoption ? 'Onde está' : 'Local';
    const location = isResidentialAddressPrivate(item)
      ? getPrivateLocationSummary(item)
      : [
          item.status === 'lost' ? removeHouseNumberFromStreet(item.street) : item.street,
          item.neighborhood,
          item.city,
          item.state,
        ].filter(Boolean).join(' - ') || 'Não especificado';
    const rawDate = String(item.date || '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T12:00:00`) : new Date(rawDate);
    const formattedDate = item.date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : 'Não informada';
    const phone = contactPhone || '';
    const phoneInfo = includePhone && phone ? `\nContato: ${phone}` : '\nContato pelo chat do WeFIND';
    
    const details = [
      item.species || item.extra_fields?.species ? `${item.species || item.extra_fields?.species}` : '',
      item.breed || item.extra_fields?.breed ? `${item.breed || item.extra_fields?.breed}` : '',
      item.gender || item.extra_fields?.gender ? `${item.gender || item.extra_fields?.gender}` : '',
      item.color || item.extra_fields?.color ? `${item.color || item.extra_fields?.color}` : '',
    ].filter(Boolean).join(' | ');

    const detailsLine = details ? `\n${details}\n` : '';
    const headerTitle = isAdoption ? 'ADOÇÃO RESPONSÁVEL' : 'AJUDE A ENCONTRAR';
    const linkInfo = `\nVer no WeFIND: ${publicationUrl(item.id)}`;

    return `*WeFIND - ${headerTitle}*\n\n${status}: *${item.title || 'Animal'}*${detailsLine}\n${locationLabel}: ${location}\nData: ${formattedDate}${phoneInfo}${linkInfo}\n\n"${item.description || ''}"\n\nSe puder, compartilhe com seus contatos.`;
  };

  const handleShareImage = async () => {
    if (capturing) return;
    try {
      setCapturing(true);

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        Alert.alert(
          'Compartilhamento de imagem',
          'O compartilhamento de arquivos não está disponível neste ambiente. Compartilhando em formato de texto...'
        );
        await handleShareText();
        setCapturing(false);
        return;
      }

      // Captura a imagem em alta resolução
      const uri = await captureRef(flyerRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });

      console.log('[ShareFlyerModal] Imagem capturada com sucesso:', uri);

      // Abre a folha nativa de compartilhamento
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Divulgar - ${item.title || 'Animal'}`,
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('[ShareFlyerModal] Erro ao compartilhar imagem:', error);
      Alert.alert('Erro ao compartilhar', 'Não foi possível gerar a imagem: ' + (error.message || 'Tente novamente.'));
    } finally {
      setCapturing(false);
    }
  };

  const handleShareText = async () => {
    try {
      const message = getShareTextMessage();
      await Share.share({ message });
    } catch (error) {
      console.error('[ShareFlyerModal] Erro ao compartilhar texto:', error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          {/* Cabeçalho do Modal */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="qr-code-2" size={24} color={colors.primary} />
              <View>
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Cartaz para divulgar</Text>
                <Text style={[styles.modalHeaderSub, { color: colors.textSecondary }]}>Com código QR e formatos para redes sociais</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
              <MaterialIcons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Seletor de Formatos (A4 / Stories / Feed) */}
          <View style={[styles.formatSelectorContainer, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
            {FORMATS.map((fmt) => {
              const isSelected = selectedFormat === fmt.id;
              return (
                <TouchableOpacity
                  key={fmt.id}
                  style={[
                    styles.formatTabBtn,
                    {
                      backgroundColor: isSelected
                        ? (isDark ? '#1E293B' : '#FFFFFF')
                        : 'transparent',
                      borderColor: isSelected ? colors.primary : 'transparent',
                      shadowOpacity: isSelected ? 0.08 : 0,
                    },
                  ]}
                  onPress={() => setSelectedFormat(fmt.id)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={fmt.icon}
                    size={18}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.formatTabLabel,
                      {
                        color: isSelected ? colors.primary : colors.textSecondary,
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                  >
                    {fmt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Escolha do autor sobre mostrar o WhatsApp no cartaz */}
          {isOwner ? (
            <View style={[styles.phoneToggleRow, { borderColor: colors.cardBorder }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.phoneToggleTitle, { color: colors.text }]}>Mostrar meu WhatsApp nos cartazes</Text>
                <Text style={[styles.phoneToggleDesc, { color: colors.textSecondary }]}>
                  {phoneAllowed
                    ? 'Ligado, o número aparece também nos cartazes que outras pessoas gerarem desta publicação. Cartazes já compartilhados continuam com o número.'
                    : 'Desligado, quem vir o cartaz fala com você pelo chat do app, através do código QR.'}
                </Text>
              </View>
              <Switch
                value={phoneAllowed}
                onValueChange={handleTogglePhone}
                disabled={savingPhone}
                trackColor={{ false: '#CBD5E1', true: colors.primary }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Mostrar meu WhatsApp nos cartazes"
              />
            </View>
          ) : (
            <Text style={[styles.phoneToggleNote, { color: colors.textMuted }]}>
              {phoneAllowed
                ? 'O autor autorizou mostrar o WhatsApp no cartaz.'
                : 'O autor preferiu não mostrar o telefone. O contato é pelo chat do WeFIND.'}
            </Text>
          )}

          {/* Área de Pré-Visualização com Rolagem */}
          <ScrollView
            style={styles.previewScrollView}
            contentContainerStyle={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.flyerWrapper}>
              <ShareCardFlyer
                ref={flyerRef}
                item={item}
                imageUrl={imageUrl}
                format={selectedFormat}
                showPhone={includePhone}
                contactPhone={contactPhone}
              />
            </View>
          </ScrollView>

          {/* Barra de Ações Inferior */}
          <View style={[styles.actionsContainer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={[styles.primaryShareBtn, { backgroundColor: colors.primary }, capturing && styles.btnDisabled]}
              onPress={handleShareImage}
              disabled={capturing}
              activeOpacity={0.85}
            >
              {capturing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryShareBtnText}>Gerando arte em alta resolução...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="share" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryShareBtnText}>
                    {selectedFormat === 'stories'
                      ? 'Compartilhar nos Stories / Status'
                      : selectedFormat === 'feed'
                      ? 'Compartilhar Post de Feed'
                      : 'Compartilhar Cartaz com QR Code'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  phoneToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  phoneToggleTitle: { fontSize: 14, fontWeight: '800' },
  phoneToggleDesc: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  phoneToggleNote: { fontSize: 12, marginHorizontal: 16, marginTop: 10, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  modalHeaderSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Seletor de Formatos
  formatSelectorContainer: {
    flexDirection: 'row',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 14,
    gap: 4,
  },
  formatTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 5,
  },
  formatTabLabel: {
    fontSize: 11.5,
  },

  previewScrollView: {
    paddingHorizontal: 16,
    maxHeight: 440,
  },
  previewScrollContent: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  flyerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  actionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  primaryShareBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryShareBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryShareBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryShareBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.7,
  },
});

export default ShareFlyerModal;
