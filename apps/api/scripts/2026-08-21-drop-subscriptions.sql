-- eBio has no subscription model: commission on sales is the only revenue.
-- Drops the subscription tables and the CASL permissions that referenced them.
BEGIN;

DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS subscription_plans;

DELETE FROM roles_permissions rp
USING permissions p
WHERE rp.permission_id = p.id AND p.subject = 'Subscription';

DELETE FROM permissions WHERE subject = 'Subscription';

-- Landing FAQ: reword the pricing answer now that paid plans are gone.
UPDATE landing_faqs
SET answer = 'L’inscription est gratuite et vous pouvez vendre dès la validation de votre boutique, sans limite de catalogue. eBio prélève une petite commission sur les produits vendus, jamais sur vos frais de livraison.'
WHERE question = 'Combien ça coûte pour un fournisseur ?';

COMMIT;
