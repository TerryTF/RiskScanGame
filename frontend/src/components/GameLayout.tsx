import { useContext, type ReactNode } from 'react';
import { Link } from 'react-router';
import { T } from '../texts';
import { ModeratorBar, ModeratorBarContext } from './ModeratorBar';

interface GameLayoutProps {
  /** Small caps text between the brand and the phase pill, for example "ONLINE GAME / BOARD IN ACTION". */
  crumb: ReactNode;
  pill: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Status bar at the bottom of the page. */
  info?: ReactNode;
  children: ReactNode;
}

export function GameLayout({ crumb, pill, title, subtitle, info, children }: GameLayoutProps) {
  const bar = useContext(ModeratorBarContext);
  const reviewing = Boolean(bar?.onReturn);
  return (
    <div className="app">
      <div className="topbar" aria-hidden="true" />
      <header className="header">
        <Link to="/" className="brand">
          <T k="common.brand" />
        </Link>
        <span className="crumb">{crumb}</span>
        <span className="pill" aria-live="polite">
          {pill}
        </span>
        {bar && <ModeratorBar {...bar} />}
      </header>
      <main className="page" inert={reviewing || undefined}>
        {reviewing && (
          <Notice tone="warning">
            <T k="page.moderator.review_notice" />
          </Notice>
        )}
        {title && <h1 className="page-title">{title}</h1>}
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {children}
      </main>
      {info && (
        <footer className="infobar" role="status">
          {info}
        </footer>
      )}
    </div>
  );
}

/** The board on the left and a column of panels on the right, as in the storyboard. */
export function BoardLayout({
  board,
  side,
  belowBoard,
}: {
  board: ReactNode;
  side: ReactNode;
  /** Extra content under the board, inside the board column (for example, the action cards row). */
  belowBoard?: ReactNode;
}) {
  return (
    <div className="board-layout">
      <div className="board-column">
        {board}
        {belowBoard}
      </div>
      <aside className="side-column">{side}</aside>
    </div>
  );
}

export function Panel({
  kicker,
  title,
  children,
  className = '',
}: {
  kicker?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {kicker && <p className="panel-kicker">{kicker}</p>}
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warning'; children: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      {children}
    </div>
  );
}

export function FullPageMessage({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="app">
      <div className="topbar" aria-hidden="true" />
      <main className="page page--centered">
        <h1 className="page-title">{title}</h1>
        {children}
      </main>
    </div>
  );
}

/** A centred overlay dialog. Click the backdrop or the close button to dismiss. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-panel__close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}
