/** Default wording, by text key. Editors can change any of these in editor mode. `{name}` marks a value filled in by the game. */
export const commonTexts = {
  'vulnerability.legend_label': 'Vulnerability scale',
  'vulnerability.level_0': 'No vulnerability',
  'vulnerability.level_1': 'Low vulnerability',
  'vulnerability.level_2': 'Moderate vulnerability',
  'vulnerability.level_3': 'High vulnerability',
  'vulnerability.cell_title': '{element} × {hazard}: {level}',
  'common.brand': 'RISKSCAN',
  'role.local_government': 'Local government',
  'role.tourism_industry': 'Tourism industry',
  'role.civil_society': 'Civil society',
  'resource.money': 'Money',
  'resource.knowledge': 'Knowledge',
  'resource.authority': 'Authority',

  'step.setup.pill': 'SETUP',
  'step.setup.title': 'Game setup',
  'step.setup.subtitle': 'The moderator is preparing the destination.',
  'step.setup.info': 'MODERATOR SETUP ONLY • Participants do not see these screens.',

  'step.priorities.pill': 'TEAM SETUP',
  'step.priorities.title': 'Introduce the three teams',
  'step.priorities.subtitle': 'The destination is ready. Participants read their role cards and join one of three teams.',
  'step.priorities.info': 'TEAM SETUP • Teams receive two large and two small priority markers for the next step.',

  'step.round0_prediction.pill': 'ROUND 0 · PRACTICE',
  'step.round0_prediction.title': 'PRACTICE ACTION 1: Hazard Prediction rolls two dice',
  'step.round0_prediction.subtitle':
    'The team selects a hazard. The game rolls one die for Round 0 and one for Round 1. No hazard damage happens yet.',
  'step.round0_prediction.info':
    'PREDICTION • Teams may take further actions before hazard damage. The saved dice are not rolled again.',

  'step.round0_adaptation.pill': 'ROUND 0 · PRACTICE',
  'step.round0_adaptation.title': 'PRACTICE ACTION 2: Risk Adaptation lowers a vulnerability',
  'step.round0_adaptation.subtitle':
    'Teams choose an element and a hazard. The game reduces that vulnerability by 1, never below 0.',
  'step.round0_adaptation.info':
    'ADAPTATION • Adapting does not change an element’s status. It changes how much damage a hazard can do.',

  'step.round0_investment.pill': 'ROUND 0 · PRACTICE',
  'step.round0_investment.title': 'PRACTICE ACTION 3: Local Investment increases an element’s status',
  'step.round0_investment.subtitle':
    'Teams choose an element. The game raises its status by 2; its vulnerabilities stay unchanged.',
  'step.round0_investment.info': 'INVESTMENT • The improvement carries forward into Round 1.',

  'step.round0_hazards.pill': 'ROUND 0 · RESOLUTION',
  'step.round0_hazards.title': 'ROUND 0 RESOLUTION: Roll the hazard dice',
  'step.round0_hazards.subtitle':
    'Predicted hazards reuse their stored die. In Round 0 only the first two triggered hazards, left to right, cause damage.',
  'step.round0_hazards.info': 'RESOLUTION • Damage is applied for real and the game is not reset afterwards.',

  'step.round0_scoring.pill': 'ROUND 0 · RESOLUTION',
  'step.round0_scoring.title': 'ROUND 0 RESOLUTION: Damage is applied and the game is not reset',
  'step.round0_scoring.subtitle': 'Round 0 really happened. Everything that changed carries into Round 1.',
  'step.round0_scoring.info': 'NEXT • Reveal the Round 0 scores.',

  'step.round0_complete.pill': 'ROUND 0 · SCORES',
  'step.round0_complete.title': 'SCORES: Scores reflect each team’s chosen priorities',
  'step.round0_complete.subtitle':
    'Large priority markers count double and small markers count once. Statuses, vulnerabilities and predicted dice carry into Round 1.',
  'step.round0_complete.info': 'ROUND 0 SCORES • {scores}. Continue to Round 1 when the teams are ready.',

  'step.resource_allocation.pill': 'ROUND {round} · RESOURCE ALLOCATION',
  'step.resource_allocation.title': 'RESOURCE ALLOCATION: Each team receives its resource tokens',
  'step.resource_allocation.subtitle':
    'Unspent resources from earlier rounds expire. Teams can now negotiate and fund shared action cards; Reduce emissions is also available.',
  'step.resource_allocation.info': 'NEXT • Give each team its tokens to open the action phase.',

  'step.action_phase.pill': 'ROUND {round} · ACTION',
  'step.action_phase.title': 'ACTIONS: Teams negotiate and fund shared actions together',
  'step.action_phase.subtitle':
    'The moderator records each agreed action and who pays. Balances update as soon as an action is applied.',
  'step.action_phase.info':
    'AVAILABLE ACTIONS • Choose an action card, record who pays, and apply it. Close the phase when teams are done.',

  'step.hazard_phase.pill': 'ROUND {round} · HAZARDS',
  'step.hazard_phase.title': 'HAZARDS: Predicted dice are reused, the others roll now',
  'step.hazard_phase.subtitle':
    'A predicted hazard is not rolled again. Damage reflects the adaptation and investment already made.',
  'step.hazard_phase.info': 'NEXT • Roll the hazard dice for this round.',

  'step.event_phase.pill': 'ROUND {round} · HAZARDS',
  'step.event_phase.title': 'HAZARDS: Dice are rolled and damage is applied',
  'step.event_phase.subtitle': 'Triggered hazards reduce the status of every active element by its vulnerability.',
  'step.event_phase.info': 'NEXT • Reveal this round’s event. Events apply after hazard damage.',

  'step.scoring.pill': 'ROUND {round} · EVENTS',
  'step.scoring.title': 'EVENT: An event changes the game for later rounds',
  'step.scoring.subtitle': 'The event was revealed after the hazard rolls. Future event cards stay hidden from players.',
  'step.scoring.info': 'NEXT • Calculate the scores for this round.',

  'step.round_complete.pill': 'ROUND {round} · CONTINUE',
  'step.round_complete.title': 'SCORES: Scores reflect each team’s chosen priorities',
  'step.round_complete.subtitle':
    'Large priority markers count double and small markers count once, using the updated status.',
  'step.round_complete.info': 'ROUND {round} SCORES • {scores}. Previous round histories remain available.',

  'step.game_complete.pill': 'FINAL · REVIEW',
  'step.game_complete.title': 'The final board keeps the full story visible',
  'step.game_complete.subtitle':
    'The game ended after Round {last} of {total} planned rounds. Final scores use the last round played.',
  'step.game_complete.info': 'FINAL • {scores}. Reflect on collaboration and the whole destination.',

  'describe.all_elements': 'All elements',
  'describe.effect.probability': '{hazard} probability {delta}',
  'describe.effect.vulnerability': '{element} × {hazard} vulnerability {delta}',
  'describe.effect.status': '{element} status {delta}',
  'describe.action.prediction': '{action}: {hazard} (dice {dice})',
  'describe.action.adaptation': '{action}: {element} × {hazard}, vulnerability {before}→{after}',
  'describe.action.investment': '{action}: {element}, status {before}→{after}',
  'describe.action.emissions': '{action}: progress {progress}/{target}',
  'describe.action.diversification': '{action}: {element} added at status {status}',
  'describe.marker.split': '{team} split its large marker on {element}',
  'describe.marker.moved': '{team} moved its {size} marker from {element}',
  'describe.and': 'and',

  'history.hazards_triggered': 'Hazards triggered: {hazards}',
  'history.no_hazard': 'No hazard triggered',
  'history.skipped_round0': 'Skipped in Round 0: {hazards}',
  'history.round0_skipped': 'Practice round skipped',
  'history.event_avoided': '{event} avoided',
  'history.event_applied': '{event}: {changes}',
  'history.no_change': 'no change',
  'history.scores': 'Scores: {scores}',
} satisfies Record<string, string>;
