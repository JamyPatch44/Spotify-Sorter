import { useState, useEffect } from 'react'
import { Plus, Trash2, Calendar, Edit2, X, Clock, ChevronDown } from 'lucide-react'
import { invoke } from '../tauri-api';
import { DynamicPlaylistConfig } from './DynamicPlaylistSection'

interface DesktopSchedule {
    id: string
    config_id: string
    cron_expression: string
    enabled: boolean
    last_run?: string
}

interface DesktopSchedulesModalProps {
    onClose: () => void;
    initialConfigId?: string;
}

// Helper to pad time
const pad = (n: number) => n.toString().padStart(2, '0');

function CustomSelect({
    options,
    value,
    onChange,
    disabled = false,
    placeholder = "Select..."
}: {
    options: { id: string, name: string }[],
    value: string,
    onChange: (id: string) => void,
    disabled?: boolean,
    placeholder?: string
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selected = options.find(o => o.id === value);

    return (
        <div className="relative">
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full bg-zinc-800 border ${isOpen ? 'border-green-500 ring-1 ring-green-500/20' : 'border-zinc-700'} rounded p-2 text-sm text-white flex items-center justify-between transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-600'}`}
                disabled={disabled}
                type="button"
            >
                <span className="truncate">{selected ? selected.name : placeholder}</span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-xl z-50 py-1 max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-100">
                        {options.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => { onChange(opt.id); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${value === opt.id ? 'bg-green-500/10 text-green-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'}`}
                            >
                                {opt.name}
                                {value === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                            </button>
                        ))}
                        {options.length === 0 && (
                            <div className="px-3 py-2 text-xs text-zinc-500 italic">No options available</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export function DesktopSchedulesModal({ onClose, initialConfigId }: DesktopSchedulesModalProps) {
    // State
    const [schedules, setSchedules] = useState<DesktopSchedule[]>([])
    const [configs, setConfigs] = useState<DynamicPlaylistConfig[]>([])
    const [hasInitialOpened, setHasInitialOpened] = useState(false);

    // Sub-Modal state (editing a schedule)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Core Form Data
    const [formData, setFormData] = useState({
        id: '',
        config_id: '',
        cron_expression: '0 0 * * *',
        enabled: true
    })

    // Expanded Simple Mode State
    const [simpleFreq, setSimpleFreq] = useState<'hourly' | 'interval' | 'daily' | 'weekly' | 'monthly'>('daily');
    const [simpleInterval, setSimpleInterval] = useState(6); // Every X hours
    const [simpleTime, setSimpleTime] = useState('00:00');
    const [simpleDow, setSimpleDow] = useState('1'); // Monday default
    const [simpleDom, setSimpleDom] = useState('1'); // 1st default
    const [error, setError] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        loadData()
    }, [])

    // Handle Initial Config autostart
    useEffect(() => {
        if (initialConfigId && !hasInitialOpened && configs.length > 0 && schedules.length >= 0) {
            const existing = schedules.find(s => s.config_id === initialConfigId);
            setHasInitialOpened(true);

            if (existing) {
                openEditModal(existing);
            } else {
                setEditingId(null);
                setFormData({
                    id: '',
                    config_id: initialConfigId,
                    cron_expression: '0 0 * * *',
                    enabled: true
                });
                parseCronToSimple('0 0 * * *');
                setShowEditModal(true);
            }
        }
    }, [initialConfigId, hasInitialOpened, configs, schedules]);

    const loadData = async () => {
        try {
            const [schedulesData, configsData] = await Promise.all([
                invoke<DesktopSchedule[]>('get_desktop_schedules'),
                invoke<DynamicPlaylistConfig[]>('get_dynamic_configs')
            ])
            setSchedules(schedulesData)
            setConfigs(configsData)
        } catch (e) {
            console.error('Failed to load data:', e)
        }
    }

    // Cron Logic
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
            setSimpleFreq('daily');
            setSimpleTime(`${pad(parseInt(hour))}:${pad(parseInt(min))}`);
        } else if (dom === '*' && mon === '*' && dow !== '*') {
            setSimpleFreq('weekly');
            setSimpleDow(dow);
            setSimpleTime(`${pad(parseInt(hour))}:${pad(parseInt(min))}`);
        } else if (dom !== '*' && mon === '*' && dow === '*') {
            setSimpleFreq('monthly');
            setSimpleDom(dom);
            setSimpleTime(`${pad(parseInt(hour))}:${pad(parseInt(min))}`);
        } else {
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

    useEffect(() => {
        if (showEditModal) {
            updateCronFromSimple();
        }
    }, [simpleFreq, simpleInterval, simpleTime, simpleDow, simpleDom]);

    const handleSave = async () => {
        try {
            const scheduleToSave = {
                id: editingId || crypto.randomUUID(),
                config_id: formData.config_id,
                cron_expression: formData.cron_expression,
                enabled: formData.enabled
            }

            await invoke('save_desktop_schedule', { schedule: scheduleToSave })

            if (editingId) {
                setSchedules(prev => prev.map(s => s.id === editingId ? { ...s, ...scheduleToSave } : s))
            } else {
                setSchedules(prev => [...prev, scheduleToSave])
            }
            closeEditModal()
            setError(null)
        } catch (e) {
            setError('Failed to save schedule: ' + e)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await invoke('delete_desktop_schedule', { id })
            setSchedules(prev => prev.filter(s => s.id !== id))
            setConfirmDeleteId(null)
        } catch (e) {
            setError('Failed to delete schedule: ' + e)
        }
    }

    const openNewModal = () => {
        if (configs.length === 0) {
            setError('Please create a Dynamic Playlist first.')
            return
        }
        setError(null)
        setEditingId(null)
        setFormData({
            id: '',
            config_id: initialConfigId || configs[0]?.id || '',
            cron_expression: '0 0 * * *',
            enabled: true
        })
        parseCronToSimple('0 0 * * *');
        setShowEditModal(true)
    }

    const openEditModal = (s: DesktopSchedule) => {
        setEditingId(s.id)
        setFormData({
            id: s.id,
            config_id: s.config_id,
            cron_expression: s.cron_expression,
            enabled: s.enabled
        })
        parseCronToSimple(s.cron_expression);
        setShowEditModal(true)
    }

    const closeEditModal = () => {
        setShowEditModal(false)
        if (initialConfigId) {
            onClose();
        }
    }

    const getConfigName = (id: string) => configs.find(c => c.id === id)?.name || id

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            {!initialConfigId && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col shadow-2xl relative">
                    <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <Calendar className="text-green-500" size={20} />
                            <div>
                                <h2 className="text-xl font-bold text-white pointer-events-none">Desktop Schedules</h2>
                                <p className="text-xs text-zinc-400">Run updates automatically in the background</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar">
                        {error && (
                            <div className="mb-4 bg-red-400/10 border border-red-400/20 text-red-400 p-3 rounded-lg text-sm flex items-center justify-between animate-in fade-in slide-in-from-top-1">
                                <span className="flex items-center gap-2">⚠️ {error}</span>
                                <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {schedules.length === 0 ? (
                            <div className="text-center py-12 bg-zinc-800/30 rounded-lg border border-zinc-800 border-dashed">
                                <Calendar size={48} className="mx-auto text-zinc-600 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-300">No Schedules Configured</h3>
                                <p className="text-zinc-500 mt-1 mb-4 text-sm">Create a schedule to automate your dynamic playlists.</p>
                                <button onClick={openNewModal} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-full inline-flex items-center gap-2 text-sm transition-transform active:scale-95">
                                    <Plus size={16} /> Create Schedule
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {schedules.map(s => (
                                    <div key={s.id} className={`bg-zinc-800/40 border border-zinc-700/50 hover:border-zinc-600 rounded-lg p-4 flex items-center justify-between transition-all ${!s.enabled ? 'opacity-60 saturate-0' : ''}`}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="font-semibold text-white">{getConfigName(s.config_id)}</h3>
                                                {!s.enabled && <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700">PAUSED</span>}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-zinc-400">
                                                <div className="flex items-center gap-1.5 bg-zinc-900/50 px-2 py-1 rounded font-mono text-zinc-300 border border-zinc-800">
                                                    <Calendar size={12} className="text-green-500/70" />
                                                    {s.cron_expression}
                                                </div>
                                                <span className="text-zinc-500">•</span>
                                                <div>
                                                    Last Run: <span className={s.last_run ? 'text-zinc-300' : 'text-zinc-500'}>{s.last_run ? new Date(s.last_run).toLocaleString() : 'Never'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pl-4 border-l border-zinc-800 ml-4">
                                            {confirmDeleteId === s.id ? (
                                                <div className="flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded border border-red-900/30 animate-in fade-in zoom-in-95 duration-200">
                                                    <span className="text-red-400 text-[10px] font-bold mr-1 uppercase">Delete?</span>
                                                    <button
                                                        onClick={() => handleDelete(s.id)}
                                                        className="text-red-400 hover:text-white px-2 py-1 hover:bg-red-500 rounded text-[10px] font-black transition-all"
                                                    >
                                                        YES
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="text-zinc-500 hover:text-white px-2 py-1 hover:bg-zinc-700 rounded text-[10px] font-black transition-all"
                                                    >
                                                        NO
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button onClick={() => openEditModal(s)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors" title="Edit">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => setConfirmDeleteId(s.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors" title="Delete">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className="pt-4 flex justify-center">
                                    <button onClick={openNewModal} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium py-2 px-4 rounded-full flex items-center gap-2 border border-zinc-700 transition-colors">
                                        <Plus size={14} /> Add Another Schedule
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showEditModal && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60">
                    <div className="bg-zinc-900 border border-zinc-600 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200" onMouseDown={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold mb-6 text-white">{editingId ? 'Edit Schedule' : 'New Schedule'}</h2>

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Playlist Configuration</label>
                            <CustomSelect
                                value={formData.config_id}
                                onChange={val => setFormData(p => ({ ...p, config_id: val }))}
                                options={configs.map(c => ({ id: c.id, name: c.name }))}
                                disabled={!!editingId}
                                placeholder="Select a configuration..."
                            />
                        </div>

                        <div className="mb-5">
                            <label className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Frequency</span>
                            </label>

                            <div className="space-y-3 bg-zinc-800/40 p-3 rounded border border-zinc-800">
                                <CustomSelect
                                    value={simpleFreq}
                                    onChange={val => setSimpleFreq(val as any)}
                                    options={[
                                        { id: 'hourly', name: 'Every Hour' },
                                        { id: 'interval', name: 'Every X Hours...' },
                                        { id: 'daily', name: 'Daily' },
                                        { id: 'weekly', name: 'Weekly' },
                                        { id: 'monthly', name: 'Monthly' }
                                    ]}
                                />

                                {simpleFreq === 'interval' && (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                        <label className="text-sm text-zinc-400 whitespace-nowrap">Every</label>
                                        <input
                                            type="number"
                                            min="1" max="23"
                                            value={simpleInterval}
                                            onChange={e => setSimpleInterval(Math.min(23, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white"
                                        />
                                        <label className="text-sm text-zinc-400">hours</label>
                                    </div>
                                )}

                                {simpleFreq === 'weekly' && (
                                    <div className="animate-in fade-in slide-in-from-top-1">
                                        <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Day of Week</label>
                                        <CustomSelect
                                            value={simpleDow}
                                            onChange={val => setSimpleDow(val)}
                                            options={[
                                                { id: '1', name: 'Monday' },
                                                { id: '2', name: 'Tuesday' },
                                                { id: '3', name: 'Wednesday' },
                                                { id: '4', name: 'Thursday' },
                                                { id: '5', name: 'Friday' },
                                                { id: '6', name: 'Saturday' },
                                                { id: '0', name: 'Sunday' }
                                            ]}
                                        />
                                    </div>
                                )}

                                {simpleFreq === 'monthly' && (
                                    <div className="animate-in fade-in slide-in-from-top-1">
                                        <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Day of Month</label>
                                        <CustomSelect
                                            value={simpleDom}
                                            onChange={val => setSimpleDom(val)}
                                            options={Array.from({ length: 31 }, (_, i) => {
                                                const d = i + 1;
                                                const suffix = d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th';
                                                return { id: d.toString(), name: `${d}${suffix}` };
                                            })}
                                        />
                                    </div>
                                )}

                                {(simpleFreq === 'daily' || simpleFreq === 'weekly' || simpleFreq === 'monthly') && (
                                    <div className="animate-in fade-in slide-in-from-top-1">
                                        <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">At Time</label>
                                        <div className="relative">
                                            <input
                                                type="time"
                                                value={simpleTime}
                                                onChange={e => setSimpleTime(e.target.value)}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white pl-8"
                                            />
                                            <Clock size={14} className="absolute left-2.5 top-3 text-zinc-500" />
                                        </div>
                                    </div>
                                )}

                                <div className="text-[10px] text-zinc-600 font-mono mt-2 bg-zinc-950/30 p-1.5 rounded text-center">
                                    Computed Cron: {formData.cron_expression}
                                </div>
                            </div>
                        </div>

                        <div className="mb-8 p-3 bg-zinc-800/30 rounded border border-zinc-800 hover:border-zinc-700 transition-colors">
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
                                    {formData.enabled ? 'Schedule Enabled' : 'Schedule Disabled'}
                                </span>
                            </label>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-700">
                            <button onClick={closeEditModal} className="px-4 py-2 bg-transparent hover:bg-zinc-800 text-zinc-300 rounded text-sm font-medium transition-colors">Cancel</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
