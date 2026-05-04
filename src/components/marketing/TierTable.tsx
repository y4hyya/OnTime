import { TIER_MULTIPLIERS, tierLabel } from "@/lib/ai/tiers";

export function TierTable() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-left">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-sm font-medium">Delay</th>
            <th className="px-4 py-3 text-sm font-medium">Payout</th>
          </tr>
        </thead>
        <tbody>
          {TIER_MULTIPLIERS.map((tier, i) => (
            <tr key={i} className="border-t">
              <td className="px-4 py-3 text-sm">{tierLabel(tier)}</td>
              <td className="px-4 py-3 text-sm font-medium">
                {tier.multiplier}× premium
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
