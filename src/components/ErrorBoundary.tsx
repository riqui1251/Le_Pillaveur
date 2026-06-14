"use client"

import React from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function ErrorBoundaryFallback({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const t = useTranslations('errors.boundary')

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 bg-gray-900 text-white">
      <h2 className="text-xl font-bold text-amber-400 mb-2">{t('title')}</h2>
      <p className="text-red-300 text-sm mb-4 font-mono max-w-md break-all">{error.message}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onRetry}>
          {t('retry')}
        </Button>
        <Link href="/jeux">
          <Button variant="default">{t('backToGames')}</Button>
        </Link>
      </div>
    </div>
  )
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}
