import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { RequestWithCorrelation } from '@/common/interfaces/request.interface';

const DEFAULT_SSE_TIMEOUT_MS = 30_000;

async function drainOrAbort(
  res: Response,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onDrain = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      res.removeListener('drain', onDrain);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    res.once('drain', onDrain);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

@Controller('chat-stream')
export class StreamController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':imageId')
  async chatStream(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const abortController = new AbortController();
    const { signal } = abortController;

    // Wire disconnect detection
    req.on('close', () => abortController.abort());

    // Wire timeout — only calls abort(), never writes to res
    const timeoutMs =
      parseInt(process.env.SSE_TIMEOUT_MS ?? '', 10) ||
      DEFAULT_SSE_TIMEOUT_MS;
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    let headersSent = false;

    try {
      // Phase 1: Validate image + get generator (pre-streaming)
      // NotFoundException here → headers not sent → rethrow → HttpExceptionFilter
      const generator = await this.chatService.chatStream(
        imageId,
        dto.message,
        signal,
      );

      // Phase 2: Set SSE headers + flush
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      headersSent = true;

      // Phase 3: Stream chunks
      for await (const chunk of generator) {
        if (signal.aborted) break;

        const ok = res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (!ok && !signal.aborted) {
          try {
            await drainOrAbort(res, signal);
          } catch (err) {
            if (
              err instanceof DOMException &&
              err.name === 'AbortError'
            ) {
              break;
            }
            throw err;
          }
        }
      }

      // Phase 4: [DONE] sentinel — only if not aborted
      if (!signal.aborted) {
        res.write('data: [DONE]\n\n');
      }
    } catch (err) {
      if (!headersSent) {
        // Headers not sent — produce JSON error matching HttpExceptionFilter shape.
        // @Res() puts NestJS in library-specific mode, so we handle errors manually.
        const correlatedReq = req as RequestWithCorrelation;
        const requestId = correlatedReq.correlationId ?? 'unknown';

        if (err instanceof HttpException) {
          const status = err.getStatus();
          const exceptionResponse = err.getResponse();
          const errorLabel = STATUS_CODES[status] ?? 'Internal Server Error';

          let message: string;
          let code: string;
          if (typeof exceptionResponse === 'string') {
            message = exceptionResponse;
            code = errorLabel.toUpperCase().replace(/\s+/g, '_');
          } else {
            const obj = exceptionResponse as { message?: string | string[]; code?: string };
            const rawMsg = obj.message ?? err.message;
            message = Array.isArray(rawMsg) ? rawMsg.join('; ') : rawMsg;
            code = obj.code ?? errorLabel.toUpperCase().replace(/\s+/g, '_');
          }

          res.status(status).json({
            statusCode: status,
            error: errorLabel,
            code,
            message,
            timestamp: new Date().toISOString(),
            path: req.url,
            requestId,
          });
        } else {
          res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: 500,
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            message: 'Internal Server Error',
            timestamp: new Date().toISOString(),
            path: req.url,
            requestId,
          });
        }
        return;
      }

      if (!signal.aborted) {
        // Headers sent, stream still active — write SSE error event
        res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      }
      // NEVER rethrow after headers sent (causes ERR_HTTP_HEADERS_SENT)
    } finally {
      clearTimeout(timeoutHandle);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
