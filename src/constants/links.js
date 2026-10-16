// Endereços públicos do WeFIND (landing page no GitHub Pages)
export const SITE_URL = 'https://luishenriquetsi.github.io/wefind';
export const TERMS_URL = `${SITE_URL}/termos.html`;
export const PRIVACY_URL = `${SITE_URL}/privacidade.html`;
export const SUPPORT_EMAIL = 'luisvictoria.pl028@academico.ifsul.edu.br';
export const publicationUrl = (itemId) => `${SITE_URL}/pet.html?id=${encodeURIComponent(itemId || '')}`;
export const petCardUrl = (petId) => `${SITE_URL}/rg.html?id=${encodeURIComponent(petId || '')}`;
