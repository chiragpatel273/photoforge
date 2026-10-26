import { z } from 'zod/v3';

export const MAX_UPLOAD = 20 * 1024 * 1024;
export const mimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(1).max(80) });
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const base = {
  id: z.string().uuid(),
  x: z.number().min(-2400).max(2400),
  y: z.number().min(-2400).max(2400),
  width: z.number().positive().max(2400),
  height: z.number().positive().max(2400),
  rotation: z.number().min(-360).max(360),
};
export const elementSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('placeholder'),
    label: z.string().max(80),
  }),
  z.object({
    ...base,
    type: z.literal('image'),
    assetId: z.string().uuid(),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .refine(
        (c) => c.x + c.width <= 1.001 && c.y + c.height <= 1.001,
        'Crop exceeds image bounds',
      ),
  }),
  z.object({
    ...base,
    type: z.literal('text'),
    text: z
      .string()
      .max(2000)
      .regex(
        /^[\x20-\x7e\n\r\t\u00a0-\u00ff]*$/,
        'PDF text supports Latin characters; use an image for other scripts',
      ),
    fontSize: z.number().min(8).max(180),
    fontFamily: z.enum(['Helvetica', 'Times-Roman', 'Courier']),
    color,
    align: z.enum(['left', 'center', 'right']),
  }),
]);
export const pageSchema = z.object({
  id: z.string().uuid(),
  background: color,
  elements: z.array(elementSchema).max(100),
});
export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    widthMm: z.number().min(100).max(420),
    heightMm: z.number().min(100).max(420),
    bleedMm: z.number().min(0).max(5),
    pages: z.array(pageSchema).min(1).max(80),
  })
  .superRefine((d, c) => {
    const ids = d.pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)]);

    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: 'custom', message: 'Document IDs must be unique' });
  });

export type BookDocument = z.infer<typeof documentSchema>;

export type Page = z.infer<typeof pageSchema>;

export type Element = z.infer<typeof elementSchema>;

export const createBookSchema = z.object({
  title: z.string().trim().min(1).max(120),
  templateId: z.string().min(1).max(100),
});
export const saveBookSchema = z.object({
  title: z.string().trim().min(1).max(120),
  revision: z.number().int().nonnegative(),
  document: documentSchema,
});
export const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  mime: mimeSchema,
  size: z.number().int().positive().max(MAX_UPLOAD),
});
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().max(100).default(''),
});
export const orderSchema = z.object({
  bookId: z.string().uuid(),
  size: z.enum(['square', 'landscape', 'large']),
  pageCount: z.number().int().min(1).max(80),
  idempotencyKey: z.string().uuid(),
});

export type OrderRequest = z.infer<typeof orderSchema>;

export type ProductSize = OrderRequest['size'];

export { priceCents, sizes, resolutionDpi, jobOptions } from './domain';

export type Asset = {
  id: string;
  filename: string;
  status: string;
  width: number | null;
  height: number | null;
  url?: string;
  thumbnailUrl?: string;
  error?: string | null;
};

export type Book = {
  id: string;
  title: string;
  revision: number;
  document: BookDocument;
  updatedAt: string;
  status: string;
};

export function referencedAssets(doc: BookDocument): string[] {
  return [
    ...new Set(
      doc.pages.flatMap((p) => p.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : []))),
    ),
  ];
}

export function emptyDocument(): BookDocument {
  return {
    schemaVersion: 1,
    widthMm: 210,
    heightMm: 210,
    bleedMm: 3,
    pages: [
      {
        id: crypto.randomUUID(),
        background: '#f6f1e9',
        elements: [],
      },
    ],
  };
}

export const templates = [
  {
    id: 'travel',
    name: 'Somewhere, together',
    category: 'Travel',
    description: 'For the places that stay with you.',
    color: '#e7eddf',
    accent: '#486047',
    subtitle: 'A collection of little adventures',
    title: 'THE LONG WAY HOME',
  },
  {
    id: 'wedding',
    name: 'The beginning of always',
    category: 'Wedding',
    description: 'A beautiful beginning, bound forever.',
    color: '#efe5dc',
    accent: '#775d52',
    subtitle: 'Our favourite chapter',
    title: 'YOU & ME',
  },
  {
    id: 'family',
    name: 'Our kind of ordinary',
    category: 'Family',
    description: 'The everyday moments that mean everything.',
    color: '#e6e2da',
    accent: '#746a54',
    subtitle: 'The beautiful everyday',
    title: 'LIFE, LATELY',
  },
  {
    id: 'birthday',
    name: 'Another trip around the sun',
    category: 'Birthday',
    description: 'Big wishes. Even bigger memories.',
    color: '#f4e7d2',
    accent: '#9d653b',
    subtitle: 'Good times, kept forever',
    title: 'MAKE A WISH',
  },
  {
    id: 'minimal',
    name: 'Less, but more',
    category: 'Minimal',
    description: 'Quiet pages. Remarkable stories.',
    color: '#e8e9e7',
    accent: '#424a45',
    subtitle: 'Selected moments',
    title: 'A MOMENT IN TIME',
  },
] as const;

export function templateDocument(id: string): BookDocument {
  const t = templates.find((t) => t.id === id) ?? templates[0];
  const d = emptyDocument();

  d.pages[0]!.background = t.color;
  d.pages[0]!.elements = [
    {
      id: crypto.randomUUID(),
      type: 'placeholder',
      label: 'Drop a memory here',
      x: 90,
      y: 90,
      width: 820,
      height: 620,
      rotation: 0,
    },
    {
      id: crypto.randomUUID(),
      type: 'text',
      x: 90,
      y: 760,
      width: 820,
      height: 110,
      rotation: 0,
      text: t.title,
      fontSize: 46,
      fontFamily: 'Times-Roman',
      color: t.accent,
      align: 'center',
    },
    {
      id: crypto.randomUUID(),
      type: 'text',
      x: 100,
      y: 880,
      width: 800,
      height: 50,
      rotation: 0,
      text: t.subtitle,
      fontSize: 19,
      fontFamily: 'Helvetica',
      color: t.accent,
      align: 'center',
    },
  ];
  d.pages.push({
    id: crypto.randomUUID(),
    background: '#ffffff',
    elements: [
      {
        id: crypto.randomUUID(),
        type: 'placeholder',
        label: 'Your story continues',
        x: 80,
        y: 80,
        width: 840,
        height: 840,
        rotation: 0,
      },
    ],
  });

  return d;
}
