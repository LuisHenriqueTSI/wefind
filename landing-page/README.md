# Landing page do WeFIND

Esta pasta contém a página estática para publicação no Netlify.

## APK para download

O APK é armazenado em uma GitHub Release para que o usuário baixe diretamente o arquivo instalável:

```text
https://github.com/LuisHenriqueTSI/wefind/releases/download/v2.5/WeFIND_v2.5.apk
```

A landing page aponta diretamente para essa URL. O usuário não precisa baixar ou extrair um ZIP.

## Configurar o Netlify

Ao importar o repositório no Netlify, use:

- **Base directory:** deixe vazio;
- **Build command:** deixe vazio;
- **Publish directory:** `landing-page`.

O arquivo `netlify.toml` na raiz já define a pasta de publicação. Como alternativa, é possível informar somente o repositório e deixar o Netlify ler essa configuração automaticamente.
