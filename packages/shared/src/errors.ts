export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions for this workspace resource') {
    super(message, 403, 'FORBIDDEN_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} (${identifier}) not found` : `${resource} not found`,
      404,
      'NOT_FOUND_ERROR',
    );
  }
}

export class QuotaExceededError extends AppError {
  constructor(quotaName: string) {
    super(`Workspace quota exceeded for ${quotaName}`, 429, 'QUOTA_EXCEEDED_ERROR');
  }
}

export class ExternalProviderError extends AppError {
  constructor(providerName: string, message: string, details?: unknown) {
    super(`[${providerName}] ${message}`, 502, 'EXTERNAL_PROVIDER_ERROR', details);
  }
}
