import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  Keyboard,
  Platform,
  Animated,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMessages, sendMessage, markMessagesAsRead, markConversationMessagesAsRead, uploadMessagePhoto, getOrCreateConversation, closeConversation } from '../services/messages';
import { submitOwnershipProof, getVerificationStatus } from '../services/proofVerification';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import COLORS from '../constants/theme';
import { getPrivateLocationSummary, isResidentialAddressPrivate } from '../utils/locationPrivacy';

const ChatScreen = (props) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const conversation = route.params?.conversation;
  const highlightMessageId = route.params?.highlightMessageId;
  const draftMessage = route.params?.draftMessage;
  const initialMessage = conversation?.initialMessage || '';

  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState(draftMessage || initialMessage || '');

  const [petTitle, setPetTitle] = useState(conversation?.itemTitle || '');
  const [otherName, setOtherName] = useState(conversation?.otherName || '');
  const [avatarUrl, setAvatarUrl] = useState(conversation?.avatarUrl || null);
  const [itemData, setItemData] = useState(null);
  const [isItemDeleted, setIsItemDeleted] = useState(Boolean(conversation?.isItemDeleted));
  const otherDeleted = Boolean(conversation?.otherDeleted);
  const [conversationState, setConversationState] = useState({
    id: conversation?.conversationId || null,
    status: conversation?.status || 'ativa',
  });

  const [sending, setSending] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Estados para a comprovação inicial de posse em pets encontrados
  const [proofText, setProofText] = useState('');
  const [proofPhoto, setProofPhoto] = useState(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);

  // Estados para o Resgatista compartilhar o local de entrega / encontro
  const [showShareLocationModal, setShowShareLocationModal] = useState(false);
  const [locationType, setLocationType] = useState('registered'); // 'registered' | 'safe_point'
  const [customSafeAddress, setCustomSafeAddress] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [sharingLocation, setSharingLocation] = useState(false);

  const flatListRef = useRef(null);

  const otherId = conversation?.otherId;
  const itemId = conversation?.itemId;
  const conversationId = conversation?.conversationId || conversationState.id;

  // Controlador de elevação animada do teclado (100% imune a bugs de Edge-to-Edge / Android)
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const onKeyboardShow = (e) => {
      setIsKeyboardOpen(true);
      const rawHeight = e?.endCoordinates?.height || 0;
      const extraOffset = Platform.OS === 'android' ? Math.max(insets.bottom, 32) : 0;
      const targetHeight = rawHeight + extraOffset;

      Animated.timing(keyboardHeightAnim, {
        toValue: targetHeight,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 100,
        useNativeDriver: false,
      }).start();

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    };

    const onKeyboardHide = (e) => {
      setIsKeyboardOpen(false);
      Animated.timing(keyboardHeightAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 200) : 100,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onKeyboardShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onKeyboardHide
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (!user?.id || (!otherId && !otherDeleted)) {
      setLoading(false);
      return;
    }
    const cacheKey = `@wefind_chat_cache_${user.id}_${otherId || conversationId}_${itemId || 'all'}`;

    const load = async () => {
      if (!otherDeleted) {
        try {
          const persistedConversation = await getOrCreateConversation(user.id, otherId, itemId);
          setConversationState(persistedConversation);
        } catch (conversationError) {
          console.error('[ChatScreen] Erro ao carregar conversa:', conversationError);
        }
      }

      // 1. Tenta carregar do cache local imediatamente para abrir em 0ms
      try {
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            setLoading(false);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 30);
          }
        }
      } catch (e) {}

      // 2. Busca mensagens do servidor em paralelo
      try {
        const [msgs] = await Promise.all([
          getMessages(
            user.id,
            otherId,
            otherDeleted ? { conversationId, limit: 120 } : itemId || 50,
          ),
          (otherDeleted
            ? markConversationMessagesAsRead(user.id, conversationId)
            : markMessagesAsRead(user.id, otherId)
          ).catch((readError) => {
            console.warn('[ChatScreen] Não foi possível marcar as mensagens como lidas:', readError.message);
          }),
        ]);

        if (Array.isArray(msgs)) {
          setMessages(msgs);
          AsyncStorage.setItem(cacheKey, JSON.stringify(msgs.slice(-50))).catch(() => {});
        }

        if (otherId && (!conversation?.otherName || !conversation?.avatarUrl)) {
          supabase
            .from('profiles')
            .select('name, avatar_url')
            .eq('id', otherId)
            .single()
            .then(({ data: profile }) => {
              if (profile) {
                if (profile.name) setOtherName(profile.name);
                if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
              }
            }).catch(() => {});
        }

        if (itemId) {
          supabase
            .from('items')
            .select('id, title, status, owner_id, species, city, state, neighborhood, street, house_number, latitude, longitude, extra_fields')
            .eq('id', itemId)
            .maybeSingle()
            .then(({ data: iData }) => {
              if (iData) {
                setItemData(iData);
                if (iData.title) setPetTitle(iData.title);
                setIsItemDeleted(false);
              } else {
                setIsItemDeleted(true);
              }
            }).catch(() => {
              setIsItemDeleted(true);
            });
        }
      } catch (err) {
        console.log('[ChatScreen] Erro ao carregar mensagens:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, otherId, itemId, otherDeleted, conversationId]);

  // Identifica papéis na conversa
  const isFoundPet = !isItemDeleted && (itemData?.status === 'found' || conversation?.itemStatus === 'found');
  const isAdoptionItem = Boolean(itemData?.extra_fields?.is_direct_adoption);
  const isPrivateResidentialLocation = isResidentialAddressPrivate(itemData) || isItemDeleted;
  const requiresOwnershipProof = Boolean(
    isFoundPet &&
    !isAdoptionItem &&
    itemData?.extra_fields?.requires_ownership_proof !== false
  );
  const isMeFinder = itemData ? itemData.owner_id === user?.id : conversation?.itemOwnerId === user?.id;
  const hasUserSentMessage = messages.some(m => m.sender_id === user?.id);

  useEffect(() => {
    if (!itemId || !user?.id || isMeFinder || !requiresOwnershipProof) return;
    getVerificationStatus(itemId, user.id)
      .then((result) => setVerificationStatus(result?.status || null))
      .catch((statusError) => console.warn('[ChatScreen] Erro ao carregar comprovação:', statusError.message));
  }, [itemId, user?.id, isMeFinder, requiresOwnershipProof]);

  const refreshVerificationStatus = async () => {
    if (!itemId || !user?.id || isMeFinder || !requiresOwnershipProof) return;
    const result = await getVerificationStatus(itemId, user.id);
    setVerificationStatus(result?.status || null);
  };

  useEffect(() => {
    if (!itemId || !user?.id || isMeFinder || !requiresOwnershipProof || verificationStatus !== 'pending') return;
    const interval = setInterval(() => {
      refreshVerificationStatus().catch((statusError) => {
        console.warn('[ChatScreen] Erro ao atualizar status da comprovação:', statusError.message);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [itemId, user?.id, isMeFinder, requiresOwnershipProof, verificationStatus]);

  // Quando exigida, a comprovação precisa ser aprovada antes da liberação do chat.
  const requiresInitialProof = Boolean(
    !otherDeleted &&
    itemId &&
    !isItemDeleted &&
    requiresOwnershipProof &&
    !isMeFinder &&
    verificationStatus !== 'approved' &&
    !loading
  );
  const verificationPending = requiresOwnershipProof && verificationStatus === 'pending';

  // Resgatista pode confirmar o tutor e liberar o local de retirada
  const canShareLocation = Boolean(itemId && !isItemDeleted && isFoundPet && isMeFinder);

  // Endereço cadastrado do item
  const registeredStreet = itemData?.extra_fields?.location_details?.street || itemData?.street || '';
  const registeredNumber = itemData?.extra_fields?.location_details?.number || itemData?.house_number || '';
  const registeredDistrict = itemData?.extra_fields?.location_details?.district || itemData?.neighborhood || '';
  const registeredCity = itemData?.extra_fields?.location_details?.city || itemData?.city || '';
  const registeredState = itemData?.extra_fields?.location_details?.state || itemData?.state || '';

  const registeredAddressText = isPrivateResidentialLocation
    ? getPrivateLocationSummary(itemData)
    : [
        [registeredStreet, registeredNumber ? `Nº ${registeredNumber}` : ''].filter(Boolean).join(', '),
        registeredDistrict,
        [registeredCity, registeredState].filter(Boolean).join(' - '),
      ].filter(Boolean).join(', ') || itemData?.address || 'Endereço cadastrado no WeFIND';

  const itemLatitude = itemData?.latitude ?? itemData?.extra_fields?.location_details?.latitude ?? itemData?.extra_fields?.latitude;
  const itemLongitude = itemData?.longitude ?? itemData?.extra_fields?.location_details?.longitude ?? itemData?.extra_fields?.longitude;

  useEffect(() => {
    if (!user?.id || !otherId || otherDeleted) return;

    const channelName = `chat-room-${[user.id, otherId].sort().join('-')}-${itemId || 'general'}`;
    const channel = supabase.channel(channelName);

    const cleanupChannel = () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('Erro ao remover canal:', e);
      }
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${otherId}`,
        },
        (payload) => {
          const msg = payload.new;
          if (msg.receiver_id === user.id) {
            setMessages((prev) => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
            });
            markMessagesAsRead(user.id, otherId);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new;
          if (msg.receiver_id === otherId) {
            setMessages((prev) => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
            });
          }
        }
      )
      .subscribe();

    return cleanupChannel;
  }, [user?.id, otherId, itemId, otherDeleted]);

  const handlePickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Permissão necessária para acessar suas fotos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setSelectedPhoto(result.assets[0]);
        setPhotoPreview(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[ChatScreen] Erro ao selecionar foto:', e);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
  };

  // Seletor de foto para comprovação inicial de posse
  const handlePickProofPhoto = async (source = 'gallery') => {
    try {
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão necessária', 'Permita o acesso à câmera para fotografar o pet ou documento.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.7,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão necessária', 'Permita o acesso à galeria para selecionar fotos.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.7,
        });
      }

      if (!result.canceled && result.assets?.[0]?.uri) {
        setProofPhoto(result.assets[0]);
      }
    } catch (e) {
      console.error('[ChatScreen] Erro ao selecionar foto de comprovação:', e);
    }
  };

  // Envio da comprovação inicial pelo tutor
  const handleSubmitProof = async () => {
    if (!proofText.trim() && !proofPhoto) {
      Alert.alert(
        'Comprovação Necessária',
        'Por favor, descreva ao menos uma característica marcante do pet ou anexe uma foto para comprovar a posse antes de enviar.'
      );
      return;
    }

    setSubmittingProof(true);
    try {
      let photoUrl = null;
      if (proofPhoto) {
        photoUrl = await uploadMessagePhoto(Date.now(), proofPhoto.uri);
      }

      const formattedContent = `🛡️ [COMPROVAÇÃO DE TUTOR]\n${proofText.trim() || 'Foto de comprovação anexada.'}`;

      const sentMsg = await sendMessage({
        sender_id: user.id,
        receiver_id: otherId,
        item_id: itemId,
        content: formattedContent,
        photo_url: photoUrl,
      });

      // Também registra no sistema de comprovação oficial em background para o administrador/resgatista
      if (itemId) {
        submitOwnershipProof({
          itemId,
          claimantId: user.id,
          proofPhotos: proofPhoto ? [proofPhoto] : [],
          message: proofText.trim() || 'Comprovação enviada via Chat.',
          itemTitle: petTitle || 'o pet',
          finderId: otherId,
          sendDirectMessage: false,
        }).catch((err) => console.log('[ChatScreen] Erro no submitOwnershipProof background:', err));
      }

      setMessages((prev) => {
        if (!sentMsg || !sentMsg.id) return prev;
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [...prev, sentMsg].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
      });

      setProofText('');
      setProofPhoto(null);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      setVerificationStatus('pending');
      Alert.alert('Solicitação enviada! 🛡️', 'Sua comprovação foi enviada ao dono da publicação. O chat será liberado assim que ele aprovar a devolução.');
    } catch (err) {
      Alert.alert('Erro ao enviar comprovação', err.message || 'Tente novamente.');
    } finally {
      setSubmittingProof(false);
    }
  };

  // Envio da Confirmação & Local de Retirada pelo Resgatista
  const handleConfirmShareLocation = async () => {
    setSharingLocation(true);
    try {
      if (isPrivateResidentialLocation && locationType !== 'safe_point') {
        Alert.alert('Ponto seguro obrigatório', 'Para proteger o endereço residencial, escolha um ponto público de encontro.');
        return;
      }

      const finalAddress = locationType === 'registered' ? registeredAddressText : customSafeAddress.trim();
      if (!finalAddress) {
        Alert.alert('Endereço Obrigatório', 'Por favor, informe o local de encontro ou selecione o endereço cadastrado.');
        return;
      }

      const instructions = pickupInstructions.trim() ? `\n📝 Orientações: ${pickupInstructions.trim()}` : '';
      const coordsPart = !isPrivateResidentialLocation && itemLatitude && itemLongitude
        ? `\n🗺️ Coordenadas: lat=${itemLatitude},lng=${itemLongitude}`
        : '';
      const safePointMarker = locationType === 'safe_point' ? '\n[PONTO_SEGURO_PUBLICO]' : '';
      const content = `📍 [LOCAL DE RETIRADA LIBERADO]${safePointMarker}\n🏠 Local de Entrega: ${finalAddress}${instructions}${coordsPart}`;

      const sentMsg = await sendMessage({
        sender_id: user.id,
        receiver_id: otherId,
        item_id: itemId,
        content,
      });

      // Libera oficialmente no cache de verificação do usuário requerente
      if (itemId && otherId) {
        AsyncStorage.setItem(
          `@wefind_proof_verification_${itemId}_${otherId}`,
          JSON.stringify({ status: 'approved', approvedAt: new Date().toISOString() })
        ).catch(() => {});
      }

      setMessages((prev) => {
        if (!sentMsg || !sentMsg.id) return prev;
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [...prev, sentMsg].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
      });

      setShowShareLocationModal(false);
      setCustomSafeAddress('');
      setPickupInstructions('');
      Alert.alert(
        'Local Enviado! 🎉',
        isPrivateResidentialLocation
          ? 'O ponto público de encontro foi compartilhado no chat. O endereço residencial e suas coordenadas permanecem protegidos.'
          : 'O endereço de retirada foi compartilhado no chat e o traçado de rota GPS foi liberado para o tutor.'
      );
    } catch (err) {
      Alert.alert('Erro ao compartilhar local', err.message || 'Tente novamente.');
    } finally {
      setSharingLocation(false);
    }
  };

  // Navegar para o mapa com a rota GPS traçada
  const handleNavigateToRoute = (targetCoords) => {
    try {
      navigation.navigate('MainApp', {
        screen: 'MapTab',
        params: {
          focusItemId: itemId,
          showRoute: true,
          targetCoords: targetCoords ? { latitude: Number(targetCoords.latitude), longitude: Number(targetCoords.longitude) } : undefined,
        },
      });
    } catch (e) {
      navigation.navigate('Map', {
        focusItemId: itemId,
        showRoute: true,
        targetCoords: targetCoords ? { latitude: Number(targetCoords.latitude), longitude: Number(targetCoords.longitude) } : undefined,
      });
    }
  };

  const handleSend = async () => {
    if (otherDeleted || !otherId) return;
    if (conversationState.status === 'encerrada') {
      setError('Esta conversa foi encerrada e não aceita novas mensagens.');
      return;
    }
    if ((!input.trim() && !selectedPhoto) || sending) return;
    setSending(true);
    try {
      let photoUrl = null;
      if (selectedPhoto) {
        photoUrl = await uploadMessagePhoto(Date.now(), selectedPhoto.uri);
      }
      const sentMsg = await sendMessage({
        sender_id: user.id,
        receiver_id: otherId,
        item_id: itemId,
        content: input.trim(),
        photo_url: photoUrl,
      });
      setMessages((prev) => {
        if (!sentMsg || !sentMsg.id) return prev;
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [...prev, sentMsg].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
      });
      setInput('');
      setSelectedPhoto(null);
      setPhotoPreview(null);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setError(err.message || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleCloseConversation = () => {
    Alert.alert('Encerrar conversa', 'O histórico será mantido, mas vocês não poderão enviar novas mensagens.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Encerrar',
        style: 'destructive',
        onPress: async () => {
          try {
            const closed = await closeConversation(conversationState.id);
            setConversationState(closed);
          } catch (closeError) {
            Alert.alert('Erro', closeError.message || 'Não foi possível encerrar a conversa.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const isMe = item.sender_id === user.id;
    const senderDeleted = Boolean(item.sender_deleted);
    const isHighlight = highlightMessageId && item.id === highlightMessageId;
    const isProofMsg = typeof item.content === 'string' && item.content.includes('[COMPROVAÇÃO DE TUTOR]');
    const isLocationReleaseMsg = typeof item.content === 'string' && item.content.includes('[LOCAL DE RETIRADA LIBERADO]');

    // Extrai coordenadas e dados do card de localização caso presentes
    let parsedCoords = null;
    let displayAddress = '';
    let displayInstructions = '';

    if (isLocationReleaseMsg) {
      const isPublicSafePointMsg = item.content.includes('[PONTO_SEGURO_PUBLICO]');
      if (isPrivateResidentialLocation && !isPublicSafePointMsg) {
        displayAddress = getPrivateLocationSummary(itemData);
      } else {
        if (!isPrivateResidentialLocation) {
          const matchLat = item.content.match(/lat=([^,\n]+)/);
          const matchLng = item.content.match(/lng=([^,\n]+)/);
          if (matchLat && matchLng) {
            parsedCoords = {
              latitude: parseFloat(matchLat[1]),
              longitude: parseFloat(matchLng[1]),
            };
          } else if (itemLatitude && itemLongitude) {
            parsedCoords = {
              latitude: parseFloat(itemLatitude),
              longitude: parseFloat(itemLongitude),
            };
          }
        }

        const matchAddress = item.content.match(/🏠 Local de Entrega:\s*([^\n]+)/);
        if (matchAddress) displayAddress = matchAddress[1].trim();

        const matchInst = item.content.match(/📝 Orientações:\s*([^\n]+)/);
        if (matchInst) displayInstructions = matchInst[1].trim();
      }
    }

    return (
      <View style={[styles.messageRow, isMe ? styles.myMessage : styles.otherMessage]}>
        <View
          style={[
            styles.messageCard,
            isMe
              ? { backgroundColor: colors.primary, borderColor: colors.primary, borderBottomRightRadius: 4 }
              : { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: 4 },
            isProofMsg && { borderWidth: 1.5, borderColor: isMe ? '#A7F3D0' : '#10B981' },
            isLocationReleaseMsg && { borderWidth: 1.5, borderColor: '#10B981', backgroundColor: isDark ? '#064E3B' : '#ECFDF5' },
            isHighlight && { borderWidth: 2, borderColor: '#F59E0B' },
          ]}
        >
          {senderDeleted && (
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700', marginBottom: 4 }}>
              Conta excluída
            </Text>
          )}
          {isProofMsg && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 }}>
              <MaterialIcons name="verified" size={14} color={isMe ? '#FFFFFF' : '#10B981'} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: isMe ? '#FFFFFF' : '#10B981' }}>
                IDENTIFICAÇÃO DE TUTOR
              </Text>
            </View>
          )}

          {isLocationReleaseMsg && (
            <View style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 }}>
                <MaterialIcons name="verified-user" size={16} color="#2E5634" />
                <Text style={{ fontSize: 11.5, fontWeight: '900', color: '#2E5634', letterSpacing: 0.3 }}>
                  {isPrivateResidentialLocation ? 'PONTO DE ENCONTRO' : 'LOCAL DE RETIRADA CONFIRMADO'}
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: isDark ? '#ECFDF5' : '#065F46', marginBottom: 2 }}>
                📍 {displayAddress || 'Ponto de Retirada'}
              </Text>
              {displayInstructions ? (
                <Text style={{ fontSize: 12, color: isDark ? '#A7F3D0' : '#1E3E24', marginBottom: 8 }}>
                  📝 {displayInstructions}
                </Text>
              ) : null}

              {/* Botão de Traçar Rota GPS */}
              {!isPrivateResidentialLocation && (
                <TouchableOpacity
                  style={styles.mapRouteCtaBtn}
                  onPress={() => handleNavigateToRoute(parsedCoords)}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="directions-car" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.mapRouteCtaBtnText}>Traçar Rota GPS até o Pet</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.messageImage} />
          ) : null}

          {!isLocationReleaseMsg && item.content ? (
            <Text style={[styles.messageText, { color: isMe ? '#FFFFFF' : colors.text }]}>
              {item.content}
            </Text>
          ) : null}

          <Text
            style={[
              styles.messageMeta,
              { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textMuted, textAlign: isMe ? 'right' : 'left' },
            ]}
          >
            {item.sent_at
              ? new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </Text>
        </View>
      </View>
    );
  };

  if (error) return <Text style={[styles.error, { backgroundColor: colors.background }]}>{error}</Text>;

  return (
    <Animated.View style={[styles.mainWrapper, { paddingBottom: keyboardHeightAnim, backgroundColor: colors.background }]}>
      {/* Header Personalizado: Voltar + Foto do Usuário + Nome (Clicável para abrir perfil) */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={[styles.chatHeader, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('MainApp');
              }
            }}
            style={styles.headerBackBtn}
            accessibilityLabel="Voltar"
            activeOpacity={0.75}
          >
            <MaterialIcons name="chevron-left" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => {
              if (otherId) {
                navigation.navigate('UserProfile', {
                  userId: otherId,
                  userName: otherName,
                  avatarUrl: avatarUrl,
                });
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.chatAvatar}>
              <Image
                source={avatarUrl ? { uri: avatarUrl } : require('../../assets/logo.png')}
                style={styles.chatAvatarImage}
              />
            </View>

            <View style={styles.chatHeaderContent}>
              <Text style={[styles.chatHeaderName, { color: colors.headerText }]} numberOfLines={1}>
                {otherName || 'Usuário'}
              </Text>
              {petTitle || isItemDeleted ? (
                <Text style={[styles.chatHeaderPet, { color: isItemDeleted ? (isDark ? '#FCA5A5' : '#DC2626') : colors.headerSubText }]} numberOfLines={1}>
                  Pet: {petTitle || 'Animal'} {isItemDeleted ? '(Publicação Excluída)' : ''}
                </Text>
              ) : null}
            </View>

            <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.7)" style={{ marginRight: 4 }} />
          </TouchableOpacity>
          {conversationState.status === 'ativa' && conversationState.id ? (
            <TouchableOpacity
              onPress={handleCloseConversation}
              style={styles.headerBackBtn}
              accessibilityLabel="Encerrar conversa"
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>

      {conversationState.status === 'encerrada' && (
        <View style={{ padding: 10, margin: 12, borderRadius: 8, backgroundColor: isDark ? '#3F1D1D' : '#FEF2F2' }}>
          <Text style={{ color: isDark ? '#FCA5A5' : '#991B1B', textAlign: 'center' }}>
            Esta conversa foi encerrada. O histórico continua disponível para consulta.
          </Text>
        </View>
      )}

      {/* Banner Informativo de Publicação Excluída/Encerrada */}
      {isItemDeleted && (
        <View style={{
          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
          borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
          borderWidth: 1,
          borderRadius: 10,
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginHorizontal: 12,
          marginTop: 8,
          marginBottom: 4,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
          <MaterialIcons name="info-outline" size={20} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, flex: 1, fontWeight: '600', lineHeight: 16 }}>
            Esta publicação não existe mais (foi encerrada ou excluída pelo autor). As mensagens e o histórico continuam disponíveis para consulta.
          </Text>
        </View>
      )}

      {/* Banner de Ação para o Resgatista: Compartilhar Localização */}
      {canShareLocation && (
        <View style={[styles.finderActionBar, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: '#A7F3D0' }]}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#D1FAE5' : '#065F46' }}>
              {isPrivateResidentialLocation ? 'Combinar Ponto Público Seguro' : 'Confirmar Tutor e Liberar Rota'}
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#A7F3D0' : '#1E3E24' }}>
              {isPrivateResidentialLocation
                ? 'Não compartilhe o endereço de casa; combine em local público.'
                : 'Se as fotos/marcas baterem, compartilhe o local de retirada:'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              setLocationType(isPrivateResidentialLocation ? 'safe_point' : 'registered');
              setShowShareLocationModal(true);
            }}
            style={styles.finderShareBtn}
            activeOpacity={0.85}
          >
            <MaterialIcons name="share-location" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.finderShareBtnText}>Liberar Local</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Banner de Segurança & Comprovação de Posse (para visitante) */}
      {!canShareLocation && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5',
          borderBottomWidth: 1,
          borderColor: isDark ? 'rgba(5, 150, 105, 0.3)' : '#A7F3D0',
          paddingHorizontal: 14,
          paddingVertical: 7,
          gap: 8,
        }}>
          <MaterialIcons name="security" size={17} color="#2E5634" />
          <Text style={{ flex: 1, fontSize: 11.5, color: isDark ? '#D1FAE5' : '#065F46', lineHeight: 15 }}>
            <Text style={{ fontWeight: '800' }}>Dica de Segurança:</Text>{' '}
            {verificationPending
              ? 'Sua solicitação está em análise. O chat será liberado assim que o dono da publicação aprovar a devolução.'
              : isFoundPet && !requiresOwnershipProof
                ? 'O autor do anúncio não exige comprovação para iniciar a conversa. Combine a devolução pelo app e mantenha seus dados pessoais protegidos.'
                : 'Só combine locais de entrega após o tutor apresentar fotos antigas ou características que comprovem que é o dono.'}
          </Text>
        </View>
      )}

      {/* Lista de Mensagens */}
      <FlatList
        ref={flatListRef}
        data={messages}
        extraData={messages}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        ListHeaderComponent={verificationPending ? (
          <View style={[styles.proofCard, { backgroundColor: colors.surface, borderColor: '#FDE68A', marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="hourglass-top" size={20} color="#D97706" />
              <Text style={{ color: isDark ? '#FBBF24' : '#B45309', fontWeight: '800', fontSize: 14 }}>
                Solicitação enviada e em análise
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
              O dono da publicação precisa revisar sua comprovação. Assim que ele aceitar a devolução, este chat será liberado automaticamente.
            </Text>
          </View>
        ) : null}
        ListEmptyComponent={
          requiresInitialProof ? (
            <View style={[styles.proofCard, { backgroundColor: colors.surface, borderColor: isDark ? colors.primary : COLORS.primaryBorder }]}>
              <View style={[styles.proofBadge, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : COLORS.primaryLight }]}>
                <MaterialIcons name="verified-user" size={20} color={colors.primary} />
                <Text style={[styles.proofBadgeText, { color: colors.primary }]}>Comprovação Obrigatória</Text>
              </View>

              <Text style={[styles.proofTitle, { color: colors.text }]}>
                Identifique-se como tutor deste pet
              </Text>
              <Text style={[styles.proofSubtitle, { color: colors.textSecondary }]}>
                Para a segurança do animal e do protetor, envie fotos anteriores ou descreva características marcantes (marcas, coleira, hábitos) para comprovar a tutela antes de iniciar a conversa.
              </Text>

              {/* Botões de Câmera / Galeria */}
              <View style={styles.proofPhotoActions}>
                <TouchableOpacity
                  style={[styles.proofBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}
                  onPress={() => handlePickProofPhoto('camera')}
                >
                  <MaterialIcons name="photo-camera" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.proofBtnText, { color: colors.text }]}>Tirar Foto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.proofBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}
                  onPress={() => handlePickProofPhoto('gallery')}
                >
                  <MaterialIcons name="photo-library" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.proofBtnText, { color: colors.text }]}>Galeria</Text>
                </TouchableOpacity>
              </View>

              {/* Preview da foto selecionada para comprovação */}
              {proofPhoto && (
                <View style={styles.proofPreviewContainer}>
                  <Image source={{ uri: proofPhoto.uri }} style={styles.proofPreviewImg} />
                  <TouchableOpacity
                    style={styles.proofRemoveBtn}
                    onPress={() => setProofPhoto(null)}
                  >
                    <MaterialIcons name="close" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Campo para descrição de características */}
              <TextInput
                style={[
                  styles.proofInput,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="Descreva marcas, manchas, cor da coleira, cicatrizes ou detalhes que comprovem que você é o tutor..."
                placeholderTextColor={colors.textMuted}
                value={proofText}
                onChangeText={setProofText}
                multiline
                numberOfLines={3}
              />

              {/* Botão de Envio de Comprovação */}
              <TouchableOpacity
                style={[styles.proofSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmitProof}
                disabled={submittingProof}
                activeOpacity={0.85}
              >
                {submittingProof ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="security" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.proofSubmitBtnText}>Enviar Comprovação e Liberar Chat</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <MaterialIcons name="chat-bubble-outline" size={40} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Nenhuma mensagem ainda</Text>
            </View>
          )
        }
      />

      {/* Preview de foto selecionada no chat normal */}
      {photoPreview && (
        <View style={[styles.previewRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Image source={{ uri: photoPreview }} style={styles.previewImage} />
          <TouchableOpacity onPress={handleRemovePhoto} style={styles.removePhotoButton}>
            <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Remover</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Barra de Digitação (Estilo Instagram Direct com Pill) */}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: isKeyboardOpen ? 8 : Math.max(8, insets.bottom),
          },
        ]}
      >
        {otherDeleted ? (
          <View style={{ paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' }}>
              Esta conta foi excluída. O histórico foi mantido sem os dados pessoais do autor.
            </Text>
          </View>
        ) : requiresInitialProof ? (
          <View style={{ paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' }}>
              🔒 Preencha e envie a comprovação acima para liberar as mensagens.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.inputPill,
              {
                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                borderColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}
          >
            <TouchableOpacity
              onPress={handlePickPhoto}
              style={[styles.photoButton, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
              accessibilityLabel="Anexar foto"
            >
              <Feather name="camera" size={17} color="#FFFFFF" />
            </TouchableOpacity>

            <TextInput
              style={[
                styles.input,
                { color: colors.text },
              ]}
              value={input}
              onChangeText={setInput}
              placeholder="Mensagem..."
              placeholderTextColor={colors.textMuted}
              editable={!sending}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              returnKeyType="send"
              multiline
            />

            {input.trim().length > 0 || photoPreview ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending}
                style={[styles.sendPillBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* MODAL DE COMPARTILHAMENTO DE LOCAL DE ENTREGA PELO RESGATISTA */}
      <Modal
        visible={showShareLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareLocationModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="share-location" size={22} color="#2E5634" />
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {isPrivateResidentialLocation ? 'Combinar Ponto Seguro' : 'Liberar Local de Retirada'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowShareLocationModal(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {isPrivateResidentialLocation
                ? 'Escolha um ponto público de encontro. O endereço residencial e as coordenadas da casa não serão compartilhados.'
                : 'Escolha onde o tutor irá encontrar você para buscar o pet. O endereço e a rota GPS serão liberados para ele no chat:'}
            </Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {/* Opção 1: Endereço Cadastrado */}
              {!isPrivateResidentialLocation && (
                <TouchableOpacity
                  style={[
                    styles.locationOptionCard,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: locationType === 'registered' ? '#2E5634' : colors.border },
                    locationType === 'registered' && { borderWidth: 2 },
                  ]}
                  onPress={() => setLocationType('registered')}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <MaterialIcons
                      name={locationType === 'registered' ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={20}
                      color={locationType === 'registered' ? '#2E5634' : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.locationOptionTitle, { color: colors.text }]}>
                        🏠 Endereço Cadastrado do Pet
                      </Text>
                      <Text style={[styles.locationOptionText, { color: colors.textSecondary }]}>
                        {registeredAddressText}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Opção 2: Ponto de Encontro Seguro */}
              <TouchableOpacity
                style={[
                  styles.locationOptionCard,
                  { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: locationType === 'safe_point' ? '#2E5634' : colors.border },
                  locationType === 'safe_point' && { borderWidth: 2 },
                ]}
                onPress={() => setLocationType('safe_point')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <MaterialIcons
                    name={locationType === 'safe_point' ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={20}
                    color={locationType === 'safe_point' ? '#2E5634' : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.locationOptionTitle, { color: colors.text }]}>
                      🛡️ Ponto de Encontro Público Seguro
                    </Text>
                    <Text style={[styles.locationOptionText, { color: colors.textSecondary }]}>
                      Clínica veterinária, praça pública, delegacia ou pet shop
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {locationType === 'safe_point' && (
                <TextInput
                  style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: colors.border, color: colors.text }]}
                  placeholder="Ex.: praça pública, clínica veterinária ou pet shop"
                  placeholderTextColor={colors.textMuted}
                  value={customSafeAddress}
                  onChangeText={setCustomSafeAddress}
                  multiline
                />
              )}

              {/* Campo de Instruções Adicionais */}
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 10, marginBottom: 4 }}>
                📝 Instruções de Retirada (Opcional):
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: colors.border, color: colors.text, minHeight: 60 }]}
                placeholder="Ex.: trazer coleira ou caixa de transporte"
                placeholderTextColor={colors.textMuted}
                value={pickupInstructions}
                onChangeText={setPickupInstructions}
                multiline
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalConfirmBtn, { backgroundColor: '#2E5634' }]}
              onPress={handleConfirmShareLocation}
              disabled={sharingLocation}
              activeOpacity={0.85}
            >
              {sharingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="share-location" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.modalConfirmBtnText}>
                    {isPrivateResidentialLocation ? 'Enviar Ponto Público Seguro' : 'Enviar Localização & Liberar Rota GPS'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  mainWrapper: { flex: 1 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, height: 60, borderBottomWidth: 1 },
  headerBackBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', marginRight: 10 },
  chatAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, overflow: 'hidden', marginRight: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  chatAvatarImage: { width: 40, height: 40, borderRadius: 20, resizeMode: 'cover' },
  chatHeaderContent: { flex: 1, minWidth: 0 },
  chatHeaderName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  chatHeaderPet: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  messageRow: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 4 },
  myMessage: { justifyContent: 'flex-end' },
  otherMessage: { justifyContent: 'flex-start' },
  messageCard: { maxWidth: '85%', padding: 12, borderRadius: 16, borderWidth: 1 },
  messageText: { fontSize: 15, marginBottom: 2, lineHeight: 20 },
  messageImage: { width: 180, height: 180, borderRadius: 12, marginBottom: 6, backgroundColor: '#E5E7EB' },
  previewRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderTopWidth: 1 },
  previewImage: { width: 60, height: 60, borderRadius: 8, marginRight: 10 },
  removePhotoButton: { padding: 8 },
  messageMeta: { fontSize: 10.5, marginTop: 4 },
  inputContainer: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  inputPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 26, paddingHorizontal: 8, paddingVertical: 4, minHeight: 48, borderWidth: 1 },
  photoButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  input: { flex: 1, fontSize: 15, paddingVertical: 6, paddingHorizontal: 6, maxHeight: 100 },
  sendPillBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  error: { color: 'red', textAlign: 'center', marginTop: 20 },

  // Barra de Ação do Resgatista no Chat
  finderActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  finderShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E5634',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#2E5634',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  finderShareBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Card de Rota GPS no Chat
  mapRouteCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  mapRouteCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Estilos da Comprovação Obrigatória
  proofCard: {
    marginVertical: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  proofBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 8,
    gap: 6,
  },
  proofBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  proofTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  proofSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
  },
  proofPhotoActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  proofBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  proofBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  proofPreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  proofPreviewImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  proofRemoveBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    minHeight: 75,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  proofSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  proofSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },

  // Modal de Compartilhamento de Localização
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 14,
  },
  locationOptionCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  locationOptionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  locationOptionText: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    marginBottom: 8,
  },
  modalConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 14,
    shadowColor: '#2E5634',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  modalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});

export default ChatScreen;
