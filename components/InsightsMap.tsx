'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
} from 'maplibre-gl'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
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

function radiusFeature(lat: number, lng: number): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [circlePolygon(lat, lng, WALK_RADIUS_MI * METERS_PER_MILE)],
    },
  }
}

function poiCollection(pois: readonly MapPoi[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature' as const,
      properties: { name: poi.name ?? '', category: poi.category },
      geometry: { type: 'Point' as const, coordinates: [poi.lng, poi.lat] },
    })),
  }
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
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  /*
    Latest props, read by the mount-only effect below without becoming
    dependencies of it. Rebuilding a MapLibre instance is expensive and visibly
    flickers, and `pois` is a fresh array on every render, so listing it as a
    dependency tore the whole map down and recreated it whenever the parent
    re-rendered. Creation happens once; the effects after it push updates in.
  */
  const latest = useRef({ lat, lng, label, pois })
  latest.current = { lat, lng, label, pois }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    // Loaded on demand so the map library stays out of the initial bundle.
    void (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        if (cancelled || !containerRef.current) return

        const start = latest.current

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [start.lng, start.lat],
          zoom: 13.4,
          attributionControl: { compact: true },
        })
        mapRef.current = map

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.scrollZoom.disable()

        map.on('error', () => setFailed(true))

        map.on('load', () => {
          if (cancelled) return
          const current = latest.current

          map.addSource('radius', {
            type: 'geojson',
            data: radiusFeature(current.lat, current.lng),
          })

          map.addLayer({
            id: 'radius-fill',
            type: 'fill',
            source: 'radius',
            paint: { 'fill-color': '#ff5d8f', 'fill-opacity': 0.09 },
          })

          map.addLayer({
            id: 'radius-line',
            type: 'line',
            source: 'radius',
            paint: { 'line-color': '#241d18', 'line-width': 3, 'line-dasharray': [2, 1.6] },
          })

          map.addSource('pois', { type: 'geojson', data: poiCollection(current.pois) })

          // One circle layer rather than hundreds of DOM markers, so 600 POIs
          // stay smooth on a phone.
          map.addLayer({
            id: 'poi-dots',
            type: 'circle',
            source: 'pois',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 15, 7],
              'circle-color': CIRCLE_COLOR,
              'circle-stroke-width': 1.75,
              'circle-stroke-color': '#241d18',
              'circle-opacity': 1,
            },
          })

          const element = document.createElement('div')
          element.style.cssText =
            'width:22px;height:22px;border-radius:9999px;background:#ff5d8f;border:4px solid #241d18;box-shadow:0 3px 0 #241d18'

          markerRef.current = new maplibregl.Marker({ element })
            .setLngLat([current.lng, current.lat])
            .setPopup(new maplibregl.Popup({ offset: 16 }).setText(current.label))
            .addTo(map)

          const popup = new maplibregl.Popup({ closeButton: false, offset: 10 })

          map.on('click', 'poi-dots', (event) => {
            const feature = event.features?.[0]
            if (!feature) return
            const name = String(feature.properties?.name ?? '').trim()
            popup
              .setLngLat(event.lngLat)
              .setText(name || String(feature.properties?.category ?? 'Amenity'))
              .addTo(map)
          })

          map.on('mouseenter', 'poi-dots', () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', 'poi-dots', () => {
            map.getCanvas().style.cursor = ''
          })

          setReady(true)
        })
      } catch {
        setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      setReady(false)
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  /* Recentre if the address changes under a live map. */
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return

    map.setCenter([lng, lat])
    markerRef.current?.setLngLat([lng, lat]).getPopup()?.setText(label)

    const source = map.getSource('radius') as GeoJSONSource | undefined
    source?.setData(radiusFeature(lat, lng))
  }, [ready, lat, lng, label])

  /* Push new dots without touching the rest of the map. */
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return

    const source = map.getSource('pois') as GeoJSONSource | undefined
    source?.setData(poiCollection(pois))
  }, [ready, pois])

  return (
    <div>
      <div className="border-ink bg-cream-deep relative overflow-hidden rounded-3xl border-[3px] shadow-[0_6px_0_var(--color-ink)]">
        <div
          ref={containerRef}
          className="h-[26rem] w-full sm:h-[32rem]"
          role="img"
          aria-label={`Map of ${label}, showing ${pois.length} mapped places within a one mile radius. The same places are listed by category in the scores below.`}
        />
        {failed ? (
          <p className="bg-cream-deep text-ink-soft absolute inset-0 flex items-center justify-center px-6 text-center">
            The map could not load. Every score on this page is unaffected.
          </p>
        ) : null}
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <li key={category.key} className="tag bg-card text-ink">
            <span
              aria-hidden
              className="border-ink inline-block h-3 w-3 rounded-full border-2"
              style={{ backgroundColor: category.color }}
            />
            {category.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
