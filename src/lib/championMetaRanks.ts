export const RANK_FILTERS = [
  { key: 'all', label: 'All tiers', tiers: null, emblem: null },
  { key: 'challenger', label: 'Challenger', tiers: ['CHALLENGER'], emblem: 'CHALLENGER' },
  { key: 'grandmaster', label: 'Grandmaster', tiers: ['GRANDMASTER'], emblem: 'GRANDMASTER' },
  { key: 'master-plus', label: 'Master +', tiers: ['MASTER', 'GRANDMASTER', 'CHALLENGER'], emblem: 'MASTER' },
  { key: 'master', label: 'Master', tiers: ['MASTER'], emblem: 'MASTER' },
  { key: 'diamond-plus', label: 'Diamond +', tiers: ['DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'], emblem: 'DIAMOND' },
  { key: 'diamond', label: 'Diamond', tiers: ['DIAMOND'], emblem: 'DIAMOND' },
  { key: 'emerald-plus', label: 'Emerald +', tiers: ['EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'], emblem: 'EMERALD' },
  { key: 'emerald', label: 'Emerald', tiers: ['EMERALD'], emblem: 'EMERALD' },
  { key: 'platinum-plus', label: 'Platinum +', tiers: ['PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'], emblem: 'PLATINUM' },
  { key: 'platinum', label: 'Platinum', tiers: ['PLATINUM'], emblem: 'PLATINUM' },
  { key: 'gold-plus', label: 'Gold +', tiers: ['GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'], emblem: 'GOLD' },
  { key: 'gold', label: 'Gold', tiers: ['GOLD'], emblem: 'GOLD' },
  { key: 'silver', label: 'Silver', tiers: ['SILVER'], emblem: 'SILVER' },
  { key: 'bronze', label: 'Bronze', tiers: ['BRONZE'], emblem: 'BRONZE' },
  { key: 'iron', label: 'Iron', tiers: ['IRON'], emblem: 'IRON' },
] as const;

export type RankFilter = (typeof RANK_FILTERS)[number];

export function findRankFilter(value?: string): RankFilter {
  return RANK_FILTERS.find((filter) => filter.key === value) ?? RANK_FILTERS[0];
}
