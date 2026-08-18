import type { TemplateName } from '../email/email-template.service'
import type {
  BroadcastNotification,
  CommissionRates,
  DashboardKpi,
  DisputeResolutionInput,
  ResolveReportInput,
  ValidationActionInput,
} from './contracts/admin.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { config } from '../../config/env.config'
import { User, UserRole } from '../auth/auth.entity'
import { EmailService } from '../email/email.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Dispute, DisputeStatus } from '../orders/entities/dispute.entity'
import { Supplier, ValidationStatus } from '../suppliers/supplier.entity'
import { ContentReport, ReportStatus, ReportTargetType } from './entities/content-report.entity'

/** Colonnes triables — liste fermée, aucune valeur de requête n'atteint le SQL. */
const ORDER_SORT_COLUMNS: Record<string, string> = {
  createdAt: 'o."createdAt"',
  orderNumber: 'o.order_number',
  status: 'o.status',
  totalAmount: 'o.total_amount',
  commissionAmount: 'o.commission_amount',
  buyer: 'bu.name',
  supplier: 's.shop_name',
}

const SUPPLIER_SORT_COLUMNS: Record<string, string> = {
  createdAt: 's."createdAt"',
  shopName: 's.shop_name',
  validationStatus: 's.validation_status',
  rating: 's.global_rating',
  productCount: 'product_count',
  orderCount: 'order_count',
}

const USER_SORT_COLUMNS: Record<string, string> = {
  createdAt: 'u."createdAt"',
  name: 'u.name',
  email: 'u.email',
  role: 'u.role',
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  async getDashboardKpis(): Promise<DashboardKpi> {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      activeUsers,
      activeSuppliers,
      monthlyTransactionsResult,
      pendingValidations,
      openDisputes,
    ] = await Promise.all([
      this.em.count(User, { role: { $ne: UserRole.ADMIN } }),
      this.em.count(Supplier, { validationStatus: ValidationStatus.VALIDATED }),
      this.em.getConnection().execute(
        `SELECT COUNT(*) as count, COALESCE(SUM(commission_amount), 0) as revenue
         FROM orders WHERE "createdAt" >= ?`,
        [startOfMonth],
      ),
      this.em.count(Supplier, {
        validationStatus: { $in: [ValidationStatus.PENDING, ValidationStatus.COMPLEMENT_REQUESTED] },
      }),
      this.em.count(Dispute, { status: DisputeStatus.OPEN }),
    ])

    const dailySearchesResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count FROM search_logs WHERE "createdAt" >= ?`,
      [startOfDay],
    ).catch(() => [{ count: 0 }])

    return {
      activeUsers,
      activeSuppliers,
      dailySearches: Number(dailySearchesResult[0]?.count ?? 0),
      monthlyTransactions: Number(monthlyTransactionsResult[0]?.count ?? 0),
      platformRevenue: Number(monthlyTransactionsResult[0]?.revenue ?? 0),
      pendingValidations,
      openDisputes,
    }
  }

  async getValidationQueue(params: {
    status?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const where: Record<string, unknown> = {}

    if (params.status) {
      where.validationStatus = params.status.toUpperCase()
    }
    else {
      where.validationStatus = {
        $in: [ValidationStatus.PENDING, ValidationStatus.COMPLEMENT_REQUESTED],
      }
    }

    const [suppliers, total] = await this.em.findAndCount(
      Supplier,
      where,
      {
        populate: ['user'],
        orderBy: { createdAt: 'ASC' },
        limit: params.limit,
        offset: (params.page - 1) * params.limit,
      },
    )

    const productCounts = await this.em.getConnection().execute(
      `SELECT supplier_id, COUNT(*) as count FROM products
       WHERE supplier_id = ANY(?)
       GROUP BY supplier_id`,
      [suppliers.map(s => s.id)],
    ).catch(() => [] as Array<{ supplier_id: string, count: string }>)

    const countMap = new Map(
      (productCounts as Array<{ supplier_id: string, count: string }>).map(r => [r.supplier_id, Number(r.count)]),
    )

    const items = suppliers.map(s => ({
      id: s.id,
      fullName: s.user?.name ?? '',
      email: s.user?.email ?? null,
      phone: s.user?.phone ?? null,
      shopName: s.shopName,
      type: s.type,
      address: s.address ?? null,
      submittedAt: s.createdAt.toISOString(),
      validationStatus: s.validationStatus,
      productCount: countMap.get(s.id) ?? 0,
      identityDocumentUrl: s.identityDocument ?? null,
      businessProofUrl: s.businessProof ?? null,
      profilePhoto: s.profilePhoto ?? null,
    }))

    return { items, total, page: params.page, limit: params.limit }
  }

  async validateSupplier(
    supplierId: string,
    input: ValidationActionInput,
    adminId: string,
  ): Promise<void> {
    const supplier = await this.em.findOne(Supplier, { id: supplierId }, { populate: ['user'] })
    if (!supplier) {
      throw new NotFoundException('Fournisseur non trouvé')
    }

    switch (input.action) {
      case 'VALIDATE':
        supplier.validationStatus = ValidationStatus.VALIDATED
        supplier.validatedAt = new Date()
        supplier.validatedBy = adminId
        await this.sendSupplierNotification(
          supplier.user,
          NotificationType.SUPPLIER_VALIDATED,
          'Compte validé',
          'Votre compte fournisseur a été validé. Vous pouvez maintenant vendre sur eBio.',
        )
        break

      case 'REJECT':
        if (!input.message) {
          throw new BadRequestException('Un message est requis pour le rejet')
        }
        supplier.validationStatus = ValidationStatus.REJECTED
        await this.sendSupplierNotification(
          supplier.user,
          NotificationType.SUPPLIER_REJECTED,
          'Compte rejeté',
          `Votre demande a été rejetée : ${input.message}`,
        )
        break

      case 'REQUEST_COMPLEMENT':
        if (!input.message) {
          throw new BadRequestException('Un message est requis pour la demande de complément')
        }
        supplier.validationStatus = ValidationStatus.COMPLEMENT_REQUESTED
        await this.sendSupplierNotification(
          supplier.user,
          NotificationType.SUPPLIER_COMPLEMENT,
          'Complément requis',
          `Des informations complémentaires sont nécessaires : ${input.message}`,
        )
        break
    }

    await this.em.flush()
  }

  async getReports(params: {
    targetType?: string
    status?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const where: Record<string, unknown> = {}

    if (params.targetType) {
      where.targetType = params.targetType as ReportTargetType
    }
    if (params.status) {
      where.status = params.status as ReportStatus
    }

    const [reports, total] = await this.em.findAndCount(
      ContentReport,
      where,
      {
        populate: ['reporter'],
        orderBy: { createdAt: 'DESC' },
        limit: params.limit,
        offset: (params.page - 1) * params.limit,
      },
    )

    const items = reports.map(r => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reporterName: r.reporter?.name ?? 'Inconnu',
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))

    return { items, total, page: params.page, limit: params.limit }
  }

  async resolveReport(
    reportId: string,
    input: ResolveReportInput,
    adminId: string,
  ): Promise<void> {
    const report = await this.em.findOne(ContentReport, { id: reportId })
    if (!report) {
      throw new NotFoundException('Signalement non trouvé')
    }

    const admin = await this.em.findOneOrFail(User, { id: adminId })

    switch (input.action) {
      case 'DELETE_CONTENT':
      case 'WARN_AUTHOR':
        report.status = ReportStatus.RESOLVED
        break
      case 'DISMISS':
        report.status = ReportStatus.DISMISSED
        break
    }

    report.resolvedBy = admin
    report.resolvedAt = new Date()
    report.adminNote = input.adminNote

    await this.em.flush()
  }

  async getDisputes(params: {
    status?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const where: Record<string, unknown> = {}
    if (params.status) {
      where.status = params.status as DisputeStatus
    }

    const [disputes, total] = await this.em.findAndCount(
      Dispute,
      where,
      {
        populate: ['order', 'order.buyer', 'order.supplier', 'order.supplier.user', 'openedBy'],
        orderBy: { createdAt: 'DESC' },
        limit: params.limit,
        offset: (params.page - 1) * params.limit,
      },
    )

    const items = disputes.map(d => ({
      id: d.id,
      orderNumber: d.order?.orderNumber ?? '',
      buyerName: d.order?.buyer?.name ?? 'Inconnu',
      supplierName: d.order?.supplier?.shopName ?? 'Inconnu',
      reason: d.reason,
      amount: d.order?.totalAmount ?? 0,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    }))

    return { items, total, page: params.page, limit: params.limit }
  }

  async resolveDispute(
    disputeId: string,
    input: DisputeResolutionInput,
    adminId: string,
  ): Promise<void> {
    const dispute = await this.em.findOne(
      Dispute,
      { id: disputeId },
      { populate: ['order', 'order.buyer', 'order.supplier', 'order.supplier.user'] },
    )
    if (!dispute) {
      throw new NotFoundException('Litige non trouvé')
    }

    const admin = await this.em.findOneOrFail(User, { id: adminId })

    dispute.status = DisputeStatus.RESOLVED
    dispute.resolvedAt = new Date()
    dispute.resolvedBy = admin
    dispute.adminNotes = input.adminNote ?? `Résolution: ${input.resolution}`

    const buyerNotifBody = input.resolution === 'REFUND_BUYER'
      ? 'Le litige a été résolu en votre faveur. Le remboursement est en cours.'
      : input.resolution === 'PARTIAL_REFUND'
        ? `Le litige a été résolu avec un remboursement partiel de ${input.partialAmount} FCFA.`
        : 'Le litige a été résolu. Le paiement a été versé au fournisseur.'

    if (dispute.order?.buyer) {
      await this.sendSupplierNotification(
        dispute.order.buyer,
        NotificationType.DISPUTE_RESOLVED,
        'Litige résolu',
        buyerNotifBody,
      )
    }

    await this.em.flush()
  }

  async suspendSupplier(
    supplierId: string,
    reason: string,
    adminId: string,
  ): Promise<void> {
    const supplier = await this.em.findOne(Supplier, { id: supplierId }, { populate: ['user'] })
    if (!supplier) {
      throw new NotFoundException('Fournisseur non trouvé')
    }

    supplier.validationStatus = ValidationStatus.SUSPENDED

    await this.sendSupplierNotification(
      supplier.user,
      NotificationType.SYSTEM,
      'Compte suspendu',
      `Votre compte a été suspendu : ${reason}`,
    )
    await this.sendSupplierEmail(supplier, 'supplier-suspended', 'Votre compte eBio a été suspendu', { reason })

    this.logger.warn(`Supplier ${supplierId} suspended by admin ${adminId}: ${reason}`)

    await this.em.flush()
  }

  /**
   * Lève une suspension et remet le fournisseur en ligne. Refuse d'agir sur un
   * compte qui n'est pas suspendu, pour ne pas valider par erreur un dossier
   * en attente ou rejeté.
   */
  async reinstateSupplier(supplierId: string, adminId: string): Promise<void> {
    const supplier = await this.em.findOne(Supplier, { id: supplierId }, { populate: ['user'] })
    if (!supplier) {
      throw new NotFoundException('Fournisseur non trouvé')
    }
    if (supplier.validationStatus !== ValidationStatus.SUSPENDED) {
      throw new BadRequestException('Ce fournisseur n\'est pas suspendu')
    }

    supplier.validationStatus = ValidationStatus.VALIDATED

    await this.sendSupplierNotification(
      supplier.user,
      NotificationType.SYSTEM,
      'Compte réactivé',
      'La suspension de votre compte a été levée.',
    )
    await this.sendSupplierEmail(supplier, 'supplier-reinstated', 'Votre compte eBio est réactivé', {})

    this.logger.warn(`Supplier ${supplierId} reinstated by admin ${adminId}`)

    await this.em.flush()
  }

  /**
   * Envoi d'e-mail best-effort : un échec SMTP ne doit pas annuler la décision
   * administrative, qui reste tracée en base et dans les journaux.
   */
  private async sendSupplierEmail(
    supplier: Supplier,
    template: TemplateName,
    subject: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const email = supplier.user?.email
    if (!email) {
      this.logger.warn(`Supplier ${supplier.id} has no email address, skipping notification`)
      return
    }

    try {
      await this.emailService.sendTemplatedEmail({
        to: email,
        subject,
        template,
        data: {
          userName: supplier.user?.name ?? '',
          shopName: supplier.shopName,
          dashboardUrl: `${config.clients.webApp.url}/catalogue`,
          ...data,
        },
      })
    }
    catch (error) {
      this.logger.error(`Failed to email supplier ${supplier.id}`, error)
    }
  }

  async getTransactions(params: {
    from?: string
    to?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const conditions: string[] = ['1=1']
    const queryParams: unknown[] = []

    if (params.from) {
      conditions.push(`o."createdAt" >= ?`)
      queryParams.push(new Date(params.from))
    }
    if (params.to) {
      conditions.push(`o."createdAt" <= ?`)
      queryParams.push(new Date(params.to))
    }

    const whereClause = conditions.join(' AND ')

    const countResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count FROM orders o WHERE ${whereClause}`,
      queryParams,
    )
    const total = Number(countResult[0]?.count ?? 0)

    queryParams.push(params.limit, (params.page - 1) * params.limit)

    const rows = await this.em.getConnection().execute(
      `SELECT o.id, o."createdAt" as date, o.order_number, o.total_amount,
              o.commission_amount, o.status,
              bu.name as buyer_name, s.shop_name as supplier_name
       FROM orders o
       LEFT JOIN users bu ON o.buyer_id = bu.id
       LEFT JOIN suppliers s ON o.supplier_id = s.id
       WHERE ${whereClause}
       ORDER BY o."createdAt" DESC
       LIMIT ? OFFSET ?`,
      queryParams,
    )

    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      date: this.toIso(r.date) ?? '',
      orderNumber: r.order_number as string,
      buyerName: (r.buyer_name as string) ?? 'Inconnu',
      supplierName: (r.supplier_name as string) ?? 'Inconnu',
      amount: Number(r.total_amount ?? 0),
      commission: Number(r.commission_amount ?? 0),
      status: r.status as string,
    }))

    return { items, total, page: params.page, limit: params.limit }
  }

  async exportTransactionsCsv(from?: string, to?: string): Promise<string> {
    const result = await this.getTransactions({ from, to, page: 1, limit: 10000 })
    const header = 'Date;N° commande;Acheteur;Fournisseur;Montant;Commission;Statut'
    const rows = (result.items as Array<Record<string, unknown>>).map(item =>
      `${item.date};${item.orderNumber};${item.buyerName};${item.supplierName};${item.amount};${item.commission};${item.status}`,
    )
    return [header, ...rows].join('\n')
  }

  async getSettings() {
    const commissions = await this.em.getConnection().execute(
      `SELECT category_slug AS category, rate FROM commission_rates ORDER BY category_slug`,
    )
    const plans = await this.em.getConnection().execute(
      `SELECT name, price_monthly, max_products, order_mode_enabled, advanced_analytics, free_commission_orders, max_members
       FROM subscription_plans ORDER BY price_monthly`,
    )
    return { commissions, plans }
  }

  async updateCommissionRates(input: CommissionRates): Promise<void> {
    for (const { category, rate } of input.rates) {
      await this.em.getConnection().execute(
        `INSERT INTO commission_rates (category_slug, rate, "updatedAt")
         VALUES (?, ?, NOW())
         ON CONFLICT (category_slug) DO UPDATE SET rate = EXCLUDED.rate, "updatedAt" = NOW()`,
        [category, rate],
      )
    }
  }

  async broadcastNotification(input: BroadcastNotification): Promise<{ sent: number }> {
    const where: Record<string, unknown> = {}

    if (input.targetRole !== 'ALL') {
      where.role = input.targetRole as UserRole
    }

    const users = await this.em.find(User, where)

    const channel = input.channel as NotificationChannel

    let sent = 0
    for (const user of users) {
      try {
        await this.notificationsService.send({
          user,
          type: NotificationType.SYSTEM,
          title: input.title,
          body: input.body,
          channels: [channel],
        })
        sent++
      }
      catch (error) {
        this.logger.error(`Failed to send broadcast to user ${user.id}`, error)
      }
    }

    return { sent }
  }

  private async sendSupplierNotification(
    user: User,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notificationsService.send({
        user,
        type,
        title,
        body,
        channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      })
    }
    catch (error) {
      this.logger.error(`Failed to send notification to user ${user.id}`, error)
    }
  }

  /**
   * Traduit un couple (champ, sens) en clause ORDER BY. La colonne est prise
   * dans une liste fermée : elle est concaténée au SQL, jamais liée.
   */
  private buildOrderBy(
    allowed: Record<string, string>,
    fallback: string,
    sortBy?: string,
    sortDir?: string,
  ): string {
    const column = (sortBy && allowed[sortBy]) ?? allowed[fallback]
    const direction = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    return `ORDER BY ${column} ${direction} NULLS LAST`
  }

  // ===========================================================================
  // Vues transverses — l'admin n'a pas de profil fournisseur, il ne peut donc
  // pas passer par les endpoints `me`-scopés. Ces lectures couvrent le support
  // client : retrouver une commande, un fournisseur, un compte.
  // ===========================================================================

  async getOrders(params: {
    status?: string
    supplierId?: string
    q?: string
    sortBy?: string
    sortDir?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const conditions: string[] = ['1=1']
    const queryParams: unknown[] = []

    if (params.status) {
      conditions.push(`o.status = ?`)
      queryParams.push(params.status)
    }
    if (params.supplierId) {
      conditions.push(`o.supplier_id = ?`)
      queryParams.push(params.supplierId)
    }
    if (params.q) {
      // Trois placeholders distincts : knex lie positionnellement, sans réutilisation.
      conditions.push(`(o.order_number ILIKE ? OR bu.name ILIKE ? OR s.shop_name ILIKE ?)`)
      queryParams.push(`%${params.q}%`, `%${params.q}%`, `%${params.q}%`)
    }

    const from = `FROM orders o
       LEFT JOIN users bu ON o.buyer_id = bu.id
       LEFT JOIN suppliers s ON o.supplier_id = s.id`
    const whereClause = conditions.join(' AND ')

    const countResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count ${from} WHERE ${whereClause}`,
      queryParams,
    )
    const total = Number(countResult[0]?.count ?? 0)

    queryParams.push(params.limit, (params.page - 1) * params.limit)

    const rows = await this.em.getConnection().execute(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.commission_amount,
              o."createdAt" as created_at, o.pickup_mode,
              bu.id as buyer_id, bu.name as buyer_name,
              s.id as supplier_id, s.shop_name as supplier_name
       ${from}
       WHERE ${whereClause}
       ${this.buildOrderBy(ORDER_SORT_COLUMNS, 'createdAt', params.sortBy, params.sortDir)}
       LIMIT ? OFFSET ?`,
      queryParams,
    )

    return {
      items: rows.map((r: Record<string, unknown>) => this.mapOrderRow(r)),
      total,
      page: params.page,
      limit: params.limit,
    }
  }

  async getOrderById(orderId: string): Promise<unknown> {
    const rows = await this.em.getConnection().execute(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.commission_amount,
              o.commission_rate, o."createdAt" as created_at, o.pickup_mode,
              o.payment_method, o.delivery_address, o.delivery_slot,
              o.accepted_at, o.delivered_at,
              bu.id as buyer_id, bu.name as buyer_name, bu.email as buyer_email,
              bu.phone as buyer_phone,
              s.id as supplier_id, s.shop_name as supplier_name
       FROM orders o
       LEFT JOIN users bu ON o.buyer_id = bu.id
       LEFT JOIN suppliers s ON o.supplier_id = s.id
       WHERE o.id = ?`,
      [orderId],
    )

    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) {
      throw new NotFoundException('Commande introuvable')
    }

    const items = await this.em.getConnection().execute(
      `SELECT oi.id, oi.quantity, oi.unit_price, oi.total_price,
              p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId],
    )

    return {
      ...this.mapOrderRow(row),
      commissionRate: Number(row.commission_rate ?? 0),
      paymentMethod: row.payment_method as string,
      deliveryAddress: (row.delivery_address as string) ?? null,
      deliverySlot: (row.delivery_slot as string) ?? null,
      acceptedAt: this.toIso(row.accepted_at),
      deliveredAt: this.toIso(row.delivered_at),
      buyerEmail: (row.buyer_email as string) ?? null,
      buyerPhone: (row.buyer_phone as string) ?? null,
      items: items.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        productName: (i.product_name as string) ?? 'Produit supprimé',
        quantity: Number(i.quantity ?? 0),
        unitPrice: Number(i.unit_price ?? 0),
        totalPrice: Number(i.total_price ?? 0),
      })),
    }
  }

  async getSuppliers(params: {
    status?: string
    q?: string
    sortBy?: string
    sortDir?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const conditions: string[] = ['1=1']
    const queryParams: unknown[] = []

    if (params.status) {
      conditions.push(`s.validation_status = ?`)
      queryParams.push(params.status)
    }
    if (params.q) {
      conditions.push(`(s.shop_name ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ?)`)
      queryParams.push(`%${params.q}%`, `%${params.q}%`, `%${params.q}%`)
    }

    const from = `FROM suppliers s LEFT JOIN users u ON s.user_id = u.id`
    const whereClause = conditions.join(' AND ')

    const countResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count ${from} WHERE ${whereClause}`,
      queryParams,
    )
    const total = Number(countResult[0]?.count ?? 0)

    queryParams.push(params.limit, (params.page - 1) * params.limit)

    const rows = await this.em.getConnection().execute(
      `SELECT s.id, s.shop_name, s.type, s.mode, s.validation_status, s.timezone,
              s.address, s.neighborhood, s.global_rating, s.total_reviews,
              s.profile_photo, s."createdAt" as created_at,
              ST_Y(s.location::geometry) as latitude,
              ST_X(s.location::geometry) as longitude,
              u.id as user_id, u.name as owner_name, u.email as owner_email,
              u.phone as owner_phone,
              (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE') as product_count,
              (SELECT COUNT(*) FROM orders o WHERE o.supplier_id = s.id) as order_count
       ${from}
       WHERE ${whereClause}
       ${this.buildOrderBy(SUPPLIER_SORT_COLUMNS, 'createdAt', params.sortBy, params.sortDir)}
       LIMIT ? OFFSET ?`,
      queryParams,
    )

    return {
      items: rows.map((r: Record<string, unknown>) => this.mapSupplierRow(r)),
      total,
      page: params.page,
      limit: params.limit,
    }
  }

  /**
   * Products an editor can pick from, searched by name or shop.
   *
   * Deliberately unbounded by location and by supplier status: the back office
   * needs to see the whole catalogue, including a shop that is only pending.
   */
  async getProducts(params: { q?: string, supplierId?: string, limit: number }): Promise<{ items: unknown[] }> {
    const conditions: string[] = [`p.status = 'ACTIVE'`]
    const queryParams: unknown[] = []

    if (params.q) {
      conditions.push(`(p.name ILIKE ? OR s.shop_name ILIKE ?)`)
      queryParams.push(`%${params.q}%`, `%${params.q}%`)
    }

    if (params.supplierId) {
      conditions.push(`p.supplier_id = ?`)
      queryParams.push(params.supplierId)
    }

    // Capped rather than paginated: this feeds a picker, where scrolling past a
    // few dozen results means the search terms were the wrong tool.
    const limit = Math.min(Math.max(params.limit, 1), 50)
    queryParams.push(limit)

    const rows = await this.em.getConnection().execute(
      `SELECT p.id, p.name, p.price_per_unit, p.promotional_price, p.unit,
              p.photos->>0 AS photo,
              s.id AS supplier_id, s.shop_name
       FROM products p
       JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.name ASC
       LIMIT ?`,
      queryParams,
    )

    return {
      items: (rows as Array<Record<string, unknown>>).map(r => ({
        id: r.id as string,
        name: r.name as string,
        photo: (r.photo as string) ?? null,
        pricePerUnit: Number(r.price_per_unit ?? 0),
        promotionalPrice: r.promotional_price != null ? Number(r.promotional_price) : null,
        unit: (r.unit as string) ?? null,
        supplierId: r.supplier_id as string,
        supplierName: r.shop_name as string,
      })),
    }
  }

  async getSupplierById(supplierId: string): Promise<unknown> {
    const rows = await this.em.getConnection().execute(
      `SELECT s.id, s.shop_name, s.type, s.mode, s.validation_status, s.timezone,
              s.address, s.neighborhood, s.global_rating, s.total_reviews,
              s.opening_hours, s.cover_photo, s.profile_photo,
              s.mobile_money_number, s."createdAt" as created_at,
              ST_Y(s.location::geometry) as latitude,
              ST_X(s.location::geometry) as longitude,
              u.id as user_id, u.name as owner_name, u.email as owner_email,
              u.phone as owner_phone,
              (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE') as product_count,
              (SELECT COUNT(*) FROM orders o WHERE o.supplier_id = s.id) as order_count,
              (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.supplier_id = s.id AND o.status = 'DELIVERED') as revenue
       FROM suppliers s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [supplierId],
    )

    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) {
      throw new NotFoundException('Fournisseur introuvable')
    }

    return {
      ...this.mapSupplierRow(row),
      openingHours: row.opening_hours ?? null,
      coverPhoto: (row.cover_photo as string) ?? null,
      profilePhoto: (row.profile_photo as string) ?? null,
      mobileMoneyNumber: (row.mobile_money_number as string) ?? null,
      revenue: Number(row.revenue ?? 0),
    }
  }

  async getUsers(params: {
    role?: string
    q?: string
    sortBy?: string
    sortDir?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const conditions: string[] = ['1=1']
    const queryParams: unknown[] = []

    if (params.role) {
      conditions.push(`u.role = ?`)
      queryParams.push(params.role)
    }
    if (params.q) {
      conditions.push(`(u.name ILIKE ? OR u.email ILIKE ? OR u.phone ILIKE ?)`)
      queryParams.push(`%${params.q}%`, `%${params.q}%`, `%${params.q}%`)
    }

    const whereClause = conditions.join(' AND ')

    const countResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count FROM users u WHERE ${whereClause}`,
      queryParams,
    )
    const total = Number(countResult[0]?.count ?? 0)

    queryParams.push(params.limit, (params.page - 1) * params.limit)

    const rows = await this.em.getConnection().execute(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u."emailVerified" as email_verified,
              u."createdAt" as created_at,
              s.id as supplier_id, s.shop_name as supplier_shop_name
       FROM users u
       LEFT JOIN suppliers s ON s.user_id = u.id
       WHERE ${whereClause}
       ${this.buildOrderBy(USER_SORT_COLUMNS, 'createdAt', params.sortBy, params.sortDir)}
       LIMIT ? OFFSET ?`,
      queryParams,
    )

    return {
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: (r.name as string) ?? '',
        email: (r.email as string) ?? null,
        phone: (r.phone as string) ?? null,
        role: r.role as string,
        emailVerified: Boolean(r.email_verified),
        createdAt: this.toIso(r.created_at) ?? '',
        supplierId: (r.supplier_id as string) ?? null,
        supplierShopName: (r.supplier_shop_name as string) ?? null,
      })),
      total,
      page: params.page,
      limit: params.limit,
    }
  }

  /**
   * Vue financière : les paiements, et non les commandes.
   *
   * La distinction est comptable. Une commande annulée ou jamais réglée n'a
   * donné lieu à aucun mouvement d'argent ; l'additionner à une commande livrée
   * produit un total dépourvu de sens. On part donc de `payments`.
   */
  async getPayments(params: {
    status?: string
    provider?: string
    q?: string
    from?: string
    to?: string
    page: number
    limit: number
  }): Promise<{
    items: unknown[]
    total: number
    page: number
    limit: number
    totals: Record<string, number>
  }> {
    const conditions: string[] = ['1=1']
    const queryParams: unknown[] = []

    if (params.status) {
      conditions.push(`p.status = ?`)
      queryParams.push(params.status)
    }
    if (params.provider) {
      conditions.push(`p.provider = ?`)
      queryParams.push(params.provider)
    }
    if (params.from) {
      conditions.push(`p."createdAt" >= ?`)
      queryParams.push(new Date(params.from))
    }
    if (params.to) {
      conditions.push(`p."createdAt" <= ?`)
      queryParams.push(new Date(params.to))
    }
    if (params.q) {
      conditions.push(`(o.order_number ILIKE ? OR bu.name ILIKE ? OR s.shop_name ILIKE ? OR p.provider_reference ILIKE ?)`)
      const like = `%${params.q}%`
      queryParams.push(like, like, like, like)
    }

    const from = `FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN users bu ON o.buyer_id = bu.id
       LEFT JOIN suppliers s ON o.supplier_id = s.id`
    const whereClause = conditions.join(' AND ')

    const [countRow] = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count ${from} WHERE ${whereClause}`,
      queryParams,
    ) as Array<{ count: string }>

    // Les agrégats portent sur l'ensemble filtré, pas sur la page affichée.
    const [totalsRow] = await this.em.getConnection().execute(
      `SELECT
         COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('CAPTURED','ESCROW','RELEASED')), 0) AS collected,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('CAPTURED','ESCROW')), 0) AS in_escrow,
         COALESCE(SUM(o.commission_amount) FILTER (WHERE p.status = 'RELEASED'), 0) AS commission_earned,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'REFUNDED'), 0) AS refunded
       ${from} WHERE ${whereClause}`,
      queryParams,
    ) as Array<Record<string, unknown>>

    const dataParams = [...queryParams, params.limit, (params.page - 1) * params.limit]
    const rows = await this.em.getConnection().execute(
      `SELECT p.id, p.amount, p.provider, p.provider_reference, p.payment_method,
              p.operator, p.status, p.paid_at, p.released_at, p.refunded_at,
              p."createdAt" as created_at,
              o.id as order_id, o.order_number, o.commission_amount,
              bu.name as buyer_name, s.shop_name as supplier_name
       ${from}
       WHERE ${whereClause}
       ORDER BY p."createdAt" DESC
       LIMIT ? OFFSET ?`,
      dataParams,
    )

    return {
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        orderId: (r.order_id as string) ?? null,
        orderNumber: (r.order_number as string) ?? null,
        buyerName: (r.buyer_name as string) ?? 'Inconnu',
        supplierName: (r.supplier_name as string) ?? 'Inconnu',
        amount: Number(r.amount ?? 0),
        // La commission n'est acquise qu'une fois le séquestre libéré.
        commission: r.status === 'RELEASED' ? Number(r.commission_amount ?? 0) : 0,
        provider: r.provider as string,
        providerReference: (r.provider_reference as string) ?? null,
        paymentMethod: (r.payment_method as string) ?? null,
        operator: (r.operator as string) ?? null,
        status: r.status as string,
        paidAt: this.toIso(r.paid_at),
        releasedAt: this.toIso(r.released_at),
        refundedAt: this.toIso(r.refunded_at),
        createdAt: this.toIso(r.created_at) ?? '',
      })),
      total: Number(countRow?.count ?? 0),
      page: params.page,
      limit: params.limit,
      totals: {
        collected: Number(totalsRow?.collected ?? 0),
        inEscrow: Number(totalsRow?.in_escrow ?? 0),
        commissionEarned: Number(totalsRow?.commission_earned ?? 0),
        refunded: Number(totalsRow?.refunded ?? 0),
      },
    }
  }

  async exportPaymentsCsv(params: {
    status?: string
    provider?: string
    q?: string
    from?: string
    to?: string
  }): Promise<string> {
    const result = await this.getPayments({ ...params, page: 1, limit: 10000 })
    const header = 'Date;Référence;N° commande;Acheteur;Fournisseur;Montant;Commission;Prestataire;Réf. prestataire;Statut'
    const rows = (result.items as Array<Record<string, unknown>>).map(item =>
      [
        item.createdAt,
        item.id,
        item.orderNumber ?? '',
        item.buyerName,
        item.supplierName,
        item.amount,
        item.commission,
        item.provider,
        item.providerReference ?? '',
        item.status,
      ].join(';'),
    )
    return [header, ...rows].join('\n')
  }

  /** Le driver renvoie les timestamps tantôt en `Date`, tantôt en chaîne. */
  private toIso(value: unknown): string | null {
    if (!value)
      return null
    return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString()
  }

  private mapOrderRow(r: Record<string, unknown>) {
    return {
      id: r.id as string,
      orderNumber: r.order_number as string,
      status: r.status as string,
      pickupMode: r.pickup_mode as string,
      totalAmount: Number(r.total_amount ?? 0),
      commissionAmount: Number(r.commission_amount ?? 0),
      createdAt: this.toIso(r.created_at) ?? '',
      buyer: {
        id: (r.buyer_id as string) ?? null,
        name: (r.buyer_name as string) ?? 'Inconnu',
      },
      supplier: {
        id: (r.supplier_id as string) ?? null,
        shopName: (r.supplier_name as string) ?? 'Inconnu',
      },
    }
  }

  private mapSupplierRow(r: Record<string, unknown>) {
    return {
      id: r.id as string,
      shopName: r.shop_name as string,
      type: r.type as string,
      mode: r.mode as string,
      validationStatus: r.validation_status as string,
      timezone: r.timezone as string,
      address: (r.address as string) ?? null,
      neighborhood: (r.neighborhood as string) ?? null,
      profilePhoto: (r.profile_photo as string) ?? null,
      latitude: r.latitude !== null ? Number(r.latitude) : null,
      longitude: r.longitude !== null ? Number(r.longitude) : null,
      rating: r.global_rating !== null ? Number(r.global_rating) : null,
      reviewCount: Number(r.total_reviews ?? 0),
      productCount: Number(r.product_count ?? 0),
      orderCount: Number(r.order_count ?? 0),
      createdAt: this.toIso(r.created_at) ?? '',
      owner: {
        id: (r.user_id as string) ?? null,
        name: (r.owner_name as string) ?? '',
        email: (r.owner_email as string) ?? null,
        phone: (r.owner_phone as string) ?? null,
      },
    }
  }
}
