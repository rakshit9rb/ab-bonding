import { fetchBonds } from '@/lib/bonds'
import Dashboard from '@/components/Dashboard'

export const revalidate = 60

export default async function Home() {
  let initialBonds: Awaited<ReturnType<typeof fetchBonds>>
  try {
    initialBonds = await fetchBonds(0.95)
  } catch {
    initialBonds = []
  }
  return <Dashboard initialBonds={initialBonds} />
}
