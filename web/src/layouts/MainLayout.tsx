/**
 * Main Layout Component
 *
 * The primary layout wrapper for the application that provides:
 * - A sidebar with navigation links to all main sections
 * - Active route highlighting for current page indication
 * - Main content area using React Router's Outlet for nested routes
 * - App branding with logo/name in the sidebar header
 *
 * This layout is used by most pages except for full-screen experiences
 * like the LiveSession page which renders without chrome/navigation.
 *
 * @example
 * ```tsx
 * // In router configuration
 * <Route element={<MainLayout />}>
 *   <Route path="/" element={<Dashboard />} />
 *   <Route path="/recall-sets" element={<RecallSets />} />
 * </Route>
 * ```
 */

import { NavLink, Outlet } from 'react-router-dom';

// ============================================================================
// Navigation Configuration
// ============================================================================

/**
 * Navigation item definition for sidebar links.
 * Each item represents a main section of the application.
 */
interface NavItem {
  /** URL path for the route */
  path: string;
  /** Display label shown in the sidebar */
  label: string;
  /** Icon character or emoji for visual identification */
  icon: string;
}

/**
 * Main navigation items displayed in the sidebar.
 * Order determines the display order in the navigation list.
 */
const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/recall-sets', label: 'Recall Sets', icon: '📚' },
  { path: '/sessions', label: 'Sessions', icon: '🕐' },
];

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Logo component for the sidebar header.
 * Displays the application name with branding styling.
 */
function Logo() {
  return (
    <div className="flex items-center gap-3 px-4 py-6 border-b border-clarity-200">
      {/* Logo icon - a stylized brain/memory symbol */}
      <div className="w-10 h-10 rounded-lg bg-clarity-600 flex items-center justify-center text-white text-xl font-bold">
        CC
      </div>
      {/* Application name */}
      <div>
        <h1 className="text-lg font-semibold text-clarity-800">
          Contextual
        </h1>
        <p className="text-sm text-clarity-600 -mt-1">
          Clarity
        </p>
      </div>
    </div>
  );
}

/**
 * Single navigation link component with active state styling.
 * Uses NavLink from React Router for automatic active class handling.
 *
 * @param item - Navigation item configuration
 */
function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.path}
      // end prop ensures exact matching for the root path "/"
      // Without it, "/" would be active for all routes
      end={item.path === '/'}
      className={({ isActive }) =>
        // Base styles for all nav items
        `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors duration-150 ${
          isActive
            // Active state: highlighted background and bold text
            ? 'bg-clarity-100 text-clarity-800 font-medium'
            // Inactive state: subtle hover effect
            : 'text-clarity-600 hover:bg-clarity-50 hover:text-clarity-700'
        }`
      }
    >
      {/* Icon displayed to the left of the label */}
      <span className="text-lg">{item.icon}</span>
      {/* Navigation label text */}
      <span>{item.label}</span>
    </NavLink>
  );
}

// ============================================================================
// Main Layout Component
// ============================================================================

/**
 * Main layout component providing the application shell.
 *
 * Structure:
 * - Fixed-width sidebar (256px) on the left with navigation
 * - Flexible main content area on the right
 * - Full viewport height with overflow handling
 */
export function MainLayout() {
  return (
    <div className="flex min-h-screen bg-clarity-50">
      {/* Sidebar - fixed width navigation panel */}
      <aside className="w-64 bg-white border-r border-clarity-200 flex flex-col">
        {/* App branding/logo at the top */}
        <Logo />

        {/* Navigation links in the middle, grows to fill available space */}
        <nav className="flex-1 py-4" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.path} item={item} />
          ))}
        </nav>

        {/* Footer area at the bottom of sidebar */}
        <div className="px-4 py-4 border-t border-clarity-200">
          <p className="text-xs text-clarity-400 text-center">
            Contextual Clarity v0.1.0
          </p>
        </div>
      </aside>

      {/* Main content area - flexible width, scrollable */}
      <main className="flex-1 overflow-auto">
        {/* Outlet renders the matched child route's component */}
        {/* All nested routes within MainLayout will render here */}
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
