import React, { useEffect, useState } from 'react';
import { Image, PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as itemsService from '../services/items';

// ---------------------------------------------------------------------------
// Marcador do mapa com a FOTO CIRCULAR do animal
// ---------------------------------------------------------------------------
// Como o Android desenha um marcador personalizado:
//  - O react-native-maps NÃO mostra a View do marcador "ao vivo" no Android.
//    Ele desenha a View dentro de uma imagem (bitmap) e entrega essa imagem
//    pronta ao Google Maps.
//  - Com a Nova Arquitetura ligada (app.json -> "newArchEnabled": true) e o
//    react-native-maps 1.20.1, esse bitmap tem SEMPRE 100 x 100 pixels físicos
//    (o tamanho real da View nunca chega à parte nativa). Tudo o que passar
//    disso é cortado à direita e embaixo: um círculo maior que 100 px deixa de
//    ser círculo.
//  - Sombras (elevation / shadow*) também não aparecem nesse bitmap.
//
// Por isso:
//  - no Android o marcador mede exatamente 100 x 100 px e o círculo fica
//    centralizado nele (a âncora 0.5 / 0.5 cai no centro da foto);
//  - a foto é recortada em círculo e os anéis (branco e colorido) são
//    desenhados POR CIMA da borda dela, o que deixa o contorno liso;
//  - a "sombra" é um círculo escuro translúcido, que aparece no bitmap.
// ---------------------------------------------------------------------------

const PIXEL_RATIO = PixelRatio.get();
const toDp = (px) => px / PIXEL_RATIO;

// Tamanho do quadrado do marcador, em pixels físicos.
const BOX_PX = Platform.OS === 'android' ? 100 : Math.round(40 * PIXEL_RATIO);

// Diâmetro do círculo: o máximo que cabe no quadrado (sobra espaço para a
// sombra), limitado a 46 dp em telas de baixa densidade.
let circlePx = Math.min(BOX_PX - 6, Math.round(46 * PIXEL_RATIO));
if ((BOX_PX - circlePx) % 2 !== 0) circlePx -= 1; // mantém o círculo no centro exato

const CIRCLE_PX = circlePx;
const CIRCLE_OFFSET_PX = (BOX_PX - CIRCLE_PX) / 2;
const RING_PX = Math.max(2, Math.round(CIRCLE_PX * 0.075)); // anel colorido (status)
const GAP_PX = Math.max(1, Math.round(CIRCLE_PX * 0.032)); // filete branco entre o anel e a foto
const OVERLAP_PX = Math.max(1, Math.round(CIRCLE_PX * 0.02)); // borda da foto escondida sob o filete
const SHADOW_DROP_PX = Math.min(CIRCLE_OFFSET_PX, Math.max(1, Math.round(CIRCLE_PX * 0.032)));
const INNER_PX = CIRCLE_PX - 2 * (RING_PX + GAP_PX); // parte visível da foto
const PHOTO_PX = INNER_PX + 2 * OVERLAP_PX;
const ICON_PX = Math.round(INNER_PX * 0.68);

// Quanto tempo esperar a foto chegar antes de "congelar" o marcador com o ícone.
// Se a foto chegar depois disso, o marcador é redesenhado com ela.
const PHOTO_MAX_WAIT_MS = 4000;
// Depois que tudo carregou, mantém o redesenho ligado mais um pouco por segurança.
const FREEZE_DELAY_MS = 500;

const circleAt = (offsetPx, sizePx) => ({
  position: 'absolute',
  left: toDp(offsetPx),
  top: toDp(offsetPx),
  width: toDp(sizePx),
  height: toDp(sizePx),
  borderRadius: toDp(sizePx) / 2,
});

const markerStyles = StyleSheet.create({
  box: {
    width: toDp(BOX_PX),
    height: toDp(BOX_PX),
  },
  shadow: {
    ...circleAt(CIRCLE_OFFSET_PX, CIRCLE_PX),
    top: toDp(CIRCLE_OFFSET_PX + SHADOW_DROP_PX),
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  disc: {
    ...circleAt(CIRCLE_OFFSET_PX, CIRCLE_PX),
    backgroundColor: '#FFFFFF',
  },
  iconSlot: {
    ...circleAt((BOX_PX - INNER_PX) / 2, INNER_PX),
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: circleAt((BOX_PX - PHOTO_PX) / 2, PHOTO_PX),
  // Começa 1 px por baixo do anel colorido e cobre a borda da foto.
  whiteRing: {
    ...circleAt(CIRCLE_OFFSET_PX + RING_PX - 1, CIRCLE_PX - 2 * (RING_PX - 1)),
    borderWidth: toDp(GAP_PX + 1),
    borderColor: '#FFFFFF',
  },
  statusRing: {
    ...circleAt(CIRCLE_OFFSET_PX, CIRCLE_PX),
    borderWidth: toDp(RING_PX),
  },
});

const MARKER_ICON_SIZE = toDp(ICON_PX);

export const getSpeciesIcon = (item) => {
  const species = String(item.species || item.extra_fields?.species || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const title = String(item.title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const value = `${species} ${title}`;

  if (/\b(cachorro|cao|canino|dog)\b/.test(value)) return 'dog';
  if (/\b(gato|felino|cat)\b/.test(value)) return 'cat';
  if (/\b(ave|aves|passaro|calopsita|papagaio|bird)\b/.test(value)) return 'bird';
  if (/\b(cavalo|equino|egua|horse)\b/.test(value)) return 'horse';
  if (/\b(bovino|vaca|boi|cow)\b/.test(value)) return 'cow';
  if (/\b(coelho|rabbit)\b/.test(value)) return 'rabbit';
  return 'paw';
};

// Mesma foto usada no cartão do animal selecionado: a primeira de item_photos.
export const getMarkerPhotoUrl = (item) => {
  const photos = Array.isArray(item?.item_photos) ? item.item_photos : [];
  const photo = photos.find((p) => typeof p?.url === 'string' && p.url.trim().length > 0);
  return photo ? photo.url.trim() : null;
};

const PetMapMarker = React.memo(({ item, isSelected, onPress, onCalloutPress }) => {
  const photoUrl = getMarkerPhotoUrl(item);

  // Situação da foto, sempre ligada à URL atual:
  // 'none' (sem foto) | 'loading' | 'loaded' | 'slow' (demorou) | 'error'
  const [photoState, setPhotoState] = useState({ url: null, status: 'loading' });
  const photoStatus = !photoUrl
    ? 'none'
    : photoState.url === photoUrl
      ? photoState.status
      : 'loading';

  const [iconFontReady, setIconFontReady] = useState(false);
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  // Animais perdidos: o ponto informado costuma ser a casa do tutor. O marcador
  // é arredondado para uma grade de cerca de 100 m, mostrando a região, não o imóvel.
  const isLostItem = item.status === 'lost';
  const roundToRegion = (value) => Math.round(Number(value) * 1000) / 1000;
  const coordinate = {
    latitude: isLostItem ? roundToRegion(item.latitude) : Number(item.latitude),
    longitude: isLostItem ? roundToRegion(item.longitude) : Number(item.longitude),
  };

  const isAdoption = itemsService.isPetAvailableForAdoption(item);
  const isFound = !isAdoption && item.status === 'found';
  const statusColor = isAdoption ? '#DB2777' : (isFound ? '#16A34A' : '#EA580C');
  const speciesIcon = getSpeciesIcon(item);

  // O ícone de reserva (sem foto / foto com erro) usa a fonte de ícones.
  useEffect(() => {
    let isMounted = true;
    const markReady = () => {
      if (isMounted) setIconFontReady(true);
    };

    Promise.resolve(MaterialCommunityIcons.loadFont?.())
      .then(markReady, (error) => {
        console.warn('[PetMapMarker] Não foi possível carregar o ícone do marcador:', error);
        markReady();
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Foto demorando demais: para de redesenhar (economiza bateria). Se ela
  // chegar depois, o onLoad marca 'loaded' e o marcador é redesenhado.
  useEffect(() => {
    if (photoStatus !== 'loading') return undefined;
    const timer = setTimeout(() => {
      setPhotoState((current) => (current.url === photoUrl ? current : { url: photoUrl, status: 'slow' }));
    }, PHOTO_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [photoStatus, photoUrl]);

  // Enquanto algo está carregando, o Android redesenha o bitmap do marcador a
  // cada quadro. Quando tudo está pronto, congela (mais leve para o mapa).
  useEffect(() => {
    setTracksViewChanges(true);
    if (!iconFontReady || photoStatus === 'loading') return undefined;
    const timer = setTimeout(() => setTracksViewChanges(false), FREEZE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [iconFontReady, photoStatus, photoUrl, statusColor, speciesIcon]);

  const showPhoto = Boolean(photoUrl) && photoStatus !== 'error';
  const showIcon = photoStatus !== 'loaded';

  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      onCalloutPress={onCalloutPress}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      calloutAnchor={{ x: 0.5, y: 0.0 }}
      zIndex={isSelected ? 2 : 1}
    >
      {/* Círculo do marcador: sombra, fundo, foto (ou ícone) e anéis por cima */}
      <View collapsable={false} style={markerStyles.box}>
        <View style={markerStyles.shadow} />
        <View style={markerStyles.disc} />

        {showIcon && (
          <View style={markerStyles.iconSlot}>
            <MaterialCommunityIcons name={speciesIcon} size={MARKER_ICON_SIZE} color={statusColor} />
          </View>
        )}

        {showPhoto && (
          <Image
            source={{ uri: photoUrl }}
            style={markerStyles.photo}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={0}
            onLoad={() => setPhotoState({ url: photoUrl, status: 'loaded' })}
            onError={() => setPhotoState({ url: photoUrl, status: 'error' })}
          />
        )}

        <View style={markerStyles.whiteRing} />
        <View style={[markerStyles.statusRing, { borderColor: statusColor }]} />
      </View>

      {/* Balão de Seleção Perfeitamente Centralizado Acima do Marcador */}
      <Callout
        onPress={onCalloutPress}
        style={{ width: 160 }}
      >
        <View style={{ width: 160, paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', textAlign: 'center', width: '100%' }} numberOfLines={1}>
            {item.title || 'Animal'}
          </Text>
          <View style={{
            backgroundColor: statusColor + '20',
            borderColor: statusColor,
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
            alignItems: 'center',
            marginTop: 3,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: statusColor, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {isAdoption ? 'Para Adoção' : (isFound ? 'Encontrado' : 'Perdido')}
            </Text>
          </View>
          <Text style={{ fontSize: 9.5, color: '#64748B', marginTop: 3 }}>
            Toque para ver detalhes
          </Text>
        </View>
      </Callout>
    </Marker>
  );
});

export default PetMapMarker;
