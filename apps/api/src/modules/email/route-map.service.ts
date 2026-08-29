import { Buffer } from 'node:buffer'
import { Injectable, Logger } from '@nestjs/common'
import { config } from '../../config/env.config'

export interface GeoPoint {
  latitude: number
  longitude: number
}

const STATIC_MAPS_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap'
const SHOP_MARKER_COLOR = '0x1e7a37'
const CLIENT_MARKER_COLOR = '0xE8735A'
const ROUTE_COLOR = '0x1e7a37'

function formatPoint(point: GeoPoint): string {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`
}

/**
 * Google Static Maps URL for a shop → client route snapshot (600×300 at
 * scale 2 for retina mail clients). Pure so it can be unit-tested; the key
 * is appended by the service and must never reach the e-mail HTML.
 */
export function buildRouteMapUrl(pickup: GeoPoint, dropoff: GeoPoint, apiKey: string): string {
  const params = new URLSearchParams()
  params.set('size', '600x300')
  params.set('scale', '2')
  params.set('maptype', 'roadmap')
  params.set('language', 'fr')
  params.append('markers', `color:${SHOP_MARKER_COLOR}|label:B|${formatPoint(pickup)}`)
  params.append('markers', `color:${CLIENT_MARKER_COLOR}|label:C|${formatPoint(dropoff)}`)
  params.set('path', `color:${ROUTE_COLOR}|weight:4|${formatPoint(pickup)}|${formatPoint(dropoff)}`)
  params.set('key', apiKey)
  return `${STATIC_MAPS_ENDPOINT}?${params.toString()}`
}

function isValidPoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return !!point
    && Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90
    && Math.abs(point.longitude) <= 180
}

/**
 * Renders a PNG snapshot of the delivery route for transactional e-mails.
 * Best-effort: any failure (missing key, missing coordinates, network or
 * HTTP error) yields null so the caller can simply omit the picture.
 */
@Injectable()
export class RouteMapService {
  private readonly logger = new Logger(RouteMapService.name)

  async render(pickup: GeoPoint | null | undefined, dropoff: GeoPoint | null | undefined): Promise<Buffer | null> {
    const apiKey = config.maps.googleApiKey
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY is not set, skipping route map rendering')
      return null
    }
    if (!isValidPoint(pickup) || !isValidPoint(dropoff)) {
      this.logger.warn('Route map skipped: pickup or drop-off coordinates missing')
      return null
    }

    try {
      const response = await fetch(buildRouteMapUrl(pickup, dropoff, apiKey), {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        this.logger.warn(`Static Maps request failed with HTTP ${response.status}`)
        return null
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        this.logger.warn(`Static Maps returned an unexpected content type: ${contentType}`)
        return null
      }
      return Buffer.from(await response.arrayBuffer())
    }
    catch (error) {
      this.logger.warn(`Route map rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }
}
