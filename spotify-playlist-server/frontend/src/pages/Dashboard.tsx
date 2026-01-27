import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Play, Edit2, Trash2, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { DynamicPlaylistConfig, RunHistory, NextRun } from '../types'
import './Dashboard.css'

export default function Dashboard() {
    const [configs, setConfigs] = useState<DynamicPlaylistConfig[]>([])
    const [history, setHistory] = useState<RunHistory[]>([])
    const [nextRuns, setNextRuns] = useState<NextRun[]>([])
    const [loading, setLoading] = useState(true)
    const [runningId, setRunningId] = useState<string | null>(null)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

    const loadData = async () => {
        try {
            const [configsRes, historyRes, nextRunsRes] = await Promise.all([
                fetch('/api/configs'),
                fetch('/api/history?limit=10'),
                fetch('/api/schedules/next-runs?limit=5')
            ])

            setConfigs(await configsRes.json())
            setHistory(await historyRes.json())
            setNextRuns(await nextRunsRes.json())
        } catch (e) {
            console.error('Failed to load dashboard data:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
        // Poll for updates every 30s
        const interval = setInterval(loadData, 30000)
        return () => clearInterval(interval)
    }, [])

    const handleRunNow = async (id: string, e: React.MouseEvent) => {
        e.preventDefault()
        if (runningId) return

        setStatusMessage(null)
        setRunningId(id)
        try {
            const res = await fetch(`/api/configs/${id}/run`, { method: 'POST' })
            
            if (!res.ok) {
                const err = await res.json()
                const msg = err.detail || 'Internal Server Error'
                if (res.status === 429) {
                    alert(`Spotify Rate Limit Active: ${msg}`)
                } else {
                    alert(`Run Failed (${res.status}): ${msg}`)
                }
                setRunningId(null)
                return
            }

            const initialHistory = await res.json()
            const historyId = initialHistory.id
            
            // Poll for completion
            let attempts = 0
            const maxAttempts = 120 // Timeout after 4 minutes (120 * 2s)
            
            const pollInterval = setInterval(async () => {
                attempts++
                try {
                    const hRes = await fetch('/api/history?limit=20')
                    if (hRes.ok) {
                        const historyList = await hRes.json()
                        const entry = historyList.find((h: any) => h.id === historyId)
                        
                        if (entry) {
                            if (entry.status === 'success') {
                                clearInterval(pollInterval)
                                setRunningId(null)
                                setStatusMessage(`Successfully updated "${initialHistory.config_name}"`)
                                setTimeout(() => setStatusMessage(null), 5000)
                                loadData() // Refresh list
                            } else if (entry.status === 'failed') {
                                clearInterval(pollInterval)
                                setRunningId(null)
                                alert(`Update Failed: ${entry.error_message}`)
                                loadData()
                            }
                        }
                    }
                } catch (e) {
                    console.error("Polling error", e)
                }
                
                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval)
                    setRunningId(null)
                    alert("Operation timed out (check history for status)")
                    loadData()
                }
            }, 2000)
            
        } catch (e) {
            console.error('Failed to run config:', e)
            alert('Network Error: Failed to reach the server. Check if your Unraid IP/port is correct.')
            setRunningId(null)
        }
    }

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault()
        if (!confirm('Are you sure you want to delete this configuration?')) return

        try {
            await fetch(`/api/configs/${id}`, { method: 'DELETE' })
            setConfigs(prev => prev.filter(c => c.id !== id))
        } catch (e) {
            console.error('Failed to delete:', e)
        }
    }

    if (loading) return <div className="p-8">Loading...</div>

    return (
        <div className="dashboard">
            {/* Main Content - Configs */}
            <div className="dashboard-grid">
                {/* Main Content - Configs */}
                <div className="configs-section">
                    <div className="section-header">
                        <h1>Dynamic Playlists</h1>
                        <Link to="/config/new" className="create-btn">
                            <Plus size={20} />
                            <span>New Playlist</span>
                        </Link>
                    </div>

                    {statusMessage && (
                        <div className="status-notification">
                            <CheckCircle2 size={16} />
                            <span>{statusMessage}</span>
                        </div>
                    )}

                    <div className="configs-list">
                        {configs.length === 0 ? (
                            <div className="empty-state">
                                <p>No dynamic playlists configured yet.</p>
                                <Link to="/config/new" className="text-primary hover:underline">Create your first one</Link>
                            </div>
                        ) : (
                            configs.map(config => (
                                <div key={config.id} className="config-card">
                                    <div className="config-info">
                                        <h3>{config.name}</h3>
                                        <p className="config-target">Target: {config.target_playlist_name || config.target_playlist_id}</p>
                                        <div className="config-meta">
                                            <span className="pill">{config.sources?.length || 0} Sources</span>
                                            <span className="pill">{config.update_mode}</span>
                                            {config.processing.apply_sort && <span className="pill outline">Sorted</span>}
                                        </div>
                                    </div>
                                    <div className="config-actions">
                                        <button
                                            onClick={(e) => handleRunNow(config.id!, e)}
                                            disabled={!!runningId}
                                            className="action-btn run"
                                            title="Run Now"
                                        >
                                            {runningId === config.id ? <div className="spinner-sm" /> : <Play size={18} />}
                                        </button>
                                        <Link to={`/config/${config.id}`} className="action-btn">
                                            <Edit2 size={18} />
                                        </Link>
                                        <button
                                            onClick={(e) => handleDelete(config.id!, e)}
                                            className="action-btn delete"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Sidebar - Schedule & History */}
                <div className="dashboard-sidebar">
                    {/* Next Runs */}
                    <div className="sidebar-card">
                        <div className="sidebar-header">
                            <Link to="/schedules" className="flex gap-2 items-center hover:text-white transition-colors">
                                <Clock size={16} className="text-success" />
                                <h3>Upcoming Runs</h3>
                            </Link>
                        </div>
                        <div className="sidebar-list">
                            {nextRuns.length === 0 ? (
                                <p className="empty-text">No runs scheduled</p>
                            ) : (
                                nextRuns.map((run, i) => (
                                    <div key={i} className="dashboard-list-item">
                                        <div className="item-main">
                                            <span className="item-title">{run.config_name}</span>
                                            <span className="item-sub">
                                                {new Date(run.next_run).toLocaleString([], {
                                                    weekday: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                    </div>

                    {/* History */}
                    <div className="sidebar-card">
                        <div className="sidebar-header">
                            <Link to="/history" className="flex gap-2 items-center hover:text-white transition-colors">
                                <CheckCircle2 size={16} className="text-success" />
                                <h3>Recent Activity</h3>
                            </Link>
                        </div>
                        <div className="sidebar-list">
                            {history.length === 0 ? (
                                <p className="empty-text">No history yet</p>
                            ) : (
                                history.map(run => (
                                    <div key={run.id} className="dashboard-list-item">
                                        <div className="item-icon">
                                            {run.status === 'success' ? (
                                                <CheckCircle2 size={14} className="text-success" />
                                            ) : run.status === 'running' ? (
                                                <div className="status-dot running" />
                                            ) : (
                                                <AlertCircle size={14} className="text-danger" />
                                            )}
                                        </div>
                                        <div className="item-main">
                                            <span className="item-title">{run.config_name}</span>
                                            <span className="item-sub">
                                                {run.tracks_processed} tracks • {new Date(run.started_at).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

    )
}
