import type { AllergenCode, LabelCode } from '../../modules/products/composition.constants'
import type { NutritionalValues } from '../../modules/products/entities/product.entity'

/**
 * Composition sheet of every demo product, keyed by product name. Used by the
 * demo seeder and by `apply-product-composition` to enrich an existing base.
 * Nutritional values are indicative, per 100 g / 100 ml.
 */
export interface ProductComposition {
  description: string
  ingredients?: string
  allergens?: AllergenCode[]
  labels?: LabelCode[]
  origin?: string
  conservation?: string
  nutritionalValues?: NutritionalValues
}

function oil(kcal: number, saturated: number): NutritionalValues {
  return {
    basis: '100ml',
    energyKcal: kcal,
    fat: 92,
    saturatedFat: saturated,
    carbohydrates: 0,
    sugars: 0,
    fiber: 0,
    protein: 0,
    salt: 0,
  }
}

export const PRODUCT_COMPOSITION: Record<string, ProductComposition> = {
  // --- Huiles Bio Koffi ---
  'Huile de palme bio': {
    description: 'Huile de palme rouge artisanale, pressée à froid à Dantokpa. Sans additifs ni conservateurs, elle garde sa couleur et son goût authentiques pour les sauces béninoises.',
    ingredients: 'Pulpe de noix de palme (100 %)',
    labels: ['organic', 'local', 'artisanal'],
    origin: 'Dantokpa, Cotonou — Bénin',
    conservation: 'À l’abri de la lumière et de la chaleur. 12 mois après ouverture.',
    nutritionalValues: oil(828, 45),
  },
  'Huile d\'arachide pure': {
    description: 'Huile d’arachide 100 % naturelle, filtrée sans solvant. Idéale pour la friture et la cuisine béninoise traditionnelle.',
    ingredients: 'Arachides décortiquées (100 %)',
    allergens: ['peanuts'],
    labels: ['local', 'artisanal'],
    origin: 'Zou — Bénin',
    conservation: 'Bouteille fermée, à température ambiante, à l’abri de la lumière. 9 mois après ouverture.',
    nutritionalValues: oil(884, 17),
  },
  'Huile de coco vierge': {
    description: 'Huile de coco vierge pressée à froid, parfum délicat de noix fraîche. Parfaite pour la cuisine, les soins de la peau et des cheveux.',
    ingredients: 'Chair de noix de coco fraîche (100 %)',
    labels: ['organic', 'local', 'artisanal', 'vegan'],
    origin: 'Ouidah — Bénin',
    conservation: 'Se solidifie sous 24 °C, c’est normal. 18 mois après ouverture.',
    nutritionalValues: oil(862, 82),
  },
  'Beurre de karite brut': {
    description: 'Beurre de karité non raffiné, riche en vitamines A et E. Usage cosmétique (peau, cheveux) et culinaire.',
    ingredients: 'Noix de karité (100 %)',
    labels: ['organic', 'local', 'handmade', 'vegan'],
    origin: 'Parakou, Borgou — Bénin',
    conservation: 'À l’abri de la chaleur. 24 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 884, fat: 100, saturatedFat: 47, carbohydrates: 0, sugars: 0, fiber: 0, protein: 0, salt: 0 },
  },
  'Gari blanc superieur': {
    description: 'Gari de manioc séché au soleil, qualité supérieure. Grain fin et régulier, croustillant, prêt pour l’eau fraîche ou la sauce.',
    ingredients: 'Manioc râpé et fermenté (100 %)',
    labels: ['local', 'gluten-free', 'vegan'],
    origin: 'Savalou — Bénin',
    conservation: 'Au sec, dans un récipient hermétique. 12 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 360, fat: 0.5, saturatedFat: 0.1, carbohydrates: 88, sugars: 2, fiber: 3, protein: 1, salt: 0.02 },
  },
  'Farine de mais bio': {
    description: 'Farine de maïs jaune moulue traditionnellement. Idéale pour l’akassa, la pâte et la bouillie.',
    ingredients: 'Maïs jaune (100 %)',
    labels: ['organic', 'local', 'gluten-free', 'vegan'],
    origin: 'Plateau — Bénin',
    conservation: 'Au sec et au frais. 6 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 362, fat: 3.5, saturatedFat: 0.5, carbohydrates: 76, sugars: 1, fiber: 7, protein: 8, salt: 0.01 },
  },
  'Riz local bio': {
    description: 'Riz paddy du nord Bénin, cultivé sans engrais chimiques. Grain long, parfumé, qui ne colle pas.',
    ingredients: 'Riz (100 %)',
    labels: ['organic', 'local', 'gluten-free', 'vegan'],
    origin: 'Malanville, Alibori — Bénin',
    conservation: 'Au sec. 12 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 350, fat: 1, saturatedFat: 0.2, carbohydrates: 78, sugars: 0.5, fiber: 1.5, protein: 7, salt: 0 },
  },
  // --- Intrants Bio Adama ---
  'Semences de tomate bio': {
    description: 'Variété locale résistante aux maladies. Sachet de 100 graines, taux de germination de 95 %.',
    ingredients: 'Graines de tomate (Solanum lycopersicum), non traitées',
    labels: ['organic', 'local', 'gmo-free'],
    origin: 'Abomey-Calavi — Bénin',
    conservation: 'Au sec, à l’abri de la lumière. Germination garantie 2 ans.',
  },
  'Semences de gombo nain': {
    description: 'Gombo nain à haut rendement. Sachet de 50 graines, récolte en 45 jours.',
    ingredients: 'Graines de gombo (Abelmoschus esculentus), non traitées',
    labels: ['organic', 'local', 'gmo-free'],
    origin: 'Abomey-Calavi — Bénin',
    conservation: 'Au sec, à l’abri de la lumière. Germination garantie 2 ans.',
  },
  'Compost organique premium': {
    description: 'Compost naturel à base de déchets verts, mûri 6 mois. Enrichit le sol et améliore la rétention d’eau.',
    ingredients: 'Déchets verts compostés, fumier de bovins, cendres',
    labels: ['organic', 'local'],
    origin: 'Sèmè-Kpodji — Bénin',
    conservation: 'Sac fermé, à l’abri de la pluie.',
  },
  'Fumier de volaille bio': {
    description: 'Fumier composté et tamisé, riche en azote. Idéal pour les cultures maraîchères.',
    ingredients: 'Fientes de volaille compostées (100 %)',
    labels: ['organic', 'local'],
    origin: 'Sèmè-Kpodji — Bénin',
    conservation: 'Sac fermé, au sec.',
  },
  // --- Fruits & Légumes Fatou ---
  'Tomates fraiches bio': {
    description: 'Tomates locales cultivées sans pesticides, cueillies le matin même. Lot de 5 kg.',
    ingredients: 'Tomates fraîches',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Grand-Popo — Bénin',
    conservation: 'À température ambiante 3 jours, au réfrigérateur 1 semaine.',
    nutritionalValues: { basis: '100g', energyKcal: 18, fat: 0.2, saturatedFat: 0, carbohydrates: 3.9, sugars: 2.6, fiber: 1.2, protein: 0.9, salt: 0.01 },
  },
  'Piment frais local': {
    description: 'Piment vert et rouge, récolte du jour. Fort arôme, goût authentique.',
    ingredients: 'Piments frais',
    labels: ['local', 'vegan'],
    origin: 'Ouémé — Bénin',
    conservation: 'Au réfrigérateur, 2 semaines.',
    nutritionalValues: { basis: '100g', energyKcal: 40, fat: 0.4, saturatedFat: 0, carbohydrates: 8.8, sugars: 5.3, fiber: 1.5, protein: 1.9, salt: 0.02 },
  },
  'Gombo frais': {
    description: 'Gombo tendre et croquant, récolté à maturité. Idéal pour la sauce gombo.',
    ingredients: 'Gombo frais',
    labels: ['local', 'vegan'],
    origin: 'Ouémé — Bénin',
    conservation: 'Au réfrigérateur, 5 jours.',
    nutritionalValues: { basis: '100g', energyKcal: 33, fat: 0.2, saturatedFat: 0, carbohydrates: 7.5, sugars: 1.5, fiber: 3.2, protein: 1.9, salt: 0.02 },
  },
  'Oignons rouges bio': {
    description: 'Oignons rouges du Nord Bénin, saveur douce. Filet de 5 kg.',
    ingredients: 'Oignons rouges',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Malanville — Bénin',
    conservation: 'Au sec et à l’abri de la lumière, 2 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 40, fat: 0.1, saturatedFat: 0, carbohydrates: 9.3, sugars: 4.2, fiber: 1.7, protein: 1.1, salt: 0.01 },
  },
  'Mangues Kent bio': {
    description: 'Mangues Kent mûres à point, sucrées et juteuses. Caisse de 6 fruits.',
    ingredients: 'Mangues Kent',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Natitingou — Bénin',
    conservation: 'À température ambiante jusqu’à maturité, puis au frais 5 jours.',
    nutritionalValues: { basis: '100g', energyKcal: 60, fat: 0.4, saturatedFat: 0.1, carbohydrates: 15, sugars: 13.7, fiber: 1.6, protein: 0.8, salt: 0 },
  },
  'Ananas Pain de Sucre': {
    description: 'Ananas bio de la vallée de l’Ouémé, très sucré et peu acide.',
    ingredients: 'Ananas',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Allada — Bénin',
    conservation: 'À température ambiante 3 jours, au frais 1 semaine.',
    nutritionalValues: { basis: '100g', energyKcal: 50, fat: 0.1, saturatedFat: 0, carbohydrates: 13, sugars: 10, fiber: 1.4, protein: 0.5, salt: 0 },
  },
  'Gingembre frais bio': {
    description: 'Gingembre frais du Bénin. Puissant arôme, idéal pour tisanes et cuisine.',
    ingredients: 'Rhizomes de gingembre',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Collines — Bénin',
    conservation: 'Au réfrigérateur, 3 semaines.',
    nutritionalValues: { basis: '100g', energyKcal: 80, fat: 0.8, saturatedFat: 0.2, carbohydrates: 18, sugars: 1.7, fiber: 2, protein: 1.8, salt: 0.03 },
  },
  'Curcuma en poudre': {
    description: 'Curcuma bio séché et moulu, anti-inflammatoire naturel. Sachet de 200 g.',
    ingredients: 'Rhizomes de curcuma séchés et moulus (100 %)',
    labels: ['organic', 'local', 'vegan', 'gluten-free'],
    origin: 'Collines — Bénin',
    conservation: 'Au sec, à l’abri de la lumière. 24 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 312, fat: 3.3, saturatedFat: 1.8, carbohydrates: 67, sugars: 3.2, fiber: 22, protein: 9.7, salt: 0.07 },
  },
  'Jus d\'ananas frais': {
    description: 'Jus d’ananas 100 % pur fruit, pressé à froid, sans sucre ajouté. Bouteille de 1 L.',
    ingredients: 'Jus d’ananas (100 %)',
    labels: ['local', 'artisanal', 'vegan', 'sugar-free'],
    origin: 'Allada — Bénin',
    conservation: 'Au réfrigérateur. À consommer dans les 3 jours après ouverture.',
    nutritionalValues: { basis: '100ml', energyKcal: 53, fat: 0.1, saturatedFat: 0, carbohydrates: 12.9, sugars: 10, fiber: 0.2, protein: 0.4, salt: 0 },
  },
  'Bissap naturel': {
    description: 'Boisson à l’hibiscus selon la recette traditionnelle, riche en vitamine C. Bouteille de 1 L.',
    ingredients: 'Eau, infusion de fleurs d’hibiscus, sucre de canne, menthe fraîche, gingembre',
    labels: ['local', 'artisanal', 'vegan'],
    origin: 'Cotonou — Bénin',
    conservation: 'Au réfrigérateur. 5 jours après ouverture.',
    nutritionalValues: { basis: '100ml', energyKcal: 38, fat: 0, saturatedFat: 0, carbohydrates: 9.5, sugars: 9, fiber: 0, protein: 0.1, salt: 0.01 },
  },
  // --- Ferme Bio de Talensac ---
  'Panier de legumes de saison': {
    description: 'Panier hebdomadaire composé le matin même au marché de Talensac : 5 à 7 variétés selon la récolte.',
    ingredients: 'Légumes de saison (variétés selon arrivage)',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Loire-Atlantique — France',
    conservation: 'Au réfrigérateur, bac à légumes. 1 semaine.',
  },
  'Carottes des sables': {
    description: 'Carottes de plein champ cultivées dans le sable de Loire-Atlantique. Douces et croquantes.',
    ingredients: 'Carottes',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Pays de Retz, Loire-Atlantique — France',
    conservation: 'Au réfrigérateur, 3 semaines.',
    nutritionalValues: { basis: '100g', energyKcal: 41, fat: 0.2, saturatedFat: 0, carbohydrates: 9.6, sugars: 4.7, fiber: 2.8, protein: 0.9, salt: 0.17 },
  },
  'Mache nantaise bio': {
    description: 'Mâche produite sous serre froide autour de Nantes. Récolte du jour, feuilles tendres.',
    ingredients: 'Mâche',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Nantes — France',
    conservation: 'Au réfrigérateur, 4 jours.',
    nutritionalValues: { basis: '100g', energyKcal: 21, fat: 0.4, saturatedFat: 0, carbohydrates: 0.8, sugars: 0.7, fiber: 1.5, protein: 2, salt: 0.01 },
  },
  'Jus de pomme fermier': {
    description: 'Jus de pomme pressé à froid, vergers de Loire-Atlantique, sans sucre ajouté. Bouteille de 1 L.',
    ingredients: 'Jus de pomme (100 %)',
    labels: ['organic', 'local', 'artisanal', 'vegan', 'sugar-free'],
    origin: 'Loire-Atlantique — France',
    conservation: 'Au frais après ouverture, 5 jours.',
    nutritionalValues: { basis: '100ml', energyKcal: 46, fat: 0.1, saturatedFat: 0, carbohydrates: 11, sugars: 10, fiber: 0.2, protein: 0.1, salt: 0 },
  },
  // --- Le Panier Chantenay ---
  'Farine de ble T65 bio': {
    description: 'Farine de blé T65 moulue sur meule de pierre, blé cultivé en Pays de la Loire. Sac de 5 kg.',
    ingredients: 'Farine de blé (100 %)',
    allergens: ['gluten'],
    labels: ['organic', 'local', 'artisanal', 'vegan'],
    origin: 'Pays de la Loire — France',
    conservation: 'Au sec, dans un récipient fermé. 9 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 340, fat: 1.2, saturatedFat: 0.3, carbohydrates: 70, sugars: 1.5, fiber: 3.5, protein: 11, salt: 0.01 },
  },
  'Huile de colza premiere pression': {
    description: 'Huile de colza bio de première pression à froid, riche en oméga 3. Bouteille de 75 cl.',
    ingredients: 'Graines de colza (100 %)',
    labels: ['organic', 'local', 'artisanal', 'vegan'],
    origin: 'Vendée — France',
    conservation: 'Au frais et à l’abri de la lumière. 6 mois après ouverture.',
    nutritionalValues: oil(828, 7),
  },
  'Pommes de terre Bintje': {
    description: 'Pommes de terre de conservation, culture bio. Filet de 10 kg, chair fondante.',
    ingredients: 'Pommes de terre',
    labels: ['organic', 'local', 'vegan'],
    origin: 'Loire-Atlantique — France',
    conservation: 'Au sec, au frais et dans le noir. 2 mois.',
    nutritionalValues: { basis: '100g', energyKcal: 77, fat: 0.1, saturatedFat: 0, carbohydrates: 17, sugars: 0.8, fiber: 2.2, protein: 2, salt: 0.01 },
  },
  // --- Semences & Compost Doulon ---
  'Semences de mache maraichere': {
    description: 'Variété Verte de Cambrai, adaptée au climat nantais. Sachet de 500 graines.',
    ingredients: 'Graines de mâche (Valerianella locusta), non traitées',
    labels: ['organic', 'local', 'gmo-free'],
    origin: 'Nantes — France',
    conservation: 'Au sec, à l’abri de la lumière. Germination garantie 3 ans.',
  },
  'Compost de dechets verts': {
    description: 'Compost normalisé NFU 44-051, produit à partir des déchets verts de la métropole nantaise.',
    ingredients: 'Déchets verts compostés (100 %)',
    labels: ['organic', 'local'],
    origin: 'Nantes Métropole — France',
    conservation: 'Sac fermé, à l’abri de la pluie.',
  },
  'Terreau universel bio': {
    description: 'Terreau sans tourbe, enrichi en compost végétal. Sac de 40 L.',
    ingredients: 'Fibres de bois, écorces compostées, compost végétal, engrais organique',
    labels: ['organic', 'local'],
    origin: 'Nantes Métropole — France',
    conservation: 'Sac fermé, au sec.',
  },
}
