import { redirect } from 'next/navigation'

/** Keeps the bare deployment URL working. */
export default function RootPage() {
  redirect('/info')
}
