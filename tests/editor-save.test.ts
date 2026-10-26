import { emptyDocument, type Book } from '../packages/shared/src';
import { createEditorSaver } from '../apps/web/src/lib/editor-save';
import { useEditor } from '../apps/web/src/lib/editor-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  const book: Book = {
    id: crypto.randomUUID(),
    title: 'Memories',
    revision: 0,
    document: emptyDocument(),
    status: 'DRAFT',
    updatedAt: new Date().toISOString(),
  };
  useEditor.getState().load(book);
});

test('a validation failure releases the save slot and corrected text persists', async () => {
  const id = crypto.randomUUID();
  useEditor.getState().add({
    id,
    type: 'text',
    text: 'Our trip 😀',
    x: 0,
    y: 0,
    width: 500,
    height: 100,
    rotation: 0,
    fontSize: 24,
    fontFamily: 'Helvetica',
    color: '#000000',
    align: 'left',
  });
  const write = jest.fn<
    Promise<{ revision: number }>,
    [string, { title: string; revision: number; document: ReturnType<typeof emptyDocument> }]
  >(async () => ({ revision: 1 }));
  const settled = jest.fn();
  const save = createEditorSaver({
    bookId: useEditor.getState().bookId,
    read: useEditor.getState,
    write,
    onSettled: settled,
  });

  await expect(save()).rejects.toThrow('PDF text supports Latin characters');
  expect(write).not.toHaveBeenCalled();
  useEditor.getState().patch(id, { text: 'Our trip' });
  await expect(save()).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0]?.[1]).toMatchObject({
    document: { pages: [{ elements: [{ text: 'Our trip' }] }] },
  });
  expect(settled).toHaveBeenCalledTimes(2);
  expect(useEditor.getState().savedSequence).toBe(useEditor.getState().sequence);
});

test('concurrent save callers share one request and async failures can be retried', async () => {
  useEditor.getState().rename('An adventure');
  const failure = deferred<{ revision: number }>();
  const write = jest
    .fn<
      Promise<{ revision: number }>,
      [string, { title: string; revision: number; document: ReturnType<typeof emptyDocument> }]
    >()
    .mockImplementationOnce(() => failure.promise)
    .mockResolvedValueOnce({ revision: 1 });
  const save = createEditorSaver({
    bookId: useEditor.getState().bookId,
    read: useEditor.getState,
    write,
  });
  const first = save();
  const second = save();
  expect(second).toBe(first);
  failure.reject(new Error('Temporary API failure'));
  await expect(first).rejects.toThrow('Temporary API failure');
  await expect(second).rejects.toThrow('Temporary API failure');
  await expect(save()).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledTimes(2);
});

test('edits during an in-flight save are written with the next server revision', async () => {
  useEditor.getState().rename('First edit');
  const response = deferred<{ revision: number }>();
  const started = deferred<void>();
  const write = jest
    .fn<
      Promise<{ revision: number }>,
      [string, { title: string; revision: number; document: ReturnType<typeof emptyDocument> }]
    >()
    .mockImplementationOnce(() => {
      started.resolve();
      return response.promise;
    })
    .mockResolvedValueOnce({ revision: 2 });
  const save = createEditorSaver({
    bookId: useEditor.getState().bookId,
    read: useEditor.getState,
    write,
  });
  const pending = save();
  await started.promise;
  useEditor.getState().rename('Second edit');
  response.resolve({ revision: 1 });
  await pending;
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[0]?.[1]).toMatchObject({ title: 'First edit', revision: 0 });
  expect(write.mock.calls[1]?.[1]).toMatchObject({ title: 'Second edit', revision: 1 });
  expect(useEditor.getState().revision).toBe(2);
  expect(useEditor.getState().savedSequence).toBe(useEditor.getState().sequence);
});

test('a response for a previous book cannot acknowledge changes in the next book', async () => {
  useEditor.getState().rename('Old book edit');
  const response = deferred<{ revision: number }>();
  const started = deferred<void>();
  const save = createEditorSaver({
    bookId: useEditor.getState().bookId,
    read: useEditor.getState,
    write: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const pending = save();
  await started.promise;
  const next: Book = {
    id: crypto.randomUUID(),
    title: 'Next book',
    revision: 7,
    document: emptyDocument(),
    status: 'DRAFT',
    updatedAt: new Date().toISOString(),
  };
  useEditor.getState().load(next);
  useEditor.getState().rename('Unsaved next book edit');
  response.resolve({ revision: 1 });
  await pending;
  expect(useEditor.getState().revision).toBe(7);
  expect(useEditor.getState().savedSequence).toBe(0);
  expect(useEditor.getState().sequence).toBe(1);
});
