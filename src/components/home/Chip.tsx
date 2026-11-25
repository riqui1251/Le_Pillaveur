export const CHIP_COLORS = ['#B3382E', '#274B8F', '#2E7D5B', '#6B3FA0', '#C8862C', '#1F7A7A', '#B0476E', '#3A3A3A', '#7A5230', '#4A6FA5', '#7C8A2E', '#8E2A3E']

export function Chip({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="block h-7 w-7 rounded-full shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
      style={{ background: `radial-gradient(circle, ${color} 0 55%, transparent 56%), repeating-conic-gradient(${color} 0 18deg, #F3EAD3 18deg 36deg)` }}
    />
  )
}
