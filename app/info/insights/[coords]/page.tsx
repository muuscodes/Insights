import { Suspense, cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Bird as BirdIcon, Building2, Map as MapIcon, Route, Users, Wind } from 'lucide-react'

import { BirdPanel } from '@/components/BirdPanel'
import { DemographicsPanel } from '@/components/DemographicsPanel'
import { FieldSection, Unavailable } from '@/components/FieldSection'
import { InsightsMap } from '@/components/InsightsMap'
import { InsightsSkeleton } from '@/components/InsightsSkeleton'
import { ScentPanel } from '@/components/ScentPanel'
import { ScoreMeter } from '@/components/ScoreMeter'
import { ShareLink } from '@/components/ShareLink'
import { UrbanIndexPanel } from '@/components/UrbanIndexPanel'
import { formatCoordParam, parseCoordParam, type LatLng } from '@/lib/geo'
import { buildInsights } from '@/lib/insights'
import { labelSchema } from '@/lib/schemas'

/*
  Coordinates in the path are the whole identity of this page. Every number
  below derives from them, so a shared URL renders identically for anyone with
  no database, no session and no link that can expire.
*/

interface PageProps {
  params: Promise<{ coords: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `cache` dedupes the work between generateMetadata and the report body, which
 * Next renders as two passes over the same request.
 */
const getInsights = cache(buildInsights)

async function resolveInputs(props: PageProps) {
  const { coords: rawCoords } = await props.params
  const search = await props.searchParams

  let decoded = rawCoords
  try {
    decoded = decodeURIComponent(rawCoords)
  } catch {
    // Malformed percent-encoding is itself an invalid URL. Fall through and let
    // the coordinate parser reject the raw text.
  }

  const center = parseCoordParam(decoded)
  if (!center) return null

  const rawLabel = Array.isArray(search.q) ? search.q[0] : search.q
  const parsedLabel = rawLabel ? labelSchema.safeParse(rawLabel) : null

  return { center, label: parsedLabel?.success ? parsedLabel.data : undefined }
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const inputs = await resolveInputs(props)
  if (!inputs) return { title: 'Address not found' }

  try {
    const insights = await getInsights(inputs.center, inputs.label)
    const walk = insights.walk.ok ? insights.walk.data.score : null
    const drive = insights.drive.ok ? insights.drive.data.score : null
    const band = insights.urban.ok ? insights.urban.data.label : null

    const parts = [
      walk === null ? null : `Walk ${walk}`,
      drive === null ? null : `Drive ${drive}`,
      band,
    ].filter(Boolean)

    return {
      title: `${insights.address.formatted} | Address Insights`,
      description: parts.length > 0 ? parts.join('  ·  ') : 'Neighborhood field report.',
      openGraph: {
        title: insights.address.formatted,
        description: parts.join('  ·  '),
        type: 'article',
      },
    }
  } catch {
    return { title: 'Address Insights' }
  }
}

export default async function InsightsPage(props: PageProps) {
  const inputs = await resolveInputs(props)

  // Raised before the Suspense boundary below, while the response status can
  // still be changed. A route-level loading.tsx would flush a 200 shell before
  // this ran, which is why the skeleton lives inside the page instead.
  if (!inputs) notFound()

  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsReport center={inputs.center} label={inputs.label} />
    </Suspense>
  )
}

async function InsightsReport({ center, label }: { center: LatLng; label?: string }) {
  const insights = await getInsights(center, label)
  const { address } = insights

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 sm:px-10">
      <header className="rise">
        <Link
          href="/info"
          className="inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-berry"
        >
          <ArrowLeft size={15} aria-hidden />
          New search
        </Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="max-w-3xl font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-ink">
              {address.formatted}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip bg-cream-deep text-ink-soft">{formatCoordParam(address)}</span>
              {address.tractGeoid ? (
                <span className="chip bg-cream-deep text-ink-soft">Tract {address.tractGeoid}</span>
              ) : null}
            </p>
          </div>

          <ShareLink />
        </div>
      </header>

      <div className="rise mt-12" style={{ animationDelay: '80ms' }}>
        <FieldSection
          title="The mile around you"
          icon={MapIcon}
          accent="berry"
          note={`${insights.mapPois.length} places plotted`}
        >
          <InsightsMap
            lat={address.lat}
            lng={address.lng}
            label={address.formatted}
            pois={insights.mapPois}
          />
        </FieldSection>
      </div>

      <div className="rise mt-16" style={{ animationDelay: '140ms' }}>
        <FieldSection title="Getting around" icon={Route} accent="leaf" note="OpenStreetMap">
          <div className="grid gap-6 md:grid-cols-2">
            {insights.walk.ok ? (
              <ScoreMeter kind="Walking" result={insights.walk.data} showWalkTimes />
            ) : (
              <Unavailable reason={insights.walk.reason} />
            )}
            {insights.drive.ok ? (
              <ScoreMeter kind="Driving" result={insights.drive.data} showWalkTimes={false} />
            ) : (
              <Unavailable reason={insights.drive.reason} />
            )}
          </div>
        </FieldSection>
      </div>

      <div className="rise mt-16" style={{ animationDelay: '200ms' }}>
        <FieldSection
          title="How built up is it"
          icon={Building2}
          accent="plum"
          note="Map data + Census"
        >
          {insights.urban.ok ? (
            <UrbanIndexPanel urban={insights.urban.data} />
          ) : (
            <Unavailable reason={insights.urban.reason} />
          )}
        </FieldSection>
      </div>

      <div className="rise mt-16 grid gap-x-10 gap-y-16 lg:grid-cols-2" style={{ animationDelay: '260ms' }}>
        <FieldSection title="Who lives here" icon={Users} accent="sky" note="Census, 5-year">
          {insights.demographics.ok ? (
            <DemographicsPanel demographics={insights.demographics.data} />
          ) : (
            <Unavailable reason={insights.demographics.reason} />
          )}
        </FieldSection>

        <FieldSection title="What it smells like" icon={Wind} accent="honey" note="Half-mile radius">
          {insights.scent.ok ? (
            <ScentPanel scent={insights.scent.data} />
          ) : (
            <Unavailable reason={insights.scent.reason} />
          )}
        </FieldSection>
      </div>

      <div className="rise mt-16" style={{ animationDelay: '320ms' }}>
        <FieldSection title="Who else lives here" icon={BirdIcon} accent="leaf" note="Bird sightings">
          {insights.birds.ok ? (
            <BirdPanel birds={insights.birds.data} />
          ) : (
            <Unavailable reason={insights.birds.reason} />
          )}
        </FieldSection>
      </div>

      <footer className="mt-20 border-t border-edge pt-6">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          These scores are simple heuristics over open data, not official indices. How much shows up
          depends on how thoroughly OpenStreetMap volunteers have mapped the area, which varies a
          lot between cities and the countryside.
        </p>
        <p className="mt-3 text-xs text-ink-faint">
          Generated {new Date(insights.generatedAt).toUTCString()}
        </p>
      </footer>
    </main>
  )
}
