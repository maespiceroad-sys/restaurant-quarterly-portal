# Desktop App

This project now includes an Electron desktop shell for the existing portal.

## Run

```powershell
cd "C:\Users\user\OneDrive\画像\ドキュメント\New project\restaurant-quarterly-portal"
npm.cmd run desktop
```

## Notes

- The desktop app loads `site/index.html` directly with `file://`.
- External links open in the system browser.
- PDF files continue to load from `site/assets/pdfs/`.
- Data refresh is still done with:

```powershell
npm.cmd run update
```
