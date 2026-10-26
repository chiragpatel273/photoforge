import { create } from 'zustand';
import { Book, BookDocument, Element, Page } from '@photoforge/shared';

type Snapshot = {
  document: BookDocument;
  title: string;
};

type State = {
  bookId: string;
  title: string;
  document: BookDocument | null;
  revision: number;
  pageIndex: number;
  selected: string | null;
  past: Snapshot[];
  future: Snapshot[];
  sequence: number;
  savedSequence: number;
  load: (b: Book) => void;
  change: (fn: (doc: BookDocument) => void) => void;
  rename: (title: string) => void;
  select: (id: string | null) => void;
  page: (index: number) => void;
  patch: (id: string, patch: Partial<Element>) => void;
  add: (element: Element) => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  addPage: () => void;
  duplicatePage: () => void;
  removePage: () => void;
  reorder: (direction: number) => void;
  acknowledge: (revision: number, sequence: number) => void;
};

const snapshot = (s: State): Snapshot => ({
  document: structuredClone(s.document!),
  title: s.title,
});
export const useEditor = create<State>((set, get) => ({
  bookId: '',
  title: '',
  document: null,
  revision: 0,
  pageIndex: 0,
  selected: null,
  past: [],
  future: [],
  sequence: 0,
  savedSequence: 0,
  load: (b) =>
    set({
      bookId: b.id,
      title: b.title,
      document: b.document,
      revision: b.revision,
      pageIndex: 0,
      selected: null,
      past: [],
      future: [],
      sequence: 0,
      savedSequence: 0,
    }),
  change: (fn) => {
    const s = get();

    if (!s.document) return;
    const doc = structuredClone(s.document);

    fn(doc);
    set({
      document: doc,
      past: [...s.past.slice(-59), snapshot(s)],
      future: [],
      sequence: s.sequence + 1,
    });
  },
  rename: (title) => {
    const s = get();

    set({
      title,
      past: [...s.past.slice(-59), snapshot(s)],
      future: [],
      sequence: s.sequence + 1,
    });
  },
  select: (selected) => set({ selected }),
  page: (pageIndex) => set({ pageIndex, selected: null }),
  patch: (id, patch) =>
    get().change((d) => {
      const p = d.pages[get().pageIndex];

      if (!p) return;
      p.elements = p.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e));
    }),
  add: (element) => {
    get().change((d) => {
      d.pages[get().pageIndex]?.elements.push(element);
    });
    set({ selected: element.id });
  },
  remove: () => {
    const s = get();

    if (!s.selected) return;
    s.change((d) => {
      const p = d.pages[s.pageIndex];

      if (p) p.elements = p.elements.filter((e) => e.id !== s.selected);
    });
    set({ selected: null });
  },
  undo: () => {
    const s = get();
    const previous = s.past.at(-1);

    if (!previous) return;
    set({
      ...previous,
      past: s.past.slice(0, -1),
      future: [snapshot(s), ...s.future],
      sequence: s.sequence + 1,
      selected: null,
      pageIndex: Math.min(s.pageIndex, previous.document.pages.length - 1),
    });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];

    if (!next) return;
    set({
      ...next,
      past: [...s.past, snapshot(s)],
      future: s.future.slice(1),
      sequence: s.sequence + 1,
      selected: null,
      pageIndex: Math.min(s.pageIndex, next.document.pages.length - 1),
    });
  },
  addPage: () => {
    const s = get();

    if (!s.document || s.document.pages.length >= 80) return;
    s.change((d) =>
      d.pages.push({
        id: crypto.randomUUID(),
        background: '#ffffff',
        elements: [],
      }),
    );
    set({ pageIndex: get().document!.pages.length - 1, selected: null });
  },
  duplicatePage: () => {
    const s = get();

    if (!s.document || s.document.pages.length >= 80) return;
    s.change((d) => {
      const p = structuredClone(d.pages[s.pageIndex]!) as Page;

      p.id = crypto.randomUUID();
      p.elements.forEach((e) => (e.id = crypto.randomUUID()));
      d.pages.splice(s.pageIndex + 1, 0, p);
    });
    set({ pageIndex: s.pageIndex + 1, selected: null });
  },
  removePage: () => {
    const s = get();

    if (!s.document || s.document.pages.length <= 1) return;
    s.change((d) => {
      d.pages.splice(s.pageIndex, 1);
    });
    set({ pageIndex: Math.max(0, s.pageIndex - 1), selected: null });
  },
  reorder: (direction) => {
    const s = get();

    s.change((d) => {
      const p = d.pages[s.pageIndex]!;
      const i = p.elements.findIndex((e) => e.id === s.selected);
      const j = i + direction;

      if (i < 0 || j < 0 || j >= p.elements.length) return;
      [p.elements[i], p.elements[j]] = [p.elements[j]!, p.elements[i]!];
    });
  },
  acknowledge: (revision, savedSequence) => set({ revision, savedSequence }),
}));
