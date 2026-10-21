# Landing page do WeFIND

Esta pasta contém a página estática publicada pela GitHub Pages. Ela também pode ser usada em uma publicação no Netlify.

## APK para download

O APK 2.8.3 é servido como arquivo estático pela GitHub Pages:

```text
https://luishenriquetsi.github.io/wefind/downloads/WeFIND_v2.8.3.apk
```

O arquivo é versionado com Git LFS. O workflow de publicação baixa o conteúdo LFS antes de enviar a pasta `landing-page` para a GitHub Pages.

## Configurar o Netlify

Ao importar o repositório no Netlify, use:

- **Base directory:** deixe vazio;
- **Build command:** deixe vazio;
- **Publish directory:** `landing-page`.

O arquivo `netlify.toml` na raiz já define a pasta de publicação. Como alternativa, é possível informar somente o repositório e deixar o Netlify ler essa configuração automaticamente.
