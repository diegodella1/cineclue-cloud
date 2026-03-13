import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { loadLevels } from './lib/xp'
import Toast from './components/shared/Toast'
import InstallPrompt from './components/shared/InstallPrompt'
import DuelNotifications from './components/shared/DuelNotifications'
import BottomNav from './components/layout/BottomNav'
import Loading from './components/shared/Loading'

const Auth = lazy(() => import('./pages/Auth'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Home = lazy(() => import('./pages/Home'))
const SoloGame = lazy(() => import('./pages/SoloGame'))
const DailyGame = lazy(() => import('./pages/DailyGame'))
const Ranking = lazy(() => import('./pages/Ranking'))
const Missions = lazy(() => import('./pages/Missions'))
const Profile = lazy(() => import('./pages/Profile'))
const PublicProfile = lazy(() => import('./pages/PublicProfile'))
const Admin = lazy(() => import('./pages/Admin'))
const DuelSetup = lazy(() => import('./pages/DuelSetup'))
const DuelGame = lazy(() => import('./pages/DuelGame'))
const Landing = lazy(() => import('./pages/Landing'))
const About = lazy(() => import('./pages/About'))
const PartyLanding = lazy(() => import('./pages/PartyLanding'))
const PartyJoin = lazy(() => import('./pages/PartyJoin'))
const PartyHost = lazy(() => import('./pages/PartyHost'))
const PartyPlayer = lazy(() => import('./pages/PartyPlayer'))

function RequireAuth({ children }) {
  const user = useAuthStore(s => s.user)
  const profile = useAuthStore(s => s.profile)
  const profileLoaded = useAuthStore(s => s.profileLoaded)
  const loading = useAuthStore(s => s.loading)
  const needsOnboarding = useAuthStore(s => s.needsOnboarding)
  const location = useLocation()

  if (loading) return <Loading />
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />
  if (!profileLoaded) return <Loading />
  if (!profile) return <Navigate to="/auth" state={{ from: location }} replace />
  if (needsOnboarding() && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return <>
    <DuelNotifications />
    {children}
    <BottomNav />
  </>
}

function CatchAll() {
  const user = useAuthStore(s => s.user)
  return <Navigate to={user ? '/home' : '/'} replace />
}

export default function App() {
  const init = useAuthStore(s => s.init)
  const loading = useAuthStore(s => s.loading)

  useEffect(() => {
    init()
    loadLevels()
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loading />
      </div>
    )
  }

  return (
    <>
      <Toast />
      <InstallPrompt />
      <Routes>
        <Route path="/auth" element={<Suspense fallback={<Loading />}><Auth /></Suspense>} />
        <Route path="/onboarding" element={<Suspense fallback={<Loading />}><RequireAuth><Onboarding /></RequireAuth></Suspense>} />
        <Route path="/home" element={<Suspense fallback={<Loading />}><RequireAuth><Home /></RequireAuth></Suspense>} />
        <Route path="/daily" element={<Suspense fallback={<Loading />}><RequireAuth><DailyGame /></RequireAuth></Suspense>} />
        <Route path="/solo" element={<Suspense fallback={<Loading />}><RequireAuth><SoloGame /></RequireAuth></Suspense>} />
        <Route path="/ranking" element={<Suspense fallback={<Loading />}><RequireAuth><Ranking /></RequireAuth></Suspense>} />
        <Route path="/missions" element={<Suspense fallback={<Loading />}><RequireAuth><Missions /></RequireAuth></Suspense>} />
        <Route path="/profile" element={<Suspense fallback={<Loading />}><RequireAuth><Profile /></RequireAuth></Suspense>} />
        <Route path="/duel" element={<Suspense fallback={<Loading />}><RequireAuth><DuelSetup /></RequireAuth></Suspense>} />
        <Route path="/duel/play" element={<Suspense fallback={<Loading />}><RequireAuth><DuelGame /></RequireAuth></Suspense>} />
        <Route path="/u/:username" element={<Suspense fallback={<Loading />}><PublicProfile /></Suspense>} />
        <Route path="/admin" element={<Suspense fallback={<Loading />}><RequireAuth><Admin /></RequireAuth></Suspense>} />
        <Route path="/party" element={<Suspense fallback={<Loading />}><PartyLanding /></Suspense>} />
        <Route path="/party/join" element={<Suspense fallback={<Loading />}><PartyJoin /></Suspense>} />
        <Route path="/party/room/:code/host" element={<Suspense fallback={<Loading />}><PartyHost /></Suspense>} />
        <Route path="/party/room/:code/player" element={<Suspense fallback={<Loading />}><PartyPlayer /></Suspense>} />
        <Route path="/about" element={<Suspense fallback={<Loading />}><About /></Suspense>} />
        <Route path="/" element={<Suspense fallback={<Loading />}><Landing /></Suspense>} />
        <Route path="*" element={<CatchAll />} />
      </Routes>
    </>
  )
}
