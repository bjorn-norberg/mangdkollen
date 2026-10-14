# Mängdkollen

Räkna åtgång för avjämning, fix och bruk.

En statisk webbapp (PWA) som kan installeras på hemskärmen och fungerar offline. Den behöver ingen server-kod, så den kan läggas på valfritt webbhotell (även GitHub Pages och Netlify). Sajten måste köras över **https** för att den ska gå att installera som app.

## Innan publicering
1. **Profilbild:** lägg en kvadratisk bild som `img/profil.jpg` (minst 224 × 224 px). Tills den finns visas en platshållare.
2. **Kontaktformulär:** öppna `app.js` och fyll i `CONFIG` högst upp:
   - `formEndpoint`: t.ex. en gratis Formspree-adress (`https://formspree.io/f/xxxx`). Formuläret skickas då direkt från sidan.
   - eller `email`: då öppnas besökarens e-postprogram med meddelandet ifyllt.
   - `name`: namnet som visas under texten.

## Uppdatera produktdata
```
python tools/build_data.py
```
Utan argument bygger kommandot vidare på `Mängdkollen_produktregister.xlsx` i projektmappen (ange en annan .xlsx som argument vid behov). Det lägger på de verifierade korrigeringarna och skriver om `data.js`. Höj `VERSION` i `sw.js` och `?v=`-numret på styles.css, data.js och app.js i `index.html` när du publicerar, så att alla besökare får de nya filerna.

## Testa lokalt
```
python -m http.server 5173
```
Öppna sedan http://localhost:5173.

## Filer
| Fil | Innehåll |
|---|---|
| `index.html`, `styles.css`, `app.js` | Sajten |
| `data.js` | Genererad produktdata |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA-installation och offlinestöd |
| `VERIFIERING.md` | Rapport över datakontrollen |
| `Mängdkollen_produktregister.xlsx` | Registret med korrigeringarna |
