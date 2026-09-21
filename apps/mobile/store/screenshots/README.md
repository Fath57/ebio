# Captures d'écran store — eBio

Captures PNG **1080 × 1920** (9:16), prises sur émulateur Android (API 35), barre de statut en mode démo (9:00, batterie pleine, Wi-Fi).

| Dossier | App | Package | Données |
|---|---|---|---|
| `client/` | eBio (client) | `com.ebio.mobile` | API de production (vrais produits, position Cotonou) |
| `supplier/` | eBio Fournisseur | `com.ebio.supplier` | API locale, boutique de démo « Huiles Bio Koffi » |
| `courier/` | eBio Livreur | `com.ebio.courier` | API locale, livreur de démo, course EB-20260906-001 |

## Google Play
Format accepté tel quel (téléphone : 16:9 ou 9:16, 320 à 3840 px). Glisser les fichiers dans Play Console → Fiche du Play Store → Captures d'écran (téléphone). Minimum 2, maximum 8 par app.

## App Store
Apple exige des captures **prises sur iPhone** (ex. 1290 × 2796 pour les 6,7", 1284 × 2778, 1242 × 2688…). Ces captures Android ne sont pas acceptées telles quelles : il faut refaire la série sur un simulateur iOS une fois un build iOS disponible, ou les recadrer/monter dans un gabarit iPhone (déconseillé par Apple).

## Refaire une capture
Outil utilisé : `adb exec-out screencap -p` sur l'AVD `ebio_store` (1080 × 1920, densité 420, clavier matériel). Voir la mémoire projet « dev-loop mobile » pour le dev-client et Metro.
