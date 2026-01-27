import { useState, useEffect } from 'react'
import { Plus, Trash2, Calendar, Edit2, ChevronDown } from 'lucide-react'
import { Schedule, DynamicPlaylistConfig } from '../types'
import './Schedules.css'

// Helper to pad time
const pad = (n: number) => n.toString().padStart(2, '0');

export default function Schedules() {
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [configs, setConfigs] = useState<DynamicPlaylistConfig[]>([])

    // Modal state
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        config_id: '',
        cron_expression: '0 0 * * *',
        enabled: true
    })

    // Simple Mode State (matching Desktop)
    const [simpleFreq, setSimpleFreq] = useState<'hourly' | 'interval' | 'daily' | 'weekly' | 'monthly'>('daily');
    const [simpleInterval, setSimpleInterval] = useState(6); // Every X hours
    const [simpleTime, setSimpleTime] = useState('00:00');
    const [simpleDow, setSimpleDow] = useState('1'); // Monday default
    const [simpleDom, setSimpleDom] = useState('1'); // 1st default

    useEffect(() => {
        Promise.all([
            fetch('/api/schedules').then(r => r.json()),
            fetch('/api/configs').then(r => r.json())
        ]).then(([schedulesData, configsData]) => {
            setSchedules(schedulesData)
            setConfigs(configsData)
        })
    }, [])

    // Cron Logic (Ported from Desktop)
    const parseCronToSimple = (cron: string) => {
        const parts = cron.split(' ');
        if (parts.length < 5) return;
        const [min, hour, dom, mon, dow] = parts;

        // Reset
        setSimpleInterval(6);
        setSimpleTime('00:00');
        setSimpleDow('1');
        setSimpleDom('1');

        if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
            setSimpleFreq('hourly');
        } else if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
            setSimpleFreq('interval');
            const interval = parseInt(hour.replace('*/', ''));
            if (!isNaN(interval)) setSimpleInterval(interval);
        } else if (dom === '*' && mon === '*' && dow === '*') {
            // Daily
            setSimpleFreq('daily');
            setSimpleTime(`${pad(parseInt(hour))}:${pad(parseInt(min))}`);
        } else if (dom === '*' && mon === '*' && dow !== '*') {
            // Weekly
            setSimpleFreq('weekly');
            setSimpleDow(dow);
            setSimpleTime(`${pad(parseInt(hour))}:${pad(parseInt(min))}`);
        } else if (dom !== '*' && mon === '*' && dow === '*') {
            // Monthly
            setSimpleFreq('monthly');
            setSimpleDom(dom);
            setSimpleTime(`${pad(parseInt(hour))}:${pad(parseInt(min))}`);
        } else {
            // Fallback: Default to Daily 00:00 if complex
            setSimpleFreq('daily');
            setSimpleTime('00:00');
        }
    };

    const updateCronFromSimple = () => {
        let cron = '* * * * *';
        const [h, m] = simpleTime.split(':').map(n => parseInt(n) || 0);

        switch (simpleFreq) {
            case 'hourly':
                cron = '0 * * * *';
                break;
            case 'interval':
                cron = `0 */${simpleInterval} * * *`;
                break;
            case 'daily':
                cron = `${m} ${h} * * *`;
                break;
            case 'weekly':
                cron = `${m} ${h} * * ${simpleDow}`;
                break;
            case 'monthly':
                cron = `${m} ${h} ${simpleDom} * *`;
                break;
        }
        setFormData(p => ({ ...p, cron_expression: cron }));
    };

    // Update cron whenever simple inputs change
    useEffect(() => {
        if (showModal) {
            updateCronFromSimple();
        }
    }, [simpleFreq, simpleInterval, simpleTime, simpleDow, simpleDom]);

    const handleSave = async () => {
        try {
            if (editingId) {
                // Update
                const res = await fetch(`/api/schedules/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cron_expression: formData.cron_expression,
                        enabled: formData.enabled
                    })
                })
                const updated = await res.json()
                setSchedules(prev => prev.map(s => s.id === editingId ? updated : s))
            } else {
                // Create
                const res = await fetch('/api/schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                })
                if (!res.ok) throw new Error(await res.text())
                const created = await res.json()
                setSchedules(prev => [...prev, created])
            }
            closeModal()
        } catch (e) {
            alert('Failed to save schedule: ' + e)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this schedule?')) return
        await fetch(`/api/schedules/${id}`, { method: 'DELETE' })
        setSchedules(prev => prev.filter(s => s.id !== id))
    }

    const openNewModal = () => {
        setEditingId(null)
        setFormData({
            config_id: configs[0]?.id || '',
            cron_expression: '0 0 * * *',
            enabled: true
        })
        parseCronToSimple('0 0 * * *');
        setShowModal(true)
    }

    const openEditModal = (s: Schedule) => {
        setEditingId(s.id!)
        setFormData({
            config_id: s.config_id,
            cron_expression: s.cron_expression,
            enabled: s.enabled
        })
        parseCronToSimple(s.cron_expression);
        setShowModal(true)
    }

    const closeModal = () => setShowModal(false)

    const getConfigName = (id: string) => configs.find(c => c.id === id)?.name || id

    return (
        <div className="schedules-page">
            <div className="page-header">
                <h1>Schedules</h1>
                <button onClick={openNewModal} className="create-btn">
                    <Plus size={20} /> New Schedule
                </button>
            </div>

            <div className="schedules-list">
                {schedules.map(s => (
                    <div key={s.id} className={`schedule-card ${!s.enabled ? 'disabled' : ''}`}>
                        <div className="schedule-main">
                            <div className="schedule-title">
                                <Calendar size={18} className="text-primary" />
                                <h3>{getConfigName(s.config_id)}</h3>
                                {!s.enabled && <span className="pill">Disabled</span>}
                            </div>
                            <div className="schedule-meta">
                                <div className="cron-tag">{s.cron_expression}</div>
                                <div className="next-run">
                                    Next: {s.next_run ? new Date(s.next_run).toLocaleString() : 'N/A'}
                                </div>
                            </div>
                        </div>

                        <div className="schedule-actions">
                            <button onClick={() => openEditModal(s)} className="action-btn">
                                <Edit2 size={18} />
                            </button>
                            <button onClick={() => handleDelete(s.id!)} className="action-btn delete">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h2>{editingId ? 'Edit Schedule' : 'New Schedule'}</h2>

                        <div className="mb-6">
                            <label className="block text-xs font-semibold text-zinc-400 mb-3">Playlist Configuration</label>
                            <div className="relative">
                                <select
                                    value={formData.config_id}
                                    onChange={e => setFormData(p => ({ ...p, config_id: e.target.value }))}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-white appearance-none focus:outline-none focus:border-green-500 pr-8"
                                    disabled={!!editingId}
                                >
                                    {configs.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-semibold text-zinc-400 mb-3">Frequency</label>
                            <div className="space-y-3 p-3 rounded border border-zinc-700 bg-zinc-900/50">
                                {/* Primary Frequency Select */}
                                <div className="relative">
                                    <select
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-white appearance-none focus:outline-none focus:border-green-500 pr-8"
                                        value={simpleFreq}
                                        onChange={e => setSimpleFreq(e.target.value as any)}
                                    >
                                        <option value="hourly">Every Hour</option>
                                        <option value="interval">Every X Hours...</option>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                                </div>

                                {/* Sub-options */}
                                {simpleFreq === 'interval' && (
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm text-zinc-400 whitespace-nowrap">Every</label>
                                        <input
                                            type="number"
                                            min="1" max="23"
                                            value={simpleInterval}
                                            onChange={e => setSimpleInterval(Math.min(23, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className="text-input"
                                        />
                                        <label className="text-sm text-zinc-400">hours</label>
                                    </div>
                                )}

                                {/* Weekly Day Selector */}
                                {simpleFreq === 'weekly' && (
                                    <div>
                                        <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Day of Week</label>
                                        <select
                                            value={simpleDow}
                                            onChange={e => setSimpleDow(e.target.value)}
                                            className="text-input"
                                        >
                                            <option value="1">Monday</option>
                                            <option value="2">Tuesday</option>
                                            <option value="3">Wednesday</option>
                                            <option value="4">Thursday</option>
                                            <option value="5">Friday</option>
                                            <option value="6">Saturday</option>
                                            <option value="0">Sunday</option>
                                        </select>
                                    </div>
                                )}

                                {/* Monthly Dom Selector */}
                                {simpleFreq === 'monthly' && (
                                    <div>
                                        <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Day of Month</label>
                                        <select
                                            value={simpleDom}
                                            onChange={e => setSimpleDom(e.target.value)}
                                            className="text-input"
                                        >
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Time Selector (Daily, Weekly, Monthly) */}
                                {(simpleFreq === 'daily' || simpleFreq === 'weekly' || simpleFreq === 'monthly') && (
                                    <div>
                                        <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">AT TIME</label>
                                        <div className="relative">
                                            <input
                                                type="time"
                                                value={simpleTime}
                                                onChange={e => setSimpleTime(e.target.value)}
                                                className="text-input"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="text-[10px] text-zinc-500 font-mono mt-2 text-center">
                                    Computed Cron: {formData.cron_expression}
                                </div>
                            </div>
                        </div>

                        <div className="form-checkbox">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.enabled}
                                        onChange={e => setFormData(p => ({ ...p, enabled: e.target.checked }))}
                                        className="peer sr-only"
                                    />
                                    <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                </div>
                                <span className={`text-sm font-medium transition-colors ${formData.enabled ? 'text-white' : 'text-zinc-500'}`}>
                                    Schedule Enabled
                                </span>
                            </label>
                        </div>

                        <div className="modal-actions">
                            <button onClick={closeModal} className="btn-secondary">Cancel</button>
                            <button onClick={handleSave} className="btn-primary">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
