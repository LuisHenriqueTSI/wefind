import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { buildGoogleMapsUrl } from '../services/returnMeetups';

// Na web não há mapa nativo: abre o ponto do encontro direto no Google Maps
const MeetupMapModal = ({ visible, meetup, onClose }) => {
  useEffect(() => {
    if (!visible) return;
    const url = buildGoogleMapsUrl(meetup);
    if (url) Linking.openURL(url).catch(() => {});
    onClose?.();
  }, [visible]);

  return null;
};

export default MeetupMapModal;
