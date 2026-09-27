# Order App

An offline-friendly order list for anyone. Enter what you need, organize it and share an order without creating an account. The app uses the order-list logo and keeps **RIM** among its built-in categories; the title is yours to change.

## Use the app

1. Tap **My Orders** to enter a shop or order title. Optionally add a default supplier and delivery notes.
2. Enter an item name, optional company and size/weight, quantity and unit. Pick a category (including RIM) or type a new one, then tap **Add to order**. Edit an item by tapping it; use +/− to adjust its quantity.
3. Search or group the list by category/company. Choose a group to export, then share text, a picture or a PDF, or print the order. Items with quantity 0 stay in your working list but are excluded from exports. Long picture orders are split into pages for sharing.

**Customize categories:** Tap **More categories** to see all the presets. Tap **Manage categories** beside the category field to add, rename or delete your own categories. Renaming updates existing items and the active export filter. Deleting a category with items asks for confirmation and moves those items to General. Built-in categories (including RIM) always remain available.

**Settings:** The slider icon at the top opens appearance and language settings. Choose **Device setting**, **Light** or **Dark**; the theme stays on this device. Choose **Device language** or explicitly select **English, Urdu, Spanish or Arabic**. Device language falls back to English if unsupported. Urdu and Arabic use right-to-left layouts and bundled fonts, including in picture/PDF labels. Existing item names and user-entered text are not translated; saved category/unit codes stay stable when switching languages.

## Where it runs

- **Website:** [Open Order App](https://Githubbbccc.github.io/saeedi-orders/) in a modern browser on Android, iPhone/iPad, Windows, macOS or Linux. Use your browser's install/add-to-home-screen option where available. Installability and file-sharing behavior vary by browser and OS; a browser is always sufficient to use the web app.
- **Android APK:** When the updated `main` build succeeds, download `Order-App.apk` from [Releases](https://github.com/Githubbbccc/saeedi-orders/releases). Older releases may be named `Saeedi-Orders.apk`. Pull requests compile an unsigned release APK as a build check; signing and publishing occur only after merging to `main`. There is no native desktop or iOS build provided here; use the website on those platforms.

The web app caches its core files after the first successful visit, so previously loaded pages work offline. Edits are handled locally without round trips to a server; the list, categories and settings are stored in this browser's/device's storage, **not synced across devices**. Clearing site data or uninstalling the app can remove orders: save/share an export first if you need a copy. The existing browser storage key (`order-list-maker-v1`), hosted URL and Android app ID (`com.saeedi.essence.orders`) are unchanged to preserve existing installations' data.

## Develop

Requires Node.js 20+. Run `npm ci && npm test` for the automated checks. To serve the website locally, run `python3 -m http.server 4173 --bind 0.0.0.0 --directory www` and open <http://localhost:4173>. Run `npm run icons` after editing `www/icon.svg` to regenerate the checked-in icons/splash screens. Local Urdu/Arabic font license files are in `www/fonts/`.
