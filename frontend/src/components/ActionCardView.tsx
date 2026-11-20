import type { ReactNode } from 'react';
import type { ActionCard } from '../api/types';
import { CardText, cardKeys, useT } from '../texts';
import { CostRow } from './Tokens';

/** Placeholder card illustrations. Swap for real artwork by replacing the component for a card key. */
function ActionArt({ cardKey }: { cardKey: string }) {
  const t = useT();
  switch (cardKey) {
    case 'hazard_prediction':
      return (
        <svg viewBox="0 0 120 70" role="img" aria-label={t('board.action_art.hazard_prediction')}>
          <path d="M15 62a45 45 0 0 1 90 0" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity=".5" />
          <path d="M15 62a45 45 0 0 1 30-42" fill="none" stroke="#8dc63f" strokeWidth="10" strokeLinecap="round" />
          <path d="M45 20a45 45 0 0 1 30 0" fill="none" stroke="#f2b82b" strokeWidth="10" />
          <path d="M75 20a45 45 0 0 1 30 42" fill="none" stroke="#d94f35" strokeWidth="10" strokeLinecap="round" />
          <path d="M60 62l22-30" stroke="#25403b" strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy="62" r="6" fill="#25403b" />
        </svg>
      );
    case 'risk_adaptation':
      return (
        <svg viewBox="0 0 120 70" role="img" aria-label={t('board.action_art.risk_adaptation')}>
          <circle cx="45" cy="38" r="20" fill="none" stroke="#2f7dc0" strokeWidth="9" strokeDasharray="8 5" />
          <circle cx="45" cy="38" r="9" fill="#2f7dc0" />
          <circle cx="82" cy="30" r="14" fill="none" stroke="#1e5f98" strokeWidth="7" strokeDasharray="6 4" />
          <circle cx="82" cy="30" r="6" fill="#1e5f98" />
        </svg>
      );
    case 'local_investment':
      return (
        <svg viewBox="0 0 120 70" role="img" aria-label={t('board.action_art.local_investment')}>
          <path d="M45 44h30l-4 22H49z" fill="#d9692f" />
          <path d="M60 44V22" stroke="#3a8a4d" strokeWidth="4" strokeLinecap="round" />
          <path d="M60 32c-16-2-22-12-20-20 12 0 21 6 20 20z" fill="#5fb36f" />
          <path d="M60 28c14-2 20-10 18-17-11 0-19 5-18 17z" fill="#3a8a4d" />
        </svg>
      );
    case 'diversification':
      return (
        <svg viewBox="0 0 120 70" role="img" aria-label={t('board.action_art.diversification')}>
          <path d="M60 64V36M60 36 30 14M60 36l30-22M60 36V10" fill="none" stroke="#6b3fa0" strokeWidth="5" strokeLinecap="round" />
          <circle cx="30" cy="14" r="6" fill="#6b3fa0" />
          <circle cx="90" cy="14" r="6" fill="#6b3fa0" />
          <circle cx="60" cy="10" r="6" fill="#6b3fa0" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 70" role="img" aria-label={t('board.action_art.default')}>
          <text x="60" y="44" textAnchor="middle" fontSize="30" fontWeight="800" fill="#2b7a68">
            CO<tspan fontSize="18" dy="6">2</tspan>
            <tspan dy="-6"> &#8595;</tspan>
          </text>
        </svg>
      );
  }
}

interface ActionCardViewProps {
  card: ActionCard;
  /** Replaces the card's description, for example to explain the current round. */
  note?: ReactNode;
  badge?: ReactNode;
  /** Hides the illustration, for places where the card sits inside a form. */
  compact?: boolean;
}

export function ActionCardView({ card, note, badge, compact = false }: ActionCardViewProps) {
  return (
    <article
      className={`action-card action-card--${card.key}${card.available ? '' : ' is-unavailable'}${compact ? ' action-card--compact' : ''}`}
    >
      <h3 className="action-card__title">
        <CardText k={cardKeys.actionName(card.key)} fallback={card.name} />
      </h3>
      <CostRow cost={card.cost} />
      {!compact && (
        <div className="action-card__art">
          <ActionArt cardKey={card.key} />
        </div>
      )}
      <p className="action-card__text">
        {note ?? <CardText k={cardKeys.actionDescription(card.key)} fallback={card.description} />}
      </p>
      {badge && <p className="action-card__badge">{badge}</p>}
    </article>
  );
}
