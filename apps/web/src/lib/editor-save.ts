import { documentSchema, type BookDocument } from '@photoforge/shared';

export type EditorSaveState = {
  bookId: string;
  title: string;
  document: BookDocument | null;
  revision: number;
  sequence: number;
  savedSequence: number;
  acknowledge: (revision: number, sequence: number) => void;
};

type SaveInput = { title: string; revision: number; document: BookDocument };

type SaveOptions = {
  bookId: string;
  read: () => EditorSaveState;
  write: (bookId: string, input: SaveInput) => Promise<{ revision: number }>;
  onStart?: () => void;
  onSuccess?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
};

/** Serialize saves and retain edits made while a request is in flight. */
export function createEditorSaver(options: SaveOptions): () => Promise<void> {
  let pending: Promise<void> | null = null;

  return function save() {
    if (pending) return pending;

    // Schedule work after assigning `pending`, including synchronous validation.
    // Otherwise a synchronous failure can clear the slot before its rejected
    // promise is assigned, preventing every subsequent save from recovering.
    const operation = Promise.resolve().then(async () => {
      options.onStart?.();
      try {
        while (true) {
          const state = options.read();
          if (
            state.bookId !== options.bookId ||
            !state.document ||
            state.sequence === state.savedSequence
          )
            break;

          const sequence = state.sequence;
          const result = await options.write(options.bookId, {
            title: state.title,
            revision: state.revision,
            document: documentSchema.parse(state.document),
          });

          if (options.read().bookId !== options.bookId) break;
          options.read().acknowledge(result.revision, sequence);
        }
        await options.onSuccess?.();
      } catch (error) {
        options.onError?.(error);
        throw error;
      }
    });

    pending = operation.finally(() => {
      pending = null;
      options.onSettled?.();
    });
    return pending;
  };
}
