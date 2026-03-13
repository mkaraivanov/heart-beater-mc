/**
 * App — top-level router.
 *
 * Routes:
 *   /        → Dashboard (live BPM + active rule)
 *   /rules   → RuleConfig (add / edit / delete threshold rules)
 */

import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Dashboard } from './views/Dashboard.tsx';
import { RuleConfig } from './views/RuleConfig.tsx';
import { SpotifyAuthBanner } from './components/SpotifyAuthBanner.tsx';

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-100'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Spotify auth banner — only visible when not authenticated */}
        <SpotifyAuthBanner />

        {/* Top nav */}
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-xl" aria-hidden="true">
                ♥
              </span>
              <span className="font-bold text-gray-900 tracking-tight">
                Heart Beater MC
              </span>
            </div>
            <nav className="flex items-center gap-1">
              <NavItem to="/" label="Dashboard" />
              <NavItem to="/rules" label="Rules" />
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6">
          <div className="max-w-2xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/rules" element={<RuleConfig />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
