import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { SUPPORT_EMAIL } from '../constants/links';

const faqs = [
  {
    question: 'Como publico um animal perdido ou para adoção?',
    answer: 'Na tela inicial ou na barra inferior, toque no botão “+ Publicar”. Preencha os dados do animal, fotos, espécie, características e localização no mapa. Quanto mais detalhes, maior a chance de reencontro!',
  },
  {
    question: 'Como encontro e gerencio minhas publicações?',
    answer: 'Acesse seu Perfil e toque em “Minhas Publicações”. Lá você pode acompanhar o status, ver quantos dias restam, editar informações ou renovar anúncios expirados.',
  },
  {
    question: 'Como funciona o sistema de mensagens?',
    answer: 'Ao abrir os detalhes de qualquer animal publicado, você pode tocar em “Enviar Mensagem” para falar diretamente com o tutor de forma segura e em tempo real.',
  },
  {
    question: 'Como denuncio um conteúdo ou publicação indevida?',
    answer: 'Abra a tela de detalhes do animal e utilize o botão de denúncia no rodapé. Nossa equipe e os administradores avaliam cada caso com total prioridade.',
  },
];

const AjudaSuporteScreen = () => {
  const { colors, isDark } = useTheme();
  const [openFaq, setOpenFaq] = useState(null);

  const openContact = (url) => Linking.openURL(url);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. PERGUNTAS FREQUENTES */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Perguntas Frequentes</Text>
      <View style={[styles.faqPanel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {faqs.map((faq, index) => {
          const isOpen = openFaq === index;
          return (
            <View key={faq.question}>
              <TouchableOpacity
                style={styles.faqRow}
                onPress={() => setOpenFaq(isOpen ? null : index)}
                activeOpacity={0.75}
              >
                <Text style={[styles.question, { color: colors.text }]}>{faq.question}</Text>
                <View style={[styles.faqIconCircle, { backgroundColor: isOpen ? colors.primary : (isDark ? '#1E293B' : colors.primaryLight) }]}>
                  <MaterialIcons
                    name={isOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={20}
                    color={isOpen ? '#FFFFFF' : colors.primary}
                  />
                </View>
              </TouchableOpacity>
              {isOpen ? (
                <Text style={[styles.answer, { color: colors.textSecondary }]}>
                  {faq.answer}
                </Text>
              ) : null}
              {index < faqs.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* 2. CANAIS DE CONTATO */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Fale com a Equipe WeFIND</Text>
      <View style={styles.contactRow}>
        <TouchableOpacity
          style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => openContact(`mailto:${SUPPORT_EMAIL}`)}
          activeOpacity={0.8}
        >
          <View style={[styles.contactIcon, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight }]}>
            <MaterialIcons name="mail-outline" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.contactTitle, { color: colors.text }]}>E-mail</Text>
          <Text style={[styles.contactText, { color: colors.textSecondary }]}>
            {SUPPORT_EMAIL}
          </Text>
        </TouchableOpacity>

      </View>

      <Text style={[styles.note, { color: colors.textMuted }]}>
        O WeFIND é mantido pelo autor do projeto. A resposta pode levar alguns dias.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginLeft: 2 },
  faqPanel: {
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    marginBottom: 24,  },
  faqRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  faqIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  question: { fontSize: 14.5, fontWeight: '700', flex: 1, lineHeight: 20 },
  answer: { fontSize: 13, lineHeight: 20, paddingRight: 10, paddingBottom: 14, paddingTop: 2 },
  divider: { height: 1 },
  contactRow: { flexDirection: 'row', gap: 12 },
  contactCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flex: 1,
    minHeight: 130,  },
  contactIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  contactTitle: { fontWeight: '800', fontSize: 15 },
  contactText: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  note: { textAlign: 'center', fontSize: 12, marginTop: 22, fontWeight: '500' },
});

export default AjudaSuporteScreen;
