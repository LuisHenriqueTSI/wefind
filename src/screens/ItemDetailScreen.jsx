import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  Modal,
  TextInput,
  Dimensions,
  Linking,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, FontAwesome, Feather, Ionicons } from '@expo/vector-icons';
import { stripEmoji } from '../utils/text';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import * as itemsService from '../services/items';
import { formatarDataMembro } from './_dateUtils';

import ShareButton from '../components/ShareButton';
import COLORS from '../constants/theme';

import SightingModal from '../components/SightingModal';
import ProofUploadModal from '../components/ProofUploadModal';
import PetFallbackImage from '../components/PetFallbackImage';
import * as sightingsService from '../services/sightings';
import { getRenewalInfo } from '../services/itemExpiration';
import { APP_FEATURES } from '../constants/features';
import { createRenewalReminderNotification } from '../services/notifications';
import * as reportsService from '../services/reports';
import { getVerificationStatus } from '../services/proofVerification';
import { findMatchesForPet } from '../services/petMatching';
import PetMatchModal from '../components/PetMatchModal';
import OptimizedImage from '../components/OptimizedImage';
import * as Location from 'expo-location';
import { describeRouteStatus, getRouteStatus } from '../services/routeEligibility';
import {
  isResidentialAddressPrivate,
  removeHouseNumberFromStreet,
} from '../utils/locationPrivacy';

const formatItemDate = (value) => {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatCityState = (item) => {
  const city = (item?.city || item?.extra_fields?.location_details?.city || '').trim();
  const state = (item?.state || item?.extra_fields?.location_details?.state || '').trim();
  const parts = [city, state].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' - ');
  }
  return item?.neighborhood || item?.extra_fields?.location_details?.district || 'Localização não informada';
};

const formatStreetNumberNeighborhood = (item) => {
  const isLost = item?.status === 'lost';
  const details = item?.extra_fields?.location_details;
  const district = (details?.district || item?.neighborhood || '').trim();

  if (isResidentialAddressPrivate(item)) {
    const street = removeHouseNumberFromStreet(
      details?.street || item?.street || details?.text || item?.address
    );
    return [street, district].filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ');
  }

  // Exibe a rua sem o número residencial.
  if (isLost) {
    const street = removeHouseNumberFromStreet(
      details?.street || details?.reference || item?.street || details?.text || item?.address
    );
    return [street, district].filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ')
      || 'Localização informada pelo tutor';
  }

  // ANIMAL VISTO NA RUA: Exibe endereço da via pública
  const street = (details?.street || item?.street || '').trim();
  const number = (details?.number || item?.house_number || '').trim();

  const streetPart = street && number ? `${street}, ${number}` : street || (number ? `Nº ${number}` : '');
  const parts = [streetPart, district].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  const rawText = removeHouseNumberFromStreet(details?.text || item?.address);
  if (rawText) {
    return rawText;
  }

  return district || '';
};

const ItemDetailScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { itemId } = route.params;
  const { user, userProfile, isAdmin } = useAuth();
  const { colors, isDark } = useTheme();
  const [item, setItem] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [owner, setOwner] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [sightings, setSightings] = useState([]);
  const [sightingModalVisible, setSightingModalVisible] = useState(false);
  const [sightingLoading, setSightingLoading] = useState(false);
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [verificationState, setVerificationState] = useState({ status: null, claim: null });
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editCommentText, setEditCommentText] = useState('');
  const [editCommentObj, setEditCommentObj] = useState(null);
  const [editCommentLocation, setEditCommentLocation] = useState('');
  const [editCommentInstagram, setEditCommentInstagram] = useState('');
  const [editCommentWhatsapp, setEditCommentWhatsapp] = useState('');
  const [editCommentFacebook, setEditCommentFacebook] = useState('');
  const [editCommentPhotoUrl, setEditCommentPhotoUrl] = useState('');
  const [editUploading, setEditUploading] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [togglingAdoption, setTogglingAdoption] = useState(false);
  const [updatingAdoptionCount, setUpdatingAdoptionCount] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [fullScreenPhotoModal, setFullScreenPhotoModal] = useState(false);
  const [fullScreenIndex, setFullScreenIndex] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [potentialMatches, setPotentialMatches] = useState([]);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const screenWidth = Dimensions.get('window').width;

  const handleSafeGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainApp');
    }
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Detalhes',
      headerStyle: {
        backgroundColor: colors.headerBg || colors.primary,
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
        color: '#fff',
        fontSize: 18,
      },
      headerShown: !proofModalVisible,
      gestureEnabled: !proofModalVisible,
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleSafeGoBack}
          style={styles.navBackBtn}
          accessibilityLabel="Voltar"
          activeOpacity={0.75}
        >
          <MaterialIcons name="chevron-left" size={28} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleSafeGoBack, colors.headerBg, proofModalVisible]);

  useFocusEffect(
    useCallback(() => {
      loadItemDetails();
      loadSightings();
      loadVerification();
    }, [itemId, user?.id])
  );

  const loadVerification = async () => {
    if (!itemId || !user?.id) return;
    try {
      const res = await getVerificationStatus(itemId, user.id);
      setVerificationState(res || { status: null, claim: null });
    } catch (e) {
      console.log('[ItemDetailScreen] Erro ao buscar status de verificação:', e.message);
    }
  };

  const loadSightings = async () => {
    if (!user?.id) {
      setSightings([]);
      return;
    }

    try {
      const data = await sightingsService.getSightings(itemId);
      setSightings(data || []);
    } catch (e) {
      setSightings([]);
    }
  };

  const loadItemDetails = async () => {
    try {
      setLoading(true);
      let itemData = await itemsService.getItemDetails(itemId);
      if (itemData) {
        // Contagem e último local visto vêm da tabela de avistamentos
        [itemData] = await sightingsService.attachSightingSummaries([itemData]);
        setItem(itemData);
        if (user && itemData.owner_id === user.id) {
          const renewalInfo = getRenewalInfo(itemData);
          if (renewalInfo.needsRenewal) {
            await createRenewalReminderNotification(itemData, user.id);
          }
        }
        setPhotos(itemData.item_photos || []);
        setOwner(itemData.profiles);
        setRewards(itemData.rewards || []);

        // Matches são dados privados do autor da publicação.
        if (user?.id && user.id === itemData.owner_id && (itemData.status === 'lost' || itemData.status === 'found')) {
          findMatchesForPet(itemData, { minScore: 55 })
            .then((matches) => setPotentialMatches(matches || []))
            .catch((e) => console.log('[ItemDetailScreen] Erro ao buscar matches:', e.message));
        } else {
          setPotentialMatches([]);
        }
      } else {
        Alert.alert('Erro', 'Pet não encontrado');
        handleSafeGoBack();
      }
    } catch (error) {
      console.error('[ItemDetailScreen] Erro ao carregar:', error);
      Alert.alert('Erro', 'Falha ao carregar detalhes do pet');
      handleSafeGoBack();
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = () => {
    if (!item) return;
    navigation.navigate('RegisterItem', {
      editItem: item,
      modo: 'editar',
    });
  };

  const renewalInfo = item ? getRenewalInfo(item) : { canRenew: false, daysRemaining: 0, expired: false };

  const handleDeleteItem = () => {
    Alert.alert(
      isAdmin && !isOwner ? 'Excluir Publicação (Admin)' : 'Excluir Publicação',
      isAdmin && !isOwner
        ? 'Como Administrador, você está prestes a excluir esta publicação de outro usuário permanentemente do banco de dados.'
        : 'Tem certeza que deseja excluir esta publicação? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await itemsService.deleteItem(itemId, { actorId: user?.id, actorIsAdmin: isAdmin });
              Alert.alert('Sucesso', 'Publicação excluída com sucesso!');
              handleSafeGoBack();
            } catch (error) {
              Alert.alert('Erro', 'Falha ao excluir publicação: ' + error.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const promptHappyStory = (petName) => {
    if (!APP_FEATURES.successStories) return;

    setTimeout(() => {
      Alert.alert(
        'Que notícia boa!',
        `Que bom que ${petName || 'seu pet'} foi reencontrado! Gostaria de compartilhar essa história feliz com toda a comunidade WeFIND?`,
        [
          { text: 'Agora não', style: 'cancel' },
          {
            text: 'Compartilhar história',
            onPress: () => {
              navigation.navigate('MuralReencontros', {
                openSendModal: true,
                prefillPetName: petName || '',
                prefillItemId: item?.id || null,
              });
            },
          },
        ]
      );
    }, 400);
  };

  const handleAdminChangeStatus = (newStatus, isAdoption = false) => {
    const statusTitles = {
      lost: 'Perdido',
      found: 'Encontrado',
      resolved: 'Reencontrado / Resolvido',
    };
    const targetLabel = isAdoption ? 'Disponível para Adoção' : (statusTitles[newStatus] || newStatus);
    const petName = item?.animal_name || item?.title || '';

    Alert.alert(
      'Alterar situação (administrador)',
      `Deseja forçar a alteração do status desta publicação para "${targetLabel}" no banco de dados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              const updatedFields = {
                ...(item.extra_fields || {}),
                available_for_adoption: isAdoption,
                is_direct_adoption: isAdoption,
              };
              await itemsService.updateItem(item.id, {
                status: newStatus,
                extra_fields: updatedFields,
              });
              setItem((prev) => ({
                ...prev,
                status: newStatus,
                extra_fields: updatedFields,
              }));
              Alert.alert(
                'Sucesso',
                `Status alterado para "${targetLabel}" com sucesso!`,
                [{
                  text: 'OK',
                  onPress: () => {
                    if (newStatus === 'resolved') promptHappyStory(petName);
                  },
                }]
              );
            } catch (err) {
              Alert.alert('Erro', 'Falha ao alterar status: ' + (err.message || 'Erro desconhecido'));
            }
          },
        },
      ]
    );
  };

  const handleMarkResolved = () => {
    const petName = item?.animal_name || item?.title || 'seu pet';
    Alert.alert(
      'Pet reencontrado',
      `Confirma que você reencontrou ${petName} e deseja encerrar esta publicação como resolvida?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar reencontro',
          onPress: async () => {
            try {
              await itemsService.updateItem(item.id, { status: 'resolved' });
              setItem((prev) => ({ ...prev, status: 'resolved' }));
              promptHappyStory(petName);
            } catch (err) {
              Alert.alert('Erro', 'Falha ao atualizar o status: ' + (err.message || 'Erro desconhecido'));
            }
          },
        },
      ]
    );
  };

  const handleRenewItem = async () => {
    if (!item) return;
    setRenewing(true);
    try {
      await itemsService.renewItem(item.id);
      await loadItemDetails();
      Alert.alert('Sucesso', 'Publicação renovada com sucesso!');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível renovar a publicação: ' + error.message);
    } finally {
      setRenewing(false);
    }
  };

  const handleEditComment = (comment) => {
    setEditCommentObj(comment);
    setEditCommentText(comment.description || '');
    setEditCommentLocation(comment.location || '');
    setEditCommentInstagram((comment.contact_info && comment.contact_info.instagram) || '');
    setEditCommentWhatsapp((comment.contact_info && comment.contact_info.whatsapp) || '');
    setEditCommentFacebook((comment.contact_info && comment.contact_info.facebook) || '');
    setEditCommentPhotoUrl(comment.photo_url || '');
    setEditModalVisible(true);
  };

  const handleSaveEditComment = async () => {
    if (!editCommentObj || !editCommentText.trim()) {
      setEditModalVisible(false);
      return;
    }
    let photoUrlToSave = editCommentPhotoUrl;
    const isLocalPhoto = photoUrlToSave && photoUrlToSave.startsWith('file:///');
    if (isLocalPhoto && photoUrlToSave !== editCommentObj.photo_url) {
      try {
        if (sightingsService.uploadSightingPhoto) {
          const uploadedUrl = await sightingsService.uploadSightingPhoto(editCommentObj.id, photoUrlToSave);
          if (uploadedUrl && !uploadedUrl.startsWith('file:///')) {
            photoUrlToSave = uploadedUrl;
          } else {
            photoUrlToSave = editCommentObj.photo_url;
          }
        }
      } catch (err) {
        photoUrlToSave = editCommentObj.photo_url;
      }
    }

    try {
      await sightingsService.updateSighting(editCommentObj.id, {
        description: editCommentText.trim(),
        location: editCommentLocation.trim(),
        contact_info: {
          instagram: editCommentInstagram.trim(),
          whatsapp: editCommentWhatsapp.trim(),
          facebook: editCommentFacebook.trim(),
        },
        photo_url: photoUrlToSave,
      });
      setEditModalVisible(false);
      loadSightings();
      Alert.alert('Sucesso', 'Comentário atualizado com sucesso!');
    } catch (error) {
      Alert.alert('Erro', 'Falha ao atualizar comentário: ' + error.message);
    }
  };

  const handleCancelEditComment = () => {
    setEditModalVisible(false);
    setEditCommentObj(null);
    setEditCommentText('');
    setEditCommentLocation('');
    setEditCommentInstagram('');
    setEditCommentWhatsapp('');
    setEditCommentFacebook('');
    setEditCommentPhotoUrl('');
  };

  const handleSendMessage = () => {
    const isDirectAdoption = Boolean(item?.extra_fields?.is_direct_adoption || item?.status === 'adoption');
    const remainingCount = item?.extra_fields?.adoption_remaining_count;
    if (isDirectAdoption && remainingCount != null && Number(remainingCount) <= 0) {
      Alert.alert('Adoção encerrada', 'Todos os animais deste anúncio já foram adotados.');
      return;
    }

    if (!user) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para enviar mensagens ao tutor.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }
    if (!item) return;

    if (user.id === item.owner_id) {
      Alert.alert('Aviso', 'Você é o autor desta publicação.');
      return;
    }

    navigation.navigate('ChatScreen', {
      conversation: {
        otherId: item.owner_id,
        itemId: itemId,
        otherName: owner?.name || 'Tutor',
        avatarUrl: owner?.avatar_url || null,
        itemTitle: item.title || item.species || 'Animal',
        itemStatus: item.status,
        itemOwnerId: item.owner_id,
      },
    });
  };

  const handleOfferFoster = () => {
    if (!user) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para oferecer lar temporário para este animal.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }

    if (isOwner) {
      Alert.alert('Aviso', 'Você é o autor desta publicação.');
      return;
    }

    const title = item.title || item.species || 'este pet';
    const initialMessage = `Olá! Vi a publicação de ${title} no WeFIND e tenho disponibilidade para ser Lar Temporário dele(a) até encontrarmos o tutor ou um lar definitivo! `;

    navigation.navigate('ChatScreen', {
      conversation: {
        otherId: item.owner_id,
        itemId: itemId,
        otherName: owner?.name || 'Tutor',
        avatarUrl: owner?.avatar_url || null,
        itemTitle: item.title || item.species || 'Animal',
        initialMessage,
      },
    });
  };

  const handleReportSighting = () => {
    const isAnimalInCustody = (item?.category === 'animal' || item?.item_type === 'animal')
      && item?.status === 'found'
      && item?.extra_fields?.found_custody !== 'spotted';
    if (isAnimalInCustody) {
      Alert.alert(
        'Animal sob cuidados',
        'Como o animal está com quem publicou, não é necessário registrar novos avistamentos. Entre em contato pelo chat para compartilhar informações.'
      );
      return;
    }

    if (!user) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para adicionar uma informação ou comentário.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }
    setSightingModalVisible(true);
  };

  const handleToggleAdoption = async () => {
    const isCurrentlyAdoption = Boolean(item?.extra_fields?.available_for_adoption);
    const waitingDays = itemsService.getAdoptionWaitingDays(item);

    if (!isCurrentlyAdoption && waitingDays > 0) {
      Alert.alert(
        'Primeiras horas de busca',
        `Este animal ainda está no período de busca pelo tutor. Faltam ${waitingDays} dia(s) para solicitar a adoção responsável. A publicação continuará ativa durante esse período.`,
        [
          { text: 'Entendi', style: 'cancel' },
        ]
      );
      return;
    }

    Alert.alert(
      isCurrentlyAdoption ? 'Marcar como adotado' : 'Disponibilizar para Adoção',
      isCurrentlyAdoption
        ? 'Confirma que este pet foi adotado e deseja encerrar a publicação de adoção?'
        : 'Ao disponibilizar para adoção responsável, outros membros poderão entrar em contato para adotá-lo. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isCurrentlyAdoption ? 'Marcar como adotado' : 'Disponibilizar',
          onPress: () => confirmAdoptionChange(isCurrentlyAdoption),
        },
      ]
    );
  };

  const confirmAdoptionChange = async (isCurrentlyAdoption) => {
    setTogglingAdoption(true);
    try {
      await itemsService.toggleItemAdoption(
        item.id,
        item.extra_fields,
        !isCurrentlyAdoption
      );
      setItem((prev) => ({
        ...prev,
        extra_fields: {
          ...(prev?.extra_fields || {}),
          available_for_adoption: !isCurrentlyAdoption,
        },
      }));
      Alert.alert(
        'Sucesso',
        !isCurrentlyAdoption
          ? 'Pet disponibilizado para adoção responsável com sucesso!'
          : 'Adoção concluída. Pet removido da listagem de adoção.'
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível atualizar o status de adoção.');
    } finally {
      setTogglingAdoption(false);
    }
  };

  const handleToggleAdoptionAnimal = (animalIndex) => {
    if (updatingAdoptionCount) return;
    const animal = adoptionAnimals[animalIndex];
    if (!animal) return;
    const nextStatus = animal.adoption_status === 'adopted' ? 'available' : 'adopted';
    const action = nextStatus === 'adopted' ? 'marcar como adotado' : 'disponibilizar novamente';
    Alert.alert(
      'Atualizar situação do animal',
      `Confirma que deseja ${action} o Animal ${animalIndex + 1}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setUpdatingAdoptionCount(true);
            try {
              const updatedAnimals = adoptionAnimals.map((currentAnimal, index) => (
                index === animalIndex
                  ? { ...currentAnimal, adoption_status: nextStatus }
                  : currentAnimal
              ));
              const updated = await itemsService.updateAdoptionAnimals(
                item.id,
                {
                  ...(item.extra_fields || {}),
                  adoption_total_count: adoptionTotalCount,
                  adoption_remaining_count: adoptionRemainingCount,
                },
                updatedAnimals
              );
              setItem((previous) => ({
                ...previous,
                extra_fields: updated.extra_fields,
              }));
            } catch (error) {
              Alert.alert('Erro', error?.message || 'Não foi possível atualizar a quantidade disponível.');
            } finally {
              setUpdatingAdoptionCount(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkAdopted = () => {
    if (updatingAdoptionCount) return;
    const petName = item?.animal_name || item?.title || 'o animal';
    const pendingAnimals = adoptionAnimals.filter((animal) => animal.adoption_status !== 'adopted').length;
    const isMultiple = adoptionTotalCount > 1;
    Alert.alert(
      isMultiple ? 'Animais adotados' : 'Marcar como adotado',
      isMultiple
        ? `Confirma que ${pendingAnimals === adoptionTotalCount ? 'todos os animais' : `os ${pendingAnimals} animais restantes`} deste anúncio foram adotados e deseja encerrar a publicação de adoção?`
        : `Confirma que ${petName} foi adotado(a) e deseja encerrar a publicação de adoção?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Marcar como adotado',
          onPress: async () => {
            setUpdatingAdoptionCount(true);
            try {
              const updatedAnimals = adoptionAnimals.map((animal) => ({ ...animal, adoption_status: 'adopted' }));
              const updated = await itemsService.updateAdoptionAnimals(
                item.id,
                {
                  ...(item.extra_fields || {}),
                  adoption_total_count: adoptionTotalCount,
                  adoption_remaining_count: 0,
                  adopted_at: new Date().toISOString(),
                },
                updatedAnimals
              );
              setItem((previous) => ({
                ...previous,
                extra_fields: updated.extra_fields,
              }));
              Alert.alert('Que notícia boa!', 'Adoção concluída. Pet removido da listagem de adoção.');
            } catch (error) {
              Alert.alert('Erro', error?.message || 'Não foi possível marcar como adotado.');
            } finally {
              setUpdatingAdoptionCount(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenReport = () => {
    if (!user) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para denunciar uma publicação.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }
    setReportModalVisible(true);
  };

  const handleSubmitReport = async () => {
    if (!user) {
      Alert.alert('Login necessário', 'Entre na sua conta para denunciar uma publicação.');
      setReportModalVisible(false);
      navigation.navigate('Login');
      return;
    }
    if (!reportReason) {
      Alert.alert('Motivo necessário', 'Selecione o motivo da denúncia.');
      return;
    }

    setReporting(true);
    try {
      await reportsService.createReport({
        itemId: item.id,
        reporterId: user.id,
        reason: reportReason,
        details: reportDetails,
      });
      setReportModalVisible(false);
      setReportReason('');
      setReportDetails('');
      Alert.alert('Denúncia enviada', 'A equipe administrativa analisará esta publicação com prioridade.');
    } catch (error) {
      Alert.alert('Não foi possível denunciar', error.message || 'Tente novamente.');
    } finally {
      setReporting(false);
    }
  };

  const handleSubmitSighting = async (form) => {
    setSightingLoading(true);
    try {
      let photoUrl = form.photo_url;
      if (photoUrl && (photoUrl.startsWith('file://') || photoUrl.startsWith('content://'))) {
        try {
          photoUrl = await sightingsService.uploadSightingPhoto(itemId, photoUrl);
        } catch (uploadErr) {
          console.warn('[ItemDetailScreen] Erro upload foto avistamento:', uploadErr);
        }
      }

      await sightingsService.recordSighting({
        itemId: itemId,
        userId: user.id,
        location: form.coordinate || form.location_details || { address: form.location },
        description: form.description,
        contactInfo: form.contact_info,
        photoUrl,
        animalPlace: form.animal_place,
      });

      setSightingModalVisible(false);
      loadSightings();
      loadItemDetails(); // Recarrega o animal com o resumo de avistamentos atualizado

      if (item?.owner_id) {
        try {
          const { createNotification } = require('../services/notifications');
          const commenterName = userProfile?.name || user?.user_metadata?.name || 'Um membro da comunidade';

          let mapsLink = '';
          if (form.coordinate?.latitude && form.coordinate?.longitude) {
            mapsLink = `https://www.google.com/maps/search/?api=1&query=${form.coordinate.latitude},${form.coordinate.longitude}`;
          } else if (form.location) {
            mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.location)}`;
          }

          let notificationMessage = `${commenterName} compartilhou uma nova localização/avistamento sobre o pet em: ${form.location || 'Local informado'}.\n\nDetalhes: "${form.description || ''}"`;
          if (mapsLink) {
            notificationMessage += `\n\nVer no mapa: ${mapsLink}`;
          }

          await createNotification({
            user_id: item.owner_id,
            type: 'sighting',
            title: `Nova pista sobre ${item.title || 'seu pet'}`,
            message: notificationMessage,
            item_id: item.id,
          });
        } catch (notifErr) {
          console.error('[ItemDetailScreen] Falha ao enviar notificação de informação:', notifErr);
        }
      }

      Alert.alert('Avistamento registrado', 'O avistamento foi registrado nas pistas do pet e o tutor foi notificado.');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível enviar as informações. Tente novamente.');
    } finally {
      setSightingLoading(false);
    }
  };

  const handleDeleteComment = (comment) => {
    const isCommentAuthor = user && comment.user_id === user.id;
    Alert.alert(
      isAdmin && !isCommentAuthor ? 'Excluir comentário (Admin)' : 'Excluir comentário',
      isAdmin && !isCommentAuthor
        ? 'Como Administrador, você está prestes a excluir este comentário permanentemente.'
        : 'Tem certeza que deseja excluir este comentário?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setSightings((prev) => prev.filter((c) => String(c.id) !== String(comment.id)));
              await sightingsService.deleteSighting(comment.id);
              Alert.alert('Sucesso', 'Comentário excluído com sucesso.');
            } catch (error) {
              console.error('Falha ao excluir comentário:', error);
              Alert.alert('Erro', 'Não foi possível excluir o comentário.');
              loadSightings();
            }
          },
        },
      ]
    );
  };

  const isOwner = user && item && item.owner_id === user.id;
  const parsedExtraFields = (() => {
    if (!item?.extra_fields) return {};
    if (typeof item.extra_fields === 'object') return item.extra_fields;
    try {
      const parsed = JSON.parse(item.extra_fields);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.warn('Não foi possível interpretar os dados extras da publicação:', error);
      return {};
    }
  })();
  const helpNetwork = parsedExtraFields.help_network;
  const isAnonymousReport = [true, 1, 'true', '1', 'yes', 'sim'].includes(
    typeof helpNetwork?.anonymous === 'string'
      ? helpNetwork.anonymous.toLowerCase()
      : helpNetwork?.anonymous
  );

  // Botão de ações (⋮) no header — apenas para visitantes
  useEffect(() => {
    if (!isOwner && !isAdmin) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setShowActionMenu(true)}
            style={{
              marginRight: 10,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.28)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            activeOpacity={0.75}
            accessibilityLabel="Ações da publicação"
          >
            <MaterialIcons name="more-vert" size={22} color="#fff" />
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isOwner, isAdmin]);

  const handleLoginRequired = (message = 'Entre ou crie uma conta para continuar.') => {
    Alert.alert('Login necessário', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Entrar', onPress: () => navigation.navigate('Login') },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando detalhes...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <MaterialIcons name="pets" size={54} color={colors.textMuted} />
        <Text style={[styles.errorText, { color: colors.text }]}>Animal não encontrado</Text>
      </View>
    );
  }

  if (proofModalVisible) {
    return (
      <ProofUploadModal
        visible
        onClose={() => setProofModalVisible(false)}
        item={item}
        userId={user?.id}
        onSuccess={loadVerification}
      />
    );
  }

  const handleOpenRoute = async () => {
    if (!item) return;
    // Só pistas públicas e recentes têm rota; o destino é o centro da área de busca
    const routeStatus = getRouteStatus(item);
    if (!routeStatus.available) return;
    const lat = routeStatus.area.latitude;
    const lng = routeStatus.area.longitude;

    const mapParams = {
      focusItemId: item.id,
      showRoute: true,
      targetCoords: { latitude: Number(lat), longitude: Number(lng) },
    };

    // Usuários não autenticados estão no PublicStack, que não possui a rota MainApp.
    if (!user) {
      navigation.navigate('Map', mapParams);
      return;
    }

    // Abre diretamente o Mapa do WeFIND traçando a rota até o animal
    try {
      navigation.navigate('MainApp', {
        screen: 'MapTab',
        params: mapParams,
      });
    } catch (e) {
      navigation.navigate('Map', mapParams);
    }
  };

  // Abre o mapa na pista mais recente (área aproximada, nunca o ponto exato).
  // Com pista quente/morna já traça a rota; pista fria só centraliza o mapa.
  const handleOpenLatestClue = () => {
    if (!item) return;
    const routeStatus = getRouteStatus(item);
    if (!routeStatus.area) return;
    const mapParams = {
      focusItemId: item.id,
      showRoute: Boolean(routeStatus.available),
      targetCoords: {
        latitude: Number(routeStatus.area.latitude),
        longitude: Number(routeStatus.area.longitude),
      },
    };
    if (!user) {
      navigation.navigate('Map', mapParams);
      return;
    }
    try {
      navigation.navigate('MainApp', { screen: 'MapTab', params: mapParams });
    } catch (e) {
      navigation.navigate('Map', mapParams);
    }
  };

  const requiresOwnershipProof = item.extra_fields?.requires_ownership_proof !== false;
  const isDirectAdoption = Boolean(item.extra_fields?.is_direct_adoption || item.status === 'adoption');
  const isAdoption = Boolean(isDirectAdoption || itemsService.isPetAvailableForAdoption(item));
  const adoptionTotalCount = Math.max(1, Number(item.extra_fields?.adoption_total_count) || 1);
  const rawAdoptionRemainingCount = item.extra_fields?.adoption_remaining_count;
  const parsedAdoptionRemainingCount = Number(rawAdoptionRemainingCount);
  const storedAdoptionAnimals = Array.isArray(item.extra_fields?.adoption_animals)
    ? item.extra_fields.adoption_animals
    : [];
  const storedRemainingCount = rawAdoptionRemainingCount == null
    || !Number.isSafeInteger(parsedAdoptionRemainingCount)
    ? adoptionTotalCount
    : Math.max(0, Math.min(adoptionTotalCount, parsedAdoptionRemainingCount));
  const hasStoredIndividualStatuses = storedAdoptionAnimals.length === adoptionTotalCount
    && storedAdoptionAnimals.every((animal) => ['available', 'adopted'].includes(animal?.adoption_status));
  const adoptionAnimals = Array.from({ length: adoptionTotalCount }, (_, index) => {
    const animal = storedAdoptionAnimals[index] || {};
    return {
      ...animal,
      adoption_status: ['available', 'adopted'].includes(animal.adoption_status)
        ? animal.adoption_status
        : index < storedRemainingCount ? 'available' : 'adopted',
    };
  });
  const adoptionRemainingCount = hasStoredIndividualStatuses
    ? adoptionAnimals.filter((animal) => animal.adoption_status === 'available').length
    : storedRemainingCount;
  const isAdoptionClosed = isDirectAdoption
    && rawAdoptionRemainingCount != null
    && adoptionRemainingCount === 0;
  // Anúncio de adoção já concluído: não deve voltar a mostrar "Reencontrado!" nem "P/ Adoção"
  const wasAdopted = Boolean(item.extra_fields?.adopted_at) || isAdoptionClosed;
  const adoptionQuantityLabel = isAdoptionClosed
    ? adoptionTotalCount === 1
      ? 'Este animal já foi adotado.'
      : `Todos os ${adoptionTotalCount} animais foram adotados.`
    : `${adoptionRemainingCount} de ${adoptionTotalCount} ${adoptionRemainingCount === 1 ? 'animal disponível' : 'animais disponíveis'} para adoção`;
  const summarizeAdoptionField = (field) => {
    const counts = new Map();
    adoptionAnimals.forEach((animal) => {
      const rawValue = animal?.[field];
      const value = Array.isArray(rawValue)
        ? rawValue.filter(Boolean).join(' e ')
        : String(rawValue || '').trim();
      if (!value) return;
      const key = value.toLocaleLowerCase();
      const existing = counts.get(key);
      counts.set(key, { label: existing?.label || value, count: (existing?.count || 0) + 1 });
    });
    return Array.from(counts.values())
      .map(({ label, count }) => `${label} (${count})`)
      .join(', ');
  };
  const adoptionAnimalSummaries = [
    { label: 'Sexo', value: summarizeAdoptionField('gender') },
    { label: 'Cores', value: summarizeAdoptionField('color') },
    { label: 'Idade', value: summarizeAdoptionField('age') },
    { label: 'Raças', value: summarizeAdoptionField('breed') },
  ].filter(({ value }) => value);
  const getAdoptionAnimalDetails = (animal) => [
    { label: 'Sexo', value: animal.gender },
    { label: 'Cor', value: Array.isArray(animal.color) ? animal.color.join(' com ') : animal.color },
    { label: 'Idade', value: animal.age },
    { label: 'Raça', value: animal.breed },
  ]
    .filter(({ value }) => typeof value === 'string' && value.trim())
    .map(({ label, value }) => `${label}: ${value}`)
    .join(' · ');
  const adoptionOriginLabels = {
    rescue: 'Resgatados / encontrados sem tutor conhecido',
    own_litter: 'Ninhada do animal do responsável',
    shelter: 'Abrigo / ONG / protetor',
    other: 'Outra origem',
  };
  const isFound = item.status === 'found' && !isAdoption;
  const isAnimalInCustody = (item.category === 'animal' || item.item_type === 'animal')
    && item.status === 'found'
    && item.extra_fields?.found_custody !== 'spotted';

  return (
    <ScrollView
      style={[styles.detailPage, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingBottom: Math.max(insets.bottom + 32, Platform.OS === 'android' ? 56 : 32),
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. HERO PHOTO SHOWCASE */}
      <View style={styles.heroContainer}>
        {photos && photos.length > 0 ? (
          <View style={{ width: '100%', height: 260, position: 'relative' }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setActivePhotoIndex(newIndex);
              }}
              style={{ width: screenWidth, height: 260 }}
            >
              {photos.map((photo, idx) => (
                <TouchableOpacity
                  key={photo.id || idx}
                  activeOpacity={0.95}
                  onPress={() => {
                    setFullScreenIndex(idx);
                    setFullScreenPhotoModal(true);
                  }}
                  style={{ width: screenWidth, height: 260 }}
                >
                  <Image
                    source={{ uri: photo.url }}
                    style={styles.heroImageItem}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Contador de fotos (Glassmorphism) */}
            {photos.length > 1 && (
              <View style={styles.photoCountBadge}>
                <Feather name="image" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.photoCountText}>
                  {activePhotoIndex + 1} / {photos.length}
                </Text>
              </View>
            )}

            {/* Botão de Zoom */}
            <TouchableOpacity
              onPress={() => {
                setFullScreenIndex(activePhotoIndex);
                setFullScreenPhotoModal(true);
              }}
              style={styles.zoomButton}
              activeOpacity={0.8}
            >
              <MaterialIcons name="zoom-in" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Barra de Paginação Flutuante */}
            {photos.length > 1 && (
              <View style={styles.paginationRow}>
                {photos.map((_, dotIndex) => (
                  <View
                    key={dotIndex}
                    style={[
                      styles.paginationDot,
                      activePhotoIndex === dotIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={{ width: screenWidth, height: 260 }}>
            <PetFallbackImage
              species={item.species}
              breed={item.breed || item.animal_breed}
              color={item.color}
              size={item.size}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        )}

        {/* Botão Flutuante de Compartilhamento Rápido */}
        <View style={styles.floatingShareBtn}>
          <ShareButton item={item} imageUrl={photos?.[0]?.url} />
        </View>
      </View>

      {/* 2. CABEÇALHO PRINCIPAL DO PET: STATUS + ATRIBUTOS */}
      <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Status Pill */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusPill,
              isAdoption
                ? styles.adoptionPill
                : isFound
                ? styles.foundPill
                : styles.lostPill,
            ]}
          >
            <Ionicons
              name={isAdoption ? 'heart' : isFound ? 'checkmark-circle' : 'alert-circle'}
              size={15}
              color={isAdoption ? '#DB2777' : isFound ? '#1E3E24' : '#C2410C'}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.statusPillText,
                { color: isAdoption ? '#DB2777' : isFound ? '#1E3E24' : '#C2410C' },
              ]}
            >
              {isAdoptionClosed
                ? 'Adoção encerrada'
                : isAdoption
                ? 'Para Adoção Responsável'
                : isFound
                ? 'Animal Encontrado'
                : 'Animal Perdido'}
            </Text>
          </View>
        </View>

        {/* Título do Pet */}
        <Text style={[styles.petMainTitle, { color: colors.text }]}>{item.title || 'Sem nome informado'}</Text>

        {/* Grid de Chips de Atributos */}
        <View style={styles.attributeGrid}>
          {(item.species || item.extra_fields?.species) ? (
            <View style={[styles.attrChip, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
              <View style={styles.attrChipTextWrap}>
                <Text style={[styles.attrChipLabel, { color: colors.textMuted }]}>Espécie</Text>
                <Text style={[styles.attrChipValue, { color: colors.text }]} numberOfLines={1}>{item.species || item.extra_fields?.species}</Text>
              </View>
            </View>
          ) : null}

          {(() => {
            const rawBreed = item.breed || item.extra_fields?.breed || '';
            const displayBreed = rawBreed
              .replace(/\s*\(\s*SRD\s*\)\s*/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            const isBreedUnknown = !displayBreed ||
              /^(não informado|não informada|nao informado|nao informada|sem raça definida|sem raca definida|sem raça|sem raca|srd|desconhecido|desconhecida|outra|outro)$/i.test(displayBreed);
            if (!showMoreInfo || isBreedUnknown) return null;
            return (
              <View style={[styles.attrChip, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
                <View style={styles.attrChipTextWrap}>
                  <Text style={[styles.attrChipLabel, { color: colors.textMuted }]}>Raça</Text>
                  <Text style={[styles.attrChipValue, { color: colors.text }]} numberOfLines={1}>{displayBreed}</Text>
                </View>
              </View>
            );
          })()}

          {(item.gender || item.extra_fields?.gender) && (item.gender || item.extra_fields?.gender) !== 'Não informado' ? (
            <View style={[styles.attrChip, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
              <View style={styles.attrChipTextWrap}>
                <Text style={[styles.attrChipLabel, { color: colors.textMuted }]}>Sexo</Text>
                <Text style={[styles.attrChipValue, { color: colors.text }]} numberOfLines={1}>{item.gender || item.extra_fields?.gender}</Text>
              </View>
            </View>
          ) : null}

          {(item.age || item.extra_fields?.age) && (item.age || item.extra_fields?.age) !== 'Não informado' ? (
            <View style={[styles.attrChip, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
              <View style={styles.attrChipTextWrap}>
                <Text style={[styles.attrChipLabel, { color: colors.textMuted }]}>Idade</Text>
                <Text style={[styles.attrChipValue, { color: colors.text }]} numberOfLines={1}>{item.age || item.extra_fields?.age}</Text>
              </View>
            </View>
          ) : null}

          {showMoreInfo && (item.size || item.extra_fields?.size) && (item.size || item.extra_fields?.size) !== 'Não informado' ? (
            <View style={[styles.attrChip, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
              <View style={styles.attrChipTextWrap}>
                <Text style={[styles.attrChipLabel, { color: colors.textMuted }]}>Porte</Text>
                <Text style={[styles.attrChipValue, { color: colors.text }]} numberOfLines={1}>{item.size || item.extra_fields?.size}</Text>
              </View>
            </View>
          ) : null}

          {showMoreInfo && (item.color || item.extra_fields?.color) && (
            <View style={[styles.attrChip, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
              <View style={styles.attrChipTextWrap}>
                <Text style={[styles.attrChipLabel, { color: colors.textMuted }]}>Cor</Text>
                <Text style={[styles.attrChipValue, { color: colors.text }]} numberOfLines={1}>{item.color || item.extra_fields?.color}</Text>
              </View>
            </View>
          )}
        </View>

        {(item.description
          || (Array.isArray(item.extra_fields?.temperament) && item.extra_fields.temperament.length > 0)
          || (Array.isArray(rewards) && rewards.some(r => r?.status === 'active'))
          || item.breed || item.extra_fields?.breed || item.size || item.extra_fields?.size || item.color || item.extra_fields?.color
          || (isDirectAdoption && (adoptionOriginLabels[item.extra_fields?.adoption_origin] || adoptionAnimalSummaries.length > 0))) && (
          <TouchableOpacity
            style={[styles.moreInfoButton, { borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}
            onPress={() => setShowMoreInfo(!showMoreInfo)}
            activeOpacity={0.75}
            accessibilityLabel={showMoreInfo ? 'Ocultar mais informações' : 'Mostrar mais informações'}
          >
            <MaterialIcons name="info-outline" size={17} color={colors.primary} />
            <Text style={[styles.moreInfoButtonText, { color: colors.primary }]}>
              {showMoreInfo ? 'Ocultar informações' : 'Mais informações'}
            </Text>
            <MaterialIcons
              name={showMoreInfo ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={19}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}

        {showMoreInfo && item.description ? (
          <View style={[styles.descriptionBlock, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Descrição e características</Text>
            <Text style={[styles.descriptionText, { color: colors.text }]}>{item.description}</Text>
          </View>
        ) : null}

        {showMoreInfo && isDirectAdoption && (adoptionOriginLabels[item.extra_fields?.adoption_origin] || adoptionAnimalSummaries.length > 0) && (
          <View style={[styles.descriptionBlock, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
            {adoptionOriginLabels[item.extra_fields?.adoption_origin] && (
              <Text style={[styles.adoptionExtraText, { color: colors.text }]}>
                Origem: {adoptionOriginLabels[item.extra_fields.adoption_origin]}
              </Text>
            )}
            {adoptionAnimalSummaries.length > 0 && (
              <>
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted, marginTop: 6 }]}>
                  Características do grupo
                </Text>
                {adoptionAnimalSummaries.map(({ label, value }) => (
                  <Text key={label} style={[styles.adoptionExtraText, { color: colors.textSecondary }]}>
                    {label}: {value}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}

        {/* Personalidade e cuidados do Pet */}
        {showMoreInfo && Array.isArray(item.extra_fields?.temperament) && item.extra_fields.temperament.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted, marginBottom: 8 }]}>
              Personalidade e cuidados
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {item.extra_fields.temperament.map((trait, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isDark ? 'rgba(219, 39, 119, 0.15)' : '#FDF2F8',
                    borderColor: isDark ? 'rgba(219, 39, 119, 0.35)' : '#FBCFE8',
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#DB2777' }}>
                    {stripEmoji(trait)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Bloco de Recompensa (Se ativa) */}
        {showMoreInfo && Array.isArray(rewards) && rewards.some(r => r?.status === 'active') && (
          <View style={styles.rewardBanner}>
            <View style={styles.rewardIconBadge}>
              <MaterialIcons name="emoji-events" size={24} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>Recompensa oferecida</Text>
              {rewards
                .filter(r => r?.status === 'active')
                .map((r, index) => (
                  <Text key={r?.id || index} style={styles.rewardAmount}>
                    {r?.amount ? `R$ ${parseFloat(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                    {r?.description ? ` • ${r.description}` : ''}
                  </Text>
                ))}
            </View>
          </View>
        )}
        {!isOwner && !isAdmin && (
          <View style={[styles.reportPublicationFooter, { borderTopColor: colors.divider }]}>
            <TouchableOpacity
              style={styles.reportPublicationButton}
              onPress={handleOpenReport}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Denunciar publicação"
            >
              <MaterialIcons name="flag" size={14} color={colors.textMuted} />
              <Text style={[styles.reportPublicationText, { color: colors.textMuted }]}>
                Denunciar publicação
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 3. ADOÇÃO E CUSTÓDIA */}
      {isDirectAdoption && (
        <View
          style={[
            styles.adoptionQuantityCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              flexDirection: 'column',
              alignItems: 'stretch',
            },
          ]}
        >
          <View>
            <Text style={[styles.adoptionQuantityLabel, { color: colors.text, flex: 0 }]}>
              {adoptionQuantityLabel}
            </Text>
          </View>
          {isOwner && !isAdmin && (
            <View style={{ marginTop: 10, gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                Atualize a situação de cada animal:
              </Text>
              {adoptionAnimals.map((animal, index) => {
                const isAdopted = animal.adoption_status === 'adopted';
                const details = getAdoptionAnimalDetails(animal);
                return (
                  <View
                    key={animal.id || index}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 10,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>
                        Animal {index + 1}
                      </Text>
                      <Text style={{
                        color: isAdopted ? '#64748B' : (isDark ? '#34D399' : '#047857'),
                        fontSize: 11,
                        fontWeight: '700',
                      }}>
                        {isAdopted ? 'Adotado' : 'Disponível'}
                      </Text>
                    </View>
                    {details ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>
                        {details}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => handleToggleAdoptionAnimal(index)}
                      disabled={updatingAdoptionCount}
                      accessibilityRole="button"
                      accessibilityLabel={`${isAdopted ? 'Marcar Animal ' + (index + 1) + ' como disponível' : 'Marcar Animal ' + (index + 1) + ' como adotado'}`}
                      style={{
                        alignSelf: 'flex-start',
                        borderWidth: 1,
                        borderColor: isAdopted ? colors.primary : '#DB2777',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        opacity: updatingAdoptionCount ? 0.55 : 1,
                      }}
                    >
                      <Text style={{
                        color: isAdopted ? colors.primary : '#DB2777',
                        fontSize: 11,
                        fontWeight: '700',
                      }}>
                        {isAdopted ? 'Marcar como disponível' : 'Marcar como adotado'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
      {/* 4. CARD DE LOCALIZAÇÃO E DATA COM ROTA GPS */}
      <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={[styles.sectionHeaderRow, { flex: 1 }]}>
            <View style={[styles.sectionIconWrap, { backgroundColor: item.status === 'lost' ? (isDark ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5') : (isDark ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5') }]}>
              <MaterialIcons
                name={item.status === 'lost' ? 'security' : (item?.extra_fields?.found_custody === 'spotted' ? 'add-location-alt' : 'home')}
                size={20}
                color={'#2E5634'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {item.status === 'lost'
                  ? 'Região do Desaparecimento'
                  : item?.extra_fields?.found_custody === 'spotted'
                  ? 'Local de Avistamento na Rua'
                  : 'Local Onde Foi Encontrado'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                {item.status === 'lost'
                  ? 'Área aproximada do desaparecimento'
                  : item?.extra_fields?.found_custody === 'spotted'
                  ? 'Local em via pública'
                  : 'Rua informada na publicação'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.locationBody}>
          <Text style={[styles.locationCityText, { color: colors.text }]}>
            {formatCityState(item)}
          </Text>
          {formatStreetNumberNeighborhood(item) ? (
            <Text style={[styles.locationStreetText, { color: colors.textSecondary, marginBottom: 5 }]}>
              {formatStreetNumberNeighborhood(item)}
            </Text>
          ) : null}

          {item.date ? (
            <View style={[styles.dateRow, { borderTopColor: colors.border, marginBottom: 6 }]}>
              <MaterialIcons name="event" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                {item.status === 'lost' ? 'Data do desaparecimento: ' : 'Data do encontro: '}
                <Text style={[styles.dateValue, { color: colors.text }]}>{formatItemDate(item.date)}</Text>
              </Text>
            </View>
          ) : null}

          {/* Avisos de Proteção de Endereço e Comprovação de Tutor para Animais Acolhidos */}
          {item.status === 'found' && item.extra_fields?.found_custody !== 'spotted' && !isAdoption && (
            <View style={{ marginBottom: 12 }}>
              {verificationState?.status === 'approved' && !isOwner && !isAdmin && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  backgroundColor: isDark ? 'rgba(5, 150, 105, 0.18)' : '#ECFDF5',
                  borderColor: isDark ? 'rgba(5, 150, 105, 0.4)' : '#A7F3D0',
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 11,
                  gap: 8,
                }}>
                  <MaterialIcons name="verified" size={20} color="#2E5634" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: isDark ? '#34D399' : '#1E3E24' }}>
                      Comprovação aprovada
                    </Text>
                    <Text style={{ fontSize: 11.5, color: isDark ? '#D1FAE5' : '#065F46', lineHeight: 16, marginTop: 2 }}>
                      Sua comprovação de tutor foi verificada. Combine a devolução pelo chat em um ponto público seguro; o endereço residencial continua protegido.
                    </Text>
                  </View>
                </View>
              )}

              {requiresOwnershipProof && verificationState?.status === 'pending' && !isOwner && !isAdmin && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(217, 119, 6, 0.35)' : '#FDE68A',
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 11,
                  gap: 8,
                }}>
                  <MaterialIcons name="hourglass-top" size={20} color="#D97706" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: isDark ? '#FBBF24' : '#B45309' }}>
                      Comprovação em análise
                    </Text>
                    <Text style={{ fontSize: 11.5, color: isDark ? '#FEF3C7' : '#78350F', lineHeight: 16, marginTop: 2 }}>
                      Suas fotos e justificativa foram enviadas para moderação. Se aprovadas, você poderá combinar a devolução pelo chat; o endereço residencial continuará protegido.
                    </Text>
                  </View>
                </View>
              )}

              {requiresOwnershipProof && verificationState?.status === 'rejected' && !isOwner && !isAdmin && (
                <View style={{
                  flexDirection: 'column',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 11,
                  gap: 6,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="error-outline" size={18} color="#DC2626" />
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#DC2626' }}>
                      Comprovação anterior não aprovada
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: isDark ? '#FCA5A5' : '#991B1B', lineHeight: 16 }}>
                    {verificationState?.claim?.rejection_reason || 'A documentação enviada não pôde confirmar a posse do animal. Você pode enviar novas fotos ou documentos tocando abaixo.'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setProofModalVisible(true)}
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: '#DC2626',
                      borderRadius: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      marginTop: 4,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' }}>Enviar nova comprovação</Text>
                  </TouchableOpacity>
                </View>
              )}

              {requiresOwnershipProof && !verificationState?.status && !isOwner && !isAdmin && (
                <View style={{
                  flexDirection: 'column',
                  backgroundColor: isDark ? 'rgba(5, 150, 105, 0.12)' : '#ECFDF5',
                  borderColor: isDark ? 'rgba(5, 150, 105, 0.3)' : '#A7F3D0',
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 8,
                  gap: 5,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <MaterialIcons name="security" size={16} color="#2E5634" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>
                      Comprove que é tutor
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: isDark ? '#D1FAE5' : '#065F46', lineHeight: 14 }}>
                    Envie fotos ou carteirinha para solicitar a devolução.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (!user) {
                        Alert.alert('Login necessário', 'Entre ou crie uma conta para solicitar a comprovação de tutor.', [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
                        ]);
                        return;
                      }
                      setProofModalVisible(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isDark ? 'rgba(5, 150, 105, 0.25)' : '#D1FAE5',
                      borderColor: isDark ? '#2E5634' : '#10B981',
                      borderWidth: 1,
                      borderRadius: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="verified-user" size={15} color={isDark ? '#34D399' : '#065F46'} style={{ marginRight: 5 }} />
                    <Text style={{ color: isDark ? '#34D399' : '#065F46', fontWeight: '800', fontSize: 12 }}>
                      Solicitar devolução
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {!requiresOwnershipProof &&
                verificationState?.status !== 'approved' &&
                !isOwner &&
                !isAdmin && (
                  <View style={{
                    flexDirection: 'column',
                    backgroundColor: isDark ? 'rgba(5, 150, 105, 0.12)' : '#ECFDF5',
                    borderColor: isDark ? 'rgba(5, 150, 105, 0.3)' : '#A7F3D0',
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 11,
                    gap: 8,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="chat" size={18} color="#2E5634" />
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>
                        Comprovação não exigida para conversar
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: isDark ? '#D1FAE5' : '#065F46', lineHeight: 16 }}>
                      O responsável permite iniciar a conversa sem comprovantes. O endereço exato continua protegido; combine a devolução pelo app.
                    </Text>
                    <TouchableOpacity
                      onPress={handleSendMessage}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isDark ? 'rgba(5, 150, 105, 0.25)' : '#D1FAE5',
                        borderColor: isDark ? '#2E5634' : '#10B981',
                        borderWidth: 1,
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 12,
                        marginTop: 2,
                      }}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="chat-bubble-outline" size={17} color={isDark ? '#34D399' : '#065F46'} style={{ marginRight: 6 }} />
                      <Text style={{ color: isDark ? '#34D399' : '#065F46', fontWeight: '800', fontSize: 12.5 }}>
                        Conversar com responsável
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>
          )}

          {/* Situação da pista: só lugares públicos e recentes têm rota */}
          {(() => {
            const routeStatus = getRouteStatus(item);
            const routeInfoText = describeRouteStatus(routeStatus);
            if (!routeInfoText || routeInfoText.tone === 'protected' || routeStatus.reason === 'no_clue') return null;
            const tone = {
              hot: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', icon: 'local-fire-department' },
              warm: { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', icon: 'schedule' },
              cold: { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', icon: 'ac-unit' },
              protected: { bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1', icon: 'lock-outline' },
            }[routeInfoText.tone];
            const canOpenClue = Boolean(routeStatus.area);
            return (
              <TouchableOpacity
                onPress={handleOpenLatestClue}
                disabled={!canOpenClue}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Ver a pista mais recente no mapa"
                style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: tone.bg, borderColor: tone.border, borderWidth: 1, borderRadius: 10, padding: 9, marginTop: 6, marginBottom: 4 }}
              >
                <MaterialIcons name={tone.icon} size={16} color={tone.text} style={{ marginRight: 6, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: tone.text }}>{routeInfoText.title}</Text>
                  <Text style={{ fontSize: 11.5, color: '#475569', lineHeight: 16, marginTop: 1 }}>{routeInfoText.text}</Text>
                  {canOpenClue && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                      <MaterialIcons name="map" size={13} color={tone.text} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: tone.text }}>Ver pista no mapa</Text>
                      <MaterialIcons name="chevron-right" size={15} color={tone.text} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })()}
          {getRouteStatus(item).available && (
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 11,
              paddingHorizontal: 14,
              marginTop: 4,
            }}
            onPress={handleOpenRoute}
            activeOpacity={0.85}
            accessibilityLabel="Ver rota no mapa"
          >
            <MaterialIcons name="directions" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 }}>
              Ver rota até a área
            </Text>
          </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 5. CARD DO TUTOR / QUEM PUBLICOU */}
      {owner && !isAnonymousReport && (
        <>
        <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 24 }]}>
          <TouchableOpacity
            style={styles.ownerHeader}
            disabled={!item.owner_id && !owner.id}
            onPress={() => {
              if (isAnonymousReport) return;
              const targetId = item.owner_id || owner.id;
              if (targetId) {
                navigation.navigate('UserProfile', {
                  userId: targetId,
                  userName: isAnonymousReport ? 'Relato anônimo da comunidade' : ((isOwner && userProfile?.name) ? userProfile.name : (owner.name || 'Usuário')),
                  avatarUrl: isAnonymousReport ? null : ((isOwner ? (userProfile?.avatar_url || userProfile?.avatarUrl) : null) || owner.avatar_url || owner.avatarUrl || null),
                });
              }
            }}
            activeOpacity={0.75}
          >
            {(() => {
              const ownerAvatar = isAnonymousReport ? null : ((isOwner ? (userProfile?.avatar_url || userProfile?.avatarUrl) : null) || owner.avatar_url || owner.avatarUrl || null);
              const ownerDisplayName = isAnonymousReport ? 'Relato anônimo da comunidade' : ((isOwner && userProfile?.name) ? userProfile.name : (owner.name || 'Usuário'));
              const ownerInitial = ownerDisplayName.trim()[0]?.toUpperCase() || 'U';

              if (ownerAvatar) {
                return (
                  <Image source={{ uri: ownerAvatar }} style={styles.ownerAvatarImage} />
                );
              }

              return (
                <View style={[styles.ownerAvatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.ownerAvatarInitial}>{ownerInitial}</Text>
                </View>
              );
            })()}

            <View style={styles.ownerInfoTextContainer}>
              <Text style={[styles.ownerLabel, { color: colors.textMuted }]}>Publicado por</Text>
              <Text style={[styles.ownerName, { color: colors.primary }]} numberOfLines={1}>
                {isAnonymousReport ? 'Relato anônimo da comunidade' : ((isOwner && userProfile?.name) ? userProfile.name : (owner.name || 'Usuário'))}
              </Text>
              {owner.created_at && formatarDataMembro(owner.created_at) && formatarDataMembro(owner.created_at) !== 'não informado' ? (
                <Text style={[styles.ownerMeta, { color: colors.textMuted }]}>
                  Membro desde {formatarDataMembro(owner.created_at)}
                </Text>
              ) : null}
            </View>

            {(item.owner_id || owner.id) && (
              <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} style={{ alignSelf: 'center' }} />
            )}
          </TouchableOpacity>

          {/* Se for terceiro anunciando em nome do tutor */}
          {item.extra_fields?.third_party_owner?.active && item.extra_fields?.third_party_owner?.name ? (
            <View style={styles.thirdPartyOwnerBox}>
              <Text style={styles.thirdPartyOwnerTitle}>
                {item.status === 'lost' ? 'Tutor Oficial do Pet:' : 'Responsável pelo Pet:'}
              </Text>
              <Text style={styles.thirdPartyOwnerName}>{item.extra_fields.third_party_owner.name}</Text>
              {user && item.extra_fields.third_party_owner.phone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${item.extra_fields.third_party_owner.phone}`)}
                  style={styles.thirdPartyPhoneRow}
                >
                  <MaterialIcons name="phone" size={16} color="#15803D" />
                  <Text style={styles.thirdPartyPhoneText}>{item.extra_fields.third_party_owner.phone}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Botão simples para conversar com quem publicou */}
          {!isOwner && (
            <TouchableOpacity
              onPress={handleSendMessage}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem para quem publicou"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                marginTop: 14,
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={19} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                {isAdoption ? 'Quero adotar - enviar mensagem' : 'Enviar mensagem'}
              </Text>
            </TouchableOpacity>
          )}
          </View>

          {/* 6. CORRESPONDÊNCIAS E MATCHES INTELIGENTES */}
          {isOwner && potentialMatches.length > 0 && (
            <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.matchesHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <MaterialIcons name="auto-awesome" size={20} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={[styles.matchesTitle, { color: colors.text }]}>
                      Possíveis correspondências ({potentialMatches.length})
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.openCompareBtn, { backgroundColor: colors.primaryLight }]}
                    onPress={() => {
                      if (!user) {
                        handleLoginRequired('Entre ou crie uma conta para ver e comparar as possíveis correspondências.');
                        return;
                      }
                      setSelectedMatchIndex(0);
                      setMatchModalVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="compare" size={15} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={[styles.openCompareBtnText, { color: colors.primary }]}>Ver lista e comparar</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.matchesSubtitle, { color: colors.textSecondary }]}>
                  {item.status === 'lost'
                    ? 'Animais encontrados na região com alta probabilidade de serem o seu pet:'
                    : 'Animais perdidos registrados na região compatíveis com este relato:'}
                </Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.matchesScrollContent}
              >
                {potentialMatches.map((m, idx) => {
                  const matchBadgeColor = m.match?.badgeColor || '#10B981';
                  const matchScore = m.match?.percentage || 70;

                  return (
                    <TouchableOpacity
                      key={m.id || idx}
                      style={[styles.matchCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: matchBadgeColor }]}
                      onPress={() => {
                        if (!user) {
                          handleLoginRequired('Entre ou crie uma conta para ver e comparar as possíveis correspondências.');
                          return;
                        }
                        setSelectedMatchIndex(idx);
                        setMatchModalVisible(true);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.matchCardImageWrapper}>
                        {m.photoUrl ? (
                          <OptimizedImage uri={m.photoUrl} style={styles.matchCardImage} resizeMode="cover" />
                        ) : (
                          <View style={[styles.matchCardPlaceholder, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                            <MaterialIcons name="pets" size={26} color={colors.primary} />
                          </View>
                        )}
                        <View style={[styles.matchScoreBadge, { backgroundColor: matchBadgeColor }]}>
                          <Text style={styles.matchScoreBadgeText}>{matchScore}% parecido</Text>
                        </View>
                      </View>

                      <Text style={[styles.matchCardTitle, { color: colors.text }]} numberOfLines={1}>
                        {m.animal_name || m.title || 'Animal'}
                      </Text>
                      <Text style={[styles.matchCardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {m.species || 'Pet'} • {m.neighborhood || m.city || ''}
                      </Text>
                      {m.match?.distanceKm != null && (
                        <Text style={[styles.matchCardDistance, { color: colors.primary }]}>
                          {m.match.distanceKm} km de você
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}


          {/* PAINEL DE CONTROLE PARA AUTOR E SUPER ADMIN */}
          {(isOwner || isAdmin) && (
            <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionIconWrap, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <MaterialIcons name="tune" size={19} color={colors.textSecondary} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Ações da publicação</Text>
              </View>
              <View style={styles.ownerActionsGrid}>
              {isAdmin && !isOwner && (
                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: isDark ? '#D97706' : '#FDE68A' }}>
                  <MaterialIcons name="admin-panel-settings" size={16} color="#D97706" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309' }}>
                    Acesso de administrador
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.ownerActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleEditItem}
              >
                <MaterialIcons name="edit" size={17} color={colors.primary} />
                <Text style={[styles.ownerActionText, { color: colors.primary }]}>
                  {isAdmin && !isOwner ? 'Editar (Admin)' : 'Editar'}
                </Text>
              </TouchableOpacity>

              {isOwner && !isAdmin && !isAdoption && !isDirectAdoption && !wasAdopted && (item.status === 'lost' || item.status === 'found') && (
                <TouchableOpacity
                  style={[styles.ownerActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={handleMarkResolved}
                >
                  <MaterialIcons name="celebration" size={17} color={isDark ? '#4ADE80' : '#15803D'} />
                  <Text style={[styles.ownerActionText, { color: isDark ? '#4ADE80' : '#15803D' }]}>Reencontrado!</Text>
                </TouchableOpacity>
              )}

              {isAdmin && (
                <TouchableOpacity
                  style={[styles.ownerActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    Alert.alert(
                      'Alterar situação (administrador)',
                      'Selecione o novo status que deseja aplicar a esta publicação:',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Animal perdido', onPress: () => handleAdminChangeStatus('lost', false) },
                        { text: 'Animal encontrado', onPress: () => handleAdminChangeStatus('found', false) },
                        { text: 'Para adoção', onPress: () => handleAdminChangeStatus('found', true) },
                        { text: 'Reencontrado (encerrado)', onPress: () => handleAdminChangeStatus('resolved', false) },
                      ]
                    );
                  }}
                >
                  <MaterialIcons name="swap-horiz" size={18} color={isDark ? '#FBBF24' : '#B45309'} />
                  <Text style={[styles.ownerActionText, { color: isDark ? '#FBBF24' : '#B45309' }]}>Status</Text>
                </TouchableOpacity>
              )}

              {isOwner && item.status === 'found' && item.extra_fields?.found_custody !== 'spotted' && !isAdmin && !wasAdopted && (
                <TouchableOpacity
                  style={[styles.ownerActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={isAdoption ? handleMarkAdopted : handleToggleAdoption}
                  disabled={togglingAdoption || updatingAdoptionCount}
                >
                  <MaterialIcons
                    name="favorite"
                    size={17}
                    color={isAdoption ? '#DB2777' : isDark ? '#4ADE80' : '#2E5634'}
                  />
                  <Text
                    style={[styles.ownerActionText, { color: isAdoption ? '#DB2777' : isDark ? '#4ADE80' : '#2E5634' }]}
                  >
                    {togglingAdoption || updatingAdoptionCount ? 'Salvando...' : isAdoption ? (adoptionTotalCount > 1 ? 'Todos adotados' : 'Marcar como adotado') : 'P/ Adoção'}
                  </Text>
                </TouchableOpacity>
              )}

              {isOwner && renewalInfo.canRenew && (
                <TouchableOpacity
                  style={[styles.ownerActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={handleRenewItem}
                  disabled={renewing}
                >
                  <MaterialIcons name="refresh" size={17} color={isDark ? '#FBBF24' : '#B45309'} />
                  <Text style={[styles.ownerActionText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    {renewing ? 'Renovando...' : 'Renovar'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.ownerActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleDeleteItem}
                disabled={deleting}
              >
                <MaterialIcons name="delete-outline" size={17} color={isDark ? '#F87171' : '#DC2626'} />
                <Text style={[styles.ownerActionText, { color: isDark ? '#F87171' : '#DC2626' }]}>
                  {deleting ? 'Excluindo...' : (isAdmin && !isOwner ? 'Excluir (Admin)' : 'Excluir')}
                </Text>
              </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {owner && isAnonymousReport && (
        <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 24 }]}>
          <View style={styles.ownerHeader}>
            <View style={[styles.ownerAvatarFallback, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <MaterialIcons name="visibility-off" size={22} color={isDark ? '#CBD5E1' : '#64748B'} />
            </View>
            <View style={styles.ownerInfoTextContainer}>
              <Text style={[styles.ownerLabel, { color: colors.textMuted }]}>Publicado por</Text>
              <Text style={[styles.ownerName, { color: colors.text, lineHeight: 21 }]} numberOfLines={2}>
                Relato anônimo da comunidade
              </Text>
              <Text style={[styles.ownerMeta, { color: colors.textMuted }]}>Perfil protegido pelo autor</Text>
            </View>
          </View>
        </View>
      )}

      {/* 6. COMENTÁRIOS E PISTAS DA COMUNIDADE */}
      {sightings.length > 0 && (
      <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 40 }]}>
        <View style={styles.commentsHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.commentsTitle, { color: colors.text }]}>Pistas e comentários</Text>
            <View style={[styles.commentsCountBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.commentsCountText, { color: colors.primary }]}>{sightings.length}</Text>
            </View>
          </View>

          {!isAnimalInCustody && (
            <TouchableOpacity
              style={[styles.addCommentBtn, { backgroundColor: colors.primary }]}
              onPress={handleReportSighting}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add-comment" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.addCommentBtnText}>
                {item.category === 'animal' || item.item_type === 'animal' ? 'Registrar pista' : 'Comentar'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {sightings.map((s, idx) => {
            let instagram = '', whatsapp = '', facebook = '', contatoExtra = '';
            if (s.contact_info && typeof s.contact_info === 'object') {
              instagram = s.contact_info.instagram || '';
              whatsapp = s.contact_info.whatsapp || '';
              facebook = s.contact_info.facebook || '';
            } else if (typeof s.contact_info === 'string' && s.contact_info.trim() !== '') {
              contatoExtra = s.contact_info;
            }

            const isAuthor = user && s.user_id === user.id;

            return (
              <View
                key={s.id || idx}
                style={[
                  styles.commentBubble,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.commentHeaderRow}>
                  {(() => {
                    const sAvatar = s.profiles?.avatar_url || s.profiles?.avatarUrl || null;
                    const sName = s.profiles?.name || 'Usuário';
                    const sInitial = sName.trim()[0]?.toUpperCase() || 'U';

                    if (sAvatar) {
                      return <Image source={{ uri: sAvatar }} style={styles.commentAvatarImg} />;
                    }
                    return (
                      <View style={[styles.commentAvatarFallback, { backgroundColor: colors.primary }]}>
                        <Text style={styles.commentAvatarInitial}>{sInitial}</Text>
                      </View>
                    );
                  })()}

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.commentAuthorName, { color: colors.text }]}>{s.profiles?.name || 'Usuário'}</Text>
                    <Text style={[styles.commentTimestamp, { color: colors.textMuted }]}>
                      {new Date(s.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  {(isAuthor || isAdmin) && (
                    <View style={styles.commentActionsWrap}>
                      {isAdmin && !isAuthor && (
                        <View style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 4 }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: isDark ? '#FCD34D' : '#B45309' }}>ADMIN</Text>
                        </View>
                      )}
                      <TouchableOpacity onPress={() => handleEditComment(s)} style={{ padding: 4, marginRight: 4 }}>
                        <MaterialIcons name="edit" size={17} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteComment(s)} style={{ padding: 4 }}>
                        <MaterialIcons name="delete-outline" size={17} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <Text style={[styles.commentContentText, { color: colors.text }]}>{s.description}</Text>

                {(() => {
                  const loc = s.location;
                  let displayLoc = null;
                  if (loc) {
                    if (typeof loc === 'object') {
                      displayLoc = loc.address || 'Localização marcada no mapa';
                    } else {
                      const str = String(loc).trim();
                      if (str.startsWith('{') || str.startsWith('[')) {
                        try {
                          const parsed = JSON.parse(str);
                          displayLoc = parsed.address || 'Localização marcada no mapa';
                        } catch {
                          displayLoc = 'Localização marcada no mapa';
                        }
                      } else if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(str)) {
                        displayLoc = 'Localização marcada no mapa';
                      } else {
                        displayLoc = str;
                      }
                    }
                  }

                  if (!displayLoc) return null;

                  let sLat = s.contact_info?.coordinate?.latitude ?? s.contact_info?.location_details?.latitude;
                  let sLng = s.contact_info?.coordinate?.longitude ?? s.contact_info?.location_details?.longitude;

                  const handlePressSightingLocation = async () => {
                    let targetLat = sLat;
                    let targetLng = sLng;

                    if ((targetLat == null || targetLng == null) && displayLoc) {
                      try {
                        const Location = await import('expo-location');
                        const results = await Location.geocodeAsync(displayLoc);
                        if (results && results.length > 0) {
                          targetLat = results[0].latitude;
                          targetLng = results[0].longitude;
                        }
                      } catch {}
                    }

                    if (targetLat != null && targetLng != null) {
                      navigation.navigate('Map', {
                        targetCoords: { latitude: Number(targetLat), longitude: Number(targetLng) },
                        focusItemId: item.id,
                        showRoute: true,
                      });
                    } else {
                      navigation.navigate('Map', {
                        targetCoords: { latitude: Number(item.latitude), longitude: Number(item.longitude) },
                        focusItemId: item.id,
                        showRoute: true,
                      });
                    }
                  };

                  return (
                    <TouchableOpacity
                      style={[
                        styles.commentLocationChip,
                        {
                          backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#F0FDF4',
                          borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
                          borderWidth: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          marginTop: 6,
                        },
                      ]}
                      onPress={handlePressSightingLocation}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="navigation" size={15} color="#16A34A" style={{ marginRight: 6 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                          Local informado • toque para ver a rota
                        </Text>
                        <Text style={[styles.commentLocationText, { color: isDark ? '#34D399' : '#15803D', fontWeight: '700', fontSize: 12 }]} numberOfLines={2}>
                          {displayLoc}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color="#16A34A" />
                    </TouchableOpacity>
                  );
                })()}

                {s.photo_url ? (
                  <Image source={{ uri: s.photo_url }} style={styles.commentAttachedImage} resizeMode="cover" />
                ) : null}

                {(instagram || whatsapp || facebook || contatoExtra) ? (
                  <View style={styles.commentContactsContainer}>
                    {user && whatsapp ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`https://wa.me/55${whatsapp.replace(/\D/g, '')}`)}
                        style={[styles.contactTag, { backgroundColor: '#DCFCE7' }]}
                      >
                        <FontAwesome name="whatsapp" size={14} color="#15803D" style={{ marginRight: 4 }} />
                        <Text style={[styles.contactTagText, { color: '#15803D' }]}>{whatsapp}</Text>
                      </TouchableOpacity>
                    ) : null}

                    {instagram ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`https://instagram.com/${instagram.replace('@', '')}`)}
                        style={[styles.contactTag, { backgroundColor: '#FCE7F3' }]}
                      >
                        <FontAwesome name="instagram" size={14} color="#BE185D" style={{ marginRight: 4 }} />
                        <Text style={[styles.contactTagText, { color: '#BE185D' }]}>@{instagram.replace('@', '')}</Text>
                      </TouchableOpacity>
                    ) : null}

                    {facebook ? (
                      <View style={[styles.contactTag, { backgroundColor: '#DBEAFE' }]}>
                        <FontAwesome name="facebook-square" size={14} color="#1D4ED8" style={{ marginRight: 4 }} />
                        <Text style={[styles.contactTagText, { color: '#1D4ED8' }]}>{facebook}</Text>
                      </View>
                    ) : null}

                    {contatoExtra ? (
                      <View style={[styles.contactTag, { backgroundColor: '#F1F5F9' }]}>
                        <Text style={[styles.contactTagText, { color: colors.textSecondary }]}>{contatoExtra}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
      </View>
      )}

      {/* MODAL DE SIGHTING / PISTAS */}
      <SightingModal
        visible={sightingModalVisible}
        onClose={() => setSightingModalVisible(false)}
        onSubmit={handleSubmitSighting}
        loading={sightingLoading}
      />

      {/* MODAL DE DENÚNCIA */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Denunciar publicação</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Escolha o motivo da denúncia para análise de moderação.
            </Text>
            {['Conteúdo falso ou enganoso', 'Conteúdo inadequado', 'Informações de contato suspeitas', 'Outro'].map(reason => (
              <TouchableOpacity
                key={reason}
                onPress={() => setReportReason(reason)}
                style={styles.radioOptionRow}
              >
                <MaterialIcons
                  name={reportReason === reason ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={reportReason === reason ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.radioOptionText, { color: colors.text }]}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Detalhes adicionais (opcional)"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.modalInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
            />
            <View style={styles.modalActionButtons}>
              <TouchableOpacity onPress={() => setReportModalVisible(false)} style={styles.modalCancelBtn}>
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitReport}
                disabled={reporting}
                style={[styles.modalSubmitBtn, { backgroundColor: '#DC2626' }]}
              >
                <Text style={styles.modalSubmitText}>{reporting ? 'Enviando...' : 'Enviar Denúncia'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE EDIÇÃO DE COMENTÁRIO */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelEditComment}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ width: '100%', maxWidth: 440, alignItems: 'center' }}
            >
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Editar comentário</Text>
                  <TextInput
                    value={editCommentText}
                    onChangeText={setEditCommentText}
                    multiline
                    style={[styles.modalInput, { minHeight: 60, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                    placeholder="Digite seu comentário"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TextInput
                    value={editCommentLocation}
                    onChangeText={setEditCommentLocation}
                    style={[styles.modalInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                    placeholder="Local onde viu o pet (opcional)"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TextInput
                    value={editCommentWhatsapp}
                    onChangeText={t => setEditCommentWhatsapp(t.replace(/[^0-9]/g, ''))}
                    style={[styles.modalInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                    placeholder="WhatsApp para contato (opcional)"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    value={editCommentInstagram}
                    onChangeText={setEditCommentInstagram}
                    style={[styles.modalInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                    placeholder="Instagram (opcional)"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                  <View style={styles.modalActionButtons}>
                    <TouchableOpacity onPress={handleCancelEditComment} style={styles.modalCancelBtn}>
                      <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSaveEditComment} style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}>
                      <Text style={styles.modalSubmitText}>Salvar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL DE FOTO EM TELA CHEIA */}
      <Modal
        visible={fullScreenPhotoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullScreenPhotoModal(false)}
      >
        <View style={styles.fullScreenModalBg}>
          <TouchableOpacity
            onPress={() => setFullScreenPhotoModal(false)}
            style={styles.fullScreenCloseBtn}
          >
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {photos && photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: fullScreenIndex * screenWidth, y: 0 }}
              style={{ width: screenWidth, flex: 1 }}
            >
              {photos.map((photo, idx) => (
                <View key={photo.id || idx} style={{ width: screenWidth, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Image
                    source={{ uri: photo.url }}
                    style={{ width: screenWidth, height: '80%' }}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={showActionMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowActionMenu(false)}>
          <View style={styles.actionSheetOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
                <View style={[styles.actionSheetHandle, { backgroundColor: colors.border }]} />
                <View style={styles.actionSheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionSheetTitle, { color: colors.text }]}>Mais opções</Text>
                    {item?.title ? (
                      <Text style={[styles.actionSheetSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                    ) : (
                      <Text style={[styles.actionSheetSubtitle, { color: colors.textMuted }]}>Escolha uma opção</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowActionMenu(false)}
                    style={[styles.actionSheetClose, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                    accessibilityLabel="Fechar ações"
                  >
                    <MaterialIcons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.sheetAction, { borderBottomColor: colors.border }]}
                  onPress={() => { setShowActionMenu(false); handleSendMessage(); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.sheetActionIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.primary} />
                  </View>
                  <Text style={[styles.sheetActionText, { color: colors.text }]}>Mensagem ao tutor</Text>
                  <MaterialIcons name="chevron-right" size={21} color={colors.textMuted} />
                </TouchableOpacity>

                {APP_FEATURES.fosterVolunteers && user && (item.status === 'lost' || (item.status === 'found' && !isAdoption)) && (
                  <>
                    <TouchableOpacity
                      style={[styles.sheetAction, { borderBottomColor: colors.border }]}
                      onPress={() => { setShowActionMenu(false); navigation.navigate('FosterVolunteers', { city: item.city || item.neighborhood || '', species: item.species || 'all' }); }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.sheetActionIcon, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.18)' : '#ECFDF5' }]}>
                        <MaterialIcons name="groups" size={19} color={colors.primary} />
                      </View>
                      <Text style={[styles.sheetActionText, { color: colors.text }]}>Buscar lar temporário</Text>
                      <MaterialIcons name="chevron-right" size={21} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sheetAction, { borderBottomColor: colors.border }]}
                      onPress={() => { setShowActionMenu(false); handleOfferFoster(); }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.sheetActionIcon, { backgroundColor: isDark ? 'rgba(22, 163, 74, 0.18)' : '#F0FDF4' }]}>
                        <MaterialIcons name="home-work" size={19} color="#16A34A" />
                      </View>
                      <Text style={[styles.sheetActionText, { color: colors.text }]}>Oferecer lar temporário</Text>
                      <MaterialIcons name="chevron-right" size={21} color={colors.textMuted} />
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={styles.sheetAction}
                  onPress={() => { setShowActionMenu(false); handleOpenReport(); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.sheetActionIcon, { backgroundColor: isDark ? 'rgba(220, 38, 38, 0.16)' : '#FEF2F2' }]}>
                    <MaterialIcons name="flag" size={19} color="#DC2626" />
                  </View>
                  <Text style={[styles.sheetActionText, { color: '#DC2626' }]}>Denunciar publicação</Text>
                  <MaterialIcons name="chevron-right" size={21} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL COMPARADOR E LISTA COMPLETA DE MATCHES */}
      <PetMatchModal
        visible={matchModalVisible}
        onClose={() => setMatchModalVisible(false)}
        newItem={item}
        matchedItems={potentialMatches}
        initialIndex={selectedMatchIndex}
        onViewDetails={(targetId) => {
          setMatchModalVisible(false);
          navigation.push('ItemDetail', { itemId: targetId });
        }}
        onStartChat={(otherId, itemId, itemTitle) => {
          if (!user) {
            setMatchModalVisible(false);
            handleLoginRequired('Entre ou crie uma conta para conversar com o responsável.');
            return;
          }
          setMatchModalVisible(false);
          navigation.navigate('ChatScreen', { conversation: { otherId, itemId, itemTitle } });
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  detailPage: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  errorText: { marginTop: 12, fontSize: 16, fontWeight: 'bold' },
  navBackBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 12, marginRight: 8, borderRadius: 19, backgroundColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.28)' },

  // Hero Section
  heroContainer: { position: 'relative', width: '100%', height: 260, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  heroImageItem: { width: '100%', height: 260 },
  noPhotoHero: { width: '100%', height: 260, justifyContent: 'center', alignItems: 'center' },
  noPhotoText: { marginTop: 8, fontSize: 14, fontWeight: '600' },
  photoCountBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(0, 0, 0, 0.65)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  photoCountText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  zoomButton: { position: 'absolute', bottom: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0, 0, 0, 0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  paginationRow: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, zIndex: 10 },
  paginationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  paginationDotActive: { width: 20, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  floatingShareBtn: { position: 'absolute', top: 16, right: 16, zIndex: 12 },

  // Card Section Container
  cardSection: { marginHorizontal: 8, marginTop: 4, borderRadius: 10, padding: 8, borderWidth: 1 },

  // Status and Title
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  lostPill: { backgroundColor: '#FFEDD5' },
  foundPill: { backgroundColor: '#DCFCE7' },
  adoptionPill: { backgroundColor: '#FCE7F3' },
  statusPillText: { fontSize: 13, fontWeight: '800' },
  petMainTitle: { fontSize: 21, fontWeight: '900', lineHeight: 25, marginBottom: 5, letterSpacing: -0.3 },

  // Attribute Chips Grid
  attributeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 2, marginBottom: 3 },
  attrChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6, borderWidth: 1, width: '32%' },
  attrChipEmoji: { fontSize: 18, width: 24, textAlign: 'center', marginRight: 8 },
  attrChipTextWrap: { flex: 1 },
  attrChipLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.1 },
  attrChipValue: { fontSize: 11, fontWeight: '700' },

  // Description Block
  descriptionBlock: { borderRadius: 11, padding: 11, borderWidth: 1, marginTop: 3 },
  adoptionExtraText: { fontSize: 12, lineHeight: 18 },
  sectionSubtitle: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  descriptionText: { fontSize: 14.5, lineHeight: 21 },

  // Reward Banner
  rewardBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#FDE68A' },
  rewardIconBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FDE68A', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rewardTitle: { fontSize: 13, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.3 },
  rewardAmount: { fontSize: 16, fontWeight: '800', color: '#B45309', marginTop: 2 },

  // Adoption & Custody Notice Cards (Modern & Sleek Accordion)
  adoptionQuantityCard: {
    marginHorizontal: 10,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adoptionQuantityLabel: { fontSize: 13, fontWeight: '700', flex: 1 },
  adoptionQuantityControls: { flexDirection: 'row', gap: 8 },
  adoptionQuantityButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Location Card
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sectionIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  locationBody: { paddingLeft: 4 },
  locationCityText: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  locationStreetText: { fontSize: 13.5, lineHeight: 18, marginTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, paddingTop: 5, borderTopWidth: 1 },
  dateLabel: { fontSize: 14 },
  dateValue: { fontWeight: '700' },

  // Owner Card
  ownerHeader: { flexDirection: 'row', alignItems: 'center' },
  ownerAvatarImage: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: COLORS.primaryLight },
  ownerAvatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  ownerAvatarInitial: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  ownerInfoTextContainer: { flex: 1 },
  ownerLabel: { fontSize: 11, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.3 },
  ownerName: { fontSize: 15.5, fontWeight: '800', marginTop: 1 },
  ownerMeta: { fontSize: 12, marginTop: 2 },

  // Third Party Owner
  thirdPartyOwnerBox: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#BBF7D0' },
  thirdPartyOwnerTitle: { fontSize: 12, fontWeight: '700', color: '#166534' },
  thirdPartyOwnerName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  thirdPartyPhoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  thirdPartyPhoneText: { fontSize: 14, fontWeight: '700', color: '#15803D' },

  // Action CTAs
  visitorActionsBlock: { marginHorizontal: 8, marginTop: 6, padding: 7, borderRadius: 11, borderWidth: 1, alignItems: 'flex-start' },
  moreInfoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 34, borderRadius: 9, borderWidth: 1, paddingHorizontal: 8, marginTop: 6 },
  moreInfoButtonText: { flex: 1, marginLeft: 6, fontSize: 12.5, fontWeight: '800' },
  actionMenuToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1 },
  actionMenuToggleText: { marginHorizontal: 7, fontSize: 12.5, fontWeight: '800' },
  actionSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  actionSheet: { width: '100%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 9, paddingBottom: 28 },
  actionSheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 16 },
  actionSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  actionSheetTitle: { fontSize: 16, fontWeight: '800' },
  actionSheetSubtitle: { fontSize: 12, marginTop: 2 },
  actionSheetClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetAction: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderBottomWidth: 1 },
  sheetActionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  sheetActionText: { flex: 1, fontSize: 13.5, fontWeight: '700' },

  ownerActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerActionBtn: { flex: 1, minWidth: '45%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, gap: 7 },
  ownerActionText: { fontSize: 13, fontWeight: '700' },

  // Comments Section
  commentsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  commentsTitle: { fontSize: 16, fontWeight: '800' },
  commentsCountBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6 },
  commentsCountText: { fontSize: 12, fontWeight: '800' },
  addCommentBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addCommentBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  emptyCommentsBox: { alignItems: 'center', paddingVertical: 20 },
  emptyCommentsText: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  emptyCommentsSub: { fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },

  // Comment Bubble
  commentBubble: { borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1 },
  commentHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  commentAvatarImg: { width: 34, height: 34, borderRadius: 17, marginRight: 8, backgroundColor: COLORS.primaryLight },
  commentAvatarFallback: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  commentAvatarInitial: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  commentAuthorName: { fontSize: 13.5, fontWeight: '700' },
  commentTimestamp: { fontSize: 11 },
  commentActionsWrap: { flexDirection: 'row', alignItems: 'center' },
  commentContentText: { fontSize: 13.5, lineHeight: 19 },
  commentLocationChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6, alignSelf: 'flex-start' },
  commentLocationText: { fontSize: 12, fontWeight: '700' },
  commentAttachedImage: { width: '100%', height: 140, borderRadius: 10, marginTop: 8 },
  commentContactsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  contactTag: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  contactTagText: { fontSize: 11.5, fontWeight: '700' },
  reportPublicationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 2,
  },
  reportPublicationText: { fontSize: 11.5, fontWeight: '500' },
  reportPublicationFooter: {
    alignItems: 'flex-end',
    marginTop: 12,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { borderRadius: 12, padding: 20, width: '100%', maxWidth: 440 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 14 },
  radioOptionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  radioOptionText: { fontSize: 14, marginLeft: 8, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10 },
  modalActionButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  modalCancelBtn: { paddingVertical: 9, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 14, fontWeight: '700' },
  modalSubmitBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  modalSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Matches Section
  matchesHeader: { marginBottom: 10 },
  matchesTitle: { fontSize: 15, fontWeight: '800' },
  matchesSubtitle: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  openCompareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  openCompareBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  matchesScrollContent: { paddingVertical: 4, gap: 10 },
  matchCard: { width: 140, borderRadius: 12, borderWidth: 1.5, padding: 8, alignItems: 'center' },
  matchCardImageWrapper: { width: '100%', height: 95, borderRadius: 10, overflow: 'hidden', position: 'relative', marginBottom: 6 },
  matchCardImage: { width: '100%', height: '100%' },
  matchCardPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  matchScoreBadge: { position: 'absolute', bottom: 4, left: 4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  matchScoreBadgeText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.3 },
  matchCardTitle: { fontSize: 12.5, fontWeight: '800', textAlign: 'center', width: '100%' },
  matchCardSub: { fontSize: 10.5, textAlign: 'center', marginTop: 1, width: '100%' },
  matchCardDistance: { fontSize: 10, fontWeight: '700', marginTop: 3 },

  // Full Screen Photo Modal
  fullScreenModalBg: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  fullScreenCloseBtn: { position: 'absolute', top: 48, right: 20, zIndex: 20, backgroundColor: 'rgba(255, 255, 255, 0.25)', borderRadius: 20, padding: 8 },
});

export default ItemDetailScreen;
