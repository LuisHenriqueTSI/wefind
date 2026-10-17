import React from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { buildGoogleMapsUrl, formatMeetupDate } from '../services/returnMeetups';

// Mostra no mapa do app o ponto combinado para a devolução do animal
const MeetupMapModal = ({ visible, meetup, onClose }) => {
  const insets = useSafeAreaInsets();
  const latitude = Number(meetup?.latitude);
  const longitude = Number(meetup?.longitude);
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  const mapsUrl = buildGoogleMapsUrl(meetup);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.title}>Ponto de encontro</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {meetup?.meeting_at ? formatMeetupDate(meetup.meeting_at) : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
            <Text style={styles.closeText}>Fechar</Text>
          </TouchableOpacity>
        </View>

        {hasCoords ? (
          <MapView
            style={{ flex: 1 }}
            initialRegion={{ latitude, longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
            showsUserLocation
            showsMyLocationButton
          >
            <Marker coordinate={{ latitude, longitude }} title="Ponto de encontro" description={meetup?.address_text || ''} pinColor="#2E5634" />
          </MapView>
        ) : (
          <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#475569' }}>Coordenadas do encontro indisponíveis.</Text>
          </View>
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 }}>
            <MaterialIcons name="place" size={18} color="#2E5634" />
            <Text style={styles.address} numberOfLines={3}>{meetup?.address_text || 'Ponto marcado no mapa'}</Text>
          </View>
          {meetup?.note ? <Text style={styles.note}>📝 {meetup.note}</Text> : null}
          {mapsUrl ? (
            <TouchableOpacity style={styles.mapsBtn} onPress={() => Linking.openURL(mapsUrl).catch(() => {})} activeOpacity={0.85}>
              <MaterialIcons name="directions" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.mapsBtnText}>Abrir rota no Google Maps</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#2E5634' },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2 },
  closeButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)' },
  closeText: { color: '#FFFFFF', fontWeight: '700' },
  footer: { paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  address: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  note: { fontSize: 12.5, color: '#475569', marginBottom: 10 },
  mapsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E5634', borderRadius: 12, paddingVertical: 12 },
  mapsBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

export default MeetupMapModal;
