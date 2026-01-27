import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ConfigEditor from './pages/ConfigEditor'
import Schedules from './pages/Schedules'
import History from './pages/History'
import Layout from './components/Layout'
import Login from './pages/Login'
import { AuthStatus } from './types'
import './App.css'

function ErrorBoundary({ children }: { children: React.ReactNode }) {
    const [hasError, setHasError] = useState(false)
    const [error, setError] = useState<any>(null)

    useEffect(() => {
        const handler = (e: ErrorEvent) => {
            setHasError(true)
            setError(e.error)
        }
        window.addEventListener('error', handler)
        return () => window.removeEventListener('error', handler)
    }, [])

    if (hasError) {
        return (
            <div style={{ padding: '2rem', background: '#200', color: '#f88', minHeight: '100vh' }}>
                <h1>Frontend Crash Detected</h1>
                <pre>{error?.message || 'Unknown Error'}</pre>
                <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>Reload App</button>
            </div>
        )
    }
    return <>{children}</>
}

function App() {
    const [auth, setAuth] = useState<AuthStatus | null>(null)
    const [loading, setLoading] = useState(true)

    const checkAuth = async () => {
        try {
            const res = await fetch('/auth/status')
            const data = await res.json()
            setAuth(data)
        } catch (e) {
            console.error('Auth check failed:', e)
            setAuth({ authenticated: false })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        checkAuth()
    }, [])

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
                <p>Loading...</p>
            </div>
        )
    }

    if (!auth?.authenticated) {
        return <Login />
    }

    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Layout auth={auth} onLogout={() => setAuth({ authenticated: false })} />}>
                        <Route index element={<Dashboard />} />
                        <Route path="playlists" element={<Dashboard />} />
                        <Route path="config/new" element={<ConfigEditor />} />
                        <Route path="config/:id" element={<ConfigEditor />} />
                        <Route path="schedules" element={<Schedules />} />
                        <Route path="history" element={<History />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    )
}

export default App
