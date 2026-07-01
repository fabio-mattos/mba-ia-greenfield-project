export abstract class DomainException extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Auth exceptions
export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 409, 'Email is already registered');
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class EmailNotConfirmedException extends DomainException {
  constructor() {
    super('EMAIL_NOT_CONFIRMED', 403, 'Email address has not been confirmed');
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super('INVALID_TOKEN', 401, 'Token is invalid');
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('TOKEN_EXPIRED', 401, 'Token has expired');
  }
}

export class TokenReuseDetectedException extends DomainException {
  constructor() {
    super(
      'TOKEN_REUSE_DETECTED',
      401,
      'Token reuse detected — all sessions revoked',
    );
  }
}

// Video exceptions
export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 422, 'Video is not ready for streaming');
  }
}

export class VideoAlreadyProcessingException extends DomainException {
  constructor() {
    super(
      'VIDEO_ALREADY_PROCESSING',
      409,
      'Video upload has already been confirmed',
    );
  }
}

export class NotVideoOwnerException extends DomainException {
  constructor() {
    super('NOT_VIDEO_OWNER', 403, 'You do not own this video');
  }
}

// Channel exceptions
export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Channel not found');
  }
}

export class NicknameAlreadyTakenException extends DomainException {
  constructor() {
    super('NICKNAME_ALREADY_TAKEN', 409, 'Nickname is already taken');
  }
}

// Category exceptions
export class CategoryNotFoundException extends DomainException {
  constructor() {
    super('CATEGORY_NOT_FOUND', 404, 'Category not found');
  }
}

// Comment exceptions
export class CommentNotFoundException extends DomainException {
  constructor() {
    super('COMMENT_NOT_FOUND', 404, 'Comment not found');
  }
}

export class NotCommentAuthorException extends DomainException {
  constructor() {
    super('NOT_COMMENT_AUTHOR', 403, 'You did not write this comment');
  }
}

export class CommentNestingNotAllowedException extends DomainException {
  constructor() {
    super(
      'COMMENT_NESTING_NOT_ALLOWED',
      422,
      'Replies to replies are not allowed',
    );
  }
}
