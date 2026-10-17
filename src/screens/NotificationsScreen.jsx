import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getConversations, markMessagesAsRead } from '../services/messages';
import { listItems, cleanupExpiredItems, renewItem } from '../services/items';
import {
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  buildRenewalAlerts,
  createNotification,
} from '../services/notifications';
import { triggerLocalNotification } from '../services/pushNotifications';
import { WeFindText } from '../components/WeFindBrand';
import COLORS from '../constants/theme';

function getRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'agora';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return '1d';
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} sem`;
  return `${Math.floor(diffDays / 30)} m`;
}

// Rótulo, ícone e ação de cada tipo de aviso
const TYPE_META = {
  message: { label: 'Nova mensagem', icon: 'chat-bubble-outline' },
  nearby_lost_pet: { label: 'Animal perdido perto de você', icon: 'location-on', alert: true },
  match: { label: 'Possível correspondência', icon: 'compare-arrows' },
  pet_match: { label: 'Possível correspondência', icon: 'compare-arrows' },
  sighting: { label: 'Novo avistamento', icon: 'visibility' },
  renewal_reminder: { label: 'Renovação da publicação', icon: 'update', action: 'Renovar' },
  item_removed: { label: 'Publicação removida', icon: 'delete-outline' },
  claim_received: { label: 'Pedido de comprovação de tutela', icon: 'assignment-ind' },
  claim_approved: { label: 'Comprovação aprovada', icon: 'check-circle-outline' },
  claim_rejected: { label: 'Comprovação recusada', icon: 'highlight-off' },
};
const DEFAULT_META = { label: 'Aviso do WeFIND', icon: 'notifications-none' };

const SYSTEM_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'matches', label: 'Correspondências' },
  { key: 'sightings', label: 'Avistamentos' },
  { key: 'alerts', label: 'Proximidade' },
  { key: 'renewals', label: 'Renovação' },
];
const COMMUNITY_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
];

export default function NotificationsScreen({ navigation, onNotificationsUpdated }) {
  const { user, isAdmin } = useAuth();
  const { colors, isDark } = useTheme();

  // Estados principais
  const [activeTab, setActiveTab] = useState('system'); // 'community' ou 'system'
  const [loading, setLoading] = useState(true);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all', 'unread', 'alerts', 'sightings', 'renewals'

  const [messageNotifications, setMessageNotifications] = useState([]);
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [renewingItemId, setRenewingItemId] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user]);

  async function loadAll() {
    setLoading(true);
    try {
      await cleanupExpiredItems();
      await fetchNotifications();
      if (typeof onNotificationsUpdated === 'function') {
        onNotificationsUpdated();
      }
    } catch (e) {
      console.warn('[NotificationsScreen] Erro ao carregar notificações:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNotifications() {
    if (!user) return;
    const conversations = await getConversations(user.id);
    const unreadMsgs = conversations.filter((c) => c.unread);
    const systemAlertsData = await getUserNotifications(user.id);

    // 1. Mensagens da Comunidade
    const mappedMessageNotifications = unreadMsgs.map((msg) => ({
      id: `msg_${msg.itemId}_${msg.otherId}`,
      type: 'message',
      title: msg.otherName || 'Membro da Comunidade',
      prefix: 'Mensagem sobre o pet:',
      message: `${msg.otherName || 'Membro da Comunidade'} enviou uma nova mensagem sobre "${msg.itemTitle || 'Pet sem nome'}".`,
      time: getRelativeTime(msg.lastMessageAt),
      timestamp: new Date(msg.lastMessageAt || Date.now()).getTime(),
      read: false,
      otherId: msg.otherId,
      itemId: msg.itemId,
      icon: 'chat',
      isCritical: false,
    }));
    setMessageNotifications(mappedMessageNotifications);

    // 2. Alertas do Sistema
    let items = await listItems({ owner_id: user.id, resolved: false });
    items = (items || []).filter((item) => item && item.id);
    const renewalAlerts = buildRenewalAlerts(items);

    const mappedSystemAlerts = [...renewalAlerts, ...(systemAlertsData || [])]
      .filter((alert) => alert && (alert.type === 'renewal_reminder' || alert.type === 'item_removed' || alert.type === 'nearby_lost_pet' || alert.type === 'match' || alert.type === 'pet_match' || alert.type === 'sighting' || alert.type === 'claim_received' || alert.type === 'claim_approved' || alert.type === 'claim_rejected' || alert.type === 'meetup_update'))
      .map((alert) => {
        const isRenewal = alert.type === 'renewal_reminder';
        const isNearby = alert.type === 'nearby_lost_pet';
        const isMatch = alert.type === 'match' || alert.type === 'pet_match';
        const isSighting = alert.type === 'sighting';
        const isClaim = alert.type === 'claim_received' || alert.type === 'claim_approved' || alert.type === 'claim_rejected';
        const isMeetup = alert.type === 'meetup_update';

        let iconName = 'notifications';
        let prefix = 'Aviso do sistema:';
        if (isRenewal) {
          iconName = 'hourglass-bottom';
          prefix = 'Lembrete de renovação:';
        } else if (isNearby) {
          iconName = 'radar';
          prefix = 'Animal perdido por perto:';
        } else if (isMatch) {
          iconName = 'auto-awesome';
          prefix = 'Possível correspondência:';
        } else if (isSighting) {
          iconName = 'visibility';
          prefix = 'Novo avistamento:';
        } else if (isClaim) {
          iconName = alert.type === 'claim_received' ? 'assignment-turned-in' : (alert.type === 'claim_approved' ? 'verified' : 'cancel');
          prefix = alert.type === 'claim_received' ? 'Nova solicitação:' : 'Atualização da solicitação:';
        } else if (isMeetup) {
          iconName = 'event';
          prefix = 'Encontro de devolução:';
        }

        return {
          ...alert,
          prefix,
          icon: iconName,
          time: getRelativeTime(alert.created_at),
          timestamp: new Date(alert.created_at || Date.now()).getTime(),
          isCritical: isNearby || isRenewal || isMatch || isClaim || isMeetup || !alert.read,
        };
      });

    setSystemAlerts(mappedSystemAlerts);
  }

  // Contadores
  const unreadSystemCount = systemAlerts.filter((n) => !n.read).length;
  const unreadCommunityCount = messageNotifications.filter((n) => !n.read).length;

  // Filtragem da lista ativa
  const currentList = useMemo(() => {
    const rawList = activeTab === 'community' ? messageNotifications : systemAlerts;

    let filtered = rawList;
    if (selectedFilter === 'unread') {
      filtered = rawList.filter((n) => !n.read);
    } else if (selectedFilter === 'alerts') {
      filtered = rawList.filter((n) => n.type === 'nearby_lost_pet');
    } else if (selectedFilter === 'matches') {
      filtered = rawList.filter((n) => n.type === 'match' || n.type === 'pet_match');
    } else if (selectedFilter === 'sightings') {
      filtered = rawList.filter((n) => n.type === 'sighting');
    } else if (selectedFilter === 'renewals') {
      filtered = rawList.filter((n) => n.type === 'renewal_reminder');
    }

    return filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [activeTab, messageNotifications, systemAlerts, selectedFilter]);

  // Agrupamento por seção (recentes e não lidas / mais antigas)
  const groupedSections = useMemo(() => {
    const important = [];
    const older = [];
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    currentList.forEach((item) => {
      const isRecent = now - (item.timestamp || now) < oneDayMs * 2;
      if (!item.read || isRecent) {
        important.push(item);
      } else {
        older.push(item);
      }
    });

    const result = [];
    if (important.length > 0) {
      result.push({ title: 'Recentes', isLightning: true, data: important });
    }
    if (older.length > 0) {
      result.push({ title: 'Mais antigas', isLightning: false, data: older });
    }
    return result;
  }, [currentList]);

  // Ações de toque
  async function handleNotificationPress(notification) {
    if (notification.type === 'renewal_reminder' && notification.itemId) {
      try {
        setRenewingItemId(notification.itemId);
        await renewItem(notification.itemId);
        await markNotificationRead(String(notification.id).replace('system_', ''));
        await fetchNotifications();
        if (typeof onNotificationsUpdated === 'function') {
          onNotificationsUpdated();
        }
        Alert.alert('Publicação renovada', 'Seu anúncio foi renovado com sucesso e continua ativo por mais 30 dias!');
      } catch (err) {
        Alert.alert('Erro', err?.message || 'Falha ao renovar publicação.');
      } finally {
        setRenewingItemId(null);
      }
      return;
    }

    if (notification.type === 'message') {
      if (notification.otherId) {
        await markMessagesAsRead(user.id, notification.otherId);
      }
      navigation.navigate('Chat', {
        conversation: {
          otherId: notification.otherId,
          itemId: notification.itemId,
          itemTitle: notification.itemTitle,
          otherName: notification.title,
        },
      });
      return;
    }

    if (notification.type === 'claim_received') {
      const normalizedId = String(notification.id).replace('system_', '');
      if (/^\d+$/.test(normalizedId)) {
        await markNotificationRead(normalizedId);
      }
      navigation.navigate('ClaimsManagement');
      return;
    }

    const targetItemId = notification.item_id || notification.itemId;
    if (targetItemId) {
      const normalizedId = String(notification.id).replace('system_', '');
      if (/^\d+$/.test(normalizedId)) {
        await markNotificationRead(normalizedId);
      }
      navigation.navigate('ItemDetail', { itemId: targetItemId });
      return;
    }

    if (notification.id) {
      const normalizedId = String(notification.id).replace('system_', '');
      if (/^\d+$/.test(normalizedId)) {
        await markNotificationRead(normalizedId);
      }
      await fetchNotifications();
      if (typeof onNotificationsUpdated === 'function') {
        onNotificationsUpdated();
      }
    }
  }

  // Marcar todas como lidas ou limpar
  function handleClearAllOptions() {
    Alert.alert(
      'Gerenciar notificações',
      'O que você deseja fazer com as notificações?',
      [
        {
          text: 'Marcar todas como lidas',
          onPress: async () => {
            try {
              if (user) {
                await markAllNotificationsRead(user.id);
                setSystemAlerts((prev) => prev.map((item) => ({ ...item, read: true })));
                if (typeof onNotificationsUpdated === 'function') {
                  onNotificationsUpdated();
                }
              }
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível marcar todas como lidas.');
            }
          },
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ]
    );
  }

  // Disparar pacote de notificações fake para teste (Exclusivo Admin)
  async function handleTestNotification() {
    if (!isAdmin) {
      Alert.alert('Acesso restrito', 'Esta funcionalidade de teste é exclusiva para a conta de Administrador.');
      return;
    }

    try {
      if (!user?.id) {
        Alert.alert('Atenção', 'Você precisa estar logado para gerar notificações.');
        return;
      }

      setLoading(true);

      const fakeNotifications = [
        {
          user_id: user.id,
          type: 'nearby_lost_pet',
          title: 'Cão perdido perto de você',
          message: 'Cão Labrador dourado ("Thor") foi visto a 800 m de você. Abra o WeFIND para ver as fotos e os detalhes.',
          read: false,
        },
        {
          user_id: user.id,
          type: 'sighting',
          title: 'Novo avistamento registrado',
          message: 'Um voluntário registrou um avistamento com foto recente perto da Praça Central.',
          read: false,
        },
        {
          user_id: user.id,
          type: 'renewal_reminder',
          title: 'Lembrete de renovação',
          message: 'Sua publicação do pet "Mel" está próxima do período de renovação de 30 dias. Abra o WeFIND para mantê-la ativa.',
          read: false,
        },
        {
          user_id: user.id,
          type: 'match',
          title: 'Possível correspondência',
          message: 'Nossa IA identificou um pet cadastrado com 94% de similaridade com as fotos do seu anúncio.',
          read: false,
        },
      ];

      for (const fakeNotif of fakeNotifications) {
        await createNotification(fakeNotif);
      }

      await triggerLocalNotification({
        title: 'Cão perdido perto de você',
        body: 'Cão ("Thor", Labrador) perdido no seu bairro. Abra o WeFIND para ver as fotos e os detalhes.',
        data: { type: 'nearby_lost_pet' },
        delaySeconds: 0,
      });

      await fetchNotifications();
      if (typeof onNotificationsUpdated === 'function') {
        onNotificationsUpdated();
      }

      Alert.alert('Notificações de teste criadas', 'Adicionamos 4 notificações de teste na sua caixa de entrada e disparamos um push de alerta!');
    } catch (e) {
      console.warn('Erro ao gerar notificações de teste:', e);
      Alert.alert('Aviso', 'Notificações de demonstração inseridas com sucesso.');
      await fetchNotifications();
    } finally {
      setLoading(false);
    }
  }

  const filters = activeTab === 'system' ? SYSTEM_FILTERS : COMMUNITY_FILTERS;
  const filterLabel = (filters.find((f) => f.key === selectedFilter) || filters[0]).label;

  const renderTab = (key, label, count) => {
    const active = activeTab === key;
    return (
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          setActiveTab(key);
          setSelectedFilter('all');
        }}
        activeOpacity={0.8}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        <Text style={[styles.tabText, { color: active ? (isDark ? colors.primary : '#A8D5AE') : '#FFFFFF', opacity: active ? 1 : 0.7 }]}>
          {label}{count > 0 ? ` (${count})` : ''}
        </Text>
        <View style={[styles.tabLine, { backgroundColor: active ? (isDark ? colors.primary : '#A8D5AE') : 'transparent' }]} />
      </TouchableOpacity>
    );
  };

  const renderRow = (item, index, list) => {
    const meta = TYPE_META[item.type] || DEFAULT_META;
    const unread = !item.read;
    const body = item.message || item.title;
    const isRenewing = renewingItemId && renewingItemId === item.itemId;
    const iconColor = meta.alert ? '#B42318' : colors.primary;
    return (
      <View key={String(item.id)}>
        <TouchableOpacity
          style={[styles.row, unread && { backgroundColor: isDark ? 'rgba(82,153,96,0.10)' : '#F1F6F1' }]}
          activeOpacity={0.7}
          onPress={() => handleNotificationPress(item)}
          accessibilityLabel={`${meta.label}${unread ? ', não lida' : ''}. ${body}`}
        >
          <View style={[styles.rowIcon, { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.cardBorder }]}>
            <MaterialIcons name={meta.icon} size={20} color={iconColor} />
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text style={[styles.rowTitle, { color: colors.text }, unread && styles.rowTitleUnread]} numberOfLines={1}>
                {meta.label}
              </Text>
              <Text style={[styles.rowTime, { color: unread ? colors.primary : colors.textMuted }]}>{item.time}</Text>
            </View>
            <Text style={[styles.rowText, { color: colors.textSecondary }]} numberOfLines={2}>{body}</Text>
            {meta.action ? (
              <View style={styles.rowActions}>
                {isRenewing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={[styles.smallBtn, { borderColor: colors.primary }]}>
                    <Text style={[styles.smallBtnText, { color: colors.primary }]}>{meta.action}</Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
          {unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : <View style={styles.dotSpace} />}
        </TouchableOpacity>
        {index < list.length - 1 && <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon} accessibilityLabel="Voltar" activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notificações</Text>
          {isAdmin && (
            <TouchableOpacity onPress={handleTestNotification} style={styles.headerIcon} accessibilityLabel="Gerar notificações de teste (admin)" activeOpacity={0.7}>
              <MaterialIcons name="bolt" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleClearAllOptions} style={styles.headerIcon} accessibilityLabel="Marcar todas como lidas" activeOpacity={0.7}>
            <MaterialIcons name="done-all" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.tabs}>
          {renderTab('system', 'Avisos', unreadSystemCount)}
          {renderTab('community', 'Mensagens', unreadCommunityCount)}
        </View>
      </View>

      <View style={[styles.filterBar, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)} activeOpacity={0.7} accessibilityLabel="Filtrar notificações">
          <MaterialIcons name="filter-list" size={18} color={colors.textSecondary} />
          <Text style={[styles.filterText, { color: colors.textSecondary }]}>Mostrando:</Text>
          <Text style={[styles.filterText, styles.filterValue, { color: colors.text }]}>{filterLabel}</Text>
          <MaterialIcons name="arrow-drop-down" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Carregando notificações...</Text>
          </View>
        ) : groupedSections.length > 0 ? (
          groupedSections.map((section, sIdx) => (
            <View key={`sec_${sIdx}`}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
              {section.data.map((item, i) => renderRow(item, i, section.data))}
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="notifications-none" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {selectedFilter === 'all' ? 'Nenhuma notificação' : 'Nada neste filtro'}
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
              {selectedFilter === 'all'
                ? 'Avistamentos, mensagens, possíveis correspondências e lembretes de renovação aparecem aqui.'
                : 'Troque o filtro para ver os outros avisos.'}
            </Text>
            {isAdmin && (
              <TouchableOpacity onPress={handleTestNotification} style={[styles.smallBtn, { borderColor: colors.primary, marginTop: 16 }]} activeOpacity={0.8}>
                <Text style={[styles.smallBtnText, { color: colors.primary }]}>Gerar notificações de teste (admin)</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {bannerVisible && !loading && (
          <Text style={[styles.footnote, { color: colors.textMuted }]}>As notificações ficam salvas por 30 dias.</Text>
        )}
      </ScrollView>

      <Modal visible={filterModalVisible} transparent animationType="fade" onRequestClose={() => setFilterModalVisible(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Mostrar</Text>
            {filters.map((f) => {
              const active = selectedFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.modalOption, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => {
                    setSelectedFilter(f.key);
                    setFilterModalVisible(false);
                  }}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.modalOptionText, { color: active ? colors.primary : colors.text }, active && { fontWeight: '800' }]}>
                    {f.label}
                  </Text>
                  {active && <MaterialIcons name="check" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', height: 56 },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginLeft: 4 },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700', marginBottom: 10 },
  tabLine: { height: 3, width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },

  filterBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  filterBtn: { width: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterText: { fontSize: 13.5, lineHeight: 18 },
  filterValue: { fontWeight: '700' },

  scrollBody: { paddingBottom: 32 },
  sectionTitle: { fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },

  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  rowTitleUnread: { fontWeight: '800' },
  rowTime: { fontSize: 12 },
  rowText: { fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  rowActions: { flexDirection: 'row', marginTop: 10 },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  smallBtnText: { fontSize: 13, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10, marginTop: 6 },
  dotSpace: { width: 8, marginLeft: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68 },

  loadingContainer: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 13 },
  emptyContainer: { paddingVertical: 64, paddingHorizontal: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emptyDescription: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText: { fontSize: 15 },
});
