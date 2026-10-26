import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import Fastify from 'fastify';
import {
  registerSchema,
  credentialsSchema,
  createBookSchema,
  saveBookSchema,
  uploadSchema,
  orderSchema,
} from '../packages/shared/src';
import { authBody } from '../apps/api/src/schemas';

test('server compiler settings resolve the shared package server export', () => {
  const root = path.resolve(__dirname, '..');
  const directory = mkdtempSync(path.join(tmpdir(), 'photoforge-exports-'));

  try {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.base.json'), ts.sys.readFile);

    expect(config.error).toBeUndefined();
    const { options, errors } = ts.convertCompilerOptionsFromJson(
      config.config.compilerOptions,
      root,
    );

    expect(errors).toHaveLength(0);
    const packageDirectory = path.join(directory, 'node_modules/@photoforge/shared');

    mkdirSync(path.join(packageDirectory, 'dist'), { recursive: true });
    writeFileSync(
      path.join(packageDirectory, 'package.json'),
      readFileSync(path.join(root, 'packages/shared/package.json')),
    );
    writeFileSync(
      path.join(packageDirectory, 'dist/server.d.ts'),
      'export declare const fixture: unique symbol;\n',
    );
    const resolved = ts.resolveModuleName(
      '@photoforge/shared/server',
      path.join(directory, 'consumer.ts'),
      options,
      ts.sys,
    ).resolvedModule;

    expect(resolved?.resolvedFileName).toBe(path.join(packageDirectory, 'dist/server.d.ts'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('all request contracts compile as Fastify runtime schemas', async () => {
  const server = Fastify();

  try {
    const contracts = [
      registerSchema,
      credentialsSchema,
      createBookSchema,
      saveBookSchema,
      uploadSchema,
      orderSchema,
    ];

    contracts.forEach((contract, index) =>
      server.post(`/contract/${index}`, { schema: authBody(contract) }, async () => ({
        accepted: true,
      })),
    );
    await server.ready();
    const accepted = await server.inject({
      method: 'POST',
      url: '/contract/4',
      payload: {
        filename: 'photo.jpg',
        mime: 'image/jpeg',
        size: 100,
      },
    });

    expect(accepted.statusCode).toBe(200);
    const rejected = await server.inject({
      method: 'POST',
      url: '/contract/4',
      payload: {
        filename: 'photo.jpg',
        mime: 'image/jpeg',
        size: 0,
      },
    });

    expect(rejected.statusCode).toBe(400);
  } finally {
    await server.close();
  }
});
