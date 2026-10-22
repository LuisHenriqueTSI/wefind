import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { dispatchSystemNotificationToWhatsApp } from './whatsappNotifications';

// Configuração do comportamento das notificações quando o app está aberto em primeiro plano (Foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const PUSH_TOKEN_STORAGE_KEY = '@wefind/expo_push_token';
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Cálculo de distância geográfica precisa em KM (Fórmula de Haversine)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // Raio da Terra em km
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) *
      Math.cos(numLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Registra o dispositivo para receber Push Notifications do Expo
 * e armazena o token no perfil do usuário no Supabase e no AsyncStorage.
 */
export async function registerForPushNotificationsAsync(userId = null) {
  try {
    // Configura canal de notificação de alta prioridade no Android
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('wefind-lost-pets', {
          name: 'Alertas de Pets Perdidos e Mensagens',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2E5634',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (_) {}
    }

    // Solicita permissão do usuário
    let finalStatus = 'undetermined';
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    } catch (_) {}

    if (finalStatus !== 'granted') {
      console.log('[PushNotifications] Permissão de notificação não concedida ou rodando no navegador.');
      return null;
    }

    // Verifica se está rodando no cliente genérico Expo Go
    const isExpoGo =
      Constants?.appOwnership === 'expo' ||
      Constants?.executionEnvironment === ExecutionEnvironment?.StoreClient ||
      Constants?.executionEnvironment === 'storeClient';

    let token = null;
    if (isExpoGo && Platform.OS === 'android') {
      // No Expo Go Android (SDK 53+), remote push notifications requerem Development Build / APK.
      // O app opera com notificações locais e in-app no Expo Go sem poluir o terminal com avisos.
      console.log('[PushNotifications] Modo Expo Go Android: operando com notificações locais e in-app.');
    } else {
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        token = tokenData?.data || null;
      } catch (tokenErr) {
        console.log('[PushNotifications] Modo Expo Go detectado. Ativando suporte a notificações locais e in-app.');
      }
    }

    if (token) {
      console.log('[PushNotifications] Token de notificações registrado.');
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);

      // Salva no perfil do Supabase se o usuário estiver autenticado
      if (userId) {
        try {
          // Mescla com os extra_fields atuais para não apagar outras preferências do perfil
          const { data: currentProfile } = await supabase.rpc('get_my_profile');
          await supabase
            .from('profiles')
            .update({
              expo_push_token: token,
              extra_fields: {
                ...(currentProfile?.extra_fields || {}),
                expo_push_token: token,
              },
            })
            .eq('id', userId);
        } catch (dbErr) {
          console.warn('[PushNotifications] Aviso ao salvar token no Supabase:', dbErr.message);
        }
      }
    }

    return token;
  } catch (error) {
    console.log('[PushNotifications] Inicialização de notificações concluída.');
    return null;
  }
}

/**
 * Dispara notificação push através da API oficial do Expo
 */
export async function sendExpoPushNotification({ to, title, body, data = {} }) {
  if (!to) return false;

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) return false;

  const messages = recipients.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'wefind-lost-pets',
    _displayInForeground: true,
  }));

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log('[PushNotifications] Resposta do envio Expo:', result);
    return true;
  } catch (error) {
    console.warn('[PushNotifications] Erro ao enviar push via Expo:', error.message);
    return false;
  }
}

/**
 * Envia uma push notification para um usuário específico pelo ID
 */
export async function sendPushNotification(targetUserId, title, body, data = {}) {
  try {
    if (!targetUserId) return false;
    // O token de push do outro usuário fica protegido no banco: quem envia é a função no servidor.
    const { error } = await supabase.functions.invoke('send-push', {
      body: { targetUserId, title, body, data },
    });
    if (error) console.warn('[sendPushNotification] Falha na função send-push:', error.message);

    // Dispara notificação local para testes e feedback visual
    triggerLocalNotification({
      title,
      body,
      data,
    }).catch(() => {});

    return !error;
  } catch (err) {
    console.warn('[sendPushNotification] Erro ao enviar push:', err.message);
    return false;
  }
}

/**
 * Dispara uma notificação local instantânea no aparelho (ótimo para testes e feedback em tempo real)
 */
export async function triggerLocalNotification({ title, body, data = {}, delaySeconds = 0 }) {
  try {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('wefind-lost-pets', {
          name: 'Alertas de Pets Perdidos e Mensagens',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2E5634',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (_) {}
    }

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    } catch (_) {}

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        channelId: 'wefind-lost-pets',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: delaySeconds > 0 ? { seconds: delaySeconds, channelId: 'wefind-lost-pets' } : null,
    });
    return true;
  } catch (error) {
    console.warn('[PushNotifications] Erro ao agendar notificação local:', error.message);
    return false;
  }
}

/**
 * ALERTA COMUNITÁRIO GEOLOCALIZADO DE PET PERDIDO:
 * Disparado quando um tutor registra a perda de um animal.
 * Notifica todos os usuários e voluntários situados no raio de busca daquele epicentro.
 */
export async function broadcastLostPetAlertToNearbyUsers(petItem, currentUserId = null) {
  if (!petItem?.id) return { notifiedCount: 0 };

  console.log('[broadcastLostPetAlert] 🚨 Pedindo ao servidor o alerta de proximidade para:', petItem.title, petItem.id);

  try {
    // O cálculo de quem está perto acontece no servidor (função notify-nearby-lost-pet),
    // para que a localização dos outros usuários nunca chegue a este aparelho.
    const { data, error } = await supabase.functions.invoke('notify-nearby-lost-pet', {
      body: { itemId: petItem.id },
    });
    if (error) {
      console.warn('[broadcastLostPetAlert] Falha na função de proximidade:', error.message);
      return { notifiedCount: 0 };
    }
    return { notifiedCount: Number(data?.notifiedCount) || 0 };
  } catch (error) {
    console.warn('[broadcastLostPetAlert] Erro ao disparar alerta comunitário:', error.message);
    return { notifiedCount: 0 };
  }
}
