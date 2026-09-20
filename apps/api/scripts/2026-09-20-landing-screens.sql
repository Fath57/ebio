-- The « Le marché bio, dans votre poche » section, editable from the backoffice.
--
-- The section becomes a slider: `screens` holds as many captures as the admin
-- uploads, in display order. The seed below is what the landing shipped with,
-- pointing at the three captures bundled in the site's own public folder, so
-- the page reads the same before and after the switch to the API.
--
-- Idempotent: safe to replay, an existing row is left untouched.
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

INSERT INTO landing_contents (key, value) VALUES
('screens', '{
  "eyebrow": "L’application",
  "title": "Le marché bio, dans votre poche",
  "body": "Les boutiques autour de vous, leurs produits du moment et vos commandes, réunis dans une seule application.",
  "screens": [
    {
      "imageUrl": "https://e-bio.org/captures/accueil.webp",
      "caption": "L’accueil, avec les boutiques autour de vous",
      "alt": "Écran d’accueil de l’app eBio : position Cotonou, catégories de produits et promotions du moment"
    },
    {
      "imageUrl": "https://e-bio.org/captures/carte.webp",
      "caption": "La carte, et les boutiques Validé eBio",
      "alt": "La carte eBio autour de Cotonou avec la fiche d’une boutique validée et sa distance"
    },
    {
      "imageUrl": "https://e-bio.org/captures/boutique.webp",
      "caption": "La fiche boutique, du contact à la commande",
      "alt": "La fiche de la boutique Granges d’Afrique : contact, horaires, itinéraire et jus en promotion en FCFA"
    }
  ]
}')
ON CONFLICT (key) DO NOTHING;

\echo '--- écrans enregistrés ---'
SELECT jsonb_array_length(value -> 'screens') AS screens FROM landing_contents WHERE key = 'screens';

COMMIT;
