import { Outlet, NavLink } from 'react-router-dom'
import { Calendar, LogOut, Music, History as HistoryIcon } from 'lucide-react'
import { AuthStatus } from '../types'
import './Layout.css'

interface Props {
    auth: AuthStatus
    onLogout: () => void
}

export default function Layout({ auth, onLogout }: Props) {
    const handleLogout = async () => {
        await fetch('/auth/logout', { method: 'POST' })
        onLogout()
    }

    return (
        <div className="layout">
            <nav className="sidebar">
                <div className="sidebar-header">
                    <Music className="logo-icon" />
                    <span className="logo-text">Spotify Playlist Automation</span>
                </div>

                <div className="nav-links">

                    <NavLink to="/playlists" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Music size={20} />
                        <span>Playlists</span>
                    </NavLink>
                    <NavLink to="/schedules" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Calendar size={20} />
                        <span>Schedules</span>
                    </NavLink>
                    <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <HistoryIcon size={20} />
                        <span>History</span>
                    </NavLink>
                </div>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <span className="user-name">{auth.user_name || 'User'}</span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={18} />
                    </button>
                </div>
            </nav>

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    )
}
