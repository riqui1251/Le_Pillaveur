"use client"

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container mx-auto max-w-4xl px-2 py-1 sm:p-4">
      <div className="space-y-3 sm:space-y-6 bg-gray-900 p-2 sm:p-6 rounded-md sm:rounded-xl text-white">
        {children}
      </div>
    </div>
  )
} 