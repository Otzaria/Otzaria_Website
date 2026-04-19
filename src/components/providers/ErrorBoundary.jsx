'use client'

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md w-full glass p-8 rounded-xl text-center">
            <span className="material-symbols-outlined text-6xl text-accent mb-4 block">
              error
            </span>
            <h1 className="text-2xl font-bold mb-4 text-on-surface">
              אופס! משהו השתבש
            </h1>
            <p className="text-on-surface/70 mb-6">
              אירעה שגיאה בלתי צפויה. אנחנו עובדים על זה.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-right text-sm text-red-800 overflow-auto max-h-40">
                <strong>שגיאה:</strong> {this.state.error.toString()}
              </div>
            )}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors"
              >
                נסה שוב
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-2 border border-primary text-primary rounded-lg hover:bg-primary-container transition-colors"
              >
                חזור לדף הבית
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
