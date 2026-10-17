import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';
import { getMyPets, deletePet, declarePetLost } from '../services/myPets';
import PetRgCard from '../components/PetRgCard';
import PetFallbackImage from '../components/PetFallbackImage';

const MyPetsScreen = ({ navigation }) => {
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRgPet, setSelectedRgPet] = useState(null);
  const [declaringLostId, setDeclaringLostId] = useState(null);

  const loadPets = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getMyPets(user.id);
      setPets(data || []);
    } catch (error) {
      console.warn('[MyPetsScreen] Erro ao carregar pets:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadPets();
  }, [loadPets]);

  useFocusEffect(
    useCallback(() => {
      loadPets();
    }, [loadPets])
  );

  const handleDeletePet = (pet) => {
    Alert.alert(
      'Remover pet',
      `Tem certeza que deseja remover ${pet.name} da sua lista de pets?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await deletePet(user.id, pet.id);
              setPets(updated);
              Alert.alert('Sucesso', 'Pet removido com sucesso.');
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível remover o pet: ' + err.message);
            }
          },
        },
      ]
    );
  };

  const handleDeclareLost = (pet) => {
    Alert.alert(
      'Declarar desaparecimento',
      `Seu pet ${pet.name} fugiu ou desapareceu?\n\nVamos criar um alerta de animal perdido no mapa e notificar os voluntários da região imediatamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Avisar agora',
          style: 'destructive',
          onPress: async () => {
            setDeclaringLostId(pet.id);
            try {
              const createdItem = await declarePetLost(user.id, pet, userProfile);
              Alert.alert(
                'Alerta de desaparecimento ativo',
                `A publicação de ${pet.name} foi criada e o alerta foi enviado para a comunidade da região.`,
                [
                  {
                    text: 'Ver publicação',
                    onPress: () => {
                      if (createdItem?.id) {
                        navigation.navigate('ItemDetail', { itemId: createdItem.id });
                      } else {
                        navigation.navigate('MeusAnuncios');
                      }
                    },
                  },
                ]
              );
            } catch (err) {
              Alert.alert('Erro', 'Falha ao disparar alerta: ' + (err.message || 'Tente novamente.'));
            } finally {
              setDeclaringLostId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadPets(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Informativo do RG Pet */}
        <View style={[styles.bannerCard, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: isDark ? '#334155' : '#BBF7D0' }]}>
          <View style={[styles.bannerIconBox, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="badge" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>Identificação e carteirinha digital</Text>
            <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
              Cadastre seus animais tutelados para organizar os dados do pet e ativar o alerta de desaparecimento caso ele fuja.
            </Text>
          </View>
        </View>

        {/* Botão de Adicionar Novo Pet */}
        <TouchableOpacity
          style={[styles.addNewPetBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('AddEditPet')}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={22} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.addNewPetBtnText}>Cadastrar novo pet</Text>
        </TouchableOpacity>

        {/* Lista de Pets */}
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : pets.length === 0 ? (
          <View style={styles.emptyStateBox}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              <MaterialIcons name="pets" size={48} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum pet cadastrado ainda</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Cadastre seus cães, gatos ou outros animais para gerar o RG Pet com foto e contatos.
            </Text>
          </View>
        ) : (
          <View style={styles.petsList}>
            {pets.map((pet) => (
              <View
                key={pet.id}
                style={[styles.petCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                {/* Linha Superior: Foto e Informações Principais */}
                <View style={styles.petCardTopRow}>
                  {pet.photo_url ? (
                    <Image source={{ uri: pet.photo_url }} style={styles.petAvatar} resizeMode="cover" />
                  ) : (
                    <View style={styles.petAvatarFallback}>
                      <PetFallbackImage species={pet.species} breed={pet.breed} color={pet.color} compact />
                    </View>
                  )}

                  <View style={styles.petInfoBox}>
                    <View style={styles.petTitleRow}>
                      <Text style={[styles.petName, { color: colors.text }]} numberOfLines={1}>{pet.name}</Text>
                      <View style={[styles.speciesBadge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <Text style={[styles.speciesBadgeText, { color: colors.primary }]}>{pet.species || 'Pet'}</Text>
                      </View>
                    </View>

                    <Text style={[styles.petMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {pet.breed || 'SRD'} • {pet.size || 'Médio'}
                    </Text>
                    <Text style={[styles.petMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {pet.gender || 'Macho'} • {pet.color || 'Não informado'}
                    </Text>
                    {pet.microchip ? (
                      <Text style={[styles.petChipText, { color: colors.primary }]} numberOfLines={1}>
                        Microchip/registro: {pet.microchip}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Linha de ações da carteirinha, edição e exclusão */}
                <View style={[styles.cardActionsRow, { borderTopColor: colors.border }]}>
                  {/* Botão Ver carteirinha */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(46, 86, 52, 0.25)' : '#DCFCE7' }]}
                    onPress={() => setSelectedRgPet(pet)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="badge" size={16} color="#15803D" style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: '#15803D' }]}>Ver carteirinha</Text>
                  </TouchableOpacity>

                  {/* Botão Editar */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                    onPress={() => navigation.navigate('AddEditPet', { pet })}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Editar</Text>
                  </TouchableOpacity>

                  {/* Botão Excluir */}
                  <TouchableOpacity
                    style={[styles.iconOnlyBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                    onPress={() => handleDeletePet(pet)}
                    activeOpacity={0.8}
                  >
                    <Feather name="trash-2" size={15} color="#DC2626" />
                  </TouchableOpacity>
                </View>

                {/* ALERTA DE DESAPARECIMENTO EM DESTAQUE */}
                <TouchableOpacity
                  style={[styles.panicButton, declaringLostId === pet.id && { opacity: 0.7 }]}
                  onPress={() => handleDeclareLost(pet)}
                  disabled={declaringLostId === pet.id}
                  activeOpacity={0.85}
                >
                  {declaringLostId === pet.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="warning" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.panicButtonText}>Meu pet fugiu</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal Visual do RG Pet */}
      <Modal
        visible={Boolean(selectedRgPet)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRgPet(null)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            {selectedRgPet && (
              <PetRgCard
                pet={selectedRgPet}
                userProfile={userProfile}
                onClose={() => setSelectedRgPet(null)}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  bannerSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  addNewPetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: 16,  },
  addNewPetBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  emptyStateBox: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  petsList: {
    gap: 14,
  },
  petCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    overflow: 'hidden',  },
  petCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  petAvatar: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
  },
  petAvatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
  },
  petInfoBox: {
    flex: 1,
    gap: 2,
  },
  petTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  petName: {
    fontSize: 16,
    fontWeight: '900',
    flex: 1,
    marginRight: 6,
  },
  speciesBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  speciesBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  petMetaText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  petChipText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  iconOnlyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 10,
  },
  panicButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalScrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
});

export default MyPetsScreen;
