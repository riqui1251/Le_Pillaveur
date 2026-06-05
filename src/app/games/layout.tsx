"use client"

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-2 py-1 sm:px-4">
      <div className="space-y-3 sm:space-y-6 bg-gray-900 p-2 sm:p-6 rounded-md sm:rounded-xl text-white">
        {children}
      </div>
    </div>
  )
} 