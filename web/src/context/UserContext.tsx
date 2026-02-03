/**
 * User Context Provider
 *
 * React context that provides user state throughout the application.
 * Components can access the current user via the useUserContext hook.
 *
 * Current Implementation:
 * - Returns hardcoded default user (single-user mode)
 * - Always shows isLoading: false (no auth fetch required)
 *
 * Future Auth Implementation:
 * When adding authentication, this provider will:
 * 1. Check for existing auth token/session on mount
 * 2. Fetch user data from /api/auth/me if token exists
 * 3. Handle login/logout state transitions
 * 4. Persist auth state (localStorage/cookies)
 *
 * @example
 * ```tsx
 * // Wrap app in provider (main.tsx)
 * <UserProvider>
 *   <App />
 * </UserProvider>
 *
 * // Access user in components
 * function ProfileButton() {
 *   const { user, isLoading } = useUserContext();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!user) return <LoginButton />;
 *   return <span>Welcome, {user.name}</span>;
 * }
 * ```
 */

import {
  createContext,
  useContext,
  type ReactNode,
  // Future imports for auth implementation:
  // useState,
  // useEffect,
} from 'react';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * User type for the frontend.
 *
 * Note: This mirrors the backend User type but only includes
 * fields needed on the frontend. Sensitive fields (if any)
 * should not be exposed to the client.
 *
 * Future fields to consider:
 * - avatarUrl?: string
 * - email?: string (for display, not auth)
 * - preferences?: UserPreferences
 */
interface User {
  /** Unique identifier for the user */
  id: string;

  /** Display name for the user */
  name: string;
}

/**
 * Context value provided to consuming components.
 *
 * Future additions for auth:
 * - login: (credentials) => Promise<void>
 * - logout: () => Promise<void>
 * - refreshUser: () => Promise<void>
 * - error: Error | null
 */
interface UserContextType {
  /** Current authenticated user, or null if not logged in */
  user: User | null;

  /** True while fetching user data (e.g., on initial load) */
  isLoading: boolean;
}

// ============================================================================
// Context Creation
// ============================================================================

/**
 * React context for user state.
 * Initialized as undefined to detect usage outside provider.
 */
const UserContext = createContext<UserContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Props for the UserProvider component.
 */
interface UserProviderProps {
  children: ReactNode;
}

/**
 * User context provider component.
 *
 * Wrap your application with this provider to enable user context
 * throughout the component tree.
 *
 * @param props - Provider props containing children
 *
 * @example
 * ```tsx
 * // In main.tsx or App.tsx
 * function App() {
 *   return (
 *     <UserProvider>
 *       <Router>
 *         <Layout />
 *       </Router>
 *     </UserProvider>
 *   );
 * }
 * ```
 *
 * Future Auth Implementation:
 * ```tsx
 * export function UserProvider({ children }: UserProviderProps) {
 *   const [user, setUser] = useState<User | null>(null);
 *   const [isLoading, setIsLoading] = useState(true);
 *
 *   useEffect(() => {
 *     async function checkAuth() {
 *       try {
 *         const token = localStorage.getItem('auth_token');
 *         if (!token) {
 *           setIsLoading(false);
 *           return;
 *         }
 *
 *         const response = await fetch('/api/auth/me', {
 *           headers: { Authorization: `Bearer ${token}` }
 *         });
 *
 *         if (response.ok) {
 *           const userData = await response.json();
 *           setUser(userData);
 *         } else {
 *           // Token invalid, clear it
 *           localStorage.removeItem('auth_token');
 *         }
 *       } catch (error) {
 *         console.error('Auth check failed:', error);
 *       } finally {
 *         setIsLoading(false);
 *       }
 *     }
 *
 *     checkAuth();
 *   }, []);
 *
 *   return (
 *     <UserContext.Provider value={{ user, isLoading }}>
 *       {children}
 *     </UserContext.Provider>
 *   );
 * }
 * ```
 */
export function UserProvider({ children }: UserProviderProps) {
  // ---------------------------------------------------------------------------
  // Future: State management for auth
  // ---------------------------------------------------------------------------
  // const [user, setUser] = useState<User | null>(null);
  // const [isLoading, setIsLoading] = useState(true);
  // const [error, setError] = useState<Error | null>(null);

  // ---------------------------------------------------------------------------
  // Future: Fetch user on mount if auth token exists
  // ---------------------------------------------------------------------------
  // useEffect(() => {
  //   async function fetchCurrentUser() {
  //     const token = localStorage.getItem('auth_token');
  //     if (!token) {
  //       setIsLoading(false);
  //       return;
  //     }
  //
  //     try {
  //       const response = await fetch('/api/auth/me', {
  //         headers: { Authorization: `Bearer ${token}` }
  //       });
  //
  //       if (response.ok) {
  //         const userData = await response.json();
  //         setUser(userData);
  //       }
  //     } catch (err) {
  //       setError(err instanceof Error ? err : new Error('Auth failed'));
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   }
  //
  //   fetchCurrentUser();
  // }, []);

  // ---------------------------------------------------------------------------
  // Current: Hardcoded default user (single-user mode)
  // ---------------------------------------------------------------------------
  const user: User = {
    id: 'default-user',
    name: 'Default User',
  };

  // Context value provided to consuming components
  const value: UserContextType = {
    user,
    isLoading: false,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

// ============================================================================
// Context Hook
// ============================================================================

/**
 * Hook to access user context within components.
 *
 * This hook provides access to the current user state and must be
 * used within a component wrapped by UserProvider.
 *
 * @returns User context containing user data and loading state
 * @throws Error if used outside of UserProvider
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const { user, isLoading } = useUserContext();
 *
 *   if (isLoading) {
 *     return <div>Loading user data...</div>;
 *   }
 *
 *   if (!user) {
 *     return <div>Please log in to view your profile.</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h1>Welcome, {user.name}!</h1>
 *       <p>User ID: {user.id}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserContext(): UserContextType {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error(
      'useUserContext must be used within a UserProvider. ' +
      'Make sure your component is wrapped with <UserProvider>.'
    );
  }

  return context;
}
