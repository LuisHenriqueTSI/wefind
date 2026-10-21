# Landing page do WeFIND

Esta pasta contém a página estática publicada pela GitHub Pages. Ela também pode ser usada em uma publicação no Netlify.

## APK para download

O APK é publicado nas Releases do GitHub, e os botões da página apontam para a versão atual:

```text
https://github.com/LuisHenriqueTSI/wefind/releases/download/v2.8.6/WeFIND_v2.8.6.apk
```

Para lançar uma versão nova: crie a release no GitHub com o APK anexado (nome `WeFIND_vX.Y.Z.apk`) e troque o número da versão nos links das páginas HTML.

## Configurar o Netlify

Ao importar o repositório no Netlify, use:

- **Base directory:** deixe vazio;
- **Build command:** deixe vazio;
- **Publish directory:** `landing-page`.

O arquivo `netlify.toml` na raiz já define a pasta de publicação. Como alternativa, é possível informar somente o repositório e deixar o Netlify ler essa configuração automaticamente.
