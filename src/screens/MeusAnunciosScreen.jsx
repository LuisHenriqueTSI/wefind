import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { listItemsWithPhotosAndOwner, renewItem } from '../services/items';
import { getRenewalInfo } from '../services/itemExpiration';
import PetFallbackImage from '../components/PetFallbackImage';
import COLORS from '../constants/theme';

const getStatusConfig = (isDark) => ({
  ativos: {
    title: 'Publicações Ativas',
    color: isDark ? '#4ADE80' : '#16A34A',
    background: isDark ? 'rgba(34, 197, 94, 0.18)' : '#DCFCE7',
    icon: 'check-circle',
  },
  renovar: {
    title: 'Precisam de Renovação',
    color: isDark ? '#FBBF24' : '#D97706',
    background: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
    icon: 'schedule',
  },
  inativos: {
    title: 'Publicações Inativas',
    color: isDark ? '#94A3B8' : '#64748B',
    background: isDark ? '#1E293B' : '#F1F5F9',
    icon: 'pause-circle-outline',
  },
});

const MeusAnunciosScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const statusConfig = getStatusConfig(isDark);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [renewingId, setRenewingId] = useState(null);

  const loadItems = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const data = await listItemsWithPhotosAndOwner({ owner_id: user.id });
    setItems(data || []);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleRenew = async (itemId) => {
    try {
      setRenewingId(itemId);
      await renewItem(itemId);
      await loadItems();
      Alert.alert('Publicação renovada', 'Ela voltou a aparecer em destaque para a comunidade.');
    } catch (error) {
      Alert.alert('Não foi possível renovar', error?.message || 'Tente novamente.');
    } finally {
      setRenewingId(null);
    }
  };

  const grouped = items.reduce((acc, item) => {
    const renewalInfo = getRenewalInfo(item);
    const category = !renewalInfo.canRenew || renewalInfo.inactive ? 'inativos' : renewalInfo.needsRenewal ? 'renovar' : 'ativos';
    if (!acc[category]) acc[category] = [];
    acc[category].push({ ...item, renewalInfo });
    return acc;
  }, {});

  const renderItem = (item) => {
    const config = statusConfig[item.renewalInfo.inactive ? 'inativos' : item.renewalInfo.needsRenewal ? 'renovar' : 'ativos'];
    const location = [item.neighborhood, item.city, item.state].filter(Boolean).join(' - ');
    const photoUrl = item.item_photos?.[0]?.url || item.photo_url || item.photos?.[0]?.url;
    const isAdoption = Boolean(item.extra_fields?.is_direct_adoption);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
        activeOpacity={0.85}
      >
        {/* Foto do Pet */}
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.petThumb}
            resizeMode="cover"
          />
        ) : (
          <View style={{ width: 84, height: 84, borderRadius: 14, overflow: 'hidden' }}>
            <PetFallbackImage
              species={item.species}
              breed={item.breed || item.animal_breed}
              color={item.color}
              compact
            />
          </View>
        )}

        <View style={styles.itemContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title || 'Sem título'}
            </Text>
          </View>

          <View style={styles.metaLine}>
            <MaterialIcons name="place" size={13} color={colors.primary} />
            <Text style={[styles.itemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {location || 'Localização não informada'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {/* Pill de Categoria */}
            {isAdoption ? (
              <View style={[styles.tagPill, { backgroundColor: COLORS.secondaryLight }]}>
                <Text style={{ color: COLORS.secondaryDark, fontSize: 10.5, fontWeight: '800' }}>🐾 Para Adoção</Text>
              </View>
            ) : item.status === 'lost' ? (
              <View style={[styles.tagPill, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2' }]}>
                <Text style={{ color: '#DC2626', fontSize: 10.5, fontWeight: '800' }}>Perdido</Text>
              </View>
            ) : (
              <View style={[styles.tagPill, { backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#ECFDF5' }]}>
                <Text style={{ color: '#2E5634', fontSize: 10.5, fontWeight: '800' }}>Encontrado</Text>
              </View>
            )}

            {/* Pill de Expiração / Status */}
            <View style={[styles.statusPill, { backgroundColor: config.background }]}>
              <View style={[styles.statusDot, { backgroundColor: config.color }]} />
              <Text style={[styles.statusText, { color: config.color }]}>
                {item.renewalInfo.inactive ? 'Inativa' : item.renewalInfo.needsRenewal ? `Renovar (${item.renewalInfo.daysRemaining}d)` : 'Ativa'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={[styles.flyerActionBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
            onPress={() => navigation.navigate('ShareFlyer', { item })}
            accessibilityLabel="Gerar Cartaz e Posts"
          >
            <MaterialIcons name="qr-code-2" size={20} color={colors.primary} />
          </TouchableOpacity>

          {item.renewalInfo.inactive && item.renewalInfo.canRenew ? (
            <TouchableOpacity
              style={[styles.renewButton, { backgroundColor: colors.primary }]}
              onPress={() => handleRenew(item.id)}
              disabled={renewingId === item.id}
              activeOpacity={0.85}
            >
              {renewingId === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="rotate-cw" size={13} color="#fff" />
                  <Text style={styles.renewText}>Renovar</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (key) => {
    const list = grouped[key] || [];
    if (!list.length) return null;
    const config = statusConfig[key];
    return (
      <View style={styles.section} key={key}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons name={config.icon} size={18} color={config.color} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{config.title}</Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <Text style={[styles.countText, { color: colors.textSecondary }]}>{list.length}</Text>
          </View>
        </View>
        {list.map(renderItem)}
      </View>
    );
  };

  const activeCount = (grouped.ativos || []).length;
  const attentionCount = (grouped.renovar || []).length + (grouped.inativos || []).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadItems(true)} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {/* Barra de Resumo */}
      <View style={[styles.summaryBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{items.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: isDark ? '#4ADE80' : '#15803D' }]}>{activeCount}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Ativas</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>{attentionCount}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Atenção</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loader} /> : null}

      {!loading && !items.length ? (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons name="pets" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum pet publicado ainda</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Quando você publicar um pet perdido, encontrado ou para adoção, ele aparecerá aqui para você gerenciar.
          </Text>
          <TouchableOpacity
            style={[styles.publishButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('RegisterItem')}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={17} color="#fff" />
            <Text style={styles.publishText}>Criar nova publicação</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && renderSection('ativos')}
      {!loading && renderSection('renovar')}
      {!loading && renderSection('inativos')}

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 44 },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { height: 28, width: 1, marginHorizontal: 8 },
  loader: { marginTop: 32 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 11.5, fontWeight: '800' },
  itemCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',  },
  petThumb: { width: 62, height: 62, borderRadius: 14, marginRight: 12, backgroundColor: '#E2E8F0' },
  petThumbFallback: { width: 62, height: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 15, fontWeight: '800' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  itemMeta: { fontSize: 12, flex: 1 },
  tagPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  renewButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,  },
  renewText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginTop: 10,  },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 18 },
  publishButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,  },
  publishText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
});

export default MeusAnunciosScreen;
