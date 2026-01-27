import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { X, Check } from 'lucide-react'
import PlaylistSelector from '../components/PlaylistSelector'
import { DynamicPlaylistConfig } from '../types'
import './ConfigEditor.css'

// generateId removed (unused)

const EMPTY_CONFIG: DynamicPlaylistConfig = {
    name: '',
    target_playlist_id: '',
    target_playlist_name: '',
    sources: [],
    filters: { exclude_liked: false, keyword_blacklist: [] },
    update_mode: 'replace',
    sample_per_source: null,
    include_liked_songs: false,
    processing: {
        apply_sort: false,
        apply_dupes: false,
        apply_versions: false,
        sort_rules: [
            { criteria: 'Release Date', descending: true },
        ],
        dupe_preference: 'Keep Oldest (Release Date)',
        version_preference: ''
    },
    enabled: true
}

export default function ConfigEditor() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [config, setConfig] = useState<DynamicPlaylistConfig>(EMPTY_CONFIG)
    const [loading, setLoading] = useState(id ? true : false)
    const [saving, setSaving] = useState(false)
    const [keywordInput, setKeywordInput] = useState('')

    // Note: "expandedOption" removed - we now just show settings inline if enabled

    useEffect(() => {
        if (id) {
            fetch(`/api/configs/${id}`)
                .then(res => res.json())
                .then(data => {
                    setConfig(data)
                    setLoading(false)
                })
                .catch(() => navigate('/'))
        }
    }, [id, navigate])

    const handleSave = async () => {
        if (!config.name) return alert('Name Required')
        setSaving(true)
        try {
            const url = id ? `/api/configs/${id}` : '/api/configs'
            const method = id ? 'PUT' : 'POST'
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })

            if (!res.ok) {
                const err = await res.json()
                alert(`Failed to save: ${err.detail || 'Unknown Error'}`)
                return
            }

            navigate('/')
        } catch (e) {
            console.error(e)
            alert('Network Error: Failed to save configuration.')
        } finally {
            setSaving(false)
        }
    }

    const updateProcessing = (u: any) => setConfig(c => ({ ...c, processing: { ...c.processing, ...u } }))

    const toggleProcessing = (key: 'apply_sort' | 'apply_dupes' | 'apply_versions') => {
        updateProcessing({ [key]: !config.processing[key] })
    }

    if (loading) return <div>Loading...</div>

    return (
        <div className="config-editor">
            {/* Header */}
            <header className="editor-header">
                <h1 className="editor-title">{id ? 'Edit Dynamic Playlist' : 'New Dynamic Playlist'}</h1>
                <button onClick={() => navigate('/')} className="close-btn"><X size={24} /></button>
            </header>

            <div className="config-grid">
                {/* Name Input */}
                <div className="form-full-width">
                    <label className="section-label">Configuration Name</label>
                    <input
                        className="text-input"
                        placeholder="My Dynamic Playlist"
                        value={config.name}
                        onChange={e => setConfig({ ...config, name: e.target.value })}
                    />
                </div>

                {/* Target Playlist */}
                <div className="playlist-col">
                    <label className="section-label">Target Playlist</label>
                    <PlaylistSelector
                        value={[config.target_playlist_id]}
                        onChange={(ids) => setConfig({ ...config, target_playlist_id: ids[0] })}
                        multiple={false}
                    />
                </div>

                {/* Source Playlists */}
                <div className="playlist-col">
                    <div className="col-header">
                        <label className="section-label">Source Playlists <span className="count-badge">({config.sources.length})</span></label>
                        <div className="header-actions">
                            <span className="action-link" onClick={() => setConfig({ ...config, sources: [] })}>Clear</span>
                        </div>
                    </div>
                    <PlaylistSelector
                        value={config.sources.map(s => s.id!)}
                        onChange={(ids) => setConfig({ ...config, sources: ids.map(id => ({ type: 'playlist', id })) })}
                        multiple={true}
                        excludeIds={[config.target_playlist_id]}
                    />
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={config.include_liked_songs}
                            onChange={e => setConfig({ ...config, include_liked_songs: e.target.checked })}
                        />
                        Include Liked Songs
                    </label>
                </div>

                {/* Processing Row */}
                <div className="processing-section">
                    <div className="processing-header">Processing Options</div>
                    <p className="info-sub">Apply rules to your main sort/duplicate settings.</p>

                    <div className="processing-cards">
                        {/* Sort Card */}
                        <div
                            className={`process-card ${config.processing.apply_sort ? 'active' : ''}`}
                            onClick={() => toggleProcessing('apply_sort')}
                        >
                            <div className="card-check">{config.processing.apply_sort && <Check size={14} strokeWidth={4} />}</div>
                            <div className="card-content">
                                <h3>Sort</h3>
                                <span>{config.processing.sort_rules.length} rules</span>
                            </div>
                        </div>

                        {/* Dedup Card */}
                        <div
                            className={`process-card ${config.processing.apply_dupes ? 'active' : ''}`}
                            onClick={() => toggleProcessing('apply_dupes')}
                        >
                            <div className="card-check">{config.processing.apply_dupes && <Check size={14} strokeWidth={4} />}</div>
                            <div className="card-content">
                                <h3>Dedup</h3>
                                <span>{config.processing.apply_dupes ? 'Enabled' : 'Disabled'}</span>
                            </div>
                        </div>

                        {/* Versions Card */}
                        <div className="process-card disabled" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                            <div className="card-check"></div>
                            <div className="card-content">
                                <h3>Versions</h3>
                                <span>Coming Soon</span>
                            </div>
                        </div>
                    </div>

                    {/* Expanded Settings Area - Always show if enabled */}
                    {config.processing.apply_sort && (
                        <div className="settings-panel">
                            <div className="panel-header">Sort Configuration</div>
                            {config.processing.sort_rules.map((rule, idx) => (
                                <div key={idx} className="rule-row">
                                    <select
                                        className="text-input small"
                                        value={rule.criteria}
                                        onChange={(e) => {
                                            const rules = [...config.processing.sort_rules];
                                            rules[idx].criteria = e.target.value;
                                            updateProcessing({ sort_rules: rules });
                                        }}
                                    >
                                        <option>Artist</option>
                                        <option>Album</option>
                                        <option>Track Name</option>
                                        <option>Release Date</option>
                                    </select>
                                    <select
                                        className="text-input small"
                                        value={rule.descending ? 'desc' : 'asc'}
                                        onChange={(e) => {
                                            const rules = [...config.processing.sort_rules];
                                            rules[idx].descending = e.target.value === 'desc';
                                            updateProcessing({ sort_rules: rules });
                                        }}
                                    >
                                        {rule.criteria === 'Release Date' ? (
                                            <>
                                                <option value="asc">Oldest First</option>
                                                <option value="desc">Newest First</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="asc">Ascending (A-Z)</option>
                                                <option value="desc">Descending (Z-A)</option>
                                            </>
                                        )}
                                    </select>
                                    <button
                                        className="icon-btn danger"
                                        onClick={() => {
                                            const rules = config.processing.sort_rules.filter((_, i) => i !== idx);
                                            updateProcessing({ sort_rules: rules });
                                        }}
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-text"
                                onClick={() => {
                                    updateProcessing({
                                        sort_rules: [...config.processing.sort_rules, { criteria: 'Artist', descending: false }]
                                    });
                                }}
                            >
                                + Add Sort Rule
                            </button>
                        </div>
                    )}

                    {config.processing.apply_dupes && (
                        <div className="settings-panel">
                            <div className="panel-header">Deduplication Logic</div>
                            <select
                                className="text-input"
                                value={config.processing.dupe_preference}
                                onChange={(e) => updateProcessing({ dupe_preference: e.target.value })}
                            >
                                <option>Keep Oldest (Release Date)</option>
                                <option>Keep Newest (Release Date)</option>
                                <option>Keep Oldest (Playlist Order)</option>
                                <option>Keep Newest (Playlist Order)</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Bottom Left: Filters */}
                <div className="bottom-left-col">
                    <div>
                        <label className="section-label">Filters</label>
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={config.filters.exclude_liked}
                                onChange={e => setConfig({ ...config, filters: { ...config.filters, exclude_liked: e.target.checked } })}
                            />
                            Exclude liked songs
                        </label>
                    </div>

                    <div>
                        <label className="section-label">Exclude keywords</label>
                        <input
                            className="text-input"
                            placeholder="remix, instrumental"
                            value={keywordInput}
                            onChange={e => setKeywordInput(e.target.value)}
                            onBlur={() => {
                                if (keywordInput) {
                                    setConfig({ ...config, filters: { ...config.filters, keyword_blacklist: [...config.filters.keyword_blacklist, keywordInput] } });
                                    setKeywordInput('');
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && keywordInput) {
                                    setConfig({ ...config, filters: { ...config.filters, keyword_blacklist: [...config.filters.keyword_blacklist, keywordInput] } });
                                    setKeywordInput('');
                                }
                            }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {config.filters.keyword_blacklist.map(kw => (
                                <span key={kw} style={{ fontSize: '0.8rem', background: '#333', padding: '2px 6px', borderRadius: '3px' }}>
                                    {kw} <span style={{ cursor: 'pointer' }} onClick={() => setConfig({ ...config, filters: { ...config.filters, keyword_blacklist: config.filters.keyword_blacklist.filter(k => k !== kw) } })}>&times;</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Right: Update Mode & Sample */}
                <div className="bottom-right-col">
                    <div>
                        <label className="section-label">Update Mode</label>
                        <div className="update-mode-control">
                            {['Replace', 'Merge', 'Append'].map(mode => (
                                <button
                                    key={mode}
                                    title={{
                                        Replace: "Overwrites the target playlist completely.",
                                        Merge: "Adds missing tracks to the target (prevents duplicates).",
                                        Append: "Adds tracks to the end of the target (may create duplicates)."
                                    }[mode]}
                                    className={`mode-option ${config.update_mode === mode.toLowerCase() ? 'selected' : ''}`}
                                    onClick={() => setConfig({ ...config, update_mode: mode.toLowerCase() as any })}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="section-label">Sample per source</label>
                        <input
                            className="text-input"
                            placeholder="All tracks"
                            type="number"
                            value={config.sample_per_source || ''}
                            onChange={e => setConfig({ ...config, sample_per_source: e.target.value ? parseInt(e.target.value) : null })}
                        />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="editor-footer">
                <button className="btn-cancel" onClick={() => navigate('/')}>Cancel</button>
                <button className="btn-create" onClick={handleSave} disabled={saving}>{id ? 'Save Changes' : 'Create'}</button>
            </footer>
        </div>
    )
}
