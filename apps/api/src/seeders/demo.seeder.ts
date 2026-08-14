/* eslint-disable no-console */
import type { Dictionary } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { hashPassword } from 'better-auth/crypto'
import { Account, User, UserRole } from '../modules/auth/auth.entity'
import { Role } from '../modules/auth/entities/role.entity'
import { Conversation } from '../modules/chat/entities/conversation.entity'
import { Message, MessageType } from '../modules/chat/entities/message.entity'
import { CommunityGroup, GroupType } from '../modules/community/entities/community-group.entity'
import { GroupMembership } from '../modules/community/entities/group-membership.entity'
import { Publication, PublicationType } from '../modules/community/entities/publication.entity'
import { Notification, NotificationChannel, NotificationType } from '../modules/notifications/notification.entity'
import { OrderItem } from '../modules/orders/entities/order-item.entity'
import { Order, OrderStatus, PaymentMethod, PickupMode } from '../modules/orders/entities/order.entity'
import { MobileOperator, Payment, PaymentProvider, PaymentStatus } from '../modules/payments/payment.entity'
import { Category } from '../modules/products/entities/category.entity'
import { ProductVariant } from '../modules/products/entities/product-variant.entity'
import { Product, ProductStatus, ProductUnit } from '../modules/products/entities/product.entity'
import { Badge, BadgeType } from '../modules/ratings/entities/badge.entity'
import { Review, TransactionType } from '../modules/ratings/entities/review.entity'
import { SubscriptionPlan } from '../modules/subscriptions/entities/subscription-plan.entity'
import { Subscription } from '../modules/subscriptions/entities/subscription.entity'
import { Supplier, SupplierMode, SupplierType, ValidationStatus } from '../modules/suppliers/supplier.entity'
import { TrainingFormat, TrainingModule } from '../modules/training/entities/training-module.entity'

const DEMO_PASSWORD = 'Password123!'

// Unsplash photos
const IMG = {
  supplier1Cover: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&h=400&fit=crop',
  supplier1Profile: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
  supplier2Cover: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&h=400&fit=crop',
  supplier2Profile: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face',
  supplier3Cover: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&h=400&fit=crop',
  supplier3Profile: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&h=200&fit=crop&crop=face',
  huilePalme: ['https://images.unsplash.com/photo-1474979266404-7f28db8e8854?w=600&h=600&fit=crop', 'https://images.unsplash.com/photo-1620706857370-e1b9770e8bb1?w=600&h=600&fit=crop'],
  huileArachide: ['https://images.unsplash.com/photo-1631209121750-a9f41ad1a30d?w=600&h=600&fit=crop'],
  huileCoco: ['https://images.unsplash.com/photo-1621236378699-8597faf6a176?w=600&h=600&fit=crop', 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=600&h=600&fit=crop'],
  beurreKarite: ['https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=600&fit=crop'],
  farineManioc: ['https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=600&h=600&fit=crop'],
  farineMais: ['https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&h=600&fit=crop'],
  riz: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&h=600&fit=crop'],
  tomates: ['https://images.unsplash.com/photo-1546470427-e26264be0b11?w=600&h=600&fit=crop', 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&h=600&fit=crop'],
  piment: ['https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=600&h=600&fit=crop'],
  gombo: ['https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?w=600&h=600&fit=crop'],
  oignons: ['https://images.unsplash.com/photo-1518977956812-cd3dbadaaf31?w=600&h=600&fit=crop'],
  mangues: ['https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&h=600&fit=crop'],
  ananas: ['https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=600&h=600&fit=crop'],
  semencesTomate: ['https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=600&fit=crop'],
  semencesGombo: ['https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600&h=600&fit=crop'],
  compost: ['https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=600&h=600&fit=crop'],
  gingembre: ['https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=600&h=600&fit=crop'],
  curcuma: ['https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&h=600&fit=crop'],
  jusAnanas: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&h=600&fit=crop'],
  bissap: ['https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?w=600&h=600&fit=crop'],
}

// Clés en anglais : c'est ce que lisent SearchService.computeIsOpen et
// SuppliersService.findNearby pour calculer `isOpen`.
const openingHours = {
  monday: { open: '07:00', close: '18:00' },
  tuesday: { open: '07:00', close: '18:00' },
  wednesday: { open: '07:00', close: '18:00' },
  thursday: { open: '07:00', close: '18:00' },
  friday: { open: '07:00', close: '18:00' },
  saturday: { open: '07:00', close: '14:00' },
  // Fermé : on garde les créneaux et on pose `closed`, comme l'éditeur d'horaires.
  sunday: { open: '07:00', close: '14:00', closed: true },
}

// Horaires « commerce de centre-ville » pour les points de vente nantais.
const openingHoursNantes = {
  monday: { open: '09:00', close: '19:30' },
  tuesday: { open: '09:00', close: '19:30' },
  wednesday: { open: '09:00', close: '19:30' },
  thursday: { open: '09:00', close: '19:30' },
  friday: { open: '09:00', close: '20:00' },
  saturday: { open: '08:30', close: '20:00' },
  sunday: { open: '09:00', close: '13:00' },
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000)
}

export class DemoSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    // ===== ROLES =====
    const adminRole = await em.findOneOrFail(Role, { name: 'ADMIN' })
    const buyerRole = await em.findOneOrFail(Role, { name: 'BUYER' })
    const supplierRole = await em.findOneOrFail(Role, { name: 'SUPPLIER' })

    // ===== USERS =====
    console.info('Creating demo users...')
    const admin = await this.createUser(em, 'Admin eBio', 'admin@ebio.bj', '+22990000001', UserRole.ADMIN, adminRole)
    const buyer1 = await this.createUser(em, 'Amina Koffi', 'amina@example.com', '+22997000001', UserRole.BUYER, buyerRole)
    const buyer2 = await this.createUser(em, 'Rachid Bello', 'rachid@example.com', '+22997000002', UserRole.BUYER, buyerRole)
    const supplierUser1 = await this.createUser(em, 'Koffi Adjanohoun', 'koffi@example.com', '+22996000001', UserRole.SUPPLIER, supplierRole)
    const supplierUser2 = await this.createUser(em, 'Adama Sossou', 'adama@example.com', '+22995000001', UserRole.SUPPLIER, supplierRole)
    const supplierUser3 = await this.createUser(em, 'Fatou Diallo', 'fatou@example.com', '+22994000001', UserRole.SUPPLIER, supplierRole)
    const supplierUser4 = await this.createUser(em, 'Élodie Renaud', 'elodie@example.com', '+33240000001', UserRole.SUPPLIER, supplierRole)
    const supplierUser5 = await this.createUser(em, 'Marc Lebreton', 'marc@example.com', '+33240000002', UserRole.SUPPLIER, supplierRole)
    const supplierUser6 = await this.createUser(em, 'Sonia Barreau', 'sonia@example.com', '+33240000003', UserRole.SUPPLIER, supplierRole)

    // ===== SUPPLIERS =====
    console.info('Creating supplier profiles...')
    const s1 = em.create(Supplier, {
      user: supplierUser1,
      shopName: 'Huiles Bio Koffi',
      type: SupplierType.TRANSFORMER,
      validationStatus: ValidationStatus.VALIDATED,
      mode: SupplierMode.ORDER,
      address: 'Marche Dantokpa, Cotonou',
      neighborhood: 'Dantokpa',
      mobileMoneyNumber: '+22996000001',
      globalRating: 4.6,
      totalReviews: 23,
      coverPhoto: IMG.supplier1Cover,
      profilePhoto: IMG.supplier1Profile,
      openingHours,
    })
    const s2 = em.create(Supplier, {
      user: supplierUser2,
      shopName: 'Intrants Bio Adama',
      type: SupplierType.INPUTS,
      validationStatus: ValidationStatus.VALIDATED,
      mode: SupplierMode.CONTACT,
      address: 'Route de Ouando, Porto-Novo',
      neighborhood: 'Ouando',
      mobileMoneyNumber: '+22995000001',
      globalRating: 4.2,
      totalReviews: 8,
      coverPhoto: IMG.supplier2Cover,
      profilePhoto: IMG.supplier2Profile,
      openingHours,
    })
    const s3 = em.create(Supplier, {
      user: supplierUser3,
      shopName: 'Fruits & Legumes Fatou',
      type: SupplierType.TRANSFORMER,
      validationStatus: ValidationStatus.VALIDATED,
      mode: SupplierMode.ORDER,
      address: 'Marche Ganhi, Cotonou',
      neighborhood: 'Ganhi',
      mobileMoneyNumber: '+22994000001',
      globalRating: 4.8,
      totalReviews: 42,
      coverPhoto: IMG.supplier3Cover,
      profilePhoto: IMG.supplier3Profile,
      openingHours,
    })

    // --- Points de vente nantais ---
    const s4 = em.create(Supplier, {
      user: supplierUser4,
      shopName: 'Ferme Bio de Talensac',
      type: SupplierType.TRANSFORMER,
      validationStatus: ValidationStatus.VALIDATED,
      mode: SupplierMode.ORDER,
      address: 'Marché de Talensac, 44000 Nantes',
      neighborhood: 'Hauts-Pavés — Saint-Félix',
      mobileMoneyNumber: '+33240000001',
      globalRating: 4.7,
      totalReviews: 31,
      coverPhoto: IMG.supplier1Cover,
      profilePhoto: IMG.supplier1Profile,
      openingHours: openingHoursNantes,
      timezone: 'Europe/Paris',
    })
    const s5 = em.create(Supplier, {
      user: supplierUser5,
      shopName: 'Le Panier Chantenay',
      type: SupplierType.TRANSFORMER,
      validationStatus: ValidationStatus.VALIDATED,
      mode: SupplierMode.ORDER,
      address: '12 rue de la Montagne, 44100 Nantes',
      neighborhood: 'Chantenay',
      mobileMoneyNumber: '+33240000002',
      globalRating: 4.4,
      totalReviews: 17,
      coverPhoto: IMG.supplier3Cover,
      profilePhoto: IMG.supplier2Profile,
      openingHours: openingHoursNantes,
      timezone: 'Europe/Paris',
    })
    const s6 = em.create(Supplier, {
      user: supplierUser6,
      shopName: 'Semences & Compost Doulon',
      type: SupplierType.INPUTS,
      validationStatus: ValidationStatus.VALIDATED,
      mode: SupplierMode.CONTACT,
      address: '5 route de Sainte-Luce, 44300 Nantes',
      neighborhood: 'Doulon — Bottière',
      mobileMoneyNumber: '+33240000003',
      globalRating: 4.1,
      totalReviews: 9,
      coverPhoto: IMG.supplier2Cover,
      profilePhoto: IMG.supplier3Profile,
      openingHours: openingHoursNantes,
      timezone: 'Europe/Paris',
    })
    await em.flush()

    // PostGIS location (raw SQL, no entity field for geography constructor)
    const db = em.getConnection()
    await db.execute(`UPDATE suppliers SET location = ST_MakePoint(2.4183, 6.3654)::geography WHERE id = ?`, [s1.id])
    await db.execute(`UPDATE suppliers SET location = ST_MakePoint(2.6289, 6.4969)::geography WHERE id = ?`, [s2.id])
    await db.execute(`UPDATE suppliers SET location = ST_MakePoint(2.4264, 6.3616)::geography WHERE id = ?`, [s3.id])
    // Nantes — ST_MakePoint attend (longitude, latitude)
    await db.execute(`UPDATE suppliers SET location = ST_MakePoint(-1.5546, 47.2216)::geography WHERE id = ?`, [s4.id])
    await db.execute(`UPDATE suppliers SET location = ST_MakePoint(-1.5920, 47.2050)::geography WHERE id = ?`, [s5.id])
    await db.execute(`UPDATE suppliers SET location = ST_MakePoint(-1.5100, 47.2320)::geography WHERE id = ?`, [s6.id])

    // ===== BADGES =====
    console.info('Creating badges...')
    em.create(Badge, { supplier: s1, type: BadgeType.VALIDATED, grantedBy: admin.id })
    em.create(Badge, { supplier: s1, type: BadgeType.TOP_SELLER, grantedBy: 'system' })
    em.create(Badge, { supplier: s2, type: BadgeType.VALIDATED, grantedBy: admin.id })
    em.create(Badge, { supplier: s2, type: BadgeType.CERTIFIED_BIO, grantedBy: admin.id })
    em.create(Badge, { supplier: s3, type: BadgeType.VALIDATED, grantedBy: admin.id })
    em.create(Badge, { supplier: s3, type: BadgeType.TOP_SELLER, grantedBy: 'system' })
    em.create(Badge, { supplier: s3, type: BadgeType.CERTIFIED_BIO, grantedBy: admin.id })
    em.create(Badge, { supplier: s4, type: BadgeType.VALIDATED, grantedBy: admin.id })
    em.create(Badge, { supplier: s4, type: BadgeType.CERTIFIED_BIO, grantedBy: admin.id })
    em.create(Badge, { supplier: s5, type: BadgeType.VALIDATED, grantedBy: admin.id })
    em.create(Badge, { supplier: s6, type: BadgeType.VALIDATED, grantedBy: admin.id })
    await em.flush()

    // ===== CATEGORIES (from context) =====
    const cats = context.categories as Record<string, Category>

    // ===== PRODUCTS =====
    console.info('Creating products...')

    // --- Supplier 1: Huiles Bio Koffi ---
    const p1 = this.createProduct(em, s1, cats.huiles, 'Huile de palme bio', 'Huile de palme artisanale, pressee a froid. Production locale de Dantokpa. Sans additifs ni conservateurs.', 2500, ProductUnit.LITER, 45, 10, IMG.huilePalme)

    this.createProduct(em, s1, cats.huiles, 'Huile d\'arachide pure', 'Huile d\'arachide 100% naturelle, ideale pour la friture et la cuisine beninoise traditionnelle.', 3000, ProductUnit.LITER, 30, 5, IMG.huileArachide)

    const p3 = this.createProduct(em, s1, cats.huiles, 'Huile de coco vierge', 'Huile de coco pressee a froid, parfaite pour la cuisine et les soins capillaires. En promotion !', 4000, ProductUnit.LITER, 20, 5, IMG.huileCoco, 3200, 30)

    this.createProduct(em, s1, cats.huiles, 'Beurre de karite brut', 'Beurre de karite non raffine, riche en vitamines. Usage cosmetique et culinaire.', 3500, ProductUnit.KG, 15, 3, IMG.beurreKarite)

    this.createProduct(em, s1, cats.cereales, 'Gari blanc superieur', 'Gari de manioc seche au soleil, qualite superieure. Grain fin et regulier.', 800, ProductUnit.KG, 100, 20, IMG.farineManioc)

    this.createProduct(em, s1, cats.cereales, 'Farine de mais bio', 'Farine de mais moulee traditionnellement. Ideale pour akassa, pate, bouillie.', 600, ProductUnit.KG, 80, 15, IMG.farineMais)

    this.createProduct(em, s1, cats.cereales, 'Riz local bio', 'Riz paddy du nord Benin, cultive sans engrais chimiques.', 1200, ProductUnit.KG, 0, 10, IMG.riz, undefined, undefined, ProductStatus.OUT_OF_STOCK)

    // --- Supplier 2: Intrants Bio Adama ---
    this.createProduct(em, s2, cats.semences, 'Semences de tomate bio', 'Variete locale resistante aux maladies. Sachet de 100 graines, taux de germination 95%.', 1500, ProductUnit.SACHET, 200, 30, IMG.semencesTomate)

    this.createProduct(em, s2, cats.semences, 'Semences de gombo nain', 'Gombo nain a haut rendement. Sachet de 50 graines. Recolte en 45 jours.', 1000, ProductUnit.SACHET, 150, 20, IMG.semencesGombo)

    this.createProduct(em, s2, cats.compost, 'Compost organique premium', 'Compost naturel a base de dechets verts. Enrichit le sol, ameliore la retention d\'eau.', 500, ProductUnit.KG, 500, 50, IMG.compost)

    this.createProduct(em, s2, cats.compost, 'Fumier de volaille bio', 'Fumier composte et tamise. Riche en azote. Ideal pour les cultures maraicheres.', 400, ProductUnit.KG, 300, 40, IMG.compost)

    // --- Supplier 3: Fruits & Legumes Fatou ---
    const p11 = this.createProduct(em, s3, cats.legumes, 'Tomates fraiches bio', 'Tomates locales cultivees sans pesticides. Cueillies le matin meme. Lot de 5 kg.', 1200, ProductUnit.KG, 60, 10, IMG.tomates)

    this.createProduct(em, s3, cats.legumes, 'Piment frais local', 'Piment vert et rouge, recolte du jour. Fort arome, gout authentique.', 300, ProductUnit.KG, 40, 10, IMG.piment)

    this.createProduct(em, s3, cats.legumes, 'Gombo frais', 'Gombo tendre et croquant, ideal pour sauce gombo. Recolte a maturite.', 500, ProductUnit.KG, 35, 8, IMG.gombo)

    this.createProduct(em, s3, cats.legumes, 'Oignons rouges bio', 'Oignons rouges du Nord Benin, saveur douce. Filet de 5 kg.', 800, ProductUnit.KG, 50, 10, IMG.oignons)

    this.createProduct(em, s3, cats.legumes, 'Mangues Kent bio', 'Mangues Kent mures a point. Sucrees et juteuses. Caisse de 6 fruits.', 1500, ProductUnit.LOT, 25, 5, IMG.mangues, 1200, 15)

    this.createProduct(em, s3, cats.legumes, 'Ananas Pain de Sucre', 'Ananas bio de la vallee de l\'Oueme. Tres sucre, peu acide.', 800, ProductUnit.PIECE, 30, 5, IMG.ananas)

    this.createProduct(em, s3, cats.epices, 'Gingembre frais bio', 'Gingembre frais du Benin. Puissant arome, ideal pour tisanes et cuisine.', 1000, ProductUnit.KG, 20, 5, IMG.gingembre)

    this.createProduct(em, s3, cats.epices, 'Curcuma en poudre', 'Curcuma bio seche et moulu. Anti-inflammatoire naturel. Sachet 200g.', 600, ProductUnit.SACHET, 40, 8, IMG.curcuma)

    this.createProduct(em, s3, cats.boissons, 'Jus d\'ananas frais', 'Jus d\'ananas 100% naturel, sans sucre ajoute. Bouteille 1L.', 1500, ProductUnit.PIECE, 50, 10, IMG.jusAnanas)

    this.createProduct(em, s3, cats.boissons, 'Bissap naturel', 'Boisson a l\'hibiscus, recette traditionnelle. Bouteille 1L. Riche en vitamine C.', 1000, ProductUnit.PIECE, 40, 8, IMG.bissap, 800, 7)

    // --- Supplier 4: Ferme Bio de Talensac (Nantes) ---
    this.createProduct(em, s4, cats.legumes, 'Panier de legumes de saison', 'Panier hebdomadaire compose le matin meme au marche de Talensac. 5 a 7 varietes selon la recolte.', 1800, ProductUnit.LOT, 40, 8, IMG.tomates)

    this.createProduct(em, s4, cats.legumes, 'Carottes des sables', 'Carottes de plein champ cultivees en Loire-Atlantique. Douces et croquantes.', 700, ProductUnit.KG, 120, 20, IMG.oignons)

    this.createProduct(em, s4, cats.legumes, 'Mache nantaise bio', 'Mache produite sous serre froide autour de Nantes. Recolte du jour.', 900, ProductUnit.SACHET, 60, 12, IMG.gombo, 750, 10)

    this.createProduct(em, s4, cats.boissons, 'Jus de pomme fermier', 'Jus de pomme presse a froid, vergers de Loire-Atlantique. Bouteille 1L.', 1200, ProductUnit.PIECE, 80, 15, IMG.jusAnanas)

    // --- Supplier 5: Le Panier Chantenay (Nantes) ---
    this.createProduct(em, s5, cats.cereales, 'Farine de ble T65 bio', 'Farine moulue sur meule de pierre, ble cultive en Pays de la Loire. Sac de 5 kg.', 1400, ProductUnit.KG, 90, 15, IMG.farineMais)

    this.createProduct(em, s5, cats.huiles, 'Huile de colza premiere pression', 'Huile de colza bio pressee a froid. Riche en omega 3. Bouteille 75 cl.', 2200, ProductUnit.LITER, 45, 10, IMG.huileArachide)

    this.createProduct(em, s5, cats.legumes, 'Pommes de terre Bintje', 'Pommes de terre de conservation, culture bio. Filet de 10 kg.', 950, ProductUnit.KG, 150, 25, IMG.oignons)

    // --- Supplier 6: Semences & Compost Doulon (Nantes) ---
    this.createProduct(em, s6, cats.semences, 'Semences de mache maraichere', 'Variete Verte de Cambrai, adaptee au climat nantais. Sachet de 500 graines.', 1300, ProductUnit.SACHET, 180, 30, IMG.semencesTomate)

    this.createProduct(em, s6, cats.compost, 'Compost de dechets verts', 'Compost normalise NFU 44-051, produit a partir des dechets verts de la metropole.', 450, ProductUnit.KG, 600, 60, IMG.compost)

    this.createProduct(em, s6, cats.compost, 'Terreau universel bio', 'Terreau sans tourbe, enrichi en compost vegetal. Sac de 40 L.', 800, ProductUnit.LOT, 70, 15, IMG.compost, 650, 20)

    await em.flush()
    console.info('  Created 32 products with photos')

    // --- Variants ---
    em.create(ProductVariant, { product: p1, label: '0,5 L', pricePerUnit: 1500, stock: 30 })
    em.create(ProductVariant, { product: p1, label: '1 L', pricePerUnit: 2500, stock: 45 })
    em.create(ProductVariant, { product: p1, label: '5 L', pricePerUnit: 10000, stock: 15 })
    em.create(ProductVariant, { product: p3, label: '250 ml', pricePerUnit: 1500, stock: 25 })
    em.create(ProductVariant, { product: p3, label: '500 ml', pricePerUnit: 2500, stock: 20 })
    em.create(ProductVariant, { product: p3, label: '1 L', pricePerUnit: 4000, stock: 10 })
    await em.flush()

    // ===== SUBSCRIPTIONS =====
    console.info('Creating subscriptions...')
    const proPlan = await em.findOne(SubscriptionPlan, { name: 'PRO' })
    const essentialPlan = await em.findOne(SubscriptionPlan, { name: 'ESSENTIAL' })
    if (proPlan && essentialPlan) {
      const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      em.create(Subscription, { supplier: s1, plan: proPlan, endDate: in30days })
      em.create(Subscription, { supplier: s2, plan: essentialPlan, endDate: in30days })
      em.create(Subscription, { supplier: s3, plan: proPlan, endDate: in30days })
      await em.flush()
    }

    // ===== ORDERS =====
    console.info('Creating orders...')
    const order1 = em.create(Order, {
      orderNumber: 'EB-20260326-001',
      buyer: buyer1,
      supplier: s1,
      status: OrderStatus.DELIVERED,
      pickupMode: PickupMode.ON_SITE,
      paymentMethod: PaymentMethod.FEDAPAY,
      totalAmount: 5000,
      commissionRate: 0.04,
      commissionAmount: 200,
      deliveryConfirmedByBuyer: true,
      deliveryConfirmedBySupplier: true,
      acceptedAt: daysAgo(2),
      deliveredAt: daysAgo(1),
      createdAt: daysAgo(3),
    })
    const order2 = em.create(Order, {
      orderNumber: 'EB-20260328-002',
      buyer: buyer1,
      supplier: s3,
      status: OrderStatus.PLACED,
      pickupMode: PickupMode.DELIVERY,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      totalAmount: 3600,
      commissionRate: 0.04,
      commissionAmount: 144,
    })
    const order3 = em.create(Order, {
      orderNumber: 'EB-20260327-003',
      buyer: buyer2,
      supplier: s1,
      status: OrderStatus.ACCEPTED,
      pickupMode: PickupMode.ON_SITE,
      paymentMethod: PaymentMethod.FEDAPAY,
      totalAmount: 8000,
      commissionRate: 0.04,
      commissionAmount: 320,
      acceptedAt: daysAgo(1),
    })
    const order4 = em.create(Order, {
      orderNumber: 'EB-20260327-004',
      buyer: buyer1,
      supplier: s3,
      status: OrderStatus.PREPARING,
      pickupMode: PickupMode.DELIVERY,
      paymentMethod: PaymentMethod.FEDAPAY,
      totalAmount: 2400,
      commissionRate: 0.04,
      commissionAmount: 96,
      acceptedAt: hoursAgo(18),
    })
    em.create(Order, {
      orderNumber: 'EB-20260327-005',
      buyer: buyer2,
      supplier: s3,
      status: OrderStatus.READY,
      pickupMode: PickupMode.ON_SITE,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      totalAmount: 1500,
      commissionRate: 0.04,
      commissionAmount: 60,
      acceptedAt: hoursAgo(12),
    })
    const order6 = em.create(Order, {
      orderNumber: 'EB-20260328-006',
      buyer: buyer1,
      supplier: s1,
      status: OrderStatus.IN_DELIVERY,
      pickupMode: PickupMode.DELIVERY,
      paymentMethod: PaymentMethod.FEDAPAY,
      totalAmount: 10000,
      commissionRate: 0.04,
      commissionAmount: 400,
      acceptedAt: hoursAgo(6),
    })
    em.create(Order, {
      orderNumber: 'EB-20260325-007',
      buyer: buyer2,
      supplier: s2,
      status: OrderStatus.CANCELLED,
      pickupMode: PickupMode.ON_SITE,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      totalAmount: 3000,
      commissionRate: 0.025,
      commissionAmount: 75,
    })
    await em.flush()

    // Order items
    em.create(OrderItem, { order: order1, product: p1, quantity: 2, unitPrice: 2500, totalPrice: 5000 })
    em.create(OrderItem, { order: order2, product: p11, quantity: 3, unitPrice: 1200, totalPrice: 3600 })
    em.create(OrderItem, { order: order3, product: p3, quantity: 2, unitPrice: 4000, totalPrice: 8000 })
    em.create(OrderItem, { order: order4, product: p11, quantity: 2, unitPrice: 1200, totalPrice: 2400 })
    em.create(OrderItem, { order: order6, product: p1, quantity: 1, unitPrice: 10000, totalPrice: 10000 })
    await em.flush()

    // Payments
    em.create(Payment, { order: order1, amount: 5000, provider: PaymentProvider.FEDAPAY, paymentMethod: 'mtn_momo', operator: MobileOperator.MTN, status: PaymentStatus.RELEASED, phoneNumber: '+22997000001', paidAt: daysAgo(3), releasedAt: daysAgo(1), providerTransactionId: 'sandbox_001' })
    em.create(Payment, { order: order3, amount: 8000, provider: PaymentProvider.FEDAPAY, paymentMethod: 'moov_money', operator: MobileOperator.MOOV, status: PaymentStatus.CAPTURED, phoneNumber: '+22997000002', paidAt: daysAgo(1), providerTransactionId: 'sandbox_003' })
    em.create(Payment, { order: order4, amount: 2400, provider: PaymentProvider.FEDAPAY, paymentMethod: 'mtn_momo', operator: MobileOperator.MTN, status: PaymentStatus.CAPTURED, phoneNumber: '+22997000001', paidAt: hoursAgo(18), providerTransactionId: 'sandbox_004' })
    em.create(Payment, { order: order6, amount: 10000, provider: PaymentProvider.FEDAPAY, paymentMethod: 'mtn_momo', operator: MobileOperator.MTN, status: PaymentStatus.CAPTURED, phoneNumber: '+22997000001', paidAt: hoursAgo(6), providerTransactionId: 'sandbox_006' })
    await em.flush()

    console.info('  Created 7 orders (all statuses)')

    // ===== REVIEWS =====
    console.info('Creating reviews...')
    em.create(Review, { buyer: buyer1, supplier: s1, order: order1, transactionType: TransactionType.ORDER, qualityRating: 5, delayRating: 4, communicationRating: 5, conformityRating: 5, comment: 'Excellente huile de palme, tres bonne qualite ! Le fournisseur est tres reactif.' })
    em.create(Review, { buyer: buyer1, supplier: s2, transactionType: TransactionType.CONTACT, qualityRating: 4, delayRating: 4, communicationRating: 5, conformityRating: 4, comment: 'Bon accueil, produits frais. Je recommande les semences de tomate.' })
    em.create(Review, { buyer: buyer1, supplier: s3, transactionType: TransactionType.CONTACT, qualityRating: 5, delayRating: 5, communicationRating: 5, conformityRating: 5, comment: 'Fatou est incroyable ! Ses tomates sont les meilleures du marche.' })
    em.create(Review, { buyer: buyer2, supplier: s3, transactionType: TransactionType.CONTACT, qualityRating: 4, delayRating: 5, communicationRating: 4, conformityRating: 5, comment: 'Tres bon rapport qualite/prix sur les fruits. Livraison rapide.' })
    await em.flush()

    // ===== CONVERSATIONS =====
    console.info('Creating conversations...')
    const conv1 = em.create(Conversation, { buyer: buyer1, supplier: s1, lastMessageAt: new Date() })
    await em.flush()
    em.create(Message, { conversation: conv1, sender: buyer1, type: MessageType.TEXT, content: 'Bonjour, votre huile de palme bio est disponible en 5L', createdAt: hoursAgo(4) })
    em.create(Message, { conversation: conv1, sender: supplierUser1, type: MessageType.TEXT, content: 'Oui ! Venez au stand 42 a Dantokpa, je vous la reserve.', createdAt: hoursAgo(3) })
    em.create(Message, { conversation: conv1, sender: buyer1, type: MessageType.TEXT, content: 'Parfait, j\'arrive dans 30 minutes. Merci !', createdAt: hoursAgo(2) })
    em.create(Message, { conversation: conv1, sender: supplierUser1, type: MessageType.TEXT, content: 'A tout a l\'heure !', createdAt: hoursAgo(1) })

    const conv2 = em.create(Conversation, { buyer: buyer2, supplier: s3, lastMessageAt: new Date() })
    await em.flush()
    em.create(Message, { conversation: conv2, sender: buyer2, type: MessageType.TEXT, content: 'Bonjour Fatou, est-ce que vous livrez a Akpakpa', createdAt: hoursAgo(2) })
    em.create(Message, { conversation: conv2, sender: supplierUser3, type: MessageType.TEXT, content: 'Bonjour Rachid ! Oui, je livre dans un rayon de 5 km. Frais 500 FCFA.', createdAt: hoursAgo(1) })
    em.create(Message, { conversation: conv2, sender: buyer2, type: MessageType.TEXT, content: 'Super, je vais passer commande pour des tomates et des mangues.', createdAt: new Date() })
    await em.flush()

    // ===== COMMUNITY =====
    console.info('Creating community groups...')
    const grp1 = em.create(CommunityGroup, { name: 'Filiere Huiles Bio', type: GroupType.SECTOR, sector: 'Huiles', memberCount: 45 })
    const grp2 = em.create(CommunityGroup, { name: 'Producteurs Cotonou', type: GroupType.GEOGRAPHIC, region: 'Littoral', commune: 'Cotonou', memberCount: 120 })
    const grp3 = em.create(CommunityGroup, { name: 'Maraichers Bio', type: GroupType.SECTOR, sector: 'Legumes', memberCount: 78 })
    await em.flush()

    for (const [user, group] of [[supplierUser1, grp1], [buyer1, grp1], [supplierUser1, grp2], [buyer1, grp2], [supplierUser3, grp2], [supplierUser3, grp3], [buyer2, grp3], [supplierUser2, grp3]] as [User, CommunityGroup][]) {
      em.create(GroupMembership, { user, group })
    }
    await em.flush()

    em.create(Publication, { author: supplierUser1, group: grp1, type: PublicationType.PRODUCT_ANNOUNCEMENT, content: 'Nouvelle recolte d\'arachides bio disponible ! Prix special cette semaine pour les membres.', createdAt: daysAgo(1) })
    em.create(Publication, { author: buyer1, group: grp2, type: PublicationType.TECHNICAL_QUESTION, content: 'Quelqu\'un a de l\'experience avec le traitement bio contre les pucerons sur les tomates', createdAt: hoursAgo(6) })
    em.create(Publication, { author: supplierUser3, group: grp3, type: PublicationType.PRODUCT_ANNOUNCEMENT, content: 'Mangues Kent en promo cette semaine ! -20% sur les caisses de 6.', createdAt: hoursAgo(4) })
    await em.flush()

    // ===== TRAINING =====
    console.info('Creating training modules...')
    em.create(TrainingModule, { title: 'Comment utiliser eBio', theme: 'Utilisation eBio', format: TrainingFormat.VIDEO, durationSeconds: 120, contentUrl: 'https://storage.ebio.bj/training/tuto-ebio.mp4', thumbnailUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop', downloadable: true, quizData: { questions: [{ id: 'q1', text: 'Comment rechercher un produit', options: [{ id: 'a', text: 'Barre de recherche' }, { id: 'b', text: 'Appeler le fournisseur' }], answer: 'a' }] } })
    em.create(TrainingModule, { title: 'Bonnes pratiques de transformation', theme: 'Transformation', format: TrainingFormat.VIDEO, durationSeconds: 180, contentUrl: 'https://storage.ebio.bj/training/transformation.mp4', thumbnailUrl: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&h=300&fit=crop', downloadable: true })
    em.create(TrainingModule, { title: 'Fixer ses prix', theme: 'Gestion', format: TrainingFormat.AUDIO, durationSeconds: 300, contentUrl: 'https://storage.ebio.bj/training/prix.mp3', thumbnailUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop', downloadable: true })
    em.create(TrainingModule, { title: 'Agriculture biologique au Benin', theme: 'Bio', format: TrainingFormat.VIDEO, durationSeconds: 240, contentUrl: 'https://storage.ebio.bj/training/bio-benin.mp4', thumbnailUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&h=300&fit=crop', downloadable: true })
    await em.flush()

    // ===== NOTIFICATIONS =====
    console.info('Creating notifications...')
    em.create(Notification, { user: buyer1, type: NotificationType.ORDER_DELIVERED, title: 'Commande livree', body: 'Votre commande EB-20260326-001 a ete livree avec succes.', channel: NotificationChannel.IN_APP, sentAt: daysAgo(1) })
    em.create(Notification, { user: buyer2, type: NotificationType.SYSTEM, title: 'Bienvenue sur eBio !', body: 'Trouvez des produits bio pres de chez vous.', channel: NotificationChannel.PUSH, sentAt: daysAgo(7) })
    em.create(Notification, { user: supplierUser1, type: NotificationType.SUPPLIER_VALIDATED, title: 'Compte valide', body: 'Felicitations ! Votre boutique est maintenant visible sur eBio.', channel: NotificationChannel.SMS, sentAt: daysAgo(5) })
    em.create(Notification, { user: supplierUser1, type: NotificationType.ORDER_PLACED, title: 'Nouvelle commande', body: 'Nouvelle commande de Amina Koffi : 2x Huile de palme bio (5000 FCFA).', channel: NotificationChannel.PUSH, sentAt: daysAgo(3) })
    await em.flush()

    console.info('')
    console.info('=== eBio demo data seeded ===')
    console.info(`Password: ${DEMO_PASSWORD}`)
    console.info('Admin:     admin@ebio.bj')
    console.info('Buyer 1:   amina@example.com')
    console.info('Buyer 2:   rachid@example.com')
    console.info('Supplier1: koffi@example.com (Huiles Bio Koffi)')
    console.info('Supplier2: adama@example.com (Intrants Bio Adama)')
    console.info('Supplier3: fatou@example.com (Fruits & Legumes Fatou)')
    console.info('22 products | 7 orders | 8 categories')
  }

  private async createUser(em: EntityManager, name: string, email: string, phone: string, role: UserRole, roleEntity: Role): Promise<User> {
    let user = await em.findOne(User, { email })
    if (!user) {
      user = em.create(User, { name, email, phone, role, emailVerified: true, userRole: roleEntity })
      await em.flush()
    }

    const existingAccount = await em.findOne(Account, { user })
    if (!existingAccount) {
      const account = new Account()
      account.user = user
      account.providerId = 'credential'
      account.accountId = crypto.randomUUID()
      account.password = await hashPassword(DEMO_PASSWORD)
      em.persist(account)
      await em.flush()
    }

    return user
  }

  private createProduct(
    em: EntityManager,
    supplier: Supplier,
    category: Category,
    name: string,
    description: string,
    price: number,
    unit: ProductUnit,
    stock: number,
    alertThreshold: number,
    photos: string[],
    promoPrice?: number,
    promoDays?: number,
    status?: ProductStatus,
  ): Product {
    return em.create(Product, {
      supplier,
      category,
      name,
      description,
      pricePerUnit: price,
      unit,
      stock,
      stockAlertThreshold: alertThreshold,
      status: status ?? ProductStatus.ACTIVE,
      photos,
      promotionalPrice: promoPrice,
      promotionExpiresAt: promoDays ? new Date(Date.now() + promoDays * 24 * 60 * 60 * 1000) : undefined,
    })
  }
}
