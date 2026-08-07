'use client'

import { useEffect, useRef, useState } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { METERS_PER_MILE, WALK_RADIUS_MI } from '@/lib/geo'
import { CATEGORIES } from '@/lib/scoring/taxonomy'
import type { MapPoi } from '@/lib/types'

/** Keyless vector tiles. No token to leak, no usage ceiling to trip over. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Metres per degree of latitude. Near enough constant everywhere. */
const METERS_PER_DEGREE_LAT = 111_320

/** Points on a circle of the given radius, for the radius outline. */
function circlePolygon(lat: number, lng: number, radiusM: number, steps = 96): number[][] {
  const latRadius = radiusM / METERS_PER_DEGREE_LAT
  const coords: number[][] = []

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    // Longitude degrees shrink with latitude, so scale by cos(lat).
    const dLat = latRadius * Math.cos(angle)
    const dLng = (latRadius * Math.sin(angle)) / Math.cos((lat * Math.PI) / 180)
    coords.push([lng + dLng, lat + dLat])
  }

  return coords
}

/**
 * Data-driven colour: one circle layer coloured by the `category` property.
 * MapLibre types expressions as fixed-length tuples, which a spread cannot
 * satisfy, so the built expression is asserted once here rather than inline.
 */
const CIRCLE_COLOR = [
  'match',
  ['get', 'category'],
  ...CATEGORIES.flatMap((c) => [c.key, c.color]),
  '#5b6670',
] as unknown as ExpressionSpecification

export function InsightsMap({
  lat,
  lng,
  label,
  pois,
}: {
  lat: number
  lng: number
  label: string
  pois: MapPoi[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let map: import('maplibre-gl').Map | undefined
    let cancelled = false

    // Loaded on demand so the map library stays out of the initial bundle.
    void (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        if (cancelled || !containerRef.current) return

        map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [lng, lat],
          zoom: 13.4,
          attributionControl: { compact: true },
        })

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.scrollZoom.disable()

        map.on('error', () => setFailed(true))

        map.on('load', () => {
          if (!map) return

          map.addSource('radius', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [circlePolygon(lat, lng, WALK_RADIUS_MI * METERS_PER_MILE)],
              },
            },
          })

          map.addLayer({
            id: 'radius-fill',
            type: 'fill',
            source: 'radius',
            paint: { 'fill-color': '#e05a47', 'fill-opacity': 0.07 },
          })

          map.addLayer({
            id: 'radius-line',
            type: 'line',
            source: 'radius',
            paint: { 'line-color': '#e05a47', 'line-width': 2, 'line-dasharray': [2, 2] },
          })

          map.addSource('pois', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: pois.map((poi) => ({
                type: 'Feature' as const,
                properties: { name: poi.name ?? '', category: poi.category },
                geometry: { type: 'Point' as const, coordinates: [poi.lng, poi.lat] },
              })),
            },
          })

          // One circle layer rather than hundreds of DOM markers, so 500 POIs
          // stay smooth on a phone.
          map.addLayer({
            id: 'poi-dots',
            type: 'circle',
            source: 'pois',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 6],
              'circle-color': CIRCLE_COLOR,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95,
            },
          })

          const marker = document.createElement('div')
          marker.style.cssText =
            'width:18px;height:18px;border-radius:9999px;background:#2b2724;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(20,16,12,.45)'

          new maplibregl.Marker({ element: marker })
            .setLngLat([lng, lat])
            .setPopup(new maplibregl.Popup({ offset: 16 }).setText(label))
            .addTo(map)

          const popup = new maplibregl.Popup({ closeButton: false, offset: 10 })

          map.on('click', 'poi-dots', (event) => {
            const feature = event.features?.[0]
            if (!feature || !map) return
            const name = String(feature.properties?.name ?? '').trim()
            popup
              .setLngLat(event.lngLat)
              .setText(name || String(feature.properties?.category ?? 'Amenity'))
              .addTo(map)
          })

          map.on('mouseenter', 'poi-dots', () => {
            if (map) map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', 'poi-dots', () => {
            if (map) map.getCanvas().style.cursor = ''
          })
        })
      } catch {
        setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [lat, lng, label, pois])

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl border border-edge bg-cream-deep">
        <div ref={containerRef} className="h-[26rem] w-full sm:h-[32rem]" />
        {failed ? (
          <p className="absolute inset-0 flex items-center justify-center bg-cream-deep px-6 text-center text-sm text-ink-soft">
            The map could not load. Every score on this page is unaffected.
          </p>
        ) : null}
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <li key={category.key} className="chip bg-cream-deep text-ink-soft">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
