import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  ArrowLeft,
  Bird as BirdIcon,
  Building2,
  Car,
  Map as MapIcon,
  Route,
  Users,
  Wind,
} from 'lucide-react'

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
import { buildCoreInsights, buildDriveScore } from '@/lib/insights'
import { labelSchema } from '@/lib/schemas'

/*
  Coordinates in the path are the whole identity of this page. Every number
  below derives from them, so a shared URL renders identically for anyone with
  no database, no session and no link that can expire.
*/

/**
 * The core report is quick, but the streamed driving score behind it runs a
 * 5-mile Overpass query that measured 9.9s on the healthiest mirror and 31.5s
 * on the worst. The response stays open until that resolves, so the ceiling has
 * to cover it even though nothing the reader can see is waiting on it.
 */
export const maxDuration = 60

interface PageProps {
  params: Promise<{ coords: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/*
  Deduplicating generateMetadata against the report body used to be attempted
  here with React's `cache`, which does nothing across those two calls: it
  compares arguments by identity and each of them parses its own LatLng out of
  the URL, so the two never matched and the report was assembled twice. The
  deduplication now lives in `lib/insights.ts`, keyed on the coordinate string.
*/
const getInsights = buildCoreInsights

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
    const band = insights.urban.ok ? insights.urban.data.label : null

    // Deliberately no driving score. Metadata is resolved before the document
    // head can be flushed, so reading it here would put the slow 5-mile pass
    // back in front of the whole page, which is what streaming it avoids.
    const parts = [walk === null ? null : `Walk ${walk}`, band].filter(Boolean)

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

/** Resolved on its own so the rest of the report does not wait for it. */
async function DriveScore({ center }: { center: LatLng }) {
  const drive = await buildDriveScore(center)

  return drive.ok ? (
    <ScoreMeter kind="Driving" result={drive.data} showWalkTimes={false} />
  ) : (
    <Unavailable reason={drive.reason} />
  )
}

/** Placeholder while the 5-mile pass is still running. */
function DriveScorePending() {
  return (
    <div className="slab px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-ink flex items-center gap-2 text-xl font-extrabold">
          <Car size={20} strokeWidth={2.75} aria-hidden />
          Driving
        </span>
        <span className="tag bg-cream-deep text-ink">5 mi</span>
      </div>

      <p className="text-ink-soft mt-6 leading-relaxed" role="status">
        Casting wider for anything worth a drive. This one takes a few seconds longer than the rest.
      </p>

      <div className="rounded-pill border-ink bg-cream-deep mt-6 h-4 w-full overflow-hidden border-[3px]">
        <div className="blink bg-ink-faint h-full w-1/3" aria-hidden />
      </div>
    </div>
  )
}

async function InsightsReport({ center, label }: { center: LatLng; label?: string }) {
  const insights = await getInsights(center, label)
  const { address } = insights

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-24 sm:px-10">
      <header className="pop">
        <Link
          href="/info"
          className="rounded-pill border-ink bg-card font-display text-ink slab-press inline-flex items-center gap-1.5 border-[3px] px-4 py-1.5 font-extrabold shadow-[0_4px_0_var(--color-ink)]"
        >
          <ArrowLeft size={16} strokeWidth={3} aria-hidden />
          New search
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="text-ink max-w-3xl text-[clamp(2rem,5.5vw,3.5rem)] leading-[1.03]">
              {address.formatted}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <span className="tag bg-card text-ink">{formatCoordParam(address)}</span>
              {address.tractGeoid ? (
                <span className="tag bg-card text-ink">Tract {address.tractGeoid}</span>
              ) : null}
            </p>
          </div>

          <ShareLink />
        </div>
      </header>

      <div className="pop mt-14" style={{ animationDelay: '80ms' }}>
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

      <div className="pop mt-16" style={{ animationDelay: '140ms' }}>
        <FieldSection title="Getting around" icon={Route} accent="lime" note="OpenStreetMap">
          <div className="grid gap-6 md:grid-cols-2">
            {insights.walk.ok ? (
              <ScoreMeter kind="Walking" result={insights.walk.data} showWalkTimes />
            ) : (
              <Unavailable reason={insights.walk.reason} />
            )}
            {/*
              The driving score is the one panel that needs the 5-mile Overpass
              pass, which measured 9.9s on the healthiest mirror against 1.5s
              for the 1-mile pass. Streaming it means the rest of the report is
              on screen while it finishes rather than behind it.
            */}
            <Suspense fallback={<DriveScorePending />}>
              <DriveScore center={center} />
            </Suspense>
          </div>
        </FieldSection>
      </div>

      <div className="pop mt-16" style={{ animationDelay: '200ms' }}>
        <FieldSection
          title="How built up is it"
          icon={Building2}
          accent="grape"
          note="Map data + Census"
        >
          {insights.urban.ok ? (
            <UrbanIndexPanel urban={insights.urban.data} />
          ) : (
            <Unavailable reason={insights.urban.reason} />
          )}
        </FieldSection>
      </div>

      <div
        className="pop mt-16 grid gap-x-10 gap-y-16 lg:grid-cols-2"
        style={{ animationDelay: '260ms' }}
      >
        <FieldSection title="Who lives here" icon={Users} accent="sea" note="Census, 5-year">
          {insights.demographics.ok ? (
            <DemographicsPanel demographics={insights.demographics.data} />
          ) : (
            <Unavailable reason={insights.demographics.reason} />
          )}
        </FieldSection>

        <FieldSection title="What it smells like" icon={Wind} accent="sun" note="Half-mile radius">
          {insights.scent.ok ? (
            <ScentPanel scent={insights.scent.data} />
          ) : (
            <Unavailable reason={insights.scent.reason} />
          )}
        </FieldSection>
      </div>

      <div className="pop mt-16" style={{ animationDelay: '320ms' }}>
        <FieldSection
          title="Who else lives here"
          icon={BirdIcon}
          accent="lime"
          note="Bird sightings"
        >
          {insights.birds.ok ? (
            <BirdPanel birds={insights.birds.data} />
          ) : (
            <Unavailable reason={insights.birds.reason} />
          )}
        </FieldSection>
      </div>

      <footer className="border-ink bg-cream-deep mt-20 rounded-3xl border-[3px] px-6 py-5">
        <p className="text-ink-soft max-w-2xl text-sm leading-relaxed">
          These scores are simple heuristics over open data, not official indices. How much shows up
          depends on how thoroughly OpenStreetMap volunteers have mapped the area, which varies a
          lot between cities and the countryside.
        </p>
        <p className="text-ink-faint mt-3 text-xs">
          Generated {new Date(insights.generatedAt).toUTCString()}
        </p>
      </footer>
    </main>
  )
}
