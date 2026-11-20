import { useState } from 'react';
import { T } from '../../texts';

export function boardUrl(gameId: string): string {
  return `${window.location.origin}/board/${encodeURIComponent(gameId)}`;
}

/** The link for the shared, read-only board that participants open on a projector or their own screens. */
export function ShareBoard({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState(false);
  const url = boardUrl(gameId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="share">
      <label>
        <span className="kicker">
          <T k="setup.share.label" />
        </span>
        <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <button type="button" className="btn btn--soft btn--small" onClick={copy}>
        <T k={copied ? 'setup.share.copied' : 'setup.share.copy'} />
      </button>
    </div>
  );
}
