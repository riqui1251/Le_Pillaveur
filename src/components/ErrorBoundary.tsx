"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
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
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 bg-gray-900 text-white">
          <h2 className="text-xl font-bold text-amber-400 mb-2">Une erreur s&apos;est produite</h2>
          <p className="text-red-300 text-sm mb-4 font-mono max-w-md break-all">
            {this.state.error.message}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Réessayer
            </Button>
            <Link href="/jeux">
              <Button variant="default">Retour aux jeux</Button>
            </Link>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
