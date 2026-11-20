import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { ApiProvider, useApi } from '../api/provider';
import { gameKey, textsKey, useCatalogue, useSavedTexts } from '../api/queries';
import type { Catalogue, GameState, SampleGame, TextChanges } from '../api/types';
import { FullPageMessage } from '../components/GameLayout';
import { IsolatedRoot } from '../features/editor/IsolatedRoot';
import { previewClient } from '../features/editor/previewClient';
import { renameGame } from '../features/editor/renameGame';
import { TextPanel, type TextEntry, type TextState } from '../features/editor/TextPanel';
import { TOUR, type SampleKey } from '../features/editor/tour';
import { UsedTexts } from '../features/editor/usedTexts';
import { DEFAULT_TEXTS, TextProvider, cardTextDefaults, type TextSource } from '../texts';

/** Loads what the editor needs: the catalogue, the saved texts and the sample game shown on every page. */
export function EditorPage() {
  const api = useApi();
  const catalogue = useCatalogue();
  const saved = useSavedTexts();
  const sample = useQuery({ queryKey: ['editor', 'sample-game'], queryFn: () => api.sampleGame(), staleTime: Infinity });

  const failed = [catalogue, saved, sample].find((query) => query.isError);
  if (failed) {
    return (
      <FullPageMessage title="The editor could not be loaded">
        <p>{failed.error?.message}</p>
        <button type="button" className="btn btn--primary" onClick={() => failed.refetch()}>
          Try again
        </button>
      </FullPageMessage>
    );
  }
  if (!catalogue.data || !saved.data || !sample.data) return <FullPageMessage title="Loading the editor…" />;
  return (
    <Editor
      catalogue={catalogue.data}
      saved={saved.data.texts}
      undoAvailable={saved.data.undo_available}
      sample={sample.data}
    />
  );
}

interface PreviewSession {
  used: UsedTexts;
  queryClient: QueryClient;
}

function newSession(): PreviewSession {
  return {
    used: new UsedTexts(),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } }),
  };
}

const has = (texts: object, key: string) => Object.hasOwn(texts, key);

interface EditorProps {
  catalogue: Catalogue;
  saved: Record<string, string>;
  /** The last save can be undone once; older versions are not kept. */
  undoAvailable: boolean;
  sample: SampleGame;
}

function Editor({ catalogue, saved, undoAvailable, sample }: EditorProps) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useRef<HTMLDivElement>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [session, setSession] = useState(newSession);
  const [pen, setPen] = useState(true);
  const [draft, setDraft] = useState<TextChanges>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'page' | 'all'>('page');
  const [search, setSearch] = useState('');
  const [quitting, setQuitting] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [lastResult, setLastResult] = useState<'saved' | 'undone' | null>(null);

  const page = TOUR[pageIndex];
  const states = useMemo(() => new Map(sample.states.map((item) => [item.key as SampleKey, item.state])), [sample]);
  const sampleState = page.sample ? (states.get(page.sample) ?? null) : null;
  const game: GameState | null = useMemo(() => {
    const current = (key: string, fallback: string) =>
      has(draft, key) ? (draft[key] ?? fallback) : (saved[key] ?? fallback);
    return sampleState && renameGame(sampleState, current);
  }, [sampleState, draft, saved]);
  const used = useSyncExternalStore(session.used.subscribe, session.used.getSnapshot);
  const changes = Object.keys(draft).length;

  const save = useMutation({
    mutationFn: (texts: TextChanges) => api.saveTexts(texts),
    onSuccess: (result) => {
      queryClient.setQueryData(textsKey, result);
      setDraft({});
      setLastResult('saved');
    },
  });

  // Puts back the texts from before the last save. Unsaved changes in the draft are kept.
  const undo = useMutation({
    mutationFn: () => api.undoTexts(),
    onSuccess: (result) => {
      queryClient.setQueryData(textsKey, result);
      setConfirmUndo(false);
      setLastResult('undone');
    },
  });

  const goTo = (index: number) => {
    setPageIndex(Math.min(TOUR.length - 1, Math.max(0, index)));
    setSession(newSession());
    setSelected(null);
  };

  const quit = () => (changes > 0 ? setQuitting(true) : navigate('/'));
  const saveAndQuit = async () => {
    await save.mutateAsync(draft);
    navigate('/');
  };

  const setText = useCallback(
    (key: string, value: string, fallback: string) => {
      setDraft((current) => {
        const next = { ...current };
        // null means "use the default"; an entry equal to what is already saved is not a change.
        const wanted = value === fallback ? null : value;
        if (wanted === (saved[key] ?? null)) delete next[key];
        else next[key] = wanted;
        return next;
      });
    },
    [saved],
  );

  const source = useMemo<TextSource>(
    () => ({
      lookup: (key) => (has(draft, key) ? (draft[key] ?? undefined) : saved[key]),
      editing: pen,
      onUse: session.used.use,
      isDraft: (key) => has(draft, key),
    }),
    [draft, saved, pen, session],
  );

  const entry = useCallback(
    (key: string, fallback: string): TextEntry => {
      const state: TextState = has(draft, key) ? 'draft' : has(saved, key) ? 'saved' : 'default';
      const value = has(draft, key) ? (draft[key] ?? fallback) : (saved[key] ?? fallback);
      return { key, fallback, value, state };
    },
    [draft, saved],
  );

  const allDefaults = useMemo(() => ({ ...cardTextDefaults(catalogue), ...DEFAULT_TEXTS }), [catalogue]);
  const entries = useMemo(() => {
    if (tab === 'page') return used.map(([key, fallback]) => entry(key, fallback));
    const query = search.trim().toLowerCase();
    return Object.entries(allDefaults)
      .map(([key, fallback]) => entry(key, fallback))
      .filter((item) => !query || [item.key, item.value, item.fallback].some((text) => text.toLowerCase().includes(query)));
  }, [tab, used, entry, allDefaults, search]);

  const client = useMemo(() => previewClient(catalogue, game, { texts: saved, undo_available: false }), [catalogue, game, saved]);

  // Pages that load the game themselves (the player board) read it from the preview's cache.
  useEffect(() => {
    if (game) session.queryClient.setQueryData(gameKey(game.id), game);
  }, [game, session]);

  // Picking a text on the page selects its field; links and buttons around it do nothing in the preview.
  useEffect(() => {
    const host = preview.current;
    if (!host) return;
    const textAt = (event: Event) => (pen ? (event.target as Element | null)?.closest?.('[data-text-key]') : null);
    const onPointerDown = (event: PointerEvent) => {
      const text = textAt(event);
      if (!text) return;
      event.preventDefault();
      setSelected(text.getAttribute('data-text-key'));
      setTab('page');
    };
    const onClick = (event: MouseEvent) => {
      if (textAt(event) || (event.target as Element | null)?.closest?.('a[href]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onSubmit = (event: Event) => event.preventDefault();
    host.addEventListener('pointerdown', onPointerDown, true);
    host.addEventListener('click', onClick, true);
    host.addEventListener('submit', onSubmit, true);
    return () => {
      host.removeEventListener('pointerdown', onPointerDown, true);
      host.removeEventListener('click', onClick, true);
      host.removeEventListener('submit', onSubmit, true);
    };
  }, [pen]);

  useEffect(() => {
    if (!selected) return;
    preview.current?.querySelector(`[data-text-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    if (changes === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes]);

  const { mutate: saveDraft } = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (changes > 0) saveDraft(draft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changes, draft, saveDraft]);

  const groups = [...new Set(TOUR.map((item) => item.group))];

  return (
    <div className="editor">
      <header className="editor-bar">
        <span className="editor-bar__brand">
          RISKSCAN <span className="editor-bar__mode">EDITOR MODE</span>
        </span>
        <nav className="editor-bar__pages" aria-label="Pages of the game">
          <button type="button" className="btn btn--small" onClick={() => goTo(pageIndex - 1)} disabled={pageIndex === 0}>
            ‹ Previous
          </button>
          <label>
            <span className="sr-only">Page</span>
            <select value={page.id} onChange={(event) => goTo(TOUR.findIndex((item) => item.id === event.target.value))}>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {TOUR.filter((item) => item.group === group).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => goTo(pageIndex + 1)}
            disabled={pageIndex === TOUR.length - 1}
          >
            Next ›
          </button>
          <span className="editor-bar__count">
            {pageIndex + 1} / {TOUR.length}
          </span>
        </nav>
        <button
          type="button"
          className={`btn btn--small pen-toggle${pen ? ' pen-toggle--on' : ''}`}
          aria-pressed={pen}
          onClick={() => setPen((on) => !on)}
          title="When the pen is on, click any text on the page to edit it"
        >
          <span aria-hidden="true">✎</span> Pen {pen ? 'on' : 'off'}
        </button>
        <div className="editor-bar__actions">
          <span className="editor-bar__status" role="status">
            {save.isPending
              ? 'Saving…'
              : undo.isPending
                ? 'Undoing…'
                : save.isError
                  ? `Not saved: ${save.error.message}`
                  : undo.isError
                    ? `Not undone: ${undo.error.message}`
                    : changes > 0
                      ? `${changes} unsaved ${changes === 1 ? 'change' : 'changes'}`
                      : lastResult === 'saved'
                        ? 'All changes saved'
                        : lastResult === 'undone'
                          ? 'Last save undone'
                          : ''}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--small editor-bar__undo"
            disabled={!undoAvailable || undo.isPending || save.isPending}
            title={undoAvailable ? 'Go back to the texts as they were before the last save' : 'There is no save to undo'}
            onClick={() => setConfirmUndo(true)}
          >
            <span aria-hidden="true">↶</span> Undo last save
          </button>
          <button
            type="button"
            className="btn btn--primary btn--small"
            disabled={changes === 0 || save.isPending}
            onClick={() => save.mutate(draft)}
          >
            Save
          </button>
          <button type="button" className="btn btn--ghost btn--small editor-bar__quit" onClick={quit}>
            Quit
          </button>
        </div>
      </header>

      {confirmUndo && (
        <div className="editor-confirm" role="alertdialog" aria-label="Undo the last save">
          <p>
            Undo your last save? The texts go back to how they were before it, for everyone. This works only once:
            older versions are not kept.
            {changes > 0 && ` Your ${changes} unsaved ${changes === 1 ? 'change stays' : 'changes stay'} as ${changes === 1 ? 'it is' : 'they are'}.`}
          </p>
          <button type="button" className="btn btn--primary btn--small" disabled={undo.isPending} onClick={() => undo.mutate()}>
            Undo last save
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirmUndo(false)}>
            Cancel
          </button>
        </div>
      )}

      {quitting && (
        <div className="editor-confirm" role="alertdialog" aria-label="Unsaved changes">
          <p>
            You have {changes} unsaved {changes === 1 ? 'change' : 'changes'}. They are lost if you quit without saving.
          </p>
          <button type="button" className="btn btn--primary btn--small" disabled={save.isPending} onClick={saveAndQuit}>
            Save and quit
          </button>
          <button type="button" className="btn btn--small" onClick={() => navigate('/')}>
            Quit without saving
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setQuitting(false)}>
            Keep editing
          </button>
        </div>
      )}

      <div className="editor-body">
        <div className={`editor-preview${pen ? ' editor-preview--pen' : ''}`} ref={preview}>
          {selected && (
            <style>{`.editor-preview [data-text-key="${CSS.escape(selected)}"] { outline: 3px solid var(--pink); }`}</style>
          )}
          <IsolatedRoot className="editor-preview__root">
            <QueryClientProvider client={session.queryClient}>
              <ApiProvider client={client}>
                <TextProvider source={source}>
                  <MemoryRouter key={page.id} initialEntries={[page.url ?? '/']}>
                    <Routes>
                      <Route path={page.path ?? '*'} element={page.render(catalogue, game)} />
                    </Routes>
                  </MemoryRouter>
                </TextProvider>
              </ApiProvider>
            </QueryClientProvider>
          </IsolatedRoot>
        </div>

        <aside className="editor-panel" aria-label="Texts">
          <div className="editor-panel__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'page'} onClick={() => setTab('page')}>
              This page ({used.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
              All texts
            </button>
          </div>
          <p className="muted editor-panel__help">
            {tab === 'page'
              ? pen
                ? 'Click a text on the page, or edit it below. Nothing changes for players until you save.'
                : 'Turn the pen on to pick texts on the page. You can also edit them below.'
              : 'Every text in the game, including ones that only appear in special situations.'}
          </p>
          {tab === 'all' && (
            <input
              type="search"
              className="editor-panel__search"
              placeholder="Search texts"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <TextPanel
            entries={entries}
            selected={selected}
            onSelect={setSelected}
            onChange={setText}
            empty={tab === 'page' ? 'This page has no texts yet.' : 'No text matches your search.'}
          />
        </aside>
      </div>
    </div>
  );
}
