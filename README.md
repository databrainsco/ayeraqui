# AyerAquí

PWA para mirar cómo era un lugar: abre la cámara, usa tu ubicación y superpone fotos históricas de Wikimedia Commons por década.

## Uso local

```bash
npm install
npm run dev
```

La cámara y el GPS requieren HTTPS (o `localhost`).

## Build

```bash
npm run build
npm run preview
```

## Deploy

Publicado en GitHub Pages: https://databrainsco.github.io/ayeraqui/

En cada deploy a `main`, el CI publica también el artefacto versionado `ayeraqui-vX.Y.Z` (build + `FEATURES.md` + `deployment.json`).

Features de la versión actual: [releases/v1.3.0.md](releases/v1.3.0.md)

Fotos © respectivos autores en Wikimedia Commons / archivos citados.
