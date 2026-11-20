import { useState, type DragEvent } from 'react';
import type { GameState, PrioritySize, TeamRole } from '../api/types';
import { DiceFace, HazardGlyph, TEAM_ICON } from '../assets/icons';
import {
  NO_CHANGES,
  activeElements,
  cellKey,
  hazardDice,
  markersByElement,
  vulnerabilityMap,
  type Changes,
  type Marker,
} from '../lib/derive';
import { roleKey } from '../lib/format';
import { vulnerabilityClass, vulnerabilityLevelKey } from '../lib/vulnerability';
import { T, useT } from '../texts';
import { VulnerabilityLegend } from './VulnerabilityLegend';

export interface BoardPreview {
  elementId?: number | null;
  hazardId?: number | null;
}

export interface MarkerSlot {
  role: TeamRole;
  size: PrioritySize;
  index: number;
}

export interface PlacedMarker extends Marker {
  slot: MarkerSlot;
}

/** Lets the moderator drop priority markers onto element rows (drag and drop, or pick then click). */
export interface MarkerPlacement {
  markers: Map<number, PlacedMarker[]>;
  /** The marker being dragged or picked up. */
  active: MarkerSlot | null;
  canPlace: (elementId: number) => boolean;
  onPlace: (elementId: number) => void;
  onPick: (slot: MarkerSlot | null) => void;
  onRemove: (slot: MarkerSlot) => void;
}

export function startMarkerDrag(event: DragEvent, onStart: () => void) {
  // Firefox only starts a drag when some data is set.
  event.dataTransfer.setData('text/plain', 'marker');
  event.dataTransfer.effectAllowed = 'move';
  onStart();
}

interface BoardProps {
  game: GameState;
  showPriorities?: boolean;
  showDice?: boolean;
  changes?: Changes;
  /** A target the moderator is about to act on: its row, column and crossing cell are outlined. */
  preview?: BoardPreview;
  placement?: MarkerPlacement;
}

/** The shared board: hazard columns with the vulnerability grid beside the destination elements and their status. */
export function Board({ game, showPriorities = true, showDice = true, changes = NO_CHANGES, preview, placement }: BoardProps) {
  // While placing markers every element stays on the board, so unchosen ones can still be picked.
  const elements = placement ? game.elements : activeElements(game);
  const vulnerability = vulnerabilityMap(game);
  const markers: Map<number, (Marker & { slot?: MarkerSlot })[]> = placement?.markers ?? markersByElement(game);
  const dice = hazardDice(game);
  const anyDice = showDice && [...dice.values()].some((d) => d.current || d.next);
  const t = useT();
  const [dragOver, setDragOver] = useState<number | null>(null);
  const over = placement?.active ? dragOver : null;
  const withPriorities = showPriorities || placement !== undefined;

  return (
    <div className="board" role="group" aria-label={t('board.grid.aria')}>
      <div className="board-scroll">
        <table className="board-grid">
          <thead>
            <tr>
              {game.hazards.map((hazard) => {
                const { current, next } = dice.get(hazard.id) ?? { current: null, next: null };
                return (
                  <th
                    key={hazard.id}
                    scope="col"
                    className={`hazard-head${preview?.hazardId === hazard.id ? ' is-preview' : ''}`}
                  >
                    <span className="hazard-head__top">
                      <HazardGlyph size={18} />
                      {showDice && next && (
                        <span title={t('board.grid.next_die_title', { die: next.die })}>
                          <DiceFace value={next.die} size={16} label={t('board.grid.next_die_label', { die: next.die })} />
                        </span>
                      )}
                    </span>
                    <span className="hazard-name">{hazard.name}</span>
                    <span className="hazard-head__foot">
                      <span className={`probability${changes.probabilities.has(hazard.id) ? ' is-changed' : ''}`}>
                        <T k="board.grid.probability" vars={{ probability: hazard.probability }} />
                      </span>
                      {showDice && current && (
                        <span title={t('board.grid.current_die_title', { die: current.die })}>
                          <DiceFace value={current.die} size={26} label={t('board.grid.current_die_label', { die: current.die })} />
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="element-head">
                <T k="board.grid.element_head" />
              </th>
              <th scope="col" className="status-head">
                <T k="board.grid.status_head" />
              </th>
              {withPriorities && (
                <th scope="col" className="priority-head">
                  <T k="board.grid.priority_head" />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {elements.map((element) => {
              const droppable = placement?.active ? placement.canPlace(element.id) : false;
              const rowClasses = [
                preview?.elementId === element.id && 'is-preview',
                changes.added.has(element.id) && 'is-new',
                droppable && 'is-drop-target',
                placement?.active && !droppable && 'is-blocked',
                over === element.id && 'is-drop-over',
              ].filter(Boolean);
              const dropHandlers =
                placement && droppable
                  ? {
                      onClick: () => placement.onPlace(element.id),
                      onDragOver: (event: DragEvent) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOver(element.id);
                      },
                      onDragLeave: (event: DragEvent) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(null);
                      },
                      onDrop: (event: DragEvent) => {
                        event.preventDefault();
                        setDragOver(null);
                        placement.onPlace(element.id);
                      },
                    }
                  : {};
              return (
              <tr key={element.id} className={rowClasses.length > 0 ? rowClasses.join(' ') : undefined} {...dropHandlers}>
                {game.hazards.map((hazard) => {
                  const key = cellKey(element.id, hazard.id);
                  const value = vulnerability.get(key);
                  const level = value === undefined ? null : vulnerabilityLevelKey(value);
                  const classes = ['cell', vulnerabilityClass(value)];
                  if (changes.cells.has(key)) classes.push('is-changed');
                  if (preview?.elementId === element.id && preview.hazardId === hazard.id) classes.push('is-target');
                  return (
                    <td
                      key={hazard.id}
                      className={classes.filter(Boolean).join(' ')}
                      title={
                        level
                          ? t('vulnerability.cell_title', { element: element.name, hazard: hazard.name, level: t(level) })
                          : undefined
                      }
                    >
                      {value ?? '\u00b7'}
                    </td>
                  );
                })}
                <th scope="row" className="element-name">
                  {droppable ? (
                    <button type="button" className="element-drop" title={t('board.grid.place_on', { element: element.name })}>
                      {element.name}
                    </button>
                  ) : (
                    element.name
                  )}
                </th>
                <td className="status">
                  <span className={`status-pill${changes.statuses.has(element.id) ? ' is-changed' : ''}`}>
                    {element.status}
                  </span>
                </td>
                {withPriorities && (
                  <td className={`priority${changes.markers.has(element.id) ? ' is-changed' : ''}`}>
                    {(markers.get(element.id) ?? []).map(({ team, size, slot }) => {
                      const Icon = TEAM_ICON[team.role];
                      const teamName = t(roleKey(team.role));
                      const label = t(size === 'large' ? 'board.grid.marker_large' : 'board.grid.marker_small', { team: teamName });
                      const content = (
                        <>
                          <Icon size={size === 'large' ? 24 : 18} />
                          <sup>{size === 'large' ? 2 : 1}</sup>
                        </>
                      );
                      if (placement && slot) {
                        return (
                          <button
                            key={`${team.id}-${size}-${slot.index}`}
                            type="button"
                            draggable
                            className={`marker marker--${size} marker--movable`}
                            title={t('board.grid.marker_move_hint', { marker: label })}
                            aria-label={t('board.grid.marker_remove', { team: teamName, size, element: element.name })}
                            onClick={(event) => {
                              event.stopPropagation();
                              placement.onRemove(slot);
                            }}
                            onDragStart={(event) => startMarkerDrag(event, () => placement.onPick(slot))}
                            onDragEnd={() => placement.onPick(null)}
                          >
                            {content}
                          </button>
                        );
                      }
                      return (
                        <span key={team.id} className={`marker marker--${size}`} title={label}>
                          {content}
                        </span>
                      );
                    })}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {elements.length === 0 ? (
        <p className="board-empty">
          <T k="board.grid.empty" />
        </p>
      ) : (
        <VulnerabilityLegend />
      )}
      {anyDice && (
        <p className="board-legend">
          <T k="board.grid.dice_legend" />
        </p>
      )}
    </div>
  );
}
