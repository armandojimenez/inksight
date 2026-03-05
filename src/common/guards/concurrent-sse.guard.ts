import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

const DEFAULT_MAX_SSE_PER_IP = 5;

@Injectable()
export class ConcurrentSseGuard implements CanActivate {
  private readonly connections = new Map<string, number>();
  private readonly maxPerIp: number;

  constructor(private readonly configService: ConfigService) {
    this.maxPerIp = this.configService.get<number>(
      'MAX_SSE_PER_IP',
      DEFAULT_MAX_SSE_PER_IP,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const ip = req.ip ?? 'unknown';

    const current = this.connections.get(ip) ?? 0;
    if (current >= this.maxPerIp) {
      throw new HttpException(
        {
          message: `Too many concurrent SSE connections (max ${this.maxPerIp} per IP).`,
          code: 'SSE_CONNECTION_LIMIT',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.connections.set(ip, current + 1);

    let decremented = false;
    res.on('close', () => {
      if (decremented) return;
      decremented = true;
      const count = this.connections.get(ip) ?? 0;
      const next = Math.max(0, count - 1);
      if (next === 0) {
        this.connections.delete(ip);
      } else {
        this.connections.set(ip, next);
      }
    });

    return true;
  }
}
