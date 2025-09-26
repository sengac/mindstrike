import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError(error => {
        const ctx = context.switchToHttp();
        const request = ctx.getRequest();
        const response = ctx.getResponse();

        // Log the error
        this.logger.error(
          `Error in ${request.method} ${request.url}:`,
          error.stack || error
        );

        // Handle different error types
        if (error instanceof HttpException) {
          // NestJS HTTP exceptions pass through
          return throwError(() => error);
        }

        // Handle Node.js file system errors
        if (error.code === 'ENOENT') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.NOT_FOUND,
                  message: 'Resource not found',
                  error: error.message,
                },
                HttpStatus.NOT_FOUND
              )
          );
        }

        if (error.code === 'EACCES' || error.code === 'EPERM') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.FORBIDDEN,
                  message: 'Permission denied',
                  error: error.message,
                },
                HttpStatus.FORBIDDEN
              )
          );
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.BAD_REQUEST,
                  message: 'Validation failed',
                  errors: error.errors || error.message,
                },
                HttpStatus.BAD_REQUEST
              )
          );
        }

        // Default error response
        const status = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error.message || 'Internal server error';

        return throwError(
          () =>
            new HttpException(
              {
                statusCode: status,
                message: message,
                timestamp: new Date().toISOString(),
                path: request.url,
              },
              status
            )
        );
      })
    );
  }
}
