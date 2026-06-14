import Link from 'next/link'
import type { ReactNode } from 'react'

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    if (match[2] && match[3]) {
      const href = match[3]
      const isInternal = href.startsWith('/')
      nodes.push(
        isInternal ? (
          <Link key={`${match.index}-link`} href={href} className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
            {match[2]}
          </Link>
        ) : (
          <a key={`${match.index}-link`} href={href} className="text-amber-400 underline underline-offset-2 hover:text-amber-300" target="_blank" rel="noopener noreferrer">
            {match[2]}
          </a>
        )
      )
    } else if (match[4]) {
      nodes.push(<strong key={`${match.index}-bold`} className="font-semibold text-white">{match[4]}</strong>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

export function renderMarkdown(markdown: string): ReactNode {
  const lines = markdown.split('\n')
  const elements: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="mb-6 text-2xl font-bold text-white sm:text-3xl">
          {parseInline(line.slice(2))}
        </h1>
      )
      i++
      continue
    }

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="mb-3 mt-8 text-xl font-semibold text-white first:mt-0">
          {parseInline(line.slice(3))}
        </h2>
      )
      i++
      continue
    }

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="mb-2 mt-6 text-lg font-medium text-white/90">
          {parseInline(line.slice(4))}
        </h3>
      )
      i++
      continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0].split('|').filter(Boolean).map((c) => c.trim())
        const rows = tableLines.slice(2).map((row) =>
          row.split('|').filter(Boolean).map((c) => c.trim())
        )
        elements.push(
          <div key={key++} className="my-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04]">
                  {headers.map((h) => (
                    <th key={h} className="px-4 py-2 font-medium text-white/80">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-white/5 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2 text-white/60">{parseInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={key++} className="my-3 list-disc space-y-1.5 pl-6 text-white/70">
          {items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (line.trim() === '') {
      i++
      continue
    }

    elements.push(
      <p key={key++} className="my-3 leading-relaxed text-white/70">
        {parseInline(line)}
      </p>
    )
    i++
  }

  return <>{elements}</>
}
