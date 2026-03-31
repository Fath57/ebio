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
import { User, UserRole } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Dispute, DisputeStatus } from '../orders/entities/dispute.entity'
import { Supplier, ValidationStatus } from '../suppliers/supplier.entity'
import { ContentReport, ReportStatus, ReportTargetType } from './entities/content-report.entity'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
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
         FROM orders WHERE "createdAt" >= $1`,
        [startOfMonth],
      ),
      this.em.count(Supplier, {
        validationStatus: { $in: [ValidationStatus.PENDING, ValidationStatus.COMPLEMENT_REQUESTED] },
      }),
      this.em.count(Dispute, { status: DisputeStatus.OPEN }),
    ])

    const dailySearchesResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count FROM search_logs WHERE "createdAt" >= $1`,
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
       WHERE supplier_id = ANY($1)
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

    this.logger.warn(`Supplier ${supplierId} suspended by admin ${adminId}: ${reason}`)

    await this.em.flush()
  }

  async getTransactions(params: {
    from?: string
    to?: string
    page: number
    limit: number
  }): Promise<{ items: unknown[], total: number, page: number, limit: number }> {
    const conditions: string[] = ['1=1']
    const queryParams: unknown[] = []
    let paramIdx = 1

    if (params.from) {
      conditions.push(`o."createdAt" >= $${paramIdx}`)
      queryParams.push(new Date(params.from))
      paramIdx++
    }
    if (params.to) {
      conditions.push(`o."createdAt" <= $${paramIdx}`)
      queryParams.push(new Date(params.to))
      paramIdx++
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
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      queryParams,
    )

    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      date: (r.date as Date).toISOString(),
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
      `SELECT category, rate FROM commission_rates ORDER BY category`,
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
        `INSERT INTO commission_rates (category, rate, "updatedAt")
         VALUES ($1, $2, NOW())
         ON CONFLICT (category) DO UPDATE SET rate = $2, "updatedAt" = NOW()`,
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
}
