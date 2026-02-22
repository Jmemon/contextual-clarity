/**
 * Main Layout Component
 *
 * The primary layout wrapper for the application that provides:
 * - A sidebar with navigation links to all main sections
 * - Active route highlighting for current page indication
 * - Main content area using React Router's Outlet for nested routes
 * - App branding with logo/name in the sidebar header
 * - Mobile-responsive hamburger menu for smaller screens
 *
 * This layout is used by most pages except for full-screen experiences
 * like the LiveSession page which renders without chrome/navigation.
 *
 * Responsive behavior:
 * - Desktop (lg+): Fixed sidebar visible, content area beside it
 * - Mobile/Tablet (<lg): Sidebar hidden, hamburger menu in header,
 *   sidebar slides in as overlay when opened
 *
 * @example
 * ```tsx
 * // In router configuration
 * <Route element={<MainLayout />}>
 *   <Route path="/" element={<RecallSets />} />
 *   <Route path="/dashboard" element={<Dashboard />} />
 * </Route>
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Clock, BarChart3, type LucideIcon } from 'lucide-react';

// ============================================================================
// Navigation Configuration
// ============================================================================

/**
 * Navigation item definition for sidebar links.
 * Each item represents a main section of the application.
 */
interface NavItem {
  path: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Main navigation items displayed in the sidebar.
 * Order determines the display order in the navigation list.
 */
const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Recall Sets', Icon: BookOpen },
  { path: '/sessions', label: 'Sessions', Icon: Clock },
  { path: '/dashboard', label: 'Dashboard', Icon: BarChart3 },
];

// ============================================================================
// Icon Components
// ============================================================================

/**
 * Hamburger menu icon (three horizontal lines).
 * Used for mobile menu toggle button when sidebar is closed.
 */
function HamburgerIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

/**
 * Close/X icon for closing the mobile sidebar.
 */
function CloseIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Logo component for the sidebar header.
 * Displays the application name with dark theme branding.
 */
function Logo() {
  return (
    <div className="flex items-center gap-3 px-4 py-6 border-b border-slate-800/50">
      <div>
        <h1 className="text-lg font-semibold text-white">
          Contextual
        </h1>
        <p className="text-sm text-clarity-400 -mt-1">
          Clarity
        </p>
      </div>
    </div>
  );
}

/**
 * Mobile header component shown on small screens.
 * Contains hamburger menu button and app branding.
 *
 * @param onMenuToggle - Callback function to toggle the mobile sidebar
 */
function MobileHeader({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-950 border-b border-slate-800/50 px-4 py-3 flex items-center justify-between">
      <button
        type="button"
        onClick={onMenuToggle}
        className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-offset-2 focus:ring-offset-slate-950 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Open navigation menu"
      >
        <HamburgerIcon />
      </button>

      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">Contextual</span>
        <span className="font-semibold text-clarity-400">Clarity</span>
      </div>

      <div className="w-[44px]" aria-hidden="true" />
    </header>
  );
}

/**
 * Single navigation link component with active state styling.
 * Uses NavLink from React Router for automatic active class handling.
 * Dark theme with Lucide icons and left-border accent for active state.
 *
 * @param item - Navigation item configuration
 * @param onClick - Optional click handler (used for closing mobile menu)
 */
function NavItemLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-all duration-200 min-h-[44px] ${
          isActive
            ? 'text-white border-l-[3px] border-clarity-500 bg-slate-800/50 ml-0 pl-[13px]'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        } focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-inset`
      }
    >
      <item.Icon className="w-5 h-5" strokeWidth={1.5} />
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
 * - Desktop: Fixed-width sidebar (256px) on the left with navigation
 * - Mobile: Sidebar hidden, accessible via hamburger menu overlay
 * - Flexible main content area on the right
 * - Full viewport height with overflow handling
 *
 * Responsive behavior:
 * - Uses CSS transforms and opacity for smooth sidebar animations
 * - Overlay backdrop on mobile when sidebar is open
 * - Automatically closes sidebar on route change (mobile)
 */
export function MainLayout() {
  // Track whether the mobile sidebar is open
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Get current location to detect route changes
  const location = useLocation();

  /**
   * Toggle the mobile sidebar open/closed state.
   * Uses useCallback to prevent unnecessary re-renders.
   */
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  /**
   * Close the mobile sidebar.
   * Called when clicking outside, selecting a nav item, or pressing Escape.
   */
  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  /**
   * Close sidebar when route changes (user navigates via nav link).
   * This provides better UX on mobile by automatically hiding the menu.
   */
  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  /**
   * Handle Escape key to close sidebar.
   * Provides keyboard accessibility for closing the mobile menu.
   */
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isSidebarOpen) {
        closeSidebar();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isSidebarOpen, closeSidebar]);

  /**
   * Prevent body scroll when mobile sidebar is open.
   * This improves UX by keeping focus on the navigation overlay.
   */
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Mobile header with hamburger menu - visible only on mobile/tablet */}
      <MobileHeader onMenuToggle={toggleSidebar} />

      {/* Backdrop overlay for mobile sidebar - click to close */}
      {/* Uses opacity transition for smooth fade in/out */}
      <div
        className={`
          fixed inset-0 bg-black/50 z-40 lg:hidden
          transition-opacity duration-300 ease-in-out
          ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* Sidebar navigation panel */}
      {/* Desktop: Always visible, fixed position */}
      {/* Mobile: Slides in from left as overlay when open */}
      <aside
        data-testid="sidebar"
        className={`
          fixed lg:sticky top-0 left-0 z-50
          w-64 h-screen bg-slate-950 border-r border-slate-800/50
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        aria-label="Main navigation sidebar"
      >
        {/* Close button for mobile - positioned in top right of sidebar */}
        <button
          type="button"
          onClick={closeSidebar}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-offset-slate-950 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close navigation menu"
        >
          <CloseIcon />
        </button>

        {/* App branding/logo at the top */}
        <Logo />

        {/* Navigation links in the middle, grows to fill available space */}
        <nav className="flex-1 py-4 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.path} item={item} onClick={closeSidebar} />
          ))}
        </nav>

        {/* Footer area at the bottom of sidebar */}
        <div className="px-4 py-4 border-t border-slate-800/50">
          <p className="text-xs text-slate-600 text-center">
            Contextual Clarity v0.1.0
          </p>
        </div>
      </aside>

      {/* Main content area - flexible width, scrollable */}
      {/* On mobile, adds top padding to account for fixed header */}
      <main className="flex-1 overflow-auto pt-16 lg:pt-0">
        {/* Outlet renders the matched child route's component */}
        {/* All nested routes within MainLayout will render here */}
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
