import { useCallback, useState } from 'react';
import { RESOURCE_TYPES, TEAM_ROLES } from '../../api/types';
import type { Catalogue, GameState, Limits, PrioritySize, Resources, TeamRole } from '../../api/types';
import type { GameCommands } from '../../api/queries';
import { TEAM_ICON } from '../../assets/icons';
import { startMarkerDrag, type MarkerPlacement, type MarkerSlot, type PlacedMarker } from '../../components/Board';
import { BoardScreen } from '../../components/BoardScreen';
import { Panel } from '../../components/GameLayout';
import { useLocalBack, UndoArea } from '../../components/ModeratorBar';
import { TeamBadge } from '../../components/Tokens';
import type { StepCopy } from '../../lib/copy';
import { elementName, orderedTeams, teamByRole, type Changes } from '../../lib/derive';
import { resourceKey, roleKey } from '../../lib/format';
import { CardText, T, cardKeys, interestsText, useT, type Translate } from '../../texts';
import { ShareBoard } from '../setup/ShareBoard';
import { SkipRoundZero } from './SkipRoundZero';

type Stage = 'teams' | 'priorities';

const PRIORITIES_COPY: StepCopy = {
  pill: { k: 'round.priorities.pill' },
  title: { k: 'round.priorities.title' },
  subtitle: { k: 'round.priorities.subtitle' },
  info: { k: 'round.priorities.info' },
};

export function allowanceText(allowance: Resources, t: Translate): string {
  const parts = RESOURCE_TYPES.map((resource) => ({ resource, amount: allowance[resource] }))
    .filter((part) => part.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const resources = parts.map((part) => `${part.amount} ${t(resourceKey(part.resource)).toLowerCase()}`).join(' + ');
  return t('round.allowance.per_round', { resources });
}

interface TeamsStageProps {
  game: GameState;
  catalogue: Catalogue;
  commands: GameCommands;
  changes: Changes;
}

/** Between setup and Round 0: introduce the role cards, then place each team's four priority markers. */
export function TeamsStage({ game, catalogue, commands, changes }: TeamsStageProps) {
  const complete = game.teams.every((team) => team.priorities.length === 4);
  const [stage, setStage] = useState<Stage>(complete ? 'priorities' : 'teams');
  const backToTeams = useCallback(() => setStage('teams'), []);
  useLocalBack(stage === 'priorities' ? backToTeams : null);

  if (stage === 'teams') {
    return (
      <BoardScreen
        game={game}
        showPriorities={false}
        error={commands.error}
        side={
          <>
            <Panel kicker={<T k="round.teams.share_kicker" />}>
              <ShareBoard gameId={game.id} />
            </Panel>
            <UndoArea key="teams">
              <RoleCards
                game={game}
                catalogue={catalogue}
                busy={commands.pending}
                onContinue={async (members) => {
                  const changed = TEAM_ROLES.some((role) => (teamByRole(game, role)?.members ?? []).join(',') !== members[role].join(','));
                  if (!changed || (await commands.setTeams(TEAM_ROLES.map((role) => ({ role, members: members[role] }))))) {
                    setStage('priorities');
                  }
                }}
              />
            </UndoArea>
            <EventQueue game={game} />
          </>
        }
      />
    );
  }

  return (
    // The draft markers live in PrioritiesStage and are shown on the board, so Undo must reset the whole stage.
    <UndoArea key="priorities">
      <PrioritiesStage game={game} catalogue={catalogue} commands={commands} changes={changes} onBack={backToTeams} />
    </UndoArea>
  );
}

/** Each team's role and, once chosen, its four priority elements. Shown to moderator and participants alike. */
export function TeamSummaryPanel({ game, limits }: { game: GameState; limits: Limits }) {
  return (
    <Panel kicker={<T k="round.team_summary.kicker" />}>
      <ul className="team-summary">
        {orderedTeams(game).map((team) => {
          const Icon = TEAM_ICON[team.role];
          const chosen = team.priorities.length === limits.large_priorities_per_team + limits.small_priorities_per_team;
          return (
            <li key={team.id} className={`team-summary__row team--${team.role}`}>
              <Icon size={40} />
              <div>
                <strong>
                  <T k={roleKey(team.role)} />
                </strong>
                <span className="muted">
                  {chosen ? (
                    team.priorities
                      .map((p) => `${elementName(game, p.element_id)} (\u00d7${p.size === 'large' ? 2 : 1})`)
                      .join(', ')
                  ) : (
                    <T
                      k="round.team_summary.markers"
                      vars={{ large: limits.large_priorities_per_team, small: limits.small_priorities_per_team }}
                    />
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function RoleCards({
  game,
  catalogue,
  busy,
  onContinue,
}: {
  game: GameState;
  catalogue: Catalogue;
  busy: boolean;
  onContinue: (members: Record<TeamRole, string[]>) => void;
}) {
  const t = useT();
  const [members, setMembers] = useState<Record<TeamRole, string>>(() => ({
    local_government: (teamByRole(game, 'local_government')?.members ?? []).join(', '),
    tourism_industry: (teamByRole(game, 'tourism_industry')?.members ?? []).join(', '),
    civil_society: (teamByRole(game, 'civil_society')?.members ?? []).join(', '),
  }));
  const parse = (text: string) =>
    text
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

  return (
    <Panel kicker={<T k="round.role_cards.kicker" />} className="role-cards">
      {catalogue.teams.map((card) => {
        const Icon = TEAM_ICON[card.role];
        return (
          <article key={card.role} className={`role-card team--${card.role}`}>
            <Icon size={56} />
            <div>
              <h3>
                <T k={roleKey(card.role)} />
              </h3>
              <p className="role-card__allowance">{allowanceText(card.allowance, t)}</p>
              <p className="muted">
                <T k="round.role_cards.interests_label" />{' '}
                <CardText k={cardKeys.teamInterests(card.role)} fallback={interestsText(card.interests)} />
              </p>
              <label>
                <span className="sr-only">
                  <T k="round.role_cards.members_label" vars={{ role: t(roleKey(card.role)) }} />
                </span>
                <input
                  value={members[card.role]}
                  placeholder={t('round.role_cards.members_placeholder')}
                  onChange={(event) => setMembers({ ...members, [card.role]: event.target.value })}
                />
              </label>
            </div>
          </article>
        );
      })}
      <p className="muted">
        <T k="round.role_cards.allocation_note" />
      </p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        onClick={() =>
          onContinue({
            local_government: parse(members.local_government),
            tourism_industry: parse(members.tourism_industry),
            civil_society: parse(members.civil_society),
          })
        }
      >
        <T k="round.role_cards.continue" />
      </button>
    </Panel>
  );
}

/** The moderator's view of every configured event. Players never see this list. */
export function EventQueue({ game }: { game: GameState }) {
  const events = [...game.events].sort((a, b) => a.round - b.round);
  return (
    <Panel kicker={<T k="round.event_queue.kicker" />} title={<T k="round.event_queue.title" />} className="event-queue">
      {events.length === 0 ? (
        <p className="muted">
          <T k="round.event_queue.empty" />
        </p>
      ) : (
        <ul className="queue">
          {events.map((event) => (
            <li key={event.id} className={`queue__item queue__item--${event.status}`}>
              <span className="queue__round">
                <T k="round.event_queue.round" vars={{ round: event.round }} />
              </span>
              <span>{event.name}</span>
              <span className="queue__status">
                <T k={`round.event_queue.status_${event.status}` as const} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        <T k="round.event_queue.hidden_note" />
      </p>
    </Panel>
  );
}

type Slots = Record<PrioritySize, (number | null)[]>;

const SIZES: PrioritySize[] = ['large', 'small'];
const weight = (size: PrioritySize) => (size === 'large' ? 2 : 1);
const sameSlot = (a: MarkerSlot | null, b: MarkerSlot) => a?.role === b.role && a.size === b.size && a.index === b.index;

const slotsOf = (game: GameState, role: TeamRole, limits: Limits): Slots => {
  const priorities = teamByRole(game, role)?.priorities ?? [];
  const pick = (size: PrioritySize, count: number) =>
    Array.from({ length: count }, (_, index) => priorities.filter((p) => p.size === size)[index]?.element_id ?? null);
  return { large: pick('large', limits.large_priorities_per_team), small: pick('small', limits.small_priorities_per_team) };
};

interface PrioritiesStageProps extends TeamsStageProps {
  onBack: () => void;
}

/** Teams drag their large and small markers from the tray onto destination elements on the board. */
function PrioritiesStage({ game, catalogue, commands, changes, onBack }: PrioritiesStageProps) {
  const t = useT();
  const { limits } = catalogue;
  const busy = commands.pending;
  const saved = Object.fromEntries(TEAM_ROLES.map((role) => [role, slotsOf(game, role, limits)])) as Record<TeamRole, Slots>;
  const [draft, setDraft] = useState<Record<TeamRole, Slots>>(saved);
  const [active, setActive] = useState<MarkerSlot | null>(null);

  const everySlotFilled = TEAM_ROLES.every((role) => [...draft[role].large, ...draft[role].small].every((id) => id !== null));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // Saved priorities are final: the markers can no longer be moved.
  const locked = game.teams.every((team) => team.priorities.length === limits.large_priorities_per_team + limits.small_priorities_per_team);

  const chosen = new Set(TEAM_ROLES.flatMap((role) => [...draft[role].large, ...draft[role].small]).filter((id): id is number => id !== null));
  const dropped = game.elements.filter((element) => !chosen.has(element.id)).map((element) => element.name);

  const valueOf = (slot: MarkerSlot) => draft[slot.role][slot.size][slot.index] ?? null;
  const setSlot = (slot: MarkerSlot, value: number | null) =>
    setDraft((current) => {
      const slots = { ...current[slot.role], [slot.size]: current[slot.role][slot.size].map((id, i) => (i === slot.index ? value : id)) };
      return { ...current, [slot.role]: slots };
    });
  const teamHasElement = (slot: MarkerSlot, elementId: number) =>
    SIZES.some((size) => draft[slot.role][size].some((id, index) => id === elementId && !(size === slot.size && index === slot.index)));

  const markers = new Map<number, PlacedMarker[]>();
  for (const size of SIZES) {
    for (const role of TEAM_ROLES) {
      const team = teamByRole(game, role);
      if (!team) continue;
      draft[role][size].forEach((elementId, index) => {
        if (elementId === null) return;
        markers.set(elementId, [...(markers.get(elementId) ?? []), { team, size, slot: { role, size, index } }]);
      });
    }
  }

  const placement: MarkerPlacement = {
    markers,
    active,
    canPlace: (elementId) => active !== null && !teamHasElement(active, elementId),
    onPlace: (elementId) => {
      if (active === null || teamHasElement(active, elementId)) return;
      setSlot(active, elementId);
      setActive(null);
    },
    onPick: setActive,
    onRemove: (slot) => {
      setSlot(slot, null);
      setActive(null);
    },
  };

  const returnable = active !== null && valueOf(active) !== null;
  const save = () =>
    commands.setPriorities(
      TEAM_ROLES.map((role) => ({
        role,
        large: draft[role].large.filter((id): id is number => id !== null),
        small: draft[role].small.filter((id): id is number => id !== null),
      })),
    );

  return (
    <BoardScreen
      game={game}
      copy={PRIORITIES_COPY}
      changes={changes}
      error={commands.error}
      placement={locked ? undefined : placement}
      side={
        <>
          <TeamSummaryPanel game={game} limits={limits} />
          <EventQueue game={game} />
        </>
      }
      below={
        <section
          className={`priorities${returnable ? ' is-drop-back' : ''}`}
          aria-label={t('round.priorities_editor.label')}
          onDragOver={
            returnable
              ? (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              : undefined
          }
          onDrop={
            returnable
              ? (event) => {
                  event.preventDefault();
                  if (active) placement.onRemove(active);
                }
              : undefined
          }
        >
          <p className="priorities__hint" role="status">
            {locked ? (
              <T k="round.priorities_editor.locked" />
            ) : active === null ? (
              <T k="round.priorities_editor.hint" />
            ) : (
              <T k="round.priorities_editor.placing" vars={{ team: t(roleKey(active.role)), size: active.size }} />
            )}
          </p>
          <div className="priorities__teams">
            {TEAM_ROLES.map((role) => {
              const Icon = TEAM_ICON[role];
              return (
                <fieldset key={role} className={`priority-team team--${role}`}>
                  <legend>
                    <TeamBadge role={role} size={26} />
                  </legend>
                  <div className="marker-tray">
                    {SIZES.flatMap((size) =>
                      draft[role][size].map((elementId, index) => {
                        const slot = { role, size, index };
                        const picked = sameSlot(active, slot);
                        const marker = t('round.priorities_editor.marker_name', { team: t(roleKey(role)), size, number: index + 1 });
                        const element = elementId === null ? null : elementName(game, elementId);
                        return (
                          <span key={`${size}-${index}`} className="marker-slot">
                            <button
                              type="button"
                              draggable={!locked}
                              disabled={locked}
                              className={`marker-chip marker-chip--${size}${element !== null ? ' is-placed' : ''}${picked ? ' is-active' : ''}`}
                              aria-pressed={picked}
                              aria-label={
                                element === null
                                  ? t('round.priorities_editor.marker_unplaced', { marker })
                                  : t('round.priorities_editor.marker_on', { marker, element })
                              }
                              onClick={() => setActive(picked ? null : slot)}
                              onDragStart={(event) => startMarkerDrag(event, () => setActive(slot))}
                              onDragEnd={() => setActive(null)}
                            >
                              <Icon size={size === 'large' ? 30 : 22} />
                              <span className="marker-chip__text">
                                <strong>
                                  <T
                                    k={size === 'large' ? 'round.priorities_editor.chip_large' : 'round.priorities_editor.chip_small'}
                                    vars={{ weight: weight(size) }}
                                  />
                                </strong>
                                <span>{element ?? <T k="round.priorities_editor.unplaced" />}</span>
                              </span>
                            </button>
                            {element !== null && !locked && (
                              <button
                                type="button"
                                className="marker-slot__remove"
                                aria-label={t('round.priorities_editor.remove', { marker, element })}
                                title={t('round.priorities_editor.remove_title')}
                                onClick={() => placement.onRemove(slot)}
                              >
                                &times;
                              </button>
                            )}
                          </span>
                        );
                      }),
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
          {dropped.length > 0 && everySlotFilled && (
            <p className="muted" role="status">
              <T k="round.priorities_editor.dropped" vars={{ elements: dropped.join(', ') }} />
            </p>
          )}
          <div className="step-actions">
            <button type="button" className="btn btn--ghost" onClick={onBack} disabled={busy}>
              <T k="round.priorities_editor.back" />
            </button>
            {!locked && (
              <button type="button" className="btn btn--soft" onClick={save} disabled={busy || !everySlotFilled || !dirty}>
                <T k="round.priorities_editor.save" />
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => commands.startRoundZero()}
              disabled={busy || !locked}
            >
              <T k="round.priorities_editor.start" />
            </button>
            {!locked && (
              <span className="step-actions__hint">
                <T k="round.priorities_editor.save_hint" />
              </span>
            )}
          </div>
          <SkipRoundZero disabled={busy || !locked} onSkip={() => commands.skipRoundZero()} />
        </section>
      }
    />
  );
}
