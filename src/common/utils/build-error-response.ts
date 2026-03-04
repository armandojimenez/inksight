import { HttpException } from '@nestjs/common';
import { STATUS_CODES } from 'http';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  timestamp: string;
  path: string;
  requestId: string;
}

interface ExceptionResponseObject {
  message?: string | string[];
  code?: string;
}

export function buildErrorResponse(
  exception: unknown,
  path: string,
  requestId: string,
): ErrorResponseBody {
  let status = 500;
  let error = 'Internal Server Error';
  let message = 'Internal Server Error';
  let code = 'INTERNAL_ERROR';

  if (exception instanceof HttpException) {
    status = exception.getStatus();
    error = STATUS_CODES[status] ?? 'Internal Server Error';

    const exceptionResponse = exception.getResponse();
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      code = error.toUpperCase().replace(/\s+/g, '_');
    } else {
      const responseObj = exceptionResponse as ExceptionResponseObject;
      const rawMessage = responseObj.message ?? exception.message;
      message = Array.isArray(rawMessage) ? rawMessage.join('; ') : rawMessage;
      code = responseObj.code ?? error.toUpperCase().replace(/\s+/g, '_');
    }
  } else if (exception instanceof Error) {
    message =
      process.env.NODE_ENV === 'development'
        ? exception.message
        : 'Internal Server Error';
  }

  return {
    statusCode: status,
    error,
    code,
    message,
    timestamp: new Date().toISOString(),
    path,
    requestId,
  };
}
