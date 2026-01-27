import { useState, useEffect } from 'react'
import { Search, Check } from 'lucide-react'
import { PlaylistInfo } from '../types'
import './PlaylistSelector.css'

interface Props {
    value: string[]
    onChange: (ids: string[]) => void
    multiple?: boolean
    excludeIds?: string[]
}

export default function PlaylistSelector({ value, onChange, multiple = false, excludeIds = [] }: Props) {
    const [playlists, setPlaylists] = useState<PlaylistInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [rateLimited, setRateLimited] = useState(false)
    const [waitTime, setWaitTime] = useState<number>(0)
    const [search, setSearch] = useState('')

    useEffect(() => {
        setRateLimited(false)
        fetch('/api/playlists')
            .then(async res => {
                if (res.status === 429) {
                    const error = await res.json()
                    const message = typeof error.detail === 'string' ? error.detail : ''
                    const match = message.match(/\d+/)
                    const seconds = match ? parseInt(match[0], 10) : 60
                    setWaitTime(seconds)
                    setRateLimited(true)
                    throw new Error('Rate Limited')
                }
                return res.json()
            })
            .then(data => {
                setPlaylists(data || [])
                setLoading(false)
            })
            .catch(err => {
                console.error('Playlist fetch error:', err)
                setLoading(false)
            })
    }, [])

    useEffect(() => {
        if (rateLimited && waitTime > 0) {
            const timer = setInterval(() => setWaitTime(t => Math.max(0, t - 1)), 1000)
            return () => clearInterval(timer)
        }
    }, [rateLimited, waitTime])

    if (rateLimited) {
        const remaining = Math.max(0, waitTime)
        const isSpotifyBan = remaining > 120 // Longer than 2 mins usually means API ban, not just local back-off
        const h = Math.floor(remaining / 3600)
        const m = Math.floor((remaining % 3600) / 60)
        const s = remaining % 60
        const timeStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`

        return (
            <div style={{
                padding: '1.5rem',
                border: `1px solid ${isSpotifyBan ? '#ff4500' : '#ffa500'}`,
                borderRadius: '8px',
                textAlign: 'center',
                background: '#1a1a1a',
                color: isSpotifyBan ? '#ff4500' : '#ffa500'
            }}>
                <div style={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>
                    {isSpotifyBan ? 'Spotify Account Lock' : 'Local Safety Back-off'}
                </div>
                <div className="countdown-clock" style={{ fontSize: '1.8rem', fontFamily: 'monospace', margin: '0.5rem 0' }}>{timeStr}</div>
                <div style={{ color: '#888', fontSize: '0.75rem' }}>
                    {isSpotifyBan ? 'Spotify has locked your API access (roughly 24h).' : 'Internal protection engaged for 60s.'}
                </div>
                <button onClick={() => window.location.reload()} style={{
                    marginTop: '1rem',
                    padding: '4px 12px',
                    background: '#222',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#ccc',
                    fontSize: '0.75rem'
                }}>Check Status</button>
            </div>
        )
    }

    if (loading) return <div style={{ padding: '1rem', color: '#888' }}>Loading...</div>

    const safeValue = value || []
    const filtered = (playlists || []).filter(p =>
        p && !excludeIds.includes(p.id) &&
        p.name.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => {
        const aSelected = safeValue.includes(a.id)
        const bSelected = safeValue.includes(b.id)
        if (aSelected && !bSelected) return -1
        if (!aSelected && bSelected) return 1
        return 0
    })

    const handleSelect = (id: string) => {
        const current = safeValue
        if (multiple) {
            if (current.includes(id)) {
                onChange(current.filter(v => v !== id))
            } else {
                onChange([...current, id])
            }
        } else {
            onChange([id])
        }
    }

    return (
        <div className="playlist-selector">
            <div className="search-box">
                <Search size={14} className="search-icon" />
                <input
                    type="text"
                    placeholder="Search playlists..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div className="playlist-list">
                {filtered.map(playlist => {
                    const isSelected = safeValue.includes(playlist.id)
                    return (
                        <div
                            key={playlist.id}
                            className={`playlist-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelect(playlist.id)}
                        >
                            <div className="checkbox">
                                {isSelected && <Check size={12} />}
                            </div>
                            <div className="info">
                                <div className="name">{playlist.name}</div>
                                <div className="sub">{playlist.track_count} tracks</div>
                            </div>
                        </div>
                    )
                })}
                {filtered.length === 0 && <div className="no-results">No playlists found</div>}
            </div>
        </div>
    )
}
