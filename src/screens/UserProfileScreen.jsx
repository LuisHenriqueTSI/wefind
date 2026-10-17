import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  TextInput,
  Dimensions,
} from 'react-native';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as userService from '../services/user';
import * as itemsService from '../services/items';
import * as ratingsService from '../services/ratings';
import { countUserSightings } from '../services/sightings';
import { getFosterProfile } from '../services/foster';
import { getUserGamificationData } from '../services/gamification';
import { APP_FEATURES } from '../constants/features';
import OptimizedImage from '../components/OptimizedImage';
import COLORS from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const UserProfileScreen = ({ route, navigation }) => {
  const { userId, userName: initialName, avatarUrl: initialAvatar } = route.params || {};
  const { user: currentUser, userProfile: currentUserProfile, isAdmin } = useAuth();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [fosterProfile, setFosterProfile] = useState(null);
  const [userItems, setUserItems] = useState([]);
  const [ratingsData, setRatingsData] = useState({ ratings: [], average: null, total: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
  const [activeMainSection, setActiveMainSection] = useState('posts'); // 'posts' | 'ratings'
  const [activePostTab, setActivePostTab] = useState('all'); // 'all' | 'lost' | 'found' | 'adoption' | 'resolved'
  const [refreshing, setRefreshing] = useState(false);
  const [gamificationData, setGamificationData] = useState(null);
  const [sightingsCount, setSightingsCount] = useState(0);

  // Estados do Modal de Avaliação
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  // 0 = nenhuma nota escolhida ainda (antes já vinha 5 marcado por padrão)
  const [selectedStars, setSelectedStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingEligible, setRatingEligible] = useState(false);

  const isOwnProfile = currentUser && currentUser.id === userId;

  const loadUserData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [profileRes, itemsRes, ratingsRes, fosterRes, gamiRes, ratingEligibilityRes, sightingsRes] = await Promise.allSettled([
        userService.getUserById(userId),
        itemsService.getUserItems(userId),
        ratingsService.getUserRatings(userId),
        APP_FEATURES.fosterVolunteers ? getFosterProfile(userId) : Promise.resolve(null),
        APP_FEATURES.gamification ? getUserGamificationData(userId) : Promise.resolve(null),
        currentUser && currentUser.id !== userId
          ? ratingsService.canRateUser(currentUser.id, userId)
          : Promise.resolve(false),
        countUserSightings(userId),
      ]);
      setSightingsCount(sightingsRes.status === 'fulfilled' ? sightingsRes.value : 0);

      const profileData = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const itemsData = itemsRes.status === 'fulfilled' ? itemsRes.value : [];
      const userRatings = ratingsRes.status === 'fulfilled' ? ratingsRes.value : null;
      const fosterData = fosterRes.status === 'fulfilled' ? fosterRes.value : null;
      const gamiData = gamiRes.status === 'fulfilled' ? gamiRes.value : null;
      const canRate = ratingEligibilityRes.status === 'fulfilled' && ratingEligibilityRes.value === true;

      setProfile(profileData || { id: userId, name: initialName || 'Membro WeFIND', avatar_url: initialAvatar });
      setFosterProfile(fosterData);
      setUserItems(Array.isArray(itemsData) ? itemsData : []);
      setRatingsData(userRatings || { ratings: [], average: null, total: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
      setGamificationData(gamiData);
      const existingRating = userRatings?.ratings?.find((rating) => rating.reviewerId === currentUser?.id);
      setRatingEligible(canRate && !existingRating);

    } catch (error) {
      console.log('[UserProfileScreen] Erro ao carregar dados do usuário:', error.message);
      setProfile({ id: userId, name: initialName || 'Membro WeFIND', avatar_url: initialAvatar });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, initialName, initialAvatar, currentUser]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadUserData();
  };

  const handleOpenRatingModal = () => {
    if (!currentUser) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para avaliar e deixar um relato sobre este membro.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }

    if (isOwnProfile) {
      Alert.alert('Aviso', 'Você não pode avaliar seu próprio perfil.');
      return;
    }

    if (!ratingEligible) {
      Alert.alert(
        'Classificação indisponível',
        'Você poderá classificar este membro após 24 horas sem novas mensagens entre vocês.'
      );
      return;
    }

    setRatingModalVisible(true);
  };

  const handleToggleTag = (tag) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const handleSubmitRating = async () => {
    if (!currentUser) return;
    setSubmittingRating(true);
    try {
      const reviewerDisplayName = currentUserProfile?.name || currentUser.user_metadata?.name || 'Membro da Comunidade';
      const reviewerAvatar = currentUserProfile?.avatar_url || currentUserProfile?.avatarUrl || null;

      await ratingsService.submitUserRating({
        targetUserId: userId,
        reviewerId: currentUser.id,
        reviewerName: reviewerDisplayName,
        reviewerAvatar,
        stars: selectedStars,
        tags: selectedTags,
        comment: reviewComment,
      });

      Alert.alert('Avaliação enviada!', 'Obrigado por ajudar a manter a comunidade WeFIND confiável e unida!');
      setRatingModalVisible(false);
      setSelectedStars(0);
      setSelectedTags([]);
      setReviewComment('');
      loadUserData();
    } catch (error) {
      Alert.alert('Erro ao avaliar', error.message || 'Não foi possível registrar a avaliação.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleOpenChat = () => {
    if (!currentUser) {
      Alert.alert(
        'Login necessário',
        'Entre ou crie uma conta para conversar com este membro.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }

    if (isOwnProfile) {
      Alert.alert('Aviso', 'Este é o seu próprio perfil.');
      return;
    }

    navigation.navigate('ChatScreen', {
      conversation: {
        otherId: userId,
        otherName: profile?.name || initialName || 'Membro WeFIND',
        avatarUrl: profile?.avatar_url || profile?.avatarUrl || initialAvatar || null,
        itemTitle: 'Perfil do Usuário',
      },
    });
  };

  const handleDeleteReview = (rating) => {
    const isReviewer = currentUser && rating.reviewerId === currentUser.id;
    Alert.alert(
      isAdmin && !isReviewer ? 'Excluir Avaliação (Super Admin)' : 'Excluir Minha Avaliação',
      isAdmin && !isReviewer
        ? 'Como Administrador, você está excluindo este relato de avaliação permanentemente do banco de dados.'
        : 'Tem certeza de que deseja excluir sua avaliação sobre este membro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await ratingsService.deleteUserRating(rating.id, userId);
              Alert.alert('Sucesso', 'Avaliação excluída com sucesso.');
              loadUserData();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir a avaliação: ' + (error.message || 'Erro desconhecido'));
            }
          },
        },
      ]
    );
  };

  const handleToggleAdminRole = () => {
    const isTargetAdmin = profile?.adm === true || profile?.adm === 'true' || profile?.role === 'admin';
    const newRole = isTargetAdmin ? 'user' : 'admin';
    const actionLabel = isTargetAdmin ? 'Remover Privilégios de Administrador' : 'Promover para Super Administrador';

    Alert.alert(
      actionLabel,
      `Deseja ${isTargetAdmin ? 'remover o cargo de Administrador de' : 'conceder acesso total de Administrador para'} "${profile?.name || 'este usuário'}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await userService.updateUserRole(userId, newRole);
              setProfile(prev => ({
                ...prev,
                role: newRole,
                adm: !isTargetAdmin,
              }));
              Alert.alert('Sucesso', `Cargo do usuário atualizado para "${newRole}" com sucesso!`);
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível atualizar o cargo: ' + (error.message || 'Erro desconhecido'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteUserAccount = () => {
    Alert.alert(
      'Excluir Conta do Usuário (Admin)',
      `ATENÇÃO: Deseja excluir permanentemente o perfil de "${profile?.name || 'este usuário'}", todas as suas publicações, fotos e comentários? Esta ação NÃO pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir Permanentemente',
          style: 'destructive',
          onPress: async () => {
            try {
              await userService.deleteUserProfile(userId);
              Alert.alert('Sucesso', 'Usuário e todos os seus dados foram excluídos com sucesso.');
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('MainApp');
              }
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir o usuário: ' + (error.message || 'Erro desconhecido'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteUserItem = (targetItem) => {
    Alert.alert(
      'Excluir Publicação (Admin)',
      `Deseja excluir a publicação "${targetItem.title || 'Pet'}" como Administrador?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await itemsService.deleteItem(targetItem.id, { actorId: currentUser?.id, actorIsAdmin: true });
              setUserItems(prev => prev.filter(i => i.id !== targetItem.id));
              Alert.alert('Sucesso', 'Publicação excluída com sucesso.');
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir a publicação.');
            }
          },
        },
      ]
    );
  };

  const formatJoinDate = (dateStr) => {
    if (!dateStr) return 'Membro da Comunidade';
    try {
      const d = new Date(dateStr);
      const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      return `Membro desde ${months[d.getMonth()]} de ${d.getFullYear()}`;
    } catch {
      return 'Membro da Comunidade';
    }
  };

  const formatReviewDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return '';
    }
  };

  const getStarLabel = (stars) => {
    switch (stars) {
      case 5: return 'Excelente experiência! ⭐⭐⭐⭐⭐';
      case 4: return 'Muito boa experiência! ⭐⭐⭐⭐';
      case 3: return 'Experiência regular ⭐⭐⭐';
      case 2: return 'Experiência abaixo do esperado ⭐⭐';
      case 1: return 'Experiência ruim ⭐';
      default: return 'Selecione uma nota';
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>Carregando perfil...</Text>
      </View>
    );
  }

  const displayName = profile?.name || initialName || 'Membro WeFIND';
  const initial = displayName.trim()[0]?.toUpperCase() || 'U';
  const avatarUri = profile?.avatar_url || profile?.avatarUrl || initialAvatar;
  const city = profile?.city;
  const state = profile?.state;
  const neighborhood = profile?.neighborhood;
  // Sem cidade/estado a linha simplesmente não aparece
  const locationSummary = (city && state) ? `${city} - ${state}` : (city || state || '');
  const hasRatings = ratingsData.total > 0 && ratingsData.average != null;
  const ratingAverageText = hasRatings ? ratingsData.average.toFixed(1).replace('.', ',') : '';
  const latestPostDate = userItems
    .map((i) => new Date(i.created_at || i.date).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  const activePosts = userItems.filter(i => !i.resolved && i.status !== 'resolved');
  const resolvedPosts = userItems.filter(i => i.resolved || i.status === 'resolved');
  const lostPosts = userItems.filter(i => i.status === 'lost' && !i.resolved);
  const foundPosts = userItems.filter(i => i.status === 'found' && !i.resolved);
  const adoptionPosts = userItems.filter(i => (i.extra_fields?.is_direct_adoption || itemsService.isPetAvailableForAdoption(i)) && !i.resolved);

  const filteredItems = userItems.filter(item => {
    if (activePostTab === 'all') return true;
    if (activePostTab === 'lost') return item.status === 'lost' && !item.resolved;
    if (activePostTab === 'found') return item.status === 'found' && !item.resolved;
    if (activePostTab === 'adoption') return (item.extra_fields?.is_direct_adoption || itemsService.isPetAvailableForAdoption(item)) && !item.resolved;
    if (activePostTab === 'resolved') return item.resolved || item.status === 'resolved';
    return true;
  });

  const existingMyRating = ratingsData.ratings.find(r => r.reviewerId === currentUser?.id);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. HERO HEADER CARD */}
      <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={[styles.heroCover, { backgroundColor: isDark ? '#11221C' : COLORS.primaryLight }]}>
          <View style={styles.heroCoverOverlay} />
        </View>

        {/* Avatar e Badges */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarWrapper, { backgroundColor: colors.surface, borderColor: colors.background }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Informações do Membro */}
        <View style={styles.profileInfoContainer}>
          <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>

          {/* Badge de Nível de Guardião Comunitário WeFIND */}
          {APP_FEATURES.gamification && gamificationData?.rank && (
            <View
              style={[
                styles.guardianBadge,
                {
                  backgroundColor: isDark ? 'rgba(46, 86, 52, 0.3)' : (gamificationData.rank.currentRank.badgeBg || '#DCFCE7'),
                  borderColor: gamificationData.rank.currentRank.color || '#166534',
                },
              ]}
            >
              <MaterialIcons
                name={gamificationData.rank.currentRank.icon || 'shield'}
                size={15}
                color={gamificationData.rank.currentRank.color || '#166534'}
              />
              <Text
                style={[
                  styles.guardianBadgeText,
                  { color: gamificationData.rank.currentRank.color || '#166534' },
                ]}
              >
                {gamificationData.rank.title} • {gamificationData.xp} XP
              </Text>
            </View>
          )}

          {/* Badge de Reputação / Estrelas */}
          <TouchableOpacity
            onPress={() => setActiveMainSection('ratings')}
            style={[styles.reputationBadge, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderColor: '#F59E0B' }]}
            activeOpacity={0.8}
          >
            <MaterialIcons name={hasRatings ? 'star' : 'star-border'} size={16} color="#F59E0B" />
            {hasRatings ? (
              <>
                <Text style={[styles.reputationScore, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                  {ratingAverageText}
                </Text>
                <Text style={[styles.reputationCount, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                  ({ratingsData.total} {ratingsData.total === 1 ? 'classificação' : 'classificações'})
                </Text>
              </>
            ) : (
              <Text style={[styles.reputationCount, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                Sem classificações
              </Text>
            )}
          </TouchableOpacity>

          {/* Localização (só quando informada) e Data de entrada */}
          <View style={styles.metaRow}>
            {locationSummary ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="location-on" size={15} color={colors.primary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {locationSummary}{neighborhood ? ` (${neighborhood})` : ''}
                </Text>
              </View>
            ) : null}

            <View style={styles.metaItem}>
              <MaterialIcons name="event" size={15} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {formatJoinDate(profile?.created_at)}
              </Text>
            </View>
          </View>

          {/* Bio / Apresentação */}
          {profile?.bio ? (
            <Text style={[styles.bioText, { color: colors.textSecondary }]}>
              "{profile.bio}"
            </Text>
          ) : null}

          {/* Ações rápidas */}
          <View style={styles.actionButtonsRow}>
            {!isOwnProfile && (
              <TouchableOpacity
                onPress={handleOpenChat}
                style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <MaterialIcons name="chat-bubble-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryActionBtnText}>Mensagem</Text>
              </TouchableOpacity>
            )}

            {!isOwnProfile && ratingEligible && (
              <TouchableOpacity
                onPress={handleOpenRatingModal}
                style={[styles.rateActionBtn, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderColor: '#F59E0B' }]}
                activeOpacity={0.85}
              >
                <MaterialIcons name="star" size={17} color="#D97706" style={{ marginRight: 5 }} />
                <Text style={[styles.rateActionBtnText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                  Classificar
                </Text>
              </TouchableOpacity>
            )}

          </View>

          {/* INSÍGNIA DE LAR TEMPORÁRIO SOLIDÁRIO */}
          {APP_FEATURES.fosterVolunteers && fosterProfile?.isActive && (
            <View style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              backgroundColor: isDark ? 'rgba(22, 163, 74, 0.12)' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(22, 163, 74, 0.3)' : '#BBF7D0',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="home-work" size={15} color="#16A34A" />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803D' }}>
                  Voluntário de Lar Temporário
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: isDark ? '#CBD5E1' : '#166534', lineHeight: 16 }}>
                Disponível para acolher: {fosterProfile.species?.map(s => s === 'dogs' ? '🐶 Cães' : (s === 'cats' ? '🐱 Gatos' : (s === 'birds' ? '🦜 Aves' : '🐾 Outros'))).join(', ') || 'Pets'}.
                {fosterProfile.neighborhood ? ` • ${fosterProfile.neighborhood}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Grid de Estatísticas de Impacto */}
        <View style={[styles.statsGrid, { borderColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
          <TouchableOpacity onPress={() => { setActiveMainSection('posts'); setActivePostTab('all'); }} style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{userItems.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Publicações</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

          <TouchableOpacity onPress={() => { setActiveMainSection('posts'); setActivePostTab('resolved'); }} style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#2E5634' }]}>{resolvedPosts.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Reencontros</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

          <TouchableOpacity onPress={() => setActiveMainSection('ratings')} style={styles.statBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name={hasRatings ? 'star' : 'star-border'} size={16} color="#F59E0B" style={{ marginRight: 2 }} />
              <Text style={[styles.statNumber, { color: hasRatings ? '#D97706' : colors.textMuted }]}>{hasRatings ? ratingAverageText : '—'}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{hasRatings ? 'Reputação' : 'Sem notas'}</Text>
          </TouchableOpacity>
        </View>

        {/* Atividade na comunidade */}
        <View style={[styles.activityCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: colors.cardBorder }]}>
          <Text style={[styles.activityTitle, { color: colors.text }]}>Atividade na comunidade</Text>
          {[
            { icon: 'visibility', color: '#D97706', label: 'Avistamentos compartilhados', value: String(sightingsCount) },
            { icon: 'search', color: '#DC2626', label: 'Procurando agora', value: String(lostPosts.length) },
            { icon: 'volunteer-activism', color: '#16A34A', label: 'Encontrados ou para adoção', value: String(new Set([...foundPosts, ...adoptionPosts].map((i) => i.id)).size) },
            latestPostDate ? { icon: 'schedule', color: colors.textMuted, label: 'Última publicação', value: formatReviewDate(latestPostDate) } : null,
          ].filter(Boolean).map((row) => (
            <View key={row.label} style={styles.activityRow}>
              <MaterialIcons name={row.icon} size={16} color={row.color} style={{ marginRight: 8 }} />
              <Text style={[styles.activityLabel, { color: colors.textSecondary }]}>{row.label}</Text>
              <Text style={[styles.activityValue, { color: colors.text }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* PAINEL DE MODERAÇÃO DE MEMBRO (SUPER ADMIN) */}
        {isAdmin && !isOwnProfile && (
          <View style={{ marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7', borderWidth: 1, borderColor: isDark ? '#D97706' : '#FDE68A' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="admin-panel-settings" size={18} color="#D97706" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#FCD34D' : '#92400E' }}>
                  Moderação Super Admin
                </Text>
              </View>
              <View style={{ backgroundColor: profile?.role === 'admin' || profile?.adm ? '#2E5634' : '#64748B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' }}>
                  {profile?.role === 'admin' || profile?.adm ? 'ADMIN' : 'USUÁRIO'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={handleToggleAdminRole}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="shield" size={15} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                  {profile?.role === 'admin' || profile?.adm ? 'Revogar Admin' : 'Tornar Admin'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDeleteUserAccount}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="delete-forever" size={16} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>
                  Excluir Conta
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* 2. CHIP TOGGLE PRINCIPAL: PUBLICAÇÕES VS AVALIAÇÕES */}
      <View style={styles.mainToggleContainer}>
        <TouchableOpacity
          onPress={() => setActiveMainSection('posts')}
          style={[
            styles.mainToggleBtn,
            { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.cardBorder },
            activeMainSection === 'posts' && [styles.mainToggleBtnActive, { backgroundColor: colors.primary, borderColor: colors.primary }],
          ]}
          activeOpacity={0.85}
        >
          <MaterialIcons name="pets" size={17} color={activeMainSection === 'posts' ? '#FFFFFF' : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.mainToggleText, { color: activeMainSection === 'posts' ? '#FFFFFF' : colors.textSecondary }]}>
            Publicações ({userItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveMainSection('ratings')}
          style={[
            styles.mainToggleBtn,
            { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.cardBorder },
            activeMainSection === 'ratings' && [styles.mainToggleBtnActive, { backgroundColor: colors.primary, borderColor: colors.primary }],
          ]}
          activeOpacity={0.85}
        >
          <MaterialIcons name="star" size={17} color={activeMainSection === 'ratings' ? '#FFFFFF' : '#F59E0B'} style={{ marginRight: 6 }} />
          <Text style={[styles.mainToggleText, { color: activeMainSection === 'ratings' ? '#FFFFFF' : colors.textSecondary }]}>
            Classificações ({ratingsData.total})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. CONTEÚDO: SEÇÃO DE PUBLICAÇÕES */}
      {activeMainSection === 'posts' && (
        <View style={styles.postsSection}>
          {/* Filtros em Abas de Pets */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {[
              { key: 'all', label: `Todos (${userItems.length})` },
              { key: 'lost', label: `Perdidos (${lostPosts.length})` },
              { key: 'found', label: `Encontrados (${foundPosts.length})` },
              { key: 'adoption', label: `Adoção (${adoptionPosts.length})` },
              { key: 'resolved', label: `Reencontrados (${resolvedPosts.length})` },
            ].map((tab) => {
              const isSelected = activePostTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActivePostTab(tab.key)}
                  style={[
                    styles.tabChip,
                    { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: isDark ? '#334155' : '#E2E8F0' },
                    isSelected && [styles.tabChipActive, { backgroundColor: colors.primary, borderColor: colors.primary }],
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabChipText, { color: isDark ? '#94A3B8' : '#475569' }, isSelected && styles.tabChipTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Lista de Pets */}
          {filteredItems.length === 0 ? (
            <View style={[styles.emptyPostsCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <MaterialIcons name="pets" size={38} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyPostsTitle, { color: colors.text }]}>Nenhuma publicação nesta categoria</Text>
              <Text style={[styles.emptyPostsSubtitle, { color: colors.textSecondary }]}>
                {displayName.split(' ')[0]} não possui anúncios com este status no momento.
              </Text>
            </View>
          ) : (
            filteredItems.map((item) => {
              const isAdoption = Boolean(item.extra_fields?.is_direct_adoption || itemsService.isPetAvailableForAdoption(item));
              const isResolved = item.resolved || item.status === 'resolved';
              const isFound = !isAdoption && !isResolved && item.status === 'found';

              const statusBg = isResolved
                ? (isDark ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5')
                : isAdoption
                ? (isDark ? 'rgba(219, 39, 119, 0.2)' : '#FDF2F8')
                : isFound
                ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5')
                : (isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2');

              const statusTextColor = isResolved
                ? '#2E5634'
                : isAdoption
                ? '#DB2777'
                : isFound
                ? '#2E5634'
                : '#DC2626';

              const statusLabel = isResolved
                ? 'Reencontrado 🎉'
                : isAdoption
                ? 'Para Adoção'
                : isFound
                ? 'Encontrado'
                : 'Perdido';

              const photoUrl = item.item_photos?.[0]?.url || item.photos?.[0] || item.photo_url || null;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.petCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                  onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                  activeOpacity={0.88}
                >
                  <View style={styles.petCardContent}>
                    <View style={[styles.petImageContainer, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
                      {photoUrl ? (
                        <OptimizedImage uri={photoUrl} style={styles.petImage} resizeMode="cover" />
                      ) : (
                        <MaterialIcons name="pets" size={30} color={colors.textMuted} />
                      )}
                    </View>

                    <View style={styles.petInfoContainer}>
                      <View style={styles.petStatusRow}>
                        <View style={[styles.petStatusBadge, { backgroundColor: statusBg }]}>
                          <Text style={[styles.petStatusBadgeText, { color: statusTextColor }]}>{statusLabel}</Text>
                        </View>
                        {item.species ? (
                          <Text style={[styles.petSpeciesText, { color: colors.textMuted }]}>
                            {item.species.toUpperCase()}
                          </Text>
                        ) : null}
                      </View>

                      <Text style={[styles.petTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.title || item.species || 'Animal'}
                      </Text>

                      {item.breed ? (
                        <Text style={[styles.petBreed, { color: colors.textSecondary }]} numberOfLines={1}>
                          Raça: {item.breed}
                        </Text>
                      ) : null}

                      <View style={styles.petLocationRow}>
                        <MaterialIcons name="location-on" size={13} color={colors.primary} />
                        <Text style={[styles.petLocationText, { color: colors.textMuted }]} numberOfLines={1}>
                          {item.city && item.state ? `${item.city} - ${item.state}` : (item.city || item.state || 'Local não informado')}
                        </Text>
                      </View>
                    </View>

                    <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} style={{ alignSelf: 'center' }} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* 4. CONTEÚDO: SEÇÃO DE CLASSIFICAÇÕES & AVALIAÇÕES */}
      {activeMainSection === 'ratings' && (
        <View style={styles.ratingsSection}>
          {/* Card Resumo de Avaliações (só com pelo menos uma classificação) */}
          {hasRatings && (
          <View style={[styles.ratingSummaryCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.ratingSummaryLeft}>
              <Text style={[styles.ratingBigScore, { color: colors.text }]}>{ratingAverageText}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <MaterialIcons
                    key={star}
                    name={ratingsData.average >= star ? 'star' : (ratingsData.average >= star - 0.5 ? 'star-half' : 'star-border')}
                    size={20}
                    color="#F59E0B"
                  />
                ))}
              </View>
              <Text style={[styles.ratingTotalText, { color: colors.textMuted }]}>
                {ratingsData.total} {ratingsData.total === 1 ? 'classificação' : 'classificações'}
              </Text>
            </View>

            <View style={styles.ratingBreakdownContainer}>
              {[5, 4, 3, 2, 1].map((s) => {
                const count = ratingsData.breakdown[s] || 0;
                const percentage = ratingsData.total > 0 ? (count / ratingsData.total) * 100 : 0;
                return (
                  <View key={s} style={styles.breakdownRow}>
                    <Text style={[styles.breakdownStarLabel, { color: colors.textSecondary }]}>{s}★</Text>
                    <View style={[styles.breakdownBarTrack, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                      <View style={[styles.breakdownBarFill, { width: `${percentage}%`, backgroundColor: '#F59E0B' }]} />
                    </View>
                    <Text style={[styles.breakdownCountText, { color: colors.textMuted }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          )}

          {/* Quem já classificou vê isso em vez do botão (a nota não é editável) */}
          {!isOwnProfile && existingMyRating && (
            <View style={[styles.alreadyRatedNote, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: isDark ? '#334155' : '#BBF7D0' }]}>
              <MaterialIcons name="check-circle" size={16} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: isDark ? '#CBD5E1' : '#166534' }}>
                Você já classificou {displayName.split(' ')[0]} com {existingMyRating.stars} {existingMyRating.stars === 1 ? 'estrela' : 'estrelas'}.
              </Text>
            </View>
          )}

          {/* Botão de Avaliar */}
          {!isOwnProfile && ratingEligible && (
            <TouchableOpacity
              onPress={handleOpenRatingModal}
              style={[styles.leaveReviewCTA, { backgroundColor: colors.primary }]}
              activeOpacity={0.88}
            >
              <MaterialIcons name="rate-review" size={19} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.leaveReviewCTAText}>
                Classificar Experiência com este Membro
              </Text>
            </TouchableOpacity>
          )}

          {/* Lista de Depoimentos de Avaliação */}
          {ratingsData.ratings.length === 0 ? (
            <View style={[styles.emptyPostsCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <MaterialIcons name="stars" size={42} color="#F59E0B" style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyPostsTitle, { color: colors.text }]}>Sem classificações</Text>
              <Text style={[styles.emptyPostsSubtitle, { color: colors.textSecondary }]}>
                {isOwnProfile
                  ? 'Quem conversar com você pelo chat poderá classificar a experiência 24 horas depois da última mensagem.'
                  : `${displayName.split(' ')[0]} ainda não recebeu classificações. Depois de conversar pelo chat, a classificação é liberada 24 horas após a última mensagem.`}
              </Text>
            </View>
          ) : (
            ratingsData.ratings.map((rating) => (
              <View key={rating.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                {/* Topo do Review: Avatar, Nome, Estrelas e Data */}
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewerAvatar, { backgroundColor: colors.primaryLight }]}>
                    {rating.reviewerAvatar ? (
                      <Image source={{ uri: rating.reviewerAvatar }} style={styles.reviewerAvatarImg} />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                        {rating.reviewerName.trim()[0]?.toUpperCase() || 'U'}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.reviewerName, { color: colors.text }]} numberOfLines={1}>
                      {rating.reviewerName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={{ flexDirection: 'row' }}>
                        {[1, 2, 3, 4, 5].map((st) => (
                          <MaterialIcons
                            key={st}
                            name={st <= rating.stars ? 'star' : 'star-border'}
                            size={14}
                            color="#F59E0B"
                          />
                        ))}
                      </View>
                      <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
                        {formatReviewDate(rating.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => handleDeleteReview(rating)}
                      style={{ padding: 6, backgroundColor: '#FEE2E2', borderRadius: 8, marginLeft: 6 }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="delete-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Tags Elogios */}
                {Array.isArray(rating.tags) && rating.tags.length > 0 ? (
                  <View style={styles.reviewTagsRow}>
                    {rating.tags.map((t, idx) => (
                      <View key={idx} style={[styles.reviewTagBadge, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderColor: '#FDE68A' }]}>
                        <Text style={[styles.reviewTagText, { color: isDark ? '#FBBF24' : '#92400E' }]}>{t}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Comentário */}
                {rating.comment ? (
                  <Text style={[styles.reviewCommentText, { color: isDark ? '#E2E8F0' : '#334155' }]}>
                    "{rating.comment}"
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      )}

      {/* MODAL INTERATIVO PARA CLASSIFICAR / AVALIAR */}
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHandle} />
            {/* Header do Modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitle}>
                <View style={styles.modalHeaderIcon}>
                  <MaterialIcons name="auto-awesome" size={19} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={[styles.modalEyebrow, { color: colors.primary }]}>SUA EXPERIÊNCIA</Text>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Classificar membro</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setRatingModalVisible(false)} style={[styles.modalCloseBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.7 }}>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Como foi sua experiência com <Text style={{ fontWeight: '800', color: colors.text }}>{displayName}</Text>?
              </Text>

              {/* Seletor de Estrelas */}
              <View style={[styles.starsPickerContainer, { backgroundColor: isDark ? '#241F13' : '#FFF9EB', borderColor: isDark ? '#5B4817' : '#FDE7A9' }]}>
                <Text style={[styles.modalRatingPrompt, { color: colors.text }]}>Qual nota você daria?</Text>
                <View style={styles.starsPickerRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setSelectedStars(star)}
                      activeOpacity={0.7}
                      style={styles.starButton}
                    >
                      <MaterialIcons
                        name={star <= selectedStars ? 'star' : 'star-border'}
                        size={36}
                        color="#F59E0B"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.starFeedbackText, { color: '#D97706' }]}>
                  {getStarLabel(selectedStars)}
                </Text>
              </View>

              {/* Elogios e Destaques */}
              <Text style={[styles.formLabel, { color: colors.text }]}>
                O que marcou sua experiência?
              </Text>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>Selecione todas as opções que combinam.</Text>
              <View style={styles.tagsContainer}>
                {ratingsService.POPULAR_RATING_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => handleToggleTag(tag)}
                      style={[
                        styles.tagChip,
                        { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' },
                        isSelected && [styles.tagChipSelected, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7', borderColor: '#F59E0B' }],
                      ]}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons
                        name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                        size={21}
                        color={isSelected ? '#D97706' : (isDark ? '#94A3B8' : '#64748B')}
                        style={{ marginRight: 7 }}
                      />
                      <Text style={[
                        styles.tagChipText,
                        { color: isDark ? '#94A3B8' : '#475569' },
                        isSelected && { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '800' },
                      ]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Comentário / Relato */}
              <Text style={[styles.formLabel, { color: colors.text }]}>
                Quer contar mais? <Text style={{ color: colors.textMuted, fontWeight: '500' }}>(opcional)</Text>
              </Text>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: isDark ? colors.card : '#F8FAFC',
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="Escreva uma mensagem sobre o atendimento, cuidado ou comunicação..."
                placeholderTextColor={colors.textMuted}
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
                numberOfLines={4}
                maxLength={400}
              />

              {/* Botões de Ação */}
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  onPress={() => setRatingModalVisible(false)}
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                  disabled={submittingRating}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSubmitRating}
                  style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }, !selectedStars && { opacity: 0.5 }]}
                  disabled={submittingRating || !selectedStars}
                  activeOpacity={0.85}
                >
                  {submittingRating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.modalSubmitText}>Publicar avaliação</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heroCard: {
    margin: 14,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',  },
  heroCover: {
    height: 72,
    width: '100%',
  },
  heroCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  avatarSection: {
    marginTop: -42,
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '900',
  },
  profileInfoContainer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    alignItems: 'center',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  reputationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 8,
    gap: 4,
  },
  reputationScore: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  reputationCount: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  metaRow: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  bioText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 19,
    marginVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
    width: '100%',
    justifyContent: 'center',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    flex: 1,  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  rateActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,  },
  rateActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCard: {
    marginHorizontal: 14,
    marginTop: 2,
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  activityLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  activityValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  alreadyRatedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: 1,
    height: '60%',
    alignSelf: 'center',
  },
  statNumber: {
    fontSize: 17,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  mainToggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 10,
  },
  mainToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  mainToggleBtnActive: {  },
  mainToggleText: {
    fontSize: 13,
    fontWeight: '800',
  },
  postsSection: {
    paddingHorizontal: 14,
  },
  tabsScroll: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    paddingRight: 10,
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabChipActive: {},
  tabChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  tagChipSelected: {
    borderWidth: 1.5,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyPostsCard: {
    padding: 26,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  emptyPostsTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyPostsSubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  petCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',  },
  petCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  petImageContainer: {
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petInfoContainer: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 4,
  },
  petStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  petStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  petStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  petSpeciesText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  petTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  petBreed: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petImage: {
    width: 86,
    height: 86,
  },
  petInfo: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  petNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  petName: {
    fontSize: 14.5,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  petTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  petTagText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  petMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  petMetaText: {
    fontSize: 11.5,
    flex: 1,
  },
  petLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 3,
  },
  petLocationText: {
    fontSize: 11,
    flex: 1,
  },
  ratingsSection: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  ratingSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,  },
  ratingSummaryLeft: {
    width: 108,
    alignItems: 'center',
    paddingRight: 14,
    borderRightWidth: 1,
  },
  ratingBigScore: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 1,
    marginTop: 2,
  },
  ratingTotalText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  ratingBreakdownContainer: {
    flex: 1,
    paddingLeft: 16,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownStarLabel: {
    width: 24,
    fontSize: 11,
    fontWeight: '800',
  },
  breakdownBarTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownCountText: {
    width: 18,
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  reviewsHeader: {
    marginBottom: 12,
  },
  ratingOverviewCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  ratingBigBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 16,
    borderRightWidth: 1,
  },
  ratingBigNumber: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  ratingStarsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  ratingTotalCount: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  ratingBarsCol: {
    flex: 1,
    paddingLeft: 14,
    gap: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barStarLabel: {
    fontSize: 11,
    fontWeight: '700',
    width: 20,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barCount: {
    fontSize: 10.5,
    fontWeight: '600',
    width: 22,
    textAlign: 'right',
  },
  leaveReviewCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginBottom: 14,  },
  leaveReviewCTAText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 15,
    marginBottom: 12,  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reviewerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '800',
  },
  reviewTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  reviewTagBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reviewTagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  reviewAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  reviewAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAuthorInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  reviewAuthorInfo: {
    flex: 1,
    marginLeft: 10,
  },
  reviewAuthorName: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  reviewDate: {
    fontSize: 11,
    marginTop: 1,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewCommentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  reviewPetContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 4,
  },
  reviewPetContextText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
    marginBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 18,
  },
  modalRatingPrompt: {
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  starsPickerContainer: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 22,
  },
  starsPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  starButton: {
    padding: 4,
  },
  starFeedbackText: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },
  formHint: {
    fontSize: 11.5,
    marginBottom: 10,
  },
  commentInput: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 13.5,
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    flex: 1.5,
    minHeight: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  guardianBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    gap: 5,
  },
  guardianBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
});

export default UserProfileScreen;
