import type { ExportCountryInput, UpdateExportCountry } from './contracts/terroir.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ExportDepartureStatus, ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportCountry } from './entities/export-country.entity'
import { terroirError } from './terroir-texts'

/** Parcels that no longer travel, or never did: not « en cours ». */
const NOT_ACTIVE_SHIPMENT = [
  ExportShipmentStatus.PENDING_PAYMENT,
  ExportShipmentStatus.CANCELLED,
  ExportShipmentStatus.HANDED_OVER,
  ExportShipmentStatus.LOST,
  ExportShipmentStatus.DAMAGED,
]

export interface CountryCounts {
  pickupPoints: number
  openDepartures: number
  activeShipments: number
}

export interface AdminCountryView {
  country: ExportCountry
  counts: CountryCounts
}

export interface ClientCountryView {
  country: ExportCountry
  hasOpenDeparture: boolean
}

function countryUnknown(status: HttpStatus = HttpStatus.BAD_REQUEST) {
  return terroirError(status, 'EXPORT_COUNTRY_UNKNOWN', 'Ce pays de destination n\'existe pas.')
}

function auditAction(wasActive: boolean, isActive: boolean): string {
  if (wasActive === isActive) {
    return 'EXPORT_COUNTRY_UPDATED'
  }
  return isActive ? 'EXPORT_COUNTRY_ACTIVATED' : 'EXPORT_COUNTRY_DEACTIVATED'
}

/**
 * Destination countries (011): a table the back office edits, so a country
 * opens without a new app version. Nothing is ever deleted; a deactivated
 * country refuses new parcels but its parcels keep travelling.
 */
@Injectable()
export class ExportCountriesService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  /** The country behind a code, active or not. 400 (404 for a path) when unknown. */
  async require(code: string, status: HttpStatus = HttpStatus.BAD_REQUEST): Promise<ExportCountry> {
    const country = await this.find(code)
    if (!country) {
      throw countryUnknown(status)
    }
    return country
  }

  /** For anything new a buyer starts: catalogue, departures, checkout, alerts. */
  async requireActive(code: string): Promise<ExportCountry> {
    const country = await this.require(code)
    if (!country.isActive) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_COUNTRY_INACTIVE', `Les envois ${country.toPhrase} sont suspendus pour le moment.`)
    }
    return country
  }

  /** Null when the code names no country; never throws (texts, notices). */
  async find(code: string): Promise<ExportCountry | null> {
    return this.em.fork().findOne(ExportCountry, { code: code.toUpperCase() })
  }

  /** Every code must exist; an inactive one is fine (the back office prepares an opening). */
  async requireAll(codes: string[]): Promise<void> {
    const wanted = [...new Set(codes.map(code => code.toUpperCase()))]
    if (wanted.length === 0) {
      return
    }
    const found = await this.em.fork().count(ExportCountry, { code: { $in: wanted } })
    if (found !== wanted.length) {
      throw countryUnknown()
    }
  }

  /** Codes of the active countries. */
  async activeCodes(): Promise<Set<string>> {
    const rows = await this.em.fork().find(ExportCountry, { isActive: true }, { fields: ['code'] })
    return new Set(rows.map(row => row.code))
  }

  // ===== BUYERS =====

  /**
   * Active countries, each saying whether an open departure (order deadline
   * not passed) has a rate towards it. `all` false keeps only those: a buyer
   * never picks a country with nothing to send.
   */
  async forClients(all: boolean): Promise<ClientCountryView[]> {
    const countries = await this.em.find(ExportCountry, { isActive: true }, { orderBy: { sortOrder: 'ASC', name: 'ASC' } })
    const served = await this.servedCodes()
    return countries
      .map(country => ({ country, hasOpenDeparture: served.has(country.code) }))
      .filter(view => all || view.hasOpenDeparture)
  }

  // ===== BACK OFFICE =====

  async listForAdmin(): Promise<AdminCountryView[]> {
    const countries = await this.em.find(ExportCountry, {}, { orderBy: { sortOrder: 'ASC', name: 'ASC' } })
    const counts = await this.countsByCountry()
    return countries.map(country => ({ country, counts: counts.get(country.code) ?? { pickupPoints: 0, openDepartures: 0, activeShipments: 0 } }))
  }

  async create(input: ExportCountryInput, actorUserId: string): Promise<AdminCountryView> {
    if (await this.find(input.code)) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_COUNTRY_EXISTS', 'Ce pays de destination existe déjà.')
    }
    const country = this.em.create(ExportCountry, {
      code: input.code,
      name: input.name,
      toPhrase: input.toPhrase,
      inPhrase: input.inPhrase,
      displayCurrency: input.displayCurrency,
      flagEmoji: input.flagEmoji ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'EXPORT_COUNTRY_CREATED', targetType: 'export_country', targetId: country.code, payload: { ...input } })
    return this.adminView(country.code)
  }

  /** Everything but the code; `isActive: false` closes the country to new parcels. */
  async update(code: string, input: UpdateExportCountry, actorUserId: string): Promise<AdminCountryView> {
    const country = await this.em.findOne(ExportCountry, { code: code.toUpperCase() }, { refresh: true })
    if (!country) {
      throw countryUnknown(HttpStatus.NOT_FOUND)
    }
    const wasActive = country.isActive
    this.em.assign(country, input)
    await this.em.flush()
    await this.audit.record({ actorUserId, action: auditAction(wasActive, country.isActive), targetType: 'export_country', targetId: country.code, payload: { ...input } })
    return this.adminView(country.code)
  }

  async adminView(code: string): Promise<AdminCountryView> {
    const country = await this.em.findOne(ExportCountry, { code: code.toUpperCase() }, { refresh: true })
    if (!country) {
      throw countryUnknown(HttpStatus.NOT_FOUND)
    }
    const counts = await this.countsByCountry([country.code])
    return { country, counts: counts.get(country.code) ?? { pickupPoints: 0, openDepartures: 0, activeShipments: 0 } }
  }

  // ===== INTERNALS =====

  /** Countries an open departure, still orderable, has a rate towards. */
  private async servedCodes(): Promise<Set<string>> {
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    const rows = await this.em.getConnection().execute(
      `SELECT DISTINCT r.country
       FROM export_departure_rates r
       JOIN export_departures d ON d.id = r.departure_id
       WHERE d.status = ? AND d.deposit_deadline - (? * INTERVAL '1 day') > NOW()`,
      [ExportDepartureStatus.OPEN, collectionDays],
    ) as Array<{ country: string }>
    return new Set(rows.map(row => row.country))
  }

  private async countsByCountry(codes?: string[]): Promise<Map<string, CountryCounts>> {
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    const filter = codes ? `WHERE c.code IN (${codes.map(() => '?').join(', ')})` : ''
    const rows = await this.em.getConnection().execute(
      `SELECT c.code,
              (SELECT COUNT(*)::int FROM export_pickup_points p WHERE p.country = c.code) AS pickup_points,
              (SELECT COUNT(DISTINCT d.id)::int
                 FROM export_departure_rates r
                 JOIN export_departures d ON d.id = r.departure_id
                WHERE r.country = c.code AND d.status = ? AND d.deposit_deadline - (? * INTERVAL '1 day') > NOW()) AS open_departures,
              (SELECT COUNT(*)::int FROM export_shipments s
                WHERE s.country = c.code AND s.status NOT IN (${NOT_ACTIVE_SHIPMENT.map(() => '?').join(', ')})) AS active_shipments
       FROM export_countries c
       ${filter}`,
      [ExportDepartureStatus.OPEN, collectionDays, ...NOT_ACTIVE_SHIPMENT, ...(codes ?? [])],
    ) as Array<{ code: string, pickup_points: number, open_departures: number, active_shipments: number }>
    return new Map(rows.map(row => [row.code, {
      pickupPoints: Number(row.pickup_points),
      openDepartures: Number(row.open_departures),
      activeShipments: Number(row.active_shipments),
    }]))
  }
}
