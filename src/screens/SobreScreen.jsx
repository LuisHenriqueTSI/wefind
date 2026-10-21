import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as storiesService from '../services/stories';
import * as itemsService from '../services/items';
import OptimizedImage from '../components/OptimizedImage';
import LoginPillButton from '../components/LoginPillButton';
import COLORS from '../constants/theme';
import { APP_FEATURES } from '../constants/features';
import { TERMS_URL, PRIVACY_URL } from '../constants/links';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Medidas do mural calculadas em pixels (porcentagens em elementos absolutos
// não se comportam igual em todos os aparelhos)
const HERO_CONTENT_W = SCREEN_WIDTH - 32 - 44; // padding da tela + padding do bloco
const CARTAZ_W = Math.round(HERO_CONTENT_W * 0.62);
const CARTAZ_IMG_H = Math.round((CARTAZ_W - 14) * (660 / 520));
const HERO_PHONE_W = Math.min(124, Math.round(HERO_CONTENT_W * 0.36));
const MURAL_H = Math.max(CARTAZ_IMG_H + 40, Math.round(HERO_PHONE_W * (1200 / 540)) + 36);

// Paleta da tela (as mesmas cores da landing page)
const MUSGO = '#17301D';
const FITA = '#F2CF5B';

// Telas reais do aplicativo
const SHOTS = {
  cartaz: require('../../assets/conhecer/cartaz.jpeg'),
  mapa: require('../../assets/conhecer/mapa.jpeg'),
  publicar: require('../../assets/conhecer/publicar.jpeg'),
  avistamento: require('../../assets/conhecer/avistamento.jpeg'),
  correspondencias: require('../../assets/conhecer/correspondencias.jpeg'),
  conversa: require('../../assets/conhecer/conversa.jpeg'),
  tutela: require('../../assets/conhecer/tutela.jpeg'),
};

const ETAPAS = [
  {
    shot: 'publicar',
    titulo: 'Publique o caso',
    texto: 'Informe espécie, porte, cor e outras características, adicione até seis fotos e marque no mapa onde o animal sumiu ou foi encontrado. Se quiser, ofereça uma recompensa.',
  },
  {
    shot: 'avistamento',
    titulo: 'A vizinhança avisa onde viu',
    texto: 'Quem cruzar com o animal registra um avistamento com local, horário, descrição e foto. O autor da publicação recebe o aviso na hora.',
  },
  {
    shot: 'correspondencias',
    titulo: 'O app sugere animais parecidos',
    texto: 'O WeFIND compara anúncios de perdidos e encontrados pela espécie, pelas características e pela distância. Quando aparece um animal compatível, você é avisado no app e, se autorizar, no WhatsApp.',
  },
  {
    shot: 'conversa',
    titulo: 'Converse sem expor seu número',
    texto: 'O contato entre quem procura e quem encontrou acontece em um chat privado, com dica de segurança e envio de fotos.',
  },
  {
    shot: 'tutela',
    titulo: 'Comprove que o animal é seu',
    texto: 'Em animais encontrados, o endereço residencial fica protegido. O tutor pode enviar fotos ou documentos para análise e, se aprovado, combinar a devolução pelo chat em um ponto público seguro.',
  },
];

const EXTRAS = [
  { icon: 'qr-code-2', titulo: 'Cartaz com QR code', texto: 'Cartaz com QR code para imprimir ou formatos para stories/status e feed quadrado.' },
  { icon: 'near-me', titulo: 'Mais perto primeiro', texto: 'O mural mostra primeiro os animais perto de você. Nos filtros, escolha o raio e a ordem.' },
  { icon: 'notifications-active', titulo: 'Avisos no app e no WhatsApp', texto: 'Avistamentos, mensagens, possíveis correspondências e lembretes de renovação.' },
  { icon: 'flag', titulo: 'Denúncias e moderação', texto: 'Conteúdo suspeito pode ser denunciado e é analisado pela administração.' },
];

// Moldura de celular para as capturas de tela
const PhoneShot = ({ source, width, style }) => (
  <View style={[styles.phone, { width, height: width * (1200 / 540) }, style]}>
    <Image source={source} style={styles.phoneImg} resizeMode="cover" />
  </View>
);

const isSameLocalDay = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
};

const formatHoursAgo = (value) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'agora' : `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h`;
};

const SobreScreen = ({ navigation }) => {
  const { user, userProfile } = useAuth();
  // "Encontrados hoje" na cidade do usuário (perfil, local salvo ou localização do visitante)
  const [todayCity, setTodayCity] = useState(null);
  const [todayFound, setTodayFound] = useState([]);
  const [todayLoading, setTodayLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadTodayFound = async () => {
        let city = userProfile?.city || '';
        let state = userProfile?.state || '';
        if (!city || !state) {
          try {
            const saved = JSON.parse((await AsyncStorage.getItem('@wefind/saved_location')) || 'null');
            if (saved?.city && saved?.state) { city = saved.city; state = saved.state; }
          } catch (_) {}
        }
        if ((!city || !state) && !user) {
          try {
            const guest = JSON.parse((await AsyncStorage.getItem('@wefind/guest_auto_location')) || 'null');
            if (guest?.city && guest?.uf) { city = guest.city; state = guest.uf; }
          } catch (_) {}
        }
        if (!active) return;
        if (!city || !state) {
          setTodayCity(null);
          setTodayFound([]);
          return;
        }
        setTodayCity({ city, state });
        setTodayLoading(true);
        try {
          const items = await itemsService.listItemsWithPhotosAndOwner({ status: 'found', city, state });
          const todayItems = (items || [])
            .filter((item) => isSameLocalDay(item.created_at))
            .filter((item) => !itemsService.isPetAvailableForAdoption(item))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          if (active) setTodayFound(todayItems);
        } catch (err) {
          console.log('[SobreScreen] Erro ao carregar encontrados de hoje:', err?.message);
          if (active) setTodayFound([]);
        } finally {
          if (active) setTodayLoading(false);
        }
      };
      loadTodayFound();
      return () => { active = false; };
    }, [user?.id, userProfile?.city, userProfile?.state])
  );
  const { colors, isDark } = useTheme();
  const [stories, setStories] = useState([]);

  useEffect(() => {
    if (!APP_FEATURES.successStories) return undefined;

    let isMounted = true;
    storiesService
      .listSuccessStories()
      .then((data) => { if (isMounted) setStories(data || []); })
      .catch((err) => console.log('[SobreScreen] Erro ao carregar mural:', err.message));
    return () => { isMounted = false; };
  }, []);

  const handleGoToMap = () => {
    if (user) {
      navigation.navigate('MainApp', { screen: 'MapTab' });
    } else {
      navigation.navigate('PublicApp', { screen: 'MapTab' });
    }
  };

  const handleGoToMural = () => navigation.navigate('MuralReencontros');

  const heroBg = isDark ? colors.surface : MUSGO;
  const shotWidth = Math.min(132, SCREEN_WIDTH * 0.34);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Cabeçalho */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <Image source={require('../../assets/logo_outlined.png')} style={styles.brandLogo} resizeMode="contain" />
            <Text style={styles.brandText}>
              <Text style={{ color: COLORS.weColor || '#B1734A' }}>We</Text>
              <Text style={{ color: '#FFFFFF' }}>FIND</Text>
            </Text>
          </View>
          {!user ? (
            <LoginPillButton onPress={() => navigation.navigate('Login')} />
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Abertura: o cartaz colado na parede */}
        <View style={[styles.hero, { backgroundColor: heroBg, borderColor: colors.cardBorder }]}>
          <Text style={styles.heroTitle}>Perdeu ou encontrou um animal? Avise quem está perto.</Text>
          <Text style={styles.heroLead}>
            No WeFIND, a publicação fica no mapa, recebe avistamentos da vizinhança e é comparada com anúncios parecidos. Tudo no mesmo lugar, sem expor o seu telefone.
          </Text>

          <View style={[styles.mural, { height: MURAL_H }]}>
            <View style={[styles.cartaz, { width: CARTAZ_W }]}>
              <View style={[styles.fita, styles.fitaA]} />
              <View style={[styles.fita, styles.fitaB]} />
              <Image source={SHOTS.cartaz} style={{ width: CARTAZ_W - 14, height: CARTAZ_IMG_H }} resizeMode="cover" />
            </View>
            <PhoneShot source={SHOTS.mapa} width={HERO_PHONE_W} style={styles.heroPhone} />
          </View>

          {!user ? (
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.btnFita}
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.85}
              >
                <Text style={styles.btnFitaText}>Criar conta grátis</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnContorno} onPress={handleGoToMap} activeOpacity={0.85}>
                <Text style={styles.btnContornoText}>Ver o mapa</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.btnFita, { alignSelf: 'flex-start' }]} onPress={handleGoToMap} activeOpacity={0.85}>
              <Text style={styles.btnFitaText}>Ver o mapa</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Encontrados hoje na cidade do usuário */}
        {todayCity ? (
          <View style={styles.section}>
            <View style={styles.storiesHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, flex: 1, fontSize: 20, lineHeight: 25 }]}>
                Encontrados hoje em {todayCity.city}
              </Text>
              {todayFound.length > 0 ? (
                <View style={[styles.todayCount, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.todayCountText, { color: colors.primary }]}>{todayFound.length}</Text>
                </View>
              ) : null}
            </View>
            {todayLoading && todayFound.length === 0 ? (
              <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>Carregando...</Text>
            ) : todayFound.length === 0 ? (
              <View style={[styles.todayEmpty, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <MaterialIcons name="pets" size={20} color={colors.textMuted} />
                <Text style={[styles.todayEmptyText, { color: colors.textSecondary }]}>
                  Nenhum animal foi registrado como encontrado hoje em {todayCity.city} - {todayCity.state}.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.todayRow}>
                {todayFound.slice(0, 10).map((item) => {
                  const photo = item.item_photos?.[0]?.url || null;
                  return (
                    <TouchableOpacity
                      key={String(item.id)}
                      style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                      activeOpacity={0.88}
                      onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                    >
                      {photo ? (
                        <OptimizedImage uri={photo} style={styles.todayPhoto} resizeMode="cover" />
                      ) : (
                        <View style={[styles.todayPhoto, styles.storyPhotoVazia, { backgroundColor: colors.primaryLight }]}>
                          <MaterialIcons name="pets" size={26} color={colors.primary} />
                        </View>
                      )}
                      <View style={styles.todayInfo}>
                        <Text style={[styles.todayTitle, { color: colors.text }]} numberOfLines={2}>
                          {item.title || item.species || 'Animal encontrado'}
                        </Text>
                        <Text style={[styles.todayMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {[item.neighborhood, formatHoursAgo(item.created_at)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* 2. Do sumiço ao reencontro */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Do sumiço ao reencontro</Text>
          <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>É assim que uma busca anda dentro do aplicativo.</Text>
          {ETAPAS.map((e, i) => {
            const invertido = i % 2 === 1;
            return (
              <View
                key={e.shot}
                style={[
                  styles.etapa,
                  { borderTopColor: colors.cardBorder, flexDirection: invertido ? 'row-reverse' : 'row' },
                ]}
              >
                <PhoneShot source={SHOTS[e.shot]} width={shotWidth} />
                <View style={[styles.etapaTexto, invertido ? { marginRight: 16 } : { marginLeft: 16 }]}>
                  <View style={styles.etapaNum}>
                    <Text style={styles.etapaNumText}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.etapaTitulo, { color: colors.text }]}>{e.titulo}</Text>
                  <Text style={[styles.etapaDesc, { color: colors.textSecondary }]}>{e.texto}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* 3. E mais */}
        <View style={[styles.extras, { backgroundColor: isDark ? colors.surface : colors.primaryLight, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 14 }]}>E mais</Text>
          <View style={styles.extrasGrid}>
            {EXTRAS.map((x) => (
              <View key={x.titulo} style={styles.extraItem}>
                <MaterialIcons name={x.icon} size={24} color={colors.primary} />
                <Text style={[styles.extraTitulo, { color: colors.text }]}>{x.titulo}</Text>
                <Text style={[styles.extraTexto, { color: colors.textSecondary }]}>{x.texto}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 4. Reencontros enviados pelos usuários (aparece só quando existem) */}
        {APP_FEATURES.successStories && stories.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.storiesHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>Reencontros da comunidade</Text>
              <TouchableOpacity onPress={handleGoToMural} activeOpacity={0.8}>
                <Text style={[styles.linkForte, { color: colors.primary }]}>Ver todos</Text>
              </TouchableOpacity>
            </View>
            {stories.slice(0, 3).map((story) => (
              <TouchableOpacity
                key={String(story.id)}
                style={[styles.storyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                activeOpacity={0.88}
                onPress={handleGoToMural}
              >
                {story.photoUrl ? (
                  <OptimizedImage uri={story.photoUrl} style={styles.storyPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.storyPhoto, styles.storyPhotoVazia, { backgroundColor: colors.primaryLight }]}>
                    <MaterialIcons name="pets" size={22} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.storyNome, { color: colors.text }]} numberOfLines={1}>{story.petName}</Text>
                  {story.testimonial ? (
                    <Text style={[styles.storyTexto, { color: colors.textSecondary }]} numberOfLines={2}>{story.testimonial}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* 5. Chamada final */}
        {!user ? (
          <View style={[styles.final, { backgroundColor: heroBg }]}>
            <Text style={styles.finalTitulo}>Pronto para ajudar?</Text>
            <Text style={styles.finalTexto}>Crie sua conta para publicar, registrar avistamentos e receber avisos de animais parecidos.</Text>
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.btnFita} onPress={() => navigation.navigate('Register')} activeOpacity={0.85}>
                <Text style={styles.btnFitaText}>Criar conta</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnContorno} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
                <Text style={styles.btnContornoText}>Já tenho conta</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={[styles.termsText, { color: colors.textMuted }]}>
          WeFIND, plataforma colaborativa para animais perdidos e encontrados.{'\n'}
          <Text style={[styles.link, { color: colors.primary }]} onPress={() => Linking.openURL(TERMS_URL)}>
            Termos de Uso
          </Text>
          {' '}e{' '}
          <Text style={[styles.link, { color: colors.primary }]} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacidade
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 40, paddingBottom: 12, paddingHorizontal: 18, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 28, height: 28, marginRight: 7 },
  brandText: { fontWeight: '900', fontSize: 22, letterSpacing: 0.5 },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  hero: { borderRadius: 24, padding: 22, borderWidth: 1, overflow: 'hidden' },
  heroTitle: { color: '#FFFFFF', fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.5 },
  heroLead: { color: '#D3E0D4', fontSize: 14.5, lineHeight: 21, marginTop: 12 },
  mural: { marginTop: 20, marginBottom: 18 },
  cartaz: {
    position: 'absolute',
    left: 4,
    top: 14,
    backgroundColor: '#FFFFFF',
    padding: 7,
    transform: [{ rotate: '-4deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 2,
  },
  fita: { position: 'absolute', top: -10, width: 62, height: 20, backgroundColor: FITA, opacity: 0.92, zIndex: 3 },
  fitaA: { left: -16, transform: [{ rotate: '-28deg' }] },
  fitaB: { right: -16, transform: [{ rotate: '24deg' }] },
  heroPhone: { position: 'absolute', right: 0, top: 26, transform: [{ rotate: '5deg' }], zIndex: 1 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  btnFita: { backgroundColor: FITA, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13 },
  btnFitaText: { color: MUSGO, fontWeight: '900', fontSize: 14.5 },
  btnContorno: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  btnContornoText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14.5 },

  phone: {
    borderWidth: 4,
    borderColor: '#141A15',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#141A15',
  },
  phoneImg: { width: '100%', height: '100%' },

  section: { marginTop: 34 },
  todayCount: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  todayCountText: { fontSize: 13, fontWeight: '900' },
  todayEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10 },
  todayEmptyText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  todayRow: { gap: 12, paddingRight: 4 },
  todayCard: { width: 150, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  todayPhoto: { width: '100%', height: 112 },
  todayInfo: { padding: 10 },
  todayTitle: { fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  todayMeta: { fontSize: 11.5, marginTop: 4 },
  sectionTitle: { fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.4 },
  sectionLead: { fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 8 },


  etapa: { alignItems: 'center', borderTopWidth: 1, paddingVertical: 20 },
  etapaTexto: { flex: 1 },
  etapaNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: FITA,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  etapaNumText: { color: MUSGO, fontWeight: '900', fontSize: 15 },
  etapaTitulo: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  etapaDesc: { fontSize: 13.5, lineHeight: 20, marginTop: 6 },

  extras: { marginTop: 30, borderRadius: 22, padding: 20, borderWidth: 1 },
  extrasGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  extraItem: { width: '47%' },
  extraTitulo: { fontSize: 14.5, fontWeight: '800', marginTop: 6 },
  extraTexto: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  storiesHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  linkForte: { fontWeight: '800', fontSize: 14, textDecorationLine: 'underline' },
  storyCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  storyPhoto: { width: 52, height: 52, borderRadius: 12 },
  storyPhotoVazia: { alignItems: 'center', justifyContent: 'center' },
  storyNome: { fontSize: 15, fontWeight: '800' },
  storyTexto: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },

  final: { marginTop: 34, borderRadius: 24, padding: 22 },
  finalTitulo: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  finalTexto: { color: '#D3E0D4', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },

  termsText: { fontSize: 11.5, textAlign: 'center', lineHeight: 18, marginTop: 28 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});

export default SobreScreen;
