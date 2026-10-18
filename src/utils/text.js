// Remove emojis decorativos de textos salvos em versões antigas do app
// (por exemplo, etiquetas de temperamento e de classificação).
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]\u{FE0F}?\s*/gu;

export const stripEmoji = (value) => String(value ?? '').replace(EMOJI_PATTERN, '').trim();

export default stripEmoji;
