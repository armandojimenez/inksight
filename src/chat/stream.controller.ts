import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { drainOrAbort } from './drain-or-abort';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { RequestWithCorrelation } from '@/common/interfaces/request.interface';
import { buildErrorResponse } from '@/common/utils/build-error-response';

const DEFAULT_SSE_TIMEOUT_MS = 30_000;
const MAX_SSE_TIMEOUT_MS = 120_000;

function clampTimeout(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SSE_TIMEOUT_MS;
  }
  return Math.min(raw, MAX_SSE_TIMEOUT_MS);
}

@Controller('chat-stream')
export class StreamController {
  private readonly logger = new Logger(StreamController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
  ) {}

  @Post(':imageId')
  async chatStream(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const abortController = new AbortController();
    const { signal } = abortController;
    const correlatedReq = req as RequestWithCorrelation;
    const requestId = correlatedReq.correlationId ?? 'unknown';
    const startTime = Date.now();

    // Wire disconnect detection — res.on('close') is more appropriate for SSE
    // since we are writing to the response stream
    res.on('close', () => abortController.abort());

    // Wire timeout — only calls abort(), never writes to res directly
    const rawTimeout = parseInt(
      String(this.configService.get('SSE_TIMEOUT_MS') ?? ''),
      10,
    );
    const timeoutMs = clampTimeout(rawTimeout);
    const timeoutHandle = setTimeout(() => {
      this.logger.warn(`[${requestId}] SSE stream timed out after ${timeoutMs}ms`);
      abortController.abort();
    }, timeoutMs);

    let headersSent = false;

    try {
      // Phase 1: Validate image + get generator (pre-streaming)
      // NotFoundException here → headers not sent → manual JSON error below
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
        const body = buildErrorResponse(err, req.url, requestId);
        res.status(body.statusCode).json(body);
        return;
      }

      if (!signal.aborted) {
        // Headers sent, stream still active — write SSE error event
        this.logger.error(
          `[${requestId}] SSE stream error after headers sent: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
        res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      }
      // NEVER rethrow after headers sent (causes ERR_HTTP_HEADERS_SENT)
    } finally {
      clearTimeout(timeoutHandle);
      const duration = Date.now() - startTime;
      this.logger.log(
        `[${requestId}] SSE stream ended — ${duration}ms${signal.aborted ? ' (aborted)' : ''}`,
      );
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
