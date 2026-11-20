import { useState, type ReactNode } from 'react';
import type { ActionCard, Catalogue, GameState, PaymentInput } from '../../api/types';
import type { GameCommands } from '../../api/queries';
import { ActionCardView } from '../../components/ActionCardView';
import { BoardScreen } from '../../components/BoardScreen';
import { Modal, Panel } from '../../components/GameLayout';
import { ResourceTokens, costSummary } from '../../components/Tokens';
import {
  actionsInRound,
  describeAction,
  describePayers,
  orderedTeams,
  reduceEmissionsInfo,
  type Changes,
} from '../../lib/derive';
import { CardText, T, cardKeys, useTexts } from '../../texts';
import { DiversifyDetails } from './DiversifyDetails';
import { emptyDraft, draftProblem, toDiversifyRequest, type DiversifyDraft } from './diversify';
import { FundingForm } from './FundingForm';
import { EMPTY_TARGET, TargetPicker, isTargetComplete, type Target, type TargetKind } from './TargetPicker';
import hazardPredictionImg from '../../assets/action-cards/hazard-prediction.png';
import riskAdaptationImg from '../../assets/action-cards/risk-adaption.png';
import localInvestmentImg from '../../assets/action-cards/local-investment.png';
import diversificationImg from '../../assets/action-cards/diversification.png';

/** Card art for the action tiles. Cards without an entry here (reduce_emissions) fall back to ActionCardView. */
const ACTION_IMAGE: Record<string, string> = {
  hazard_prediction: hazardPredictionImg,
  risk_adaptation: riskAdaptationImg,
  local_investment: localInvestmentImg,
  diversification: diversificationImg,
};

interface ScreenProps {
  game: GameState;
  catalogue: Catalogue;
  commands: GameCommands;
  changes: Changes;
}

const KIND_OF: Record<string, TargetKind | null> = {
  hazard_prediction: 'predict',
  risk_adaptation: 'adapt',
  local_investment: 'invest',
  diversification: null,
  reduce_emissions: null,
};

function cardFor(catalogue: Catalogue, key: string): ActionCard {
  const card = catalogue.actions.find((item) => item.key === key);
  if (!card) throw new Error(`The catalogue has no action card "${key}".`);
  return card;
}

/** Runs the action for the chosen target. Resolves to the new state, or null when the API refused it. */
function runAction(commands: GameCommands, key: string, target: Target, payments: PaymentInput[]) {
  switch (key) {
    case 'hazard_prediction':
      return commands.predict({ hazard_id: target.hazardId ?? 0, payments });
    case 'risk_adaptation':
      return commands.adapt({ element_id: target.elementId ?? 0, hazard_id: target.hazardId ?? 0, payments });
    case 'local_investment':
      return commands.invest({ element_id: target.elementId ?? 0, payments });
    default:
      return commands.reduceEmissions(payments);
  }
}

function LastAction({ game }: { game: GameState }) {
  const texts = useTexts();
  const last = actionsInRound(game, game.current_round ?? 0).at(-1);
  if (!last) return null;
  const payers = describePayers(game, last, texts.t);
  return (
    <Panel kicker={<T k="round.actions.last_kicker" />}>
      <p>{describeAction(game, last, texts)}</p>
      {payers && (
        <p className="muted">
          <T k="round.actions.paid_by" vars={{ payers }} />
        </p>
      )}
    </Panel>
  );
}

const PRACTICE_KEY: Record<string, string> = {
  ROUND0_PREDICTION: 'hazard_prediction',
  ROUND0_ADAPTATION: 'risk_adaptation',
  ROUND0_INVESTMENT: 'local_investment',
};

/** Round 0: one free demonstration action per step. */
export function PracticeScreen({ game, catalogue, commands, changes }: ScreenProps) {
  const key = PRACTICE_KEY[game.phase] ?? 'hazard_prediction';
  const kind = KIND_OF[key] ?? 'predict';
  const card = cardFor(catalogue, key);
  const [target, setTarget] = useState<Target>(EMPTY_TARGET);
  const texts = useTexts();

  return (
    <BoardScreen
      game={game}
      changes={changes}
      preview={target}
      error={commands.error}
      belowBoard={
        <Panel kicker={<T k="round.actions.cards_kicker" />}>
          <ul className="action-menu action-menu--cards">
            {catalogue.actions.map((item) => {
              const image = ACTION_IMAGE[item.key];
              const isActive = item.key === key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`action-tile${image ? '' : ' action-tile--plain'}${isActive ? ' is-selected' : ''}`}
                    aria-pressed={isActive}
                    disabled
                  >
                    {image ? (
                      <img src={image} alt={item.name} className="action-tile__image" />
                    ) : (
                      <ActionCardView
                        card={item}
                        note={isActive ? <T k="round.actions.free_round0" /> : costSummary(item.cost, texts.t)}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      }
      side={
        <>
          <Panel kicker={<T k="round.actions.practice_card_kicker" />}>
            <ActionCardView
              card={card}
              note={
                <>
                  <CardText k={cardKeys.actionDescription(card.key)} fallback={card.description} />{' '}
                  <strong>
                    <T k="round.actions.free_round0" />
                  </strong>
                </>
              }
            />
          </Panel>
          <Panel kicker={<T k="round.actions.practice_kicker" />}>
            <TargetPicker game={game} limits={catalogue.limits} kind={kind} target={target} onChange={setTarget} />
            <button
              type="button"
              className="btn btn--primary"
              disabled={commands.pending || !isTargetComplete(kind, target)}
              onClick={async () => {
                if (await runAction(commands, key, target, [])) setTarget(EMPTY_TARGET);
              }}
            >
              <T k="round.actions.practice_button" />
            </button>
          </Panel>
          <LastAction game={game} />
        </>
      }
    />
  );
}

/** Regular rounds: choose an action card, record who pays, apply it. Repeat until teams are done. */
export function ActionPhaseScreen({
  game,
  catalogue,
  commands,
  changes,
  initialCard,
}: ScreenProps & {
  /** The action card selected when the screen opens; editor mode uses it to show the funding form. */
  initialCard?: string;
}) {
  const [selected, setSelected] = useState<string | null>(initialCard ?? null);
  const texts = useTexts();
  const [target, setTarget] = useState<Target>(EMPTY_TARGET);
  const [draft, setDraft] = useState<DiversifyDraft>(() => emptyDraft(catalogue.limits));
  const round = game.current_round ?? 0;
  const emissions = reduceEmissionsInfo(game, catalogue.limits);
  const teams = orderedTeams(game);

  const status = (card: ActionCard): { enabled: boolean; note: ReactNode } => {
    if (!card.available) return { enabled: false, note: <T k="round.actions.not_available" /> };
    if (card.key !== 'reduce_emissions') return { enabled: true, note: costSummary(card.cost, texts.t) };
    if (!emissions.eligibleRound) {
      const rounds = catalogue.limits.reduce_emissions_rounds.join(` ${texts.t('describe.and')} `);
      return { enabled: false, note: <T k="round.actions.rounds_only" vars={{ rounds }} /> };
    }
    if (emissions.usedThisRound) return { enabled: false, note: <T k="round.actions.already_funded" /> };
    const vars = { progress: emissions.progress, target: emissions.target };
    return {
      enabled: true,
      note: (
        <span className="action-card__text--progress">
          <T k="round.actions.progress" vars={vars} />
        </span>
      ),
    };
  };

  const card = selected ? cardFor(catalogue, selected) : null;
  const kind = selected ? KIND_OF[selected] : null;
  const diversifying = selected === 'diversification';
  const targetReady = diversifying
    ? draftProblem(game, draft, catalogue.limits, texts.t) === null
    : kind === null || isTargetComplete(kind, target);
  const closeModal = () => {
    setSelected(null);
    setTarget(EMPTY_TARGET);
    setDraft(emptyDraft(catalogue.limits));
  };

  return (
    <>
      <BoardScreen
        game={game}
        changes={changes}
        preview={kind ? target : undefined}
        error={commands.error}
        belowBoard={
          <Panel kicker={<T k="round.actions.cards_kicker" />}>
            <ul className="action-menu action-menu--cards">
              {catalogue.actions.map((item) => {
                const { enabled, note } = status(item);
                const image = ACTION_IMAGE[item.key];
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`action-tile${image ? '' : ' action-tile--plain'}${selected === item.key ? ' is-selected' : ''}`}
                      aria-pressed={selected === item.key}
                      disabled={!enabled}
                      onClick={() => {
                        setSelected(item.key);
                        setTarget(EMPTY_TARGET);
                        setDraft(emptyDraft(catalogue.limits));
                      }}
                    >
                      {image ? (
                        <img src={image} alt={item.name} className="action-tile__image" />
                      ) : (
                        <ActionCardView card={item} note={note} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        }
        side={
          <>
            <Panel kicker={<T k="round.tokens.kicker" />} title={<T k="round.actions.tokens_title" />}>
              <ResourceTokens
                rows={teams.map((team) => ({ role: team.role, resources: team.resources }))}
                caption={<T k="round.tokens.caption" />}
              />
            </Panel>

            <ActionLog game={game} round={round} />

            <Panel>
              <button
                type="button"
                className="btn btn--primary btn--wide"
                disabled={commands.pending}
                onClick={() => commands.runStep(round, 'close-actions')}
              >
                <T k="round.actions.close_button" />
              </button>
            </Panel>
          </>
        }
      />
      {card && (
        <Modal
          title={`${texts.t('round.actions.record_title')}: ${texts.card(cardKeys.actionName(card.key), card.name)}`}
          onClose={closeModal}
        >
          <h2 className="panel-title">
            <T k="round.actions.record_title" />
          </h2>
          <ActionCardView card={card} compact />
          {kind && <TargetPicker game={game} limits={catalogue.limits} kind={kind} target={target} onChange={setTarget} />}
          {diversifying && <DiversifyDetails game={game} catalogue={catalogue} draft={draft} onChange={setDraft} />}
          <FundingForm
            key={card.key}
            cost={card.cost}
            teams={teams}
            disabled={commands.pending || !targetReady}
            submitLabel={<T k="round.actions.apply_button" />}
            onSubmit={async (payments) => {
              const applied = diversifying
                ? commands.diversify(toDiversifyRequest(game, draft, payments, catalogue.limits))
                : runAction(commands, card.key, target, payments);
              if (await applied) closeModal();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function ActionLog({ game, round }: { game: GameState; round: number }) {
  const texts = useTexts();
  const actions = actionsInRound(game, round);
  return (
    <Panel kicker={<T k="round.actions.log_kicker" vars={{ round }} />}>
      {actions.length === 0 ? (
        <p className="muted">
          <T k="round.actions.log_empty" />
        </p>
      ) : (
        <ol className="log">
          {actions.map((action) => {
            const payers = describePayers(game, action, texts.t);
            return (
              <li key={action.id}>
                {describeAction(game, action, texts)}
                {payers && (
                  <span className="muted">
                    {' '}
                    <T k="round.actions.log_paid_by" vars={{ payers }} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
