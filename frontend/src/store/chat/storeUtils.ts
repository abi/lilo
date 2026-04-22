const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error && /chat not found|status 404/i.test(error.message);

export { isNotFoundError };
