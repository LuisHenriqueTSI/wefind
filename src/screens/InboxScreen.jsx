import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Image, View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, TextInput, Alert, RefreshControl } from 'react-native';
import { getConversations, getCachedConversations, hideConversation, getMessages } from '../services/messages';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Feather, MaterialIcons } from '@expo/vector-icons';

const InboxScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedConversationKey, setSelectedConversationKey] = useState(null);
  const conversationsLoadedForUserRef = useRef(null);

  const loadConversations = useCallback(async (isSilent = false) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const hasLoadedForUser = conversationsLoadedForUserRef.current === user.id;
    if (!isSilent && !hasLoadedForUser) {
      setLoading(true);
    }
    setError('');

    try {
      // 1. Tenta carregar do cache instantâneo se a lista estiver vazia
      if (!hasLoadedForUser) {
        const cached = await getCachedConversations(user.id);
        if (cached && cached.length > 0) {
          conversationsLoadedForUserRef.current = user.id;
          setConversations(cached);
          setFiltered(cached);
          setLoading(false);
        }
      }

      // 2. Busca do servidor de forma ultra-rápida (batch queries)
      const convs = await getConversations(user.id);
      conversationsLoadedForUserRef.current = user.id;
      setConversations(convs || []);
      setFiltered(convs || []);
    } catch (err) {
      console.log('[InboxScreen] Erro ao carregar conversas:', err.message);
      if (conversationsLoadedForUserRef.current !== user.id) {
        setError(err.message || 'Erro ao carregar conversas');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      // Ao focar na tela, atualiza silenciosamente sem travar a interface
      loadConversations(true);
    }, [loadConversations])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadConversations(true);
  };

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(conversations);
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const s = search.trim().toLowerCase();
    // Filtro instantâneo em memória por nome do contato, título do pet ou última mensagem
    const directMatches = conversations.filter(c =>
      (c.otherName || '').toLowerCase().includes(s) ||
      (c.itemTitle || '').toLowerCase().includes(s) ||
      (c.lastMessage || '').toLowerCase().includes(s)
    );
    setFiltered(directMatches);
  }, [search, conversations]);

  const handleDeleteConversation = (conversation) => {
    Alert.alert(
      'Ocultar conversa',
      `Deseja ocultar a conversa com ${conversation.otherName || 'usuário'}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Ocultar',
          style: 'destructive',
          onPress: async () => {
            try {
              await hideConversation(user.id, conversation.otherId, conversation.itemId);
              setSelectedConversationKey(null);
              loadConversations();
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível ocultar a conversa.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => {
    let time = '';
    if (item.lastMessageAt) {
      const date = new Date(item.lastMessageAt);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (date > new Date(now - 86400000)) {
        time = 'Ontem';
      } else {
        time = date.toLocaleDateString();
      }
    }
    const isSelected = selectedConversationKey === `${item.conversationId || item.otherId}_${item.itemId || ''}`;
    const initial = item.otherName?.trim()[0]?.toUpperCase() || 'U';

    return (
      <View style={[
        styles.convBtn,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
        isSelected && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight },
      ]}>
        <TouchableOpacity
          onPress={() => {
            if (isSelected) {
              setSelectedConversationKey(null);
              return;
            }
            navigation.navigate('ChatScreen', { conversation: item });
          }}
          onLongPress={() => setSelectedConversationKey(`${item.conversationId || item.otherId}_${item.itemId || ''}`)}
          style={styles.convMainButton}
          activeOpacity={0.85}
        >
          {/* Avatar com foto ou inicial estilizada */}
          <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 19 }}>
                {initial}
              </Text>
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {item.otherName || 'Usuário'}
              </Text>
              <Text style={[styles.time, { color: colors.textMuted }]}>{time}</Text>
            </View>

            {/* Chip de Pet Relacionado */}
            {(item.itemTitle || item.isItemDeleted) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, flexWrap: 'wrap', gap: 4 }}>
                <View style={[styles.petChip, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <MaterialIcons name="pets" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                  <Text style={[styles.petChipText, { color: colors.primary }]} numberOfLines={1}>
                    {item.itemTitle || 'Pet'}
                  </Text>
                </View>
                {item.isItemDeleted && (
                  <View style={{
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}>
                    <MaterialIcons name="error-outline" size={10} color={isDark ? '#FCA5A5' : '#DC2626'} style={{ marginRight: 2 }} />
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: isDark ? '#FCA5A5' : '#DC2626' }}>
                      Publicação excluída
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {item.lastPhotoUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="image" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                  Foto enviada
                </Text>
              </View>
            ) : (
              <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.lastMessage || 'Conversa iniciada'}
              </Text>
            )}
          </View>

          {item.unread ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadBadgeText}>{item.unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {isSelected && !item.otherDeleted && (
          <TouchableOpacity
            onPress={() => handleDeleteConversation(item)}
            style={[styles.deleteConversationButton, { backgroundColor: isDark ? '#1E293B' : '#FEE2E2' }]}
            accessibilityLabel={`Apagar conversa com ${item.otherName || 'usuário'}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="trash-2" size={16} color="#DC2626" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />;
  if (error) return <Text style={[styles.error, { backgroundColor: colors.background }]}>{error}</Text>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Barra de Busca de Conversas */}
      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Buscar conversas ou mensagens..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.textMuted}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            style={{ position: 'absolute', right: 10, top: 12, zIndex: 3, padding: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {search.trim() ? (
        searching ? (
          <ActivityIndicator style={{ flex: 1, marginTop: 32 }} size="large" color={colors.primary} />
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={item => `${item.conversation.otherId}_${item.conversation.itemId}_${item.message.id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => navigation.navigate('ChatScreen', { conversation: item.conversation, highlightMessageId: item.message.id })}
                style={[styles.convBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder, flexDirection: 'column', alignItems: 'flex-start' }]}
                activeOpacity={0.85}
              >
                <Text style={{ fontWeight: '800', color: colors.primary, marginBottom: 4 }}>
                  {item.conversation.otherName} {item.conversation.itemTitle ? `· ${item.conversation.itemTitle}` : ''}
                </Text>
                <Text style={{ color: isDark ? '#F8FAFC' : '#1F2937', fontSize: 14, backgroundColor: isDark ? '#334155' : '#FFF9C4', borderRadius: 8, padding: 6 }}>
                  {item.message.content}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  {new Date(item.message.sent_at).toLocaleString()}
                </Text>
              </TouchableOpacity>
            )}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
              <Feather name="search" size={36} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma mensagem encontrada</Text>
            <Text style={[styles.emptyMsg, { color: colors.textSecondary }]}>Nenhuma mensagem ou conversa contém o termo pesquisado.</Text>
          </View>
        )
      ) : filtered.length > 0 ? (
        <FlatList
          data={filtered}
          keyExtractor={item => item.conversationId || `${item.otherId || ''}_${item.itemId || ''}`}
          renderItem={renderItem}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons name="chat-bubble-outline" size={38} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma conversa ainda</Text>
          <Text style={[styles.emptyMsg, { color: colors.textSecondary }]}>
            Quando você trocar mensagens sobre um animal com outros tutores, elas aparecerão aqui em tempo real.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    top: 14,
    zIndex: 2,
  },
  searchInput: {
    height: 48,
    borderRadius: 16,
    paddingLeft: 42,
    paddingRight: 36,
    fontSize: 15,
    borderWidth: 1,
  },
  convBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 18,
    gap: 10,  },
  convMainButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 12,
  },
  deleteConversationButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    resizeMode: 'cover',
  },
  name: {
    fontWeight: '800',
    fontSize: 15.5,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 11.5,
    fontWeight: '600',
    flexShrink: 0,
  },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  petChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lastMessage: {
    fontSize: 13,
    lineHeight: 17,
  },
  unreadBadge: {
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11.5,
  },
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyMsg: {
    fontSize: 13.5,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 19,
  },
});

export default InboxScreen;
