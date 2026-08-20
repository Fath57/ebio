-- Editable content of the public landing site (e-bio.org).
--
-- `landing_contents` holds one JSON document per section; `landing_faqs`
-- holds the FAQ. The seeds below are the texts the landing shipped with, so
-- the site reads the same before and after the switch to the API.
--
-- Idempotent: safe to replay, existing rows are left untouched.

BEGIN;

CREATE TABLE IF NOT EXISTS landing_contents (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO landing_contents (key, value) VALUES
('hero', '{
  "eyebrow": "Produits locaux & bio",
  "title": "Des produits locaux et bio, près de chez vous.",
  "highlight": "locaux et bio",
  "subtitle": "eBio met sur la carte les producteurs, transformateurs et boutiques bio autour de vous. Commandez, payez par Mobile Money, faites-vous livrer ou passez retirer à la boutique.",
  "footnote": "Gratuit · Cotonou d’abord, le Bénin ensuite"
}'),
('stores', '{
  "playStoreUrl": null,
  "appStoreUrl": null,
  "comingSoonTitle": "Bientôt disponible",
  "comingSoonBody": "L’application eBio arrive très bientôt sur Google Play et l’App Store. Encore un peu de patience, les boutiques préparent déjà leurs étals."
}'),
('trust', '{
  "points": [
    {"title": "Validé eBio", "body": "Chaque boutique est vérifiée par l’équipe eBio avant d’apparaître sur l’app. Vous commandez tranquille, chez des fournisseurs bien identifiés."},
    {"title": "Paiement Mobile Money", "body": "Vous payez directement dans l’app avec MTN Money ou Moov Money. Si vous préférez, vous pouvez aussi payer en espèces à la remise."},
    {"title": "Livraison ou retrait", "body": "Vous choisissez ce qui vous arrange : livraison à domicile ou retrait à la boutique. C’est vous qui décidez au moment de commander."}
  ]
}'),
('steps', '{
  "eyebrow": "Côté acheteur",
  "title": "Du marché à votre table, en trois gestes",
  "steps": [
    {"title": "Cherchez autour de vous", "body": "Ouvrez la carte : les boutiques Validé eBio s’affichent autour de votre position, avec leurs produits, leurs prix et leurs horaires. Chaque boutique est vérifiée avant d’apparaître."},
    {"title": "Commandez en quelques gestes", "body": "Composez votre panier, choisissez livraison ou retrait à la boutique, puis payez par Mobile Money ou à la remise. Le total est annoncé avant de confirmer, frais de livraison compris."},
    {"title": "Récupérez vos produits", "body": "Suivez votre commande jusqu’à la remise et échangez avec le fournisseur directement dans l’app si besoin. Notez la boutique une fois servi : c’est ce qui fait vivre la confiance."}
  ]
}'),
('supplier', '{
  "eyebrow": "Producteurs & transformateurs",
  "title": "Votre étal, visible de toute la ville",
  "body": "Huiles, jus, farines, confitures, légumes : vous produisez ou vous transformez, eBio vous donne des clients au-delà de votre quartier, sans rien installer à part l’app.",
  "points": [
    "Votre fiche boutique, votre position sur la carte et vos horaires",
    "Votre catalogue et vos stocks, gérés depuis le téléphone",
    "Les commandes et les discussions acheteurs au même endroit",
    "Vos frais de livraison, fixés par vous, reversés en intégralité"
  ],
  "ctaLabel": "Créer ma boutique"
}'),
('footer', '{
  "tagline": "Des produits locaux et bio, près de chez vous. La carte des producteurs et transformateurs du Bénin.",
  "contactEmail": "contact@e-bio.org",
  "bottomLine": "eBio · Cotonou, Bénin"
}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO landing_faqs (question, answer, sort_order)
SELECT * FROM (VALUES
  ('Dans quelles villes eBio est-il disponible ?', 'eBio démarre à Cotonou et s’étend au Bénin. La carte vous montre ce qui existe réellement autour de vous : plus les producteurs et transformateurs rejoignent la plateforme, plus elle se remplit.', 0),
  ('Comment les boutiques sont-elles validées ?', 'Chaque fournisseur soumet sa fiche boutique et ses pièces. L’équipe eBio vérifie avant de rendre la boutique visible : c’est le badge « Validé eBio ». Une boutique qui ne respecte plus les règles est suspendue et disparaît du catalogue.', 1),
  ('Comment se passe le paiement ?', 'Par Mobile Money (MTN, Moov) directement dans l’app, ou en espèces à la remise selon la boutique. Le total des produits et de la livraison est affiché avant que vous confirmiez la commande.', 2),
  ('Combien ça coûte pour un fournisseur ?', 'L’inscription est gratuite et le plan de départ permet déjà de vendre. Des plans payants existent pour les catalogues plus grands. eBio prélève une commission sur les produits vendus, jamais sur vos frais de livraison.', 3)
) AS seed(question, answer, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM landing_faqs);

COMMIT;

-- Contact form recipients (added with the contact section). Idempotent.
INSERT INTO landing_contents (key, value) VALUES
('contact', '{"recipients": ["aattayaya@gmail.com", "enobonheur@gmail.com"]}')
ON CONFLICT (key) DO NOTHING;
