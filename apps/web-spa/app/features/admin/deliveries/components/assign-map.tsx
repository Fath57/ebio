import type { CourierCandidate, GeoPoint } from '../utils/deliveries-queries'
import { AdvancedMarker, APIProvider, InfoWindow, Map, Pin, useMap } from '@vis.gl/react-google-maps'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
/** Any string works as a map id for Advanced Markers; a real style id is optional. */
const MAP_ID = 'ebio-admin-dispatch'
/** Fallback centre (Cotonou) when the delivery carries no coordinates at all. */
const DEFAULT_CENTER: GeoPoint = { latitude: 6.3703, longitude: 2.3912 }

const COLORS = {
  pickup: '#15803d',
  dropoff: '#ea580c',
  gps: '#16a34a',
  zone: '#f59e0b',
  offline: '#9ca3af',
  selected: '#1d4ed8',
} as const

interface AssignMapProps {
  pickup: GeoPoint | null
  dropoff: GeoPoint | null
  candidates: CourierCandidate[]
  radiusKm?: number
  selectedId: string | null
  onSelect: (courierId: string | null) => void
}

function toLatLng(point: GeoPoint): google.maps.LatLngLiteral {
  return { lat: point.latitude, lng: point.longitude }
}

function markerColor(candidate: CourierCandidate, selected: boolean): string {
  if (selected)
    return COLORS.selected
  if (!candidate.isAvailable)
    return COLORS.offline
  return candidate.positionSource === 'GPS' ? COLORS.gps : COLORS.zone
}

/** Search radius drawn around the pickup point; the Circle has no React wrapper. */
function RadiusCircle({ center, radiusKm }: { center: GeoPoint | null, radiusKm?: number }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !center || !radiusKm)
      return
    const circle = new google.maps.Circle({
      map,
      center: toLatLng(center),
      radius: radiusKm * 1000,
      strokeColor: COLORS.pickup,
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillColor: COLORS.pickup,
      fillOpacity: 0.06,
      clickable: false,
    })
    return () => circle.setMap(null)
  }, [map, center, radiusKm])
  return null
}

/** Frame pickup, drop-off and every positioned courier once they are known. */
function FitBounds({ points }: { points: GeoPoint[] }) {
  const map = useMap()
  const signature = points.map(p => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join('|')
  useEffect(() => {
    if (!map || points.length === 0)
      return
    if (points.length === 1) {
      map.setCenter(toLatLng(points[0]))
      map.setZoom(14)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    points.forEach(p => bounds.extend(toLatLng(p)))
    map.fitBounds(bounds, 64)
    // Only re-frame when the set of points actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature])
  return null
}

export function AssignMap({ pickup, dropoff, candidates, radiusKm, selectedId, onSelect }: AssignMapProps) {
  const { t } = useTranslation()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        {t('admin.deliveries.assignPage.mapMissingKey')}
      </div>
    )
  }

  const positioned = candidates.filter((c): c is CourierCandidate & { position: GeoPoint } => c.position !== null)
  const framed = [pickup, dropoff, ...positioned.map(c => c.position)].filter((p): p is GeoPoint => p !== null)
  const center = pickup ?? dropoff ?? DEFAULT_CENTER
  const infoCandidate = positioned.find(c => c.id === (hoveredId ?? selectedId)) ?? null

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-lg border">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={toLatLng(center)}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          className="h-full w-full"
          onClick={() => onSelect(null)}
        >
          <FitBounds points={framed} />
          <RadiusCircle center={pickup} radiusKm={radiusKm} />

          {pickup && (
            <AdvancedMarker position={toLatLng(pickup)} title={t('admin.deliveries.assignPage.legend.pickup')} zIndex={20}>
              <Pin background={COLORS.pickup} borderColor="#166534" glyphColor="#ffffff" scale={1.2} />
            </AdvancedMarker>
          )}
          {dropoff && (
            <AdvancedMarker position={toLatLng(dropoff)} title={t('admin.deliveries.assignPage.legend.dropoff')} zIndex={20}>
              <Pin background={COLORS.dropoff} borderColor="#9a3412" glyphColor="#ffffff" scale={1.2} />
            </AdvancedMarker>
          )}

          {positioned.map((candidate) => {
            const selected = candidate.id === selectedId
            return (
              <AdvancedMarker
                key={candidate.id}
                position={toLatLng(candidate.position)}
                zIndex={selected ? 30 : 10}
                onClick={() => onSelect(selected ? null : candidate.id)}
                onMouseEnter={() => setHoveredId(candidate.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div
                  className="flex items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-md transition-transform"
                  style={{
                    width: selected ? 34 : 28,
                    height: selected ? 34 : 28,
                    backgroundColor: markerColor(candidate, selected),
                    opacity: candidate.isAvailable ? 1 : 0.75,
                  }}
                >
                  {initials(candidate.fullName)}
                </div>
              </AdvancedMarker>
            )
          })}

          {infoCandidate && (
            <InfoWindow position={toLatLng(infoCandidate.position)} pixelOffset={[0, -18]} headerDisabled>
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold">{infoCandidate.fullName}</p>
                <p className="text-muted-foreground">
                  {infoCandidate.distanceKm !== null
                    ? t('admin.deliveries.assignPage.distance', { km: infoCandidate.distanceKm.toLocaleString() })
                    : t('admin.deliveries.assignPage.noPosition')}
                  {' · '}
                  {t(`admin.deliveries.assignPage.${infoCandidate.isAvailable ? 'online' : 'offline'}`)}
                </p>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>

      <MapLegend />
    </div>
  )
}

function MapLegend() {
  const { t } = useTranslation()
  const items: Array<{ key: string, color: string }> = [
    { key: 'pickup', color: COLORS.pickup },
    { key: 'dropoff', color: COLORS.dropoff },
    { key: 'gps', color: COLORS.gps },
    { key: 'zone', color: COLORS.zone },
    { key: 'offline', color: COLORS.offline },
  ]
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-background/90 px-3 py-2 text-xs shadow">
      {items.map(item => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          {t(`admin.deliveries.assignPage.legend.${item.key}`)}
        </span>
      ))}
    </div>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}
