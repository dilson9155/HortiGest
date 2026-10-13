// Wrapper para Route Handlers do Next.js: converte HttpError em JSON padronizado.

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError, apiErr, apiOk, type ApiResult } from './session';

export type Handler<T> = (req: Request, ctx?: any) => Promise<T> | T;

export function handler<T>(fn: Handler<T>) {
  return async (req: Request, ctx?: any): Promise<NextResponse> => {
    try {
      const result = await fn(req, ctx);
      if (result instanceof NextResponse) return result;
      return NextResponse.json(apiOk(result) as ApiResult<T>);
    } catch (err: any) {
      if (err instanceof HttpError) {
        const e = apiErr(err.status, err.code, err.message, err.details);
        return NextResponse.json(e.body as ApiResult<never>, { status: e.status });
      }
      if (err instanceof ZodError) {
        const e = apiErr(400, 'VALIDATION_ERROR', 'Dados inválidos.', err.issues);
        return NextResponse.json(e.body as ApiResult<never>, { status: 400 });
      }
      if (err?.code === 'P2002') {
        const e = apiErr(409, 'DUPLICADO', 'Registro duplicado.');
        return NextResponse.json(e.body as ApiResult<never>, { status: 409 });
      }
      // eslint-disable-next-line no-console
      console.error('Erro na rota:', err);
      const e = apiErr(500, 'ERRO_INTERNO', 'Erro interno do servidor.');
      return NextResponse.json(e.body as ApiResult<never>, { status: 500 });
    }
  };
}
