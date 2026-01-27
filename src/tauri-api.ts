
// Shim for @tauri-apps/api/core when running in browser

// Check if running in Tauri context
const isTauri = () => {
    if (typeof window === 'undefined') return false;
    return '__TAURI__' in window || '__TAURI_INTERNALS__' in window || (window as any).rpc;
};

export async function invoke<T>(cmd: string, args: any = {}): Promise<T> {
    if (isTauri()) {
        try {
            const tauri = (window as any).__TAURI__;
            // Tauri 2.0 usually has it under .core.invoke
            if (tauri?.core?.invoke) {
                return await tauri.core.invoke(cmd, args);
            }
            // Fallback for older Tauri or different configurations
            if (tauri?.invoke) {
                return await tauri.invoke(cmd, args);
            }
            // Direct access to internals if needed
            if ((window as any).__TAURI_INTERNALS__?.invoke) {
                return await (window as any).__TAURI_INTERNALS__.invoke(cmd, args);
            }
        } catch (e) {
            console.error(`Tauri invoke('${cmd}') failed:`, e);
            throw e; // Bubble up the real Tauri error
        }
    }

    // --- WEB SHIM IMPLEMENTATION ---
    // console.log(`[Web Shim] invoke('${cmd}', ${JSON.stringify(args)})`);

    const headers = { 'Content-Type': 'application/json' };

    switch (cmd) {
        case 'check_auth': {
            const res = await fetch('/auth/status');
            if (!res.ok) throw new Error('Auth check failed');
            const status = await res.json();

            let playlists = [];
            if (status.authenticated) {
                try {
                    const plRes = await fetch('/api/playlists');
                    if (plRes.ok) playlists = await plRes.json();
                } catch (e) {
                    console.warn("Failed to fetch playlists in shim", e);
                }
            }
            return { authenticated: status.authenticated, playlists } as T;
        }

        case 'get_history': {
            console.warn("[Shim] Fetching History...");
            const res = await fetch('/api/history?limit=50&_t=' + Date.now());
            if (!res.ok) throw new Error('Failed to fetch history');
            const data = await res.json();
            console.warn("[Shim] History Data:", data);
            return data;
        }

        case 'delete_history_item': {
            const res = await fetch(`/api/history/${args.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete history item');
            return true as T;
        }

        case 'clear_history': {
            const res = await fetch('/api/history', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear history');
            return true as T;
        }

        case 'restore_snapshot': {
            // POST /api/history/{id}/restore  (Need to check if this route exists!)
            const res = await fetch(`/api/history/${args.snapshotId}/restore`, { method: 'POST' });
            if (!res.ok) throw new Error('Restoration failed');
            return "Restored" as T;
        }

        case 'get_dynamic_configs': {
            const res = await fetch('/api/configs');
            if (!res.ok) throw new Error('Failed to fetch configs');
            return await res.json();
        }

        case 'save_dynamic_config': {
            // Determine if create (POST) or update (PUT)
            // args.config has the data
            const config = args.config;
            if (config.id && !config.id.startsWith('new-')) { // heuristic for new vs edit
                // Try PUT first, or assume if it has ID it exists? 
                // The backend 'create_config' generates an ID if missing.
                // The frontend usually generates a temporary ID or passes one?
                // Let's assume if we are editing, we call PUT. A new one calls POST.
                // Actually, the backend `update_config` needs an ID in URL.

                // If the frontend generates IDs for new items, we might need to check if it exists.
                // Safest is: try PUT, if 404, try POST? Or just use POST for create?

                // For now, let's treat it as: If it has an ID, use PUT. (The frontend generates IDs?)
                // Looking at store, `generateId` is used locally.
                // Let's assume we use POST for new items (which might be handled by create_config).

                // Backend: POST /api/configs (create), PUT /api/configs/{id}

                // How do we know if it's new? The shim doesn't easily know.
                // We can try PUT.
                const res = await fetch(`/api/configs/${config.id}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(config)
                });
                if (res.status === 404) {
                    // Fallback to POST
                    const res2 = await fetch(`/api/configs`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(config)
                    });
                    if (!res2.ok) throw new Error('Failed to save config');
                    return await res2.json();
                }
                if (!res.ok) throw new Error('Failed to save config');
                return await res.json();
            } else {
                const res = await fetch(`/api/configs`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(config)
                });
                if (!res.ok) throw new Error('Failed to save config');
                return await res.json();
            }
        }

        case 'delete_dynamic_config': {
            const res = await fetch(`/api/configs/${args.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete config');
            return true as T;
        }

        case 'run_dynamic_update': {
            const res = await fetch(`/api/configs/${args.configId}/run`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to run update');
            // The backend returns the RunHistory object. 
            // The frontend expects a number (count)?
            // DynamicPlaylistSection.tsx: `const count = await invoke<number>('...`
            const history = await res.json();
            return (history.tracks_processed || 0) as T;
        }

        // ... Add more commands as they are discovered ...
        // scan_playlist -> Likely used for 'Compare' or manual scan
        // get_schedules, save_schedule...

        default:
            console.warn(`[Web Shim] Unknown command: ${cmd}`, args);
            throw new Error(`Command ${cmd} not supported in Web Mode`);
    }
}
