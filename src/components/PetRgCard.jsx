import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import COLORS from '../constants/theme';
import { petCardUrl } from '../constants/links';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Carteirinha digital do pet para salvar e compartilhar.
 */
const PetRgCard = ({ pet, userProfile, onClose }) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  if (!pet) return null;

  const petIdentifier = pet.microchip || 'Não informado';
  const tutorName = userProfile?.name || pet.owner_name || 'Tutor do Pet';
  const tutorPhone = userProfile?.whatsapp || userProfile?.phone || pet.owner_phone || 'Não informado';
  const tutorCity = userProfile?.city || pet.city || 'Pelotas';
  const tutorState = userProfile?.state || pet.state || 'RS';

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(petCardUrl(pet.id || 'pet'))}&color=2E5634&bgcolor=FFFFFF&margin=1`;

  const handleShareRg = async () => {
    if (sharing) return;
    try {
      setSharing(true);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Aviso', 'O compartilhamento não está disponível neste dispositivo.');
        setSharing(false);
        return;
      }

      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Carteirinha do Pet - ${pet.name || 'Pet'}`,
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('[PetRgCard] Erro ao compartilhar carteirinha:', error);
      Alert.alert('Erro', 'Não foi possível gerar a carteirinha: ' + error.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Visual da carteirinha digital */}
      <View ref={cardRef} collapsable={false} style={styles.rgContainer}>
        {/* Cabeçalho da carteirinha */}
        <View style={styles.rgHeader}>
          <View style={styles.brasaoRow}>
            <MaterialIcons name="pets" size={24} color={COLORS.secondary} />
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.rgHeaderCountry}>IDENTIFICAÇÃO DO PET</Text>
              <Text style={styles.rgHeaderApp}>CARTEIRINHA DIGITAL • WEFIND</Text>
            </View>
            <MaterialIcons name="verified" size={24} color={COLORS.secondary} />
          </View>
          <View style={styles.rgaNumberBadge}>
            <Text style={styles.rgaNumberText}>MICROCHIP / REGISTRO: {petIdentifier}</Text>
          </View>
        </View>

        {/* Corpo Principal: Foto 3x4 + Dados Oficiais */}
        <View style={styles.rgBody}>
          {/* Lado Esquerdo: Foto 3x4 com Moldura e Carimbo */}
          <View style={styles.photoColumn}>
            <View style={styles.photoFrame}>
              {pet.photo_url ? (
                <Image source={{ uri: pet.photo_url }} style={styles.petPhoto} resizeMode="cover" />
              ) : (
                <View style={styles.noPhotoFrame}>
                  <MaterialIcons name="pets" size={36} color="#9CA3AF" />
                </View>
              )}
            </View>

            {/* Microchip / Porte */}
            <View style={styles.miniChipBox}>
              <Text style={styles.miniChipLabel}>PORTE: {pet.size || 'MÉDIO'}</Text>
              <Text style={styles.miniChipLabel}>SEXO: {pet.gender || 'MACHO'}</Text>
            </View>
          </View>

          {/* Lado Direito: Campos de Identificação */}
          <View style={styles.fieldsColumn}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>NOME DO ANIMAL:</Text>
              <Text style={styles.fieldValueHighlight} numberOfLines={1}>{pet.name || 'Pet'}</Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>ESPÉCIE / RAÇA:</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {pet.species || 'Cachorro'} • {pet.breed || 'SRD'}
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>COR / PELAGEM:</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{pet.color || 'Não informado'}</Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>IDADE / DATA DE NASCIMENTO:</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{pet.birth_date || pet.age || 'Não informada'}</Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>TUTOR(A) RESPONSÁVEL:</Text>
              <Text style={styles.fieldValueTutor} numberOfLines={1}>{tutorName}</Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>CONTATO DE EMERGÊNCIA:</Text>
              <Text style={styles.fieldValuePhone} numberOfLines={1}>{tutorPhone}</Text>
            </View>

            <View style={styles.tagsRow}>
              <View style={[styles.healthTag, { backgroundColor: pet.neutered ? '#DCFCE7' : '#F1F5F9' }]}>
                <Text style={[styles.healthTagText, { color: pet.neutered ? '#166534' : '#64748B' }]}>
                  {pet.neutered ? '✓ Castrado' : 'Não Castrado'}
                </Text>
              </View>
              <View style={[styles.healthTag, { backgroundColor: pet.vaccinated ? '#DCFCE7' : '#F1F5F9' }]}>
                <Text style={[styles.healthTagText, { color: pet.vaccinated ? '#166534' : '#64748B' }]}>
                  {pet.vaccinated ? '✓ Vacinas em dia' : 'Vacinas pendentes'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Rodapé com QR Code e Dados do Município */}
        <View style={styles.rgFooter}>
          <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.footerCityText}>CADASTRADO EM: {tutorCity} - {tutorState}</Text>
            <Text style={styles.footerAppText}>
              Carteirinha digital criada no <Text style={{ fontWeight: '900', color: '#B1734A' }}>We</Text><Text style={{ fontWeight: '900', color: '#166534' }}>FIND</Text>
            </Text>
          </View>
          <View style={styles.validSeal}>
            <MaterialIcons name="security" size={20} color="#166534" />
          </View>
        </View>
      </View>

      {/* Botões de Ação */}
      <View style={styles.actionButtonsRow}>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShareRg}
          disabled={sharing}
          activeOpacity={0.85}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="share" size={18} color="#FFFFFF" style={{ marginRight: 7 }} />
              <Text style={styles.shareBtnText}>Salvar / compartilhar carteirinha</Text>
            </>
          )}
        </TouchableOpacity>

        {typeof onClose === 'function' && (
          <TouchableOpacity
            style={styles.closeModalBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Fechar carteirinha digital"
          >
            <MaterialIcons name="close" size={18} color={COLORS.secondaryDark} />
            <Text style={styles.closeModalBtnText}>Fechar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    width: '100%',
  },
  rgContainer: {
    width: 340,
    backgroundColor: '#FAF5EA', // Fundo visual da carteirinha
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#2E5634',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  rgHeader: {
    backgroundColor: '#2E5634',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  brasaoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  rgHeaderCountry: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  rgHeaderApp: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  rgaNumberBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  rgaNumberText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  rgBody: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  photoColumn: {
    width: 105,
    alignItems: 'center',
  },
  photoFrame: {
    width: 100,
    height: 125,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    overflow: 'hidden',
    position: 'relative',
  },
  petPhoto: {
    width: '100%',
    height: '100%',
  },
  noPhotoFrame: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  stampBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(22, 101, 52, 0.9)',
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
  },
  stampBadgeText: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  miniChipBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 4,
    marginTop: 6,
    width: '100%',
    alignItems: 'center',
    gap: 2,
  },
  miniChipLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#374151',
  },
  fieldsColumn: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  fieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(209, 213, 219, 0.6)',
    paddingBottom: 2,
  },
  fieldLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.3,
  },
  fieldValueHighlight: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#111827',
  },
  fieldValue: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1F2937',
  },
  fieldValueTutor: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#166534',
  },
  fieldValuePhone: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  healthTag: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  healthTagText: {
    fontSize: 8,
    fontWeight: '800',
  },
  rgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qrImage: {
    width: 36,
    height: 36,
    borderRadius: 4,
  },
  footerCityText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#1F2937',
  },
  footerAppText: {
    fontSize: 7.5,
    color: '#6B7280',
    marginTop: 1,
  },
  validSeal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonsRow: {
    width: 340,
    marginTop: 14,
    gap: 8,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 13,
    backgroundColor: COLORS.secondaryDark,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    shadowColor: COLORS.secondaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  closeModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 12,
    paddingVertical: 11,
  },
  closeModalBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.secondaryDark,
  },
});

export default PetRgCard;
