# Draussen vor der Tür – Galerie

Statische Foto-Galerie, die per GitHub Action aus einem [Immich](https://immich.app)-Album
gebaut und auf GitHub Pages deployed wird.

## Wie es funktioniert

1. Die GitHub Action liest ein Album über die Immich REST-API aus.
2. Thumbnails und Vorschaubilder werden heruntergeladen.
3. `scripts/build.mjs` generiert eine statische `index.html` mit [lightGallery](https://www.lightgalleryjs.com/).
4. `dist/` wird auf GitHub Pages deployed.

Immich muss **nicht öffentlich erreichbar** sein – alle Bilder werden beim Build geladen.

## Setup

### 1. Immich API-Key erstellen

In Immich: **Account Settings → API Keys → New API Key**

Benötigte Berechtigungen: `asset.read`, `album.read`

### 2. GitHub Repository konfigurieren

Unter **Settings → Secrets and variables → Actions**:

| Typ | Name | Wert |
|-----|------|------|
| Secret | `IMMICH_API_KEY` | Dein Immich API-Key |
| Variable | `IMMICH_URL` | z.B. `https://photos.example.com` |
| Variable | `ALBUM_ID` | Album-UUID aus Immich (empfohlen) |
| Variable | `ALBUM_NAME` | Albumname als Alternative zu `ALBUM_ID` |
| Variable | `GALLERY_TITLE` | Seitentitel, z.B. `Draussen vor der Tür` |

Entweder `ALBUM_ID` **oder** `ALBUM_NAME` setzen – nicht beides.

Die Album-UUID findest du in der Immich-URL wenn du ein Album öffnest:
`https://photos.example.com/albums/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### 3. GitHub Pages aktivieren

Unter **Settings → Pages**:
- Source: **GitHub Actions**

### 4. Galerie bauen und deployen

Unter **Actions → Build & Deploy Gallery → Run workflow** klicken.

Nach erfolgreichem Lauf ist die Galerie unter
`https://<username>.github.io/<repository>/` erreichbar.

## Lokaler Testlauf

```bash
IMMICH_URL=https://photos.example.com \
IMMICH_API_KEY=dein-api-key \
ALBUM_NAME="Mein Album" \
node scripts/build.mjs

# Ergebnis lokal ansehen:
npx serve dist
```

## Projektstruktur

```
.
├── scripts/build.mjs         # Build-Script (Node ≥ 18, keine Deps)
├── src/
│   ├── template.html         # HTML-Vorlage (lightGallery via CDN)
│   └── styles.css            # Grid-Layout
├── .github/workflows/
│   └── deploy.yml            # Manuelle GitHub Action
└── dist/                     # Build-Output (nicht im Repo)
    ├── index.html
    ├── styles.css
    ├── images/<id>.jpg       # Vorschaubilder (preview)
    └── thumbs/<id>.jpg       # Grid-Thumbnails
```
