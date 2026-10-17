import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';

const AdvancedFiltersModal = ({
  visible,
  onClose,
  currentFilters,
  onApply,
  onClear,
}) => {
  const { colors, isDark } = useTheme();

  // Local state for the modal so changes only apply when "Aplicar" is pressed
  const [localFilters, setLocalFilters] = useState(currentFilters || {});

  // Sync local filters when the modal opens
  useEffect(() => {
    if (visible && currentFilters) {
      setLocalFilters(currentFilters);
    }
  }, [visible, currentFilters]);

  // Avoid error if localFilters is undefined
  const safeFilters = localFilters || {};
  const activeCount = Object.values(safeFilters).filter(v => v !== 'all').length;

  const handleApply = () => {
    onApply(safeFilters);
    onClose();
  };

  const handleClear = () => {
    const emptyFilters = {
      animalType: 'all',
      size: 'all',
      gender: 'all',
      age: 'all',
      colors: 'all',
      hasReward: false,
      sortBy: 'distance',
    };
    setLocalFilters(emptyFilters);
  };

  const renderSection = (title, field, options) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {title}
      </Text>
      <View style={styles.pillContainer}>
        {options.map((opt) => {
          const isSelected = (safeFilters[field] || 'all') === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.pill,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
                isSelected && [
                  styles.pillActive,
                  { backgroundColor: colors.primary, borderColor: colors.primary },
                ],
              ]}
              onPress={() => setLocalFilters({ ...safeFilters, [field]: opt.value })}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: isDark ? '#94A3B8' : '#475569' },
                  isSelected && styles.pillTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
              <View style={styles.headerLeft}>
                <MaterialIcons name="tune" size={24} color={colors.primary} />
                <Text style={[styles.title, { color: colors.text }]}>Filtros avançados</Text>
                {activeCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.primaryLight, borderColor: COLORS.primaryBorder }]}>
                    <Text style={[styles.badgeText, { color: colors.primary }]}>{activeCount}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Filters */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {renderSection('Espécie', 'animalType', [
                { label: 'Todas', value: 'all' },
                { label: 'Cachorro', value: 'cachorro' },
                { label: 'Gato', value: 'gato' },
                { label: 'Ave', value: 'ave' },
                { label: 'Cavalo', value: 'cavalo' },
                { label: 'Bovino', value: 'bovino' },
                { label: 'Outro', value: 'outro' },
              ])}
              
              {renderSection('Porte', 'size', [
                { label: 'Todos', value: 'all' },
                { label: 'Pequeno', value: 'pequeno' },
                { label: 'Médio', value: 'medio' },
                { label: 'Grande', value: 'grande' },
                { label: 'Gigante', value: 'gigante' },
              ])}

              {renderSection('Sexo', 'gender', [
                { label: 'Todos', value: 'all' },
                { label: 'Macho', value: 'macho' },
                { label: 'Fêmea', value: 'femea' },
              ])}

              {renderSection('Idade', 'age', [
                { label: 'Todas', value: 'all' },
                { label: 'Filhote', value: 'filhote' },
                { label: 'Adulto', value: 'adulto' },
                { label: 'Idoso', value: 'idoso' },
              ])}

              {renderSection('Cor', 'colors', [
                { label: 'Todas', value: 'all' },
                { label: 'Preto', value: 'preto' },
                { label: 'Branco', value: 'branco' },
                { label: 'Marrom', value: 'marrom' },
                { label: 'Caramelo', value: 'caramelo' },
                { label: 'Cinza', value: 'cinza' },
                { label: 'Amarelo', value: 'amarelo' },
                { label: 'Mesclado', value: 'mesclado' },
                { label: 'Outra', value: 'outra' },
              ])}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Destaque e ordenação</Text>
                <View style={styles.pillContainer}>
                  <TouchableOpacity
                    onPress={() => setLocalFilters(prev => ({ ...prev, hasReward: !prev.hasReward }))}
                    style={[
                      styles.pill,
                      { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' },
                      safeFilters.hasReward && [styles.pillActive, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7', borderColor: '#F59E0B' }],
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.pillText,
                      { color: isDark ? '#94A3B8' : '#475569' },
                      safeFilters.hasReward && { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '800' },
                    ]}>
                      Com recompensa
                    </Text>
                  </TouchableOpacity>

                  {[
                    { label: 'Mais próximos', value: 'distance' },
                    { label: 'Mais recentes', value: 'newest' },
                    { label: 'Mais antigos', value: 'oldest' },
                  ].map(opt => {
                    const isSelected = (safeFilters.sortBy || 'distance') === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setLocalFilters({ ...safeFilters, sortBy: opt.value })}
                        style={[
                          styles.pill,
                          { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' },
                          isSelected && [styles.pillActive, { backgroundColor: colors.primary, borderColor: colors.primary }],
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.pillText, { color: isDark ? '#94A3B8' : '#475569' }, isSelected && styles.pillTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={[styles.footer, { borderTopColor: isDark ? '#334155' : '#F1F5F9' }]}>
              <TouchableOpacity
                style={[styles.btnOutline, { borderColor: isDark ? '#475569' : '#CBD5E1' }]}
                onPress={handleClear}
              >
                <Text style={[styles.btnOutlineText, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                  Limpar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleApply}
              >
                <Text style={styles.btnPrimaryText}>Aplicar filtros</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillActive: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  btnOutline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 15,
    fontWeight: '700',
  },
  btnPrimary: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default AdvancedFiltersModal;