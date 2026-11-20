import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { T, useT } from '../texts';

export type Handler = (() => void) | null;

export interface ModeratorBarState {
  /** Shows the previous screen; null when there is none. */
  onBack: Handler;
  /** Clears what has been chosen on the current page; null when nothing has been chosen there. */
  onUndo: Handler;
  /** A short confirmation after Undo. */
  status: ReactNode;
  busy: boolean;
  /** Set while an earlier screen is shown read-only. */
  onReturn: Handler;
}

/** Provided on the moderator page only, so the participant board never shows these controls. */
export const ModeratorBarContext = createContext<ModeratorBarState | null>(null);

export interface ScreenControls {
  registerBack: (handler: Handler) => void;
  registerUndo: (handler: Handler) => void;
}

export const IGNORED_CONTROLS: ScreenControls = { registerBack: () => {}, registerUndo: () => {} };

/** How the current screen tells the header what Back and Undo should do. */
export const ScreenControlsContext = createContext<ScreenControls>(IGNORED_CONTROLS);

// Handlers must keep their identity between renders (useCallback), or they re-register on every render.
function useRegistered(handler: Handler, pick: (controls: ScreenControls) => (handler: Handler) => void) {
  const controls = useContext(ScreenControlsContext);
  const register = pick(controls);
  useEffect(() => {
    register(handler);
    return () => register(null);
  }, [register, handler]);
}

/** Lets a screen with its own steps (setup wizard, teams and priorities, Round 0 introduction) handle Back. */
export function useLocalBack(handler: Handler) {
  useRegistered(handler, (controls) => controls.registerBack);
}

/**
 * The part of a page that the header Undo button clears: Undo puts everything inside back the way it was when the
 * page opened. It only resets what is on screen; nothing saved is changed and the page does not move.
 */
export function UndoArea({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [touched, setTouched] = useState(false);
  const clear = useCallback(() => {
    setVersion((current) => current + 1);
    setTouched(false);
  }, []);
  useRegistered(touched ? clear : null, (controls) => controls.registerUndo);

  const touch = (event: SyntheticEvent) => {
    if (!(event.target as Element).closest('.moderator-bar')) setTouched(true);
  };
  return (
    <div
      key={version}
      className="undo-area"
      onChangeCapture={touch}
      onDropCapture={touch}
      onClickCapture={(event) => {
        if ((event.target as Element).closest('button')) touch(event);
      }}
    >
      {children}
    </div>
  );
}

export function ModeratorBar({ onBack, onUndo, status, busy, onReturn }: ModeratorBarState) {
  const t = useT();
  return (
    <div className="moderator-bar" role="toolbar" aria-label={t('page.moderator.controls')}>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        aria-label={t('page.moderator.back_label')}
        disabled={!onBack || busy}
        onClick={onBack ?? undefined}
      >
        <span aria-hidden="true">&larr;</span> <T k="page.moderator.back" />
      </button>
      {onReturn ? (
        <button type="button" className="btn btn--primary btn--small" onClick={onReturn}>
          <T k="page.moderator.return" />
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--soft btn--small"
          aria-label={t('page.moderator.undo_label')}
          title={t('page.moderator.undo_title')}
          disabled={!onUndo || busy}
          onClick={onUndo ?? undefined}
        >
          <span aria-hidden="true">&#8630;</span> <T k="page.moderator.undo" />
        </button>
      )}
      <span className="moderator-bar__note" role="status">
        {status ?? (onReturn ? <T k="page.moderator.review_note" /> : null)}
      </span>
    </div>
  );
}
