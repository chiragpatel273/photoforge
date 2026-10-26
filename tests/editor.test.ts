import { useEditor } from '../apps/web/src/lib/editor-store';
import { emptyDocument, Book } from '../packages/shared/src';

const book = (): Book => ({
  id: crypto.randomUUID(),
  title: 'Memories',
  revision: 0,
  document: emptyDocument(),
  updatedAt: new Date().toISOString(),
  status: 'DRAFT',
});

beforeEach(() => useEditor.getState().load(book()));

test('edits and undo/redo preserve the document and mark it dirty', () => {
  let s = useEditor.getState();

  s.addPage();
  s = useEditor.getState();
  expect(s.document!.pages).toHaveLength(2);
  s.undo();
  expect(useEditor.getState().document!.pages).toHaveLength(1);
  useEditor.getState().redo();
  expect(useEditor.getState().document!.pages).toHaveLength(2);
  expect(useEditor.getState().sequence).toBe(3);
});

test('duplicate page IDs are regenerated and last page cannot be removed', () => {
  const original = useEditor.getState().document!.pages[0]!.id;

  useEditor.getState().duplicatePage();
  expect(useEditor.getState().document!.pages[1]!.id).not.toBe(original);
  useEditor.getState().removePage();
  useEditor.getState().removePage();
  expect(useEditor.getState().document!.pages).toHaveLength(1);
});

test('acknowledging a save does not erase edits made during the request', () => {
  useEditor.getState().rename('First');
  const sequence = useEditor.getState().sequence;

  useEditor.getState().rename('Second');
  useEditor.getState().acknowledge(1, sequence);
  const s = useEditor.getState();

  expect(s.title).toBe('Second');
  expect(s.savedSequence).toBeLessThan(s.sequence);
});
