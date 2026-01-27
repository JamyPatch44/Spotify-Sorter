import { useState, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Clock, Trash2 } from 'lucide-react'
import { RunHistory } from '../types'
import './History.css'

export default function History() {
    const [history, setHistory] = useState<RunHistory[]>([])
    const [loading, setLoading] = useState(true)

    const loadHistory = () => {
        setLoading(true)
        // limit=0 means fetch all
        fetch('/api/history?limit=0')
            .then(res => res.json())
            .then(data => {
                setHistory(data)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load history:', err)
                setLoading(false)
            })
    }

    useEffect(() => {
        loadHistory()
    }, [])

    const [confirmClear, setConfirmClear] = useState(false)

    const handleClearHistory = async () => {
        if (!confirmClear) {
            setConfirmClear(true)
            return
        }

        try {
            await fetch('/api/history', { method: 'DELETE' })
            loadHistory()
            setConfirmClear(false)
        } catch (e) {
            console.error('Failed to clear history:', e)
            alert('Failed to clear history')
            setConfirmClear(false)
        }
    }

    const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Removed native confirm to fix interactivity issues
        // if (!confirm('Delete this history entry?')) return

        try {
            await fetch(`/api/history/${id}`, { method: 'DELETE' })
            setHistory(prev => prev.filter(h => h.id !== id))
        } catch (e) {
            console.error('Failed to delete history item:', e)
        }
    }

    return (
        <div className="history-page">
            <div className="page-header">
                <h1>History</h1>
                {history.length > 0 && (
                    <button
                        onClick={handleClearHistory}
                        onMouseLeave={() => setConfirmClear(false)}
                        className={`clear-all-btn ${confirmClear ? 'confirming' : ''}`}
                        title={confirmClear ? "Click again to confirm" : "Clear All History"}
                    >
                        {confirmClear ? <AlertCircle size={16} /> : <Trash2 size={16} />}
                        <span>{confirmClear ? "Confirm Clear?" : "Clear History"}</span>
                    </button>
                )}
            </div>

            <div className="history-container">
                {loading ? (
                    <div className="p-8 text-center text-zinc-500">Loading history...</div>
                ) : history.length === 0 ? (
                    <div className="empty-state">
                        <Clock size={48} className="text-zinc-700 mb-4" />
                        <p>No execution history found.</p>
                    </div>
                ) : (
                    <div className="history-list">
                        {history.map(run => (
                            <div key={run.id} className="history-item group">
                                <div className="item-status">
                                    {run.status === 'success' ? (
                                        <CheckCircle2 size={20} className="text-success" />
                                    ) : run.status === 'running' ? (
                                        <div className="status-dot running large" />
                                    ) : (
                                        <AlertCircle size={20} className="text-danger" />
                                    )}
                                </div>
                                <div className="item-details">
                                    <div className="item-header">
                                        <h3>{run.config_name}</h3>
                                        <span className="item-time">
                                            {new Date(run.started_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="item-meta">
                                        <span className="meta-tag">
                                            {run.tracks_processed} tracks processed
                                        </span>
                                        {run.finished_at && (
                                            <span className="meta-tag">
                                                {((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s duration
                                            </span>
                                        )}
                                        {run.error_message && (
                                            <div className="error-msg">
                                                {run.error_message}
                                            </div>
                                        )}
                                        {run.warning_message && (
                                            <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '0.375rem', color: '#fde047', fontSize: '0.75rem', lineHeight: '1.5', display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
                                                <span style={{ fontSize: '1rem', marginTop: '-0.1rem', flexShrink: 0 }}>⚠️</span>
                                                <div style={{ flex: 1, maxHeight: '100px', overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
                                                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block' }}>
                                                        {(() => {
                                                            try {
                                                                return decodeURIComponent(run.warning_message);
                                                            } catch (e) {
                                                                return run.warning_message;
                                                            }
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteItem(run.id, e)}
                                    className="item-delete-btn"
                                    title="Delete Entry"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
