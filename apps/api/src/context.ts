import { FastifyRequest } from 'fastify';
import { Infrastructure, Environment } from '@photoforge/shared/server';
import { BooksService } from './books';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      version: number;
    };
    user: {
      sub: string;
      version: number;
    };
  }
}

export type RouteContext = {
  infra: Infrastructure;
  env: Environment;
  books: BooksService;
  auth: (req: FastifyRequest) => Promise<void>;
};
