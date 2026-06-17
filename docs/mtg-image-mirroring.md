# MTG Image Mirroring

Right now the MTG catalog has complete image URLs, but those URLs still point to external hosts unless you mirror them locally.

## Commands

Download mirrored image files:

```powershell
npm.cmd run mtg:mirror:images
```

Download only selected kinds:

```powershell
node scripts/mirror-mtg-images.mjs normal,small,art_crop
node scripts/mirror-mtg-images.mjs png
```

Rebuild the catalog so mirrored files are preferred:

```powershell
npm.cmd run mtg:build
```

## What it does

- Reads the MTG catalog rows under [public/data/mtg/search](/C:/Users/Admin/Desktop/main-phase-market/public/data/mtg/search)
- Downloads image files into [public/data/mtg/images](/C:/Users/Admin/Desktop/main-phase-market/public/data/mtg/images)
- Keeps the original Scryfall URL only when a local mirrored file does not exist yet

## Result

After mirroring and rebuilding:

- `image_small`
- `image_normal`
- `image_art_crop`
- `image_png`

will point to your own `/data/mtg/images/...` files whenever those files exist locally.

## Note

This is resumable. Existing files are skipped.
