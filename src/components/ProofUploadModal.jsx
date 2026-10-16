import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { MaterialIcons, Ionicons, Feather, FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../contexts/ThemeContext';
import { submitOwnershipProof } from '../services/proofVerification';
import COLORS from '../constants/theme';

export default function ProofUploadModal({
  visible,
  onClose,
  item,
  userId,
  onSuccess,
}) {
  const { colors, isDark } = useTheme();

  // Tipo de prova selecionada: 'photos' | 'documents' | 'secret_marks'
  const [proofType, setProofType] = useState('photos');
  const [message, setMessage] = useState('');
  const [secretMarks, setSecretMarks] = useState('');
  const [vetDocNumber, setVetDocNumber] = useState('');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso às fotos para anexar a comprovação.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotos((prev) => [...prev, result.assets[0]]);
      }
    } catch (err) {
      console.warn('[ProofUploadModal] Erro ao selecionar foto:', err.message);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para tirar a foto de comprovação.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotos((prev) => [...prev, result.assets[0]]);
      }
    } catch (err) {
      console.warn('[ProofUploadModal] Erro ao abrir câmera:', err.message);
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!item?.id || !userId) {
      Alert.alert('Erro', 'Informações incompletas para envio da comprovação.');
      return;
    }

    let compiledMessage = message.trim();

    if (proofType === 'secret_marks') {
      if (!secretMarks.trim() && !compiledMessage) {
        Alert.alert(
          'Detalhes necessários',
          'Por favor, descreva as marcas secretas, cicatrizes ou particularidades que só o verdadeiro tutor saberia.'
        );
        return;
      }
      compiledMessage = `[Comprovação por Marcas Secretas & Particularidades]\n${secretMarks.trim()}\n\nObservações adicionais: ${compiledMessage || 'Nenhuma'}`;
    } else if (proofType === 'documents') {
      if (photos.length === 0 && !vetDocNumber.trim() && !compiledMessage) {
        Alert.alert(
          'Documento necessário',
          'Por favor, anexe uma foto da carteirinha de vacinação/termo ou informe o número de registro/microchip.'
        );
        return;
      }
      compiledMessage = `[Comprovação por documentação veterinária]\nMicrochip/registro: ${vetDocNumber.trim() || 'Foto em anexo'}\n\nDetalhes: ${compiledMessage || 'Documento veterinário em anexo'}`;
    } else {
      if (photos.length === 0 && !compiledMessage) {
        Alert.alert(
          'Comprovação necessária',
          'Por favor, anexe fotos anteriores com o animal ou descreva a comprovação de tutela.'
        );
        return;
      }
      compiledMessage = `[Comprovação por Fotos Anteriores & Relato]\n${compiledMessage}`;
    }

    setLoading(true);
    try {
      await submitOwnershipProof({
        itemId: item.id,
        claimantId: userId,
        message: compiledMessage,
        proofPhotos: photos,
        itemTitle: item.title || item.species || 'o animal',
        finderId: item.owner_id,
        proofType,
      });

      Alert.alert(
        'Comprovação Enviada com Sucesso! 🛡️',
        'Sua solicitação foi enviada para verificação. Se aprovada, você poderá combinar a devolução pelo chat em um ponto público seguro. O endereço residencial continuará protegido.',
        [
          {
            text: 'Entendido',
            onPress: () => {
              setMessage('');
              setSecretMarks('');
              setVetDocNumber('');
              setPhotos([]);
              onSuccess?.();
              onClose?.();
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Erro ao enviar', err.message || 'Não foi possível concluir o envio da comprovação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardContainer}
          >
            <View
              style={[
                styles.container,
                {
                  backgroundColor: colors.surface || (isDark ? '#132218' : '#FFFFFF'),
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={[styles.iconBadge, { backgroundColor: isDark ? 'rgba(46, 86, 52, 0.25)' : '#EAF2EB' }]}>
                  <MaterialIcons name="verified-user" size={24} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    Comprovação de Tutela
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                    Liberação Segura do Animal
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  disabled={loading}
                  accessibilityLabel="Fechar"
                >
                  <MaterialIcons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                {/* Banner de Segurança */}
                <View
                  style={[
                    styles.securityNotice,
                    {
                      backgroundColor: isDark ? 'rgba(46, 86, 52, 0.16)' : '#EAF2EB',
                      borderColor: isDark ? '#1E3626' : '#CDE1D1',
                    },
                  ]}
                >
                  <MaterialIcons name="shield" size={18} color={COLORS.primary} style={{ marginTop: 2 }} />
                  <Text style={[styles.securityNoticeText, { color: isDark ? '#E2E8F0' : '#1E3626' }]}>
                    Escolha a forma mais fácil e rápida para comprovar que o animal é seu.
                  </Text>
                </View>

                {/* Seleção do Tipo de Comprovante */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Como deseja comprovar?
                </Text>

                <View style={styles.proofTypeRow}>
                  {/* 1. Fotos */}
                  <TouchableOpacity
                    style={[
                      styles.proofTypeCard,
                      proofType === 'photos' && styles.proofTypeCardActive,
                      { backgroundColor: isDark ? '#0A120D' : '#F8FAFC', borderColor: proofType === 'photos' ? COLORS.primary : (isDark ? '#1E3626' : '#E2E8F0') },
                    ]}
                    onPress={() => setProofType('photos')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="images"
                      size={20}
                      color={proofType === 'photos' ? COLORS.primary : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.proofTypeLabel,
                        { color: proofType === 'photos' ? COLORS.primary : colors.textSecondary },
                        proofType === 'photos' && styles.proofTypeLabelActive,
                      ]}
                    >
                      Fotos do Pet
                    </Text>
                  </TouchableOpacity>

                  {/* 2. Documento */}
                  <TouchableOpacity
                    style={[
                      styles.proofTypeCard,
                      proofType === 'documents' && styles.proofTypeCardActive,
                      { backgroundColor: isDark ? '#0A120D' : '#F8FAFC', borderColor: proofType === 'documents' ? COLORS.primary : (isDark ? '#1E3626' : '#E2E8F0') },
                    ]}
                    onPress={() => setProofType('documents')}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name="medical-services"
                      size={20}
                      color={proofType === 'documents' ? COLORS.primary : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.proofTypeLabel,
                        { color: proofType === 'documents' ? COLORS.primary : colors.textSecondary },
                        proofType === 'documents' && styles.proofTypeLabelActive,
                      ]}
                    >
                      Vacina / Doc
                    </Text>
                  </TouchableOpacity>

                  {/* 3. Marcas Secretas */}
                  <TouchableOpacity
                    style={[
                      styles.proofTypeCard,
                      proofType === 'secret_marks' && styles.proofTypeCardActive,
                      { backgroundColor: isDark ? '#0A120D' : '#F8FAFC', borderColor: proofType === 'secret_marks' ? COLORS.primary : (isDark ? '#1E3626' : '#E2E8F0') },
                    ]}
                    onPress={() => setProofType('secret_marks')}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name="fingerprint"
                      size={20}
                      color={proofType === 'secret_marks' ? COLORS.primary : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.proofTypeLabel,
                        { color: proofType === 'secret_marks' ? COLORS.primary : colors.textSecondary },
                        proofType === 'secret_marks' && styles.proofTypeLabelActive,
                      ]}
                    >
                      Marcas Ocultas
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Conteúdo dinâmico conforme a opção selecionada */}
                {proofType === 'photos' && (
                  <View style={styles.dynamicBox}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      Anexe fotos do animal ou de momentos com você:
                    </Text>
                    <View style={styles.photoPickersRow}>
                      <TouchableOpacity
                        style={[styles.photoPickerBtn, { backgroundColor: isDark ? '#0A120D' : '#F1F5F9', borderColor: colors.border }]}
                        onPress={handlePickImage}
                        disabled={loading}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="images-outline" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.photoPickerBtnText, { color: COLORS.primary }]}>Galeria</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.photoPickerBtn, { backgroundColor: isDark ? '#0A120D' : '#F1F5F9', borderColor: colors.border }]}
                        onPress={handleTakePhoto}
                        disabled={loading}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="camera-outline" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.photoPickerBtnText, { color: COLORS.primary }]}>Câmera</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {proofType === 'documents' && (
                  <View style={styles.dynamicBox}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      Número de microchip ou registro veterinário:
                    </Text>
                    <TextInput
                      value={vetDocNumber}
                      onChangeText={setVetDocNumber}
                      placeholder="Ex: número do microchip ou registro da clínica"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.singleInput, { backgroundColor: isDark ? '#0A120D' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                      editable={!loading}
                    />

                    <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>
                      Foto da Carteira de Vacinação ou Termo de Adoção:
                    </Text>
                    <View style={styles.photoPickersRow}>
                      <TouchableOpacity
                        style={[styles.photoPickerBtn, { backgroundColor: isDark ? '#0A120D' : '#F1F5F9', borderColor: colors.border }]}
                        onPress={handlePickImage}
                        disabled={loading}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="photo-library" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.photoPickerBtnText, { color: COLORS.primary }]}>Anexar Documento</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoPickerBtn, { backgroundColor: isDark ? '#0A120D' : '#F1F5F9', borderColor: colors.border }]}
                        onPress={handleTakePhoto}
                        disabled={loading}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="camera-outline" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.photoPickerBtnText, { color: COLORS.primary }]}>Fotografar Doc</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {proofType === 'secret_marks' && (
                  <View style={styles.dynamicBox}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      Descreva detalhes que só o tutor saberia:
                    </Text>
                    <TextInput
                      value={secretMarks}
                      onChangeText={setSecretMarks}
                      multiline
                      numberOfLines={3}
                      placeholder="Ex: 'Tem cicatriz na orelha direita, mancha na barriga, atende pelo som de assobio ou responde pelo nome Max.'"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.textInput, { backgroundColor: isDark ? '#0A120D' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                      editable={!loading}
                    />
                  </View>
                )}

                {/* Lista de Fotos Selecionadas */}
                {photos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoList}>
                    {photos.map((p, idx) => (
                      <View key={idx} style={styles.photoThumbWrap}>
                        <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                        <TouchableOpacity
                          style={styles.removePhotoBtn}
                          onPress={() => handleRemovePhoto(idx)}
                          disabled={loading}
                        >
                          <MaterialIcons name="close" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* Mensagem / Detalhes Adicionais */}
                <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>
                  Mensagem para o acolhedor (opcional):
                </Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={2}
                  placeholder="Ex: 'Olá, sou o tutor e moro perto de onde ele foi visto. Muito obrigado por cuidar dele!'"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.textInput,
                    {
                      minHeight: 52,
                      backgroundColor: isDark ? '#0A120D' : '#F8FAFC',
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  editable={!loading}
                />
              </ScrollView>

              {/* Botões de Ação */}
              <View style={[styles.actionButtonsRow, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[
                    styles.cancelBtn,
                    {
                      backgroundColor: isDark ? '#0A120D' : '#F1F5F9',
                    },
                  ]}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor: COLORS.primary,
                      opacity: loading ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  ) : (
                    <MaterialIcons name="send" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.submitBtnText}>
                    {loading ? 'Enviando...' : 'Enviar Comprovação'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardContainer: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
  },
  container: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  securityNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  proofTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  proofTypeCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  proofTypeCardActive: {
    borderWidth: 2,
  },
  proofTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  proofTypeLabelActive: {
    fontWeight: '800',
  },
  dynamicBox: {
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  singleInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    fontSize: 13.5,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  photoPickersRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  photoPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  photoPickerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  photoList: {
    marginTop: 10,
    maxHeight: 70,
  },
  photoThumbWrap: {
    position: 'relative',
    marginRight: 8,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
