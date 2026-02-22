export default function Loading({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      {text && <p className="text-text-secondary text-sm">{text}</p>}
    </div>
  )
}
