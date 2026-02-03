/**
 * User Hook
 *
 * Convenience re-export of useUserContext for cleaner imports.
 * Components can import useUser instead of the more verbose useUserContext.
 *
 * This pattern allows for:
 * 1. Cleaner import statements in components
 * 2. Future flexibility to enhance the hook without changing imports
 * 3. Consistent hook naming convention (use-*)
 *
 * @example
 * ```tsx
 * // Instead of:
 * import { useUserContext } from '../context/UserContext';
 *
 * // Use:
 * import { useUser } from '../hooks/use-user';
 *
 * function MyComponent() {
 *   const { user, isLoading } = useUser();
 *   // ...
 * }
 * ```
 *
 * Future Enhancement Example:
 * ```typescript
 * // The hook could be enhanced to provide additional functionality
 * export function useUser() {
 *   const context = useUserContext();
 *
 *   // Add computed properties
 *   const isLoggedIn = context.user !== null;
 *   const displayName = context.user?.name ?? 'Guest';
 *
 *   // Add memoized values
 *   const userInitials = useMemo(() => {
 *     if (!context.user?.name) return '?';
 *     return context.user.name
 *       .split(' ')
 *       .map(n => n[0])
 *       .join('')
 *       .toUpperCase();
 *   }, [context.user?.name]);
 *
 *   return {
 *     ...context,
 *     isLoggedIn,
 *     displayName,
 *     userInitials,
 *   };
 * }
 * ```
 */

export { useUserContext as useUser } from '../context/UserContext';
