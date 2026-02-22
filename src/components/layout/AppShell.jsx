export default function AppShell({ children }) {
  return (
    <div className="min-h-dvh relative">
      <div className="grain-overlay" />
      <div className="max-w-[600px] mx-auto px-4 pb-6">
        {children}
      </div>
    </div>
  )
}
