/**
 * Base Repository Interface for Contextual Clarity
 *
 * This module defines the generic repository interface that all entity
 * repositories implement. The Repository pattern abstracts data access
 * operations, allowing business logic to work with domain models without
 * knowing the specifics of the underlying data store (Drizzle ORM + SQLite).
 *
 * Benefits of this pattern:
 * - Testability: Repositories can be mocked for unit testing
 * - Flexibility: Storage implementation can change without affecting business logic
 * - Type safety: Strong typing ensures domain models are used correctly
 * - Separation of concerns: Data access logic is isolated from business logic
 */

/**
 * Generic repository interface defining standard CRUD operations.
 *
 * All entity repositories implement this interface, providing a consistent
 * API for data access across different entity types.
 *
 * @typeParam T - The domain model type returned by the repository
 * @typeParam CreateInput - The type for creating new entities (typically Omit<T, 'id' | 'createdAt' | 'updatedAt'>)
 * @typeParam UpdateInput - The type for updating entities (typically Partial<CreateInput>)
 *
 * @example
 * ```typescript
 * class UserRepository implements Repository<User, CreateUserInput, UpdateUserInput> {
 *   async findById(id: string): Promise<User | null> {
 *     // implementation
 *   }
 *   // ... other methods
 * }
 * ```
 */
export interface Repository<T, CreateInput, UpdateInput> {
  /**
   * Retrieves an entity by its unique identifier.
   *
   * @param id - The unique identifier of the entity
   * @returns The domain model if found, or null if not found
   */
  findById(id: string): Promise<T | null>;

  /**
   * Retrieves all entities of this type.
   *
   * Note: For large datasets, consider using pagination methods
   * instead of findAll to avoid memory issues.
   *
   * @returns Array of all domain models (may be empty)
   */
  findAll(): Promise<T[]>;

  /**
   * Creates a new entity and persists it to the database.
   *
   * @param input - The data for creating the new entity
   * @returns The created domain model with generated id and timestamps
   */
  create(input: CreateInput): Promise<T>;

  /**
   * Updates an existing entity with partial data.
   *
   * @param id - The unique identifier of the entity to update
   * @param input - The partial data to update (only specified fields are changed)
   * @returns The updated domain model
   * @throws Error if the entity with the given id does not exist
   */
  update(id: string, input: UpdateInput): Promise<T>;

  /**
   * Permanently deletes an entity from the database.
   *
   * @param id - The unique identifier of the entity to delete
   * @throws Error if the entity with the given id does not exist
   */
  delete(id: string): Promise<void>;
}
