# Mängdkollen

Räkna åtgång för avjämning, fix, fog och bruk.

En statisk webbapp (PWA) som kan installeras på hemskärmen och fungerar offline för själva beräkningen. Den behöver ingen server-kod.
Mörkt tema är standard, ljust läge är ett val.

Adress: **https://bygg.junestaden.se**

## Publicering
Sidan serveras av **Cloudflare Pages** (projektet `mangdkollen`) och publiceras automatiskt vid varje push till `main`.
Ingen build: rotmappen är utdata. Installation som app kräver https, vilket Cloudflare ger.
Repots rot är webbens rot, så `tools/`, registret (`.xlsx`) och `VERIFIERING.md` ligger i `.gitignore` och ska inte committas.

## Kontaktformulär
Formuläret ("Saknar du en produkt?") skickas till Cloudflare-Workern `junestaden-kontakt`, som mejlar vidare.
Adressen står i `CONFIG.formEndpoint` överst i `app.js`. Workern släpper bara igenom anrop från sajter som finns i dess lista.

## Uppdatera produktdata
```
python tools/build_data.py
```
Utan argument bygger kommandot vidare på `Mängdkollen_produktregister.xlsx` i projektmappen (ange en annan .xlsx som argument vid behov). Det lägger på de verifierade korrigeringarna och skriver om `data.js`. Höj `VERSION` i `sw.js` och `?v=`-numret på styles.css, data.js och app.js i `index.html` när du publicerar, så att alla besökare får de nya filerna.
Verktygen och registret finns bara på ägarens dator (säkerhetskopierade privat), inte i det här repot.

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
