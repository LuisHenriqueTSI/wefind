import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import MapLocationPicker from './MapLocationPicker';
import { useTheme } from '../contexts/ThemeContext';
import { formatMeetupDate } from '../services/returnMeetups';
import { removeHouseNumberFromAddress } from '../utils/locationPrivacy';

const DAYS_AHEAD = 14;
const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pad = (value) => String(value).padStart(2, '0');

const toDayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTimeKey = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const buildDate = (dayKey, timeKey) => {
  if (!dayKey || !timeKey) return null;
  const [year, month, day] = dayKey.split('-').map(Number);
  const [hours, minutes] = timeKey.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

// Horários de 30 em 30 minutos (sem seletor nativo, funciona igual no Android, iOS e web)
const BASE_TIME_SLOTS = (() => {
  const slots = [];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
    slots.push(`${pad(hour)}:00`);
    if (hour < LAST_HOUR) slots.push(`${pad(hour)}:30`);
  }
  return slots;
})();

/**
 * Proposta (ou contraproposta) de encontro para devolução do animal:
 * ponto no mapa, data, horário e observação opcional.
 */
const MeetupProposalModal = ({
  visible,
  mode = 'propose', // 'propose' | 'counter' | 'reschedule'
  initialMeetup = null,
  initialCoordinate = null,
  submitting = false,
  onClose,
  onSubmit,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [coordinate, setCoordinate] = useState(null);
  const [addressText, setAddressText] = useState('');
  const [dayKey, setDayKey] = useState('');
  const [timeKey, setTimeKey] = useState('');
  const [note, setNote] = useState('');
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [formError, setFormError] = useState('');

  // Preenche com a proposta anterior (contraproposta) ou deixa em branco
  useEffect(() => {
    if (!visible) return;
    setFormError('');
    if (initialMeetup) {
      const previousDate = new Date(initialMeetup.meeting_at);
      const lat = Number(initialMeetup.latitude);
      const lng = Number(initialMeetup.longitude);
      setCoordinate(Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null);
      setAddressText(initialMeetup.address_text || '');
      setDayKey(Number.isNaN(previousDate.getTime()) ? '' : toDayKey(previousDate));
      setTimeKey(Number.isNaN(previousDate.getTime()) ? '' : toTimeKey(previousDate));
      setNote('');
    } else {
      setCoordinate(null);
      setAddressText('');
      setDayKey(toDayKey(new Date()));
      setTimeKey('');
      setNote('');
    }
  }, [visible, initialMeetup]);

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const label = index === 0 ? 'Hoje' : index === 1 ? 'Amanhã' : WEEKDAYS_SHORT[date.getDay()];
      return { key: toDayKey(date), label, sub: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}` };
    });
  }, [visible]);

  // Mantém o horário da proposta anterior mesmo fora da grade de 30 minutos
  const timeSlots = useMemo(() => {
    const slots = timeKey && !BASE_TIME_SLOTS.includes(timeKey)
      ? [...BASE_TIME_SLOTS, timeKey].sort()
      : BASE_TIME_SLOTS;
    const now = Date.now();
    return slots.map((slot) => {
      const slotDate = buildDate(dayKey, slot);
      return { key: slot, disabled: !slotDate || slotDate.getTime() <= now };
    });
  }, [dayKey, timeKey, visible]);

  // Se trocar o dia e o horário escolhido ficar no passado, limpa o horário
  useEffect(() => {
    if (!timeKey) return;
    const selected = timeSlots.find((slot) => slot.key === timeKey);
    if (selected?.disabled) setTimeKey('');
  }, [timeSlots]);

  const selectedDate = buildDate(dayKey, timeKey);

  const handleConfirmLocation = (location) => {
    if (!location?.coordinate) return;
    setCoordinate(location.coordinate);
    const text = location.addressText
      || [location.street, location.district, [location.city, location.state].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
    setAddressText(removeHouseNumberFromAddress(text) || 'Ponto marcado no mapa');
    setMapPickerVisible(false);
    setFormError('');
  };

  const handleSubmit = () => {
    if (!coordinate) {
      setFormError('Marque no mapa o ponto público de encontro.');
      return;
    }
    if (!selectedDate || selectedDate.getTime() <= Date.now()) {
      setFormError('Escolha um dia e um horário no futuro.');
      return;
    }
    setFormError('');
    onSubmit?.({
      meetingAt: selectedDate,
      coordinate,
      addressText: removeHouseNumberFromAddress(addressText.trim()),
      note: note.trim(),
    });
  };

  const title = mode === 'counter'
    ? 'Sugerir outro horário ou local'
    : mode === 'reschedule'
      ? 'Remarcar encontro'
      : 'Propor encontro para devolução';

  const fieldBg = isDark ? '#0F172A' : '#F8FAFC';
  const accent = '#2E5634';

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <MaterialIcons name="event" size={22} color={isDark ? '#A7F3D0' : accent} />
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Fechar" disabled={submitting}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={[styles.privacyHint, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5', borderColor: isDark ? 'rgba(5, 150, 105, 0.35)' : '#A7F3D0' }]}>
                <MaterialIcons name="shield" size={16} color={isDark ? '#A7F3D0' : accent} />
                <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 16, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  Escolha um local público e movimentado (praça, pet shop, clínica veterinária). Não marque o endereço de casa.
                </Text>
              </View>

              {/* Local */}
              <Text style={[styles.label, { color: colors.text }]}>📍 Ponto de encontro</Text>
              <TouchableOpacity
                style={[styles.locationField, { backgroundColor: fieldBg, borderColor: coordinate ? accent : colors.border }]}
                onPress={() => setMapPickerVisible(true)}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <MaterialIcons name={coordinate ? 'place' : 'add-location-alt'} size={20} color={coordinate ? accent : colors.textMuted} />
                <Text style={{ flex: 1, fontSize: 13, color: coordinate ? colors.text : colors.textMuted }} numberOfLines={2}>
                  {coordinate ? (addressText || 'Ponto marcado no mapa') : 'Toque para escolher no mapa'}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#A7F3D0' : accent }}>
                  {coordinate ? 'Alterar' : 'Abrir mapa'}
                </Text>
              </TouchableOpacity>

              {/* Dia */}
              <Text style={[styles.label, { color: colors.text }]}>🗓️ Dia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {days.map((day) => {
                  const selected = day.key === dayKey;
                  return (
                    <TouchableOpacity
                      key={day.key}
                      style={[styles.dayChip, { backgroundColor: selected ? accent : fieldBg, borderColor: selected ? accent : colors.border }]}
                      onPress={() => setDayKey(day.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: selected ? '#FFFFFF' : colors.text }}>{day.label}</Text>
                      <Text style={{ fontSize: 11, color: selected ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>{day.sub}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Horário */}
              <Text style={[styles.label, { color: colors.text }]}>⏰ Horário</Text>
              <View style={styles.timeGrid}>
                {timeSlots.map((slot) => {
                  const selected = slot.key === timeKey;
                  return (
                    <TouchableOpacity
                      key={slot.key}
                      style={[
                        styles.timeChip,
                        { backgroundColor: selected ? accent : fieldBg, borderColor: selected ? accent : colors.border },
                        slot.disabled && { opacity: 0.35 },
                      ]}
                      onPress={() => setTimeKey(slot.key)}
                      disabled={slot.disabled}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? '#FFFFFF' : colors.text }}>{slot.key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Observação */}
              <Text style={[styles.label, { color: colors.text }]}>📝 Observação (opcional)</Text>
              <TextInput
                style={[styles.noteInput, { backgroundColor: fieldBg, borderColor: colors.border, color: colors.text }]}
                placeholder={mode === 'propose'
                  ? 'Ex.: estarei de camiseta azul; traga coleira ou caixa de transporte'
                  : 'Ex.: nesse horário não consigo, mas às 18h posso'}
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
                maxLength={300}
                multiline
              />
            </ScrollView>

            {selectedDate && coordinate ? (
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }} numberOfLines={2}>
                Resumo: {formatMeetupDate(selectedDate)} • {addressText || 'Ponto marcado no mapa'}
              </Text>
            ) : null}

            {formError ? (
              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700', marginTop: 8 }}>{formError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: accent }, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="send" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>
                    {mode === 'propose' ? 'Enviar proposta' : 'Enviar nova sugestão'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <MapLocationPicker
        visible={mapPickerVisible}
        initialLocation={coordinate || initialCoordinate}
        mode="pin"
        showRadius={false}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={handleConfirmLocation}
      />
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  privacyHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  label: { fontSize: 12.5, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  locationField: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 12 },
  dayChip: { alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minWidth: 62 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: { borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, minWidth: 58, alignItems: 'center' },
  noteInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13, minHeight: 64, textAlignVertical: 'top' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, marginTop: 12 },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

export default MeetupProposalModal;
