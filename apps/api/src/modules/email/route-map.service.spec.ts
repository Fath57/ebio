import { buildRouteMapUrl } from './route-map.service'

describe('buildRouteMapUrl', () => {
  const pickup = { latitude: 6.36536, longitude: 2.41833 }
  const dropoff = { latitude: 6.3702, longitude: 2.3912 }

  it('targets the Static Maps endpoint at 600x300, scale 2', () => {
    const url = new URL(buildRouteMapUrl(pickup, dropoff, 'test-key'))

    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap')
    expect(url.searchParams.get('size')).toBe('600x300')
    expect(url.searchParams.get('scale')).toBe('2')
    expect(url.searchParams.get('key')).toBe('test-key')
  })

  it('places a green B marker on the shop and a coral C marker on the client', () => {
    const url = new URL(buildRouteMapUrl(pickup, dropoff, 'test-key'))
    const markers = url.searchParams.getAll('markers')

    expect(markers).toEqual([
      'color:0x1e7a37|label:B|6.365360,2.418330',
      'color:0xE8735A|label:C|6.370200,2.391200',
    ])
  })

  it('draws the route as a brand-green path from pickup to drop-off', () => {
    const url = new URL(buildRouteMapUrl(pickup, dropoff, 'test-key'))

    expect(url.searchParams.get('path')).toBe('color:0x1e7a37|weight:4|6.365360,2.418330|6.370200,2.391200')
  })
})
