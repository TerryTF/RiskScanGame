import type { Catalogue } from '../../api/types';
import { GameLayout } from '../../components/GameLayout';
import { CardText, T, cardKeys, useTexts, type TextKey } from '../../texts';
import { SkipRoundZero } from './SkipRoundZero';

const PROCESS: TextKey[] = [
  'round.intro.process.discuss',
  'round.intro.process.measure',
  'round.intro.process.apply',
  'round.intro.process.resolve',
];
const INTRO_CARDS = ['hazard_prediction', 'risk_adaptation', 'local_investment', 'diversification'];

interface Round0IntroProps {
  catalogue: Catalogue;
  busy: boolean;
  onStart: () => void;
  onSkip: () => void;
}

/** Shown once before the first practice action: how the shared action cards work. */
export function Round0Intro({ catalogue, busy, onStart, onSkip }: Round0IntroProps) {
  const { t, card: cardText } = useTexts();
  const cards = INTRO_CARDS.flatMap((key) => catalogue.actions.find((card) => card.key === key) ?? []);
  const reduce = catalogue.actions.find((card) => card.key === 'reduce_emissions');

  return (
    <GameLayout
      crumb={<T k="round.intro.crumb" />}
      pill={<T k="round.intro.pill" />}
      title={<T k="round.intro.title" />}
      subtitle={<T k="round.intro.subtitle" />}
      info={<T k="round.intro.info" />}
    >
      <ol className="process" aria-label={t('round.intro.process_label')}>
        {PROCESS.map((step, index) => (
          <li key={step}>
            <T k={step} />
            {index < PROCESS.length - 1 && <span aria-hidden="true"> &rarr; </span>}
          </li>
        ))}
      </ol>

      <div className="intro-cards">
        {cards.map((card, index) => (
          <article key={card.key} className={`intro-card intro-card--${card.key}`}>
            <h2>
              <span className="intro-card__number">{index + 1}</span>{' '}
              <CardText k={cardKeys.actionName(card.key)} fallback={card.name} />
            </h2>
            <p>
              <CardText k={cardKeys.actionDescription(card.key)} fallback={card.description} />
            </p>
            <p className="intro-card__foot">
              <T k={card.free_in_round_zero ? 'round.intro.card_free' : 'round.intro.card_explained'} />
            </p>
          </article>
        ))}
      </div>

      <p className="infostrip">
        <T k="round.intro.after_practice" />
      </p>
      {reduce && (
        <p className="muted">
          <strong>
            <T
              k="round.intro.special_label"
              vars={{ rounds: catalogue.limits.reduce_emissions_rounds.join('\u2013') }}
            />
          </strong>{' '}
          <T
            k="round.intro.special_text"
            vars={{
              action: cardText(cardKeys.actionName(reduce.key), reduce.name),
              round: catalogue.limits.transition_pressure_round,
            }}
          />
        </p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn--primary" onClick={onStart}>
          <T k="round.intro.start" />
        </button>
      </div>
      <SkipRoundZero disabled={busy} onSkip={onSkip} />
    </GameLayout>
  );
}
