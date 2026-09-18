# New Student Visa Workspace — Web/PWA

Static GitHub Pages version of the BU new-student visa preparation workspace.

## Privacy model

GitHub hosts only the application code and non-personal academic/nationality reference data. Student cases, generation history, settings, and imported Word templates are stored in the browser's IndexedDB on the user's device.

No student name, ID, passport number, visa date, or imported DOCX template is intentionally uploaded to GitHub by the application.

## First-time setup

1. Open the deployed Pages site.
2. Go to **Workspace settings → Word templates**.
3. Import the approved Letter 16, Letter 76, and Student List `.docx` files once.
4. Use **Backup data** regularly. Backups include browser data and locally imported templates.

## Moving from the portable localhost version

1. In the portable app, click **Backup data**.
2. Open this web version and click **Restore**.
3. Older JSON backups are accepted. If the backup does not contain templates, import the three DOCX templates once in Workspace settings.

## Architecture

- Static HTML/CSS/JavaScript hosted by GitHub Pages
- IndexedDB for local persistent data and DOCX templates
- Client-side OpenXML/DOCX generation; no Python, localhost server, or backend API
- Service worker + web app manifest for installable/offline-capable PWA behavior

## GitHub Pages

Deployment is handled by `.github/workflows/pages.yml`. If Pages has never been enabled for this repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions** once.
