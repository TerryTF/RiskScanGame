import type { ActionCard, Catalogue, GameState, Team, TeamRole } from '../api/types';

export function makeCatalogue(): Catalogue {
  const action = (card: Partial<ActionCard> & Pick<ActionCard, 'key' | 'name' | 'cost'>): ActionCard => ({
    description: `${card.name} description.`,
    free_in_round_zero: false,
    rounds: null,
    available: true,
    ...card,
  });
  return {
    element_groups: [
      {
        name: 'Tourism activities',
        elements: ['Skiing and snow tourism', 'Beach tourism', 'Hiking and camping', 'Urban sightseeing'],
      },
      {
        name: 'Tourism sector',
        elements: [
          'Other attractions and experiences',
          'Tourism businesses',
          'Tourism jobs and workers',
          'Visitor demand and travel connections',
        ],
      },
      {
        name: 'Wider destination systems',
        elements: [
          'Water supply',
          'Food supply',
          'Nature and wildlife',
          'Energy supply',
          'Local transport infrastructure',
          'Internet and communications',
          'Waste and wastewater services',
          'Healthcare and public health',
          'Housing',
          'Schools and community services',
          'Safety and emergency services',
        ],
      },
    ],
    hazards: [
      'Extreme heat',
      'Heat stress',
      'Cold',
      'Changes in precipitation',
      'Extreme precipitation',
      'Short drought',
      'Long drought',
      'Wildfire',
    ],
    teams: [
      {
        role: 'local_government',
        name: 'Local Government',
        interests: ['Inhabitant wellbeing', 'Safety and cleanliness'],
        allowance: { money: 2, knowledge: 0, authority: 4 },
      },
      {
        role: 'tourism_industry',
        name: 'Tourism Industry',
        interests: ['Local economy', 'Tourist satisfaction'],
        allowance: { money: 4, knowledge: 2, authority: 0 },
      },
      {
        role: 'civil_society',
        name: 'Civil Society',
        interests: ['Local ecosystems', 'Cultural history', 'Social equity'],
        allowance: { money: 0, knowledge: 4, authority: 2 },
      },
    ],
    actions: [
      action({
        key: 'hazard_prediction',
        name: 'Hazard Prediction',
        cost: { money: 0, knowledge: 1, authority: 0, wild: 1 },
        free_in_round_zero: true,
      }),
      action({
        key: 'risk_adaptation',
        name: 'Risk Adaptation',
        cost: { money: 1, knowledge: 1, authority: 2, wild: 0 },
        free_in_round_zero: true,
      }),
      action({
        key: 'local_investment',
        name: 'Local Investment',
        cost: { money: 1, knowledge: 0, authority: 0, wild: 2 },
        free_in_round_zero: true,
      }),
      action({
        key: 'diversification',
        name: 'Diversification',
        cost: { money: 2, knowledge: 1, authority: 1, wild: 0 },
      }),
      action({
        key: 'reduce_emissions',
        name: 'Reduce Emissions',
        cost: { money: 1, knowledge: 1, authority: 1, wild: 0 },
        rounds: [1, 2],
      }),
    ],
    event_templates: [
      {
        key: 'rising_temperatures',
        name: 'Rising temperatures',
        description: 'Warmer conditions.',
        type: 'standard',
        suggested_round: 1,
        effects: [
          { kind: 'hazard_probability', delta: 1, hazard: 'Extreme heat', element: null },
          { kind: 'hazard_probability', delta: 1, hazard: 'Heat stress', element: null },
        ],
      },
      {
        key: 'longer_dry_seasons',
        name: 'Longer dry seasons',
        description: 'Dry periods last longer.',
        type: 'standard',
        suggested_round: 2,
        effects: [{ kind: 'hazard_probability', delta: 1, hazard: 'Long drought', element: null }],
      },
      {
        key: 'pressure_on_water_supplies',
        name: 'Growing pressure on water supplies',
        description: 'Water supply is more exposed.',
        type: 'standard',
        suggested_round: null,
        effects: [{ kind: 'vulnerability', delta: 1, hazard: 'Long drought', element: 'Water supply' }],
      },
      {
        key: 'transition_pressure',
        name: 'Transition pressure',
        description: 'Applies unless Reduce Emissions was completed in Rounds 1 and 2.',
        type: 'transition_pressure',
        suggested_round: 3,
        effects: [{ kind: 'element_status', delta: -2, hazard: null, element: 'Tourism businesses' }],
      },
    ],
    limits: {
      regular_rounds: [4, 5],
      default_regular_rounds: 4,
      elements_min: 4,
      elements_max: 12,
      hazards_min: 4,
      hazards_max: 5,
      probability_min: 1,
      probability_max: 6,
      vulnerability_min: 0,
      vulnerability_max: 3,
      starting_status: 10,
      events_per_round_max: 2,
      transition_pressure_round: 3,
      reduce_emissions_rounds: [1, 2],
      reduce_emissions_target: 2,
      round_zero_damage_limit: 2,
      large_priorities_per_team: 2,
      small_priorities_per_team: 2,
      local_investment_gain: 2,
      adaptation_reduction: 1,
      diversification_status: 7,
    },
  };
}

export function makeTeam(id: number, role: TeamRole, overrides: Partial<Team> = {}): Team {
  const names: Record<TeamRole, string> = {
    local_government: 'Local Government',
    tourism_industry: 'Tourism Industry',
    civil_society: 'Civil Society',
  };
  return {
    id,
    role,
    name: names[role],
    members: [],
    priorities: [],
    resources: { money: 0, knowledge: 0, authority: 0 },
    ...overrides,
  };
}

/** A game still being set up: two elements, three hazards, a full matrix and the API's default transition event. */
export function makeSetupGame(overrides: Partial<GameState> = {}): GameState {
  return makeGame({
    phase: 'SETUP',
    current_round: null,
    elements: [
      { id: 1, name: 'Tourism businesses', status: 10, active: true },
      { id: 2, name: 'Water supply', status: 10, active: true },
    ],
    hazards: [
      { id: 11, name: 'Extreme heat', probability: 4 },
      { id: 12, name: 'Heat stress', probability: 3 },
      { id: 13, name: 'Long drought', probability: 2 },
    ],
    vulnerabilities: [],
    teams: [makeTeam(1, 'local_government'), makeTeam(2, 'tourism_industry'), makeTeam(3, 'civil_society')],
    events: [
      {
        id: 1,
        round: 3,
        type: 'transition_pressure',
        name: 'Transition pressure',
        description: 'Penalty applies unless Reduce Emissions was completed.',
        effects: [{ kind: 'element_status', delta: -2, hazard_id: null, element_id: null }],
        status: 'pending',
        applied_changes: [],
      },
    ],
    ...overrides,
  });
}

/**
 * A small mid-game state: three elements (one inactive), two hazards, three teams, Round 1 in its action phase.
 * Element 1 and 2 are prioritised by the teams; element 3 is not and so is inactive.
 */
export function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game-1',
    destination_name: 'Alpine visitor region',
    geographic_scope: 'Region',
    total_rounds: 4,
    phase: 'ACTION_PHASE',
    current_round: 1,
    elements: [
      { id: 1, name: 'Beach tourism', status: 10, active: true },
      { id: 2, name: 'Water supply', status: 8, active: true },
      { id: 3, name: 'Harbour', status: 10, active: false },
    ],
    hazards: [
      { id: 1, name: 'Extreme heat', probability: 4 },
      { id: 2, name: 'Long drought', probability: 2 },
    ],
    vulnerabilities: [
      { element_id: 1, hazard_id: 1, value: 2 },
      { element_id: 1, hazard_id: 2, value: 1 },
      { element_id: 2, hazard_id: 1, value: 1 },
      { element_id: 2, hazard_id: 2, value: 3 },
      { element_id: 3, hazard_id: 1, value: 1 },
      { element_id: 3, hazard_id: 2, value: 1 },
    ],
    teams: [
      makeTeam(1, 'local_government', {
        priorities: [
          { element_id: 1, size: 'large' },
          { element_id: 2, size: 'small' },
        ],
        resources: { money: 2, knowledge: 0, authority: 4 },
      }),
      makeTeam(2, 'tourism_industry', {
        priorities: [
          { element_id: 2, size: 'large' },
          { element_id: 1, size: 'small' },
        ],
        resources: { money: 4, knowledge: 2, authority: 0 },
      }),
      makeTeam(3, 'civil_society', {
        priorities: [{ element_id: 2, size: 'large' }],
        resources: { money: 0, knowledge: 4, authority: 2 },
      }),
    ],
    hazard_rolls: [],
    actions: [],
    events: [],
    scores: [],
    ledger: [],
    reduce_emissions_progress: 0,
    winners: [],
    ...overrides,
  };
}
