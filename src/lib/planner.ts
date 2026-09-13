import Decimal from "decimal.js";
import { calculateProductionComparison } from "./calculations";
import {
  SEGMENTS,
  type AcceptanceMode,
  type Allocation,
  type ClientInput,
  type ClientOutcome,
  type FarmInput,
  type FarmSegmentBalance,
  type InputSnapshot,
  type LocalResidual,
  type PlanningKpis,
  type PlanningResult,
  type Segment,
} from "./types";

/** A is the highest quality and D is the lowest. */
const QUALITY_RANK: Record<Segment, number> = { A: 0, B: 1, C: 2, D: 3 };
const ALLOCATION_UNIT_TONNES = new Decimal(5);

interface WorkingBalance {
  readonly farmId: string;
  readonly segment: Segment;
  readonly actualTonnes: Decimal;
  availableTonnes: Decimal;
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareSegments(left: Segment, right: Segment): number {
  return QUALITY_RANK[left] - QUALITY_RANK[right];
}

function toNumber(value: Decimal, label: string): number {
  const result = value.toNumber();
  if (!Number.isFinite(result)) {
    throw new Error(`Planning result ${label} is not finite.`);
  }
  return result;
}

function toUnits(tonnes: number, label: string): Decimal {
  const units = new Decimal(tonnes).div(ALLOCATION_UNIT_TONNES);
  if (!units.isInteger() || units.isNegative()) {
    throw new Error(`Planning input ${label} is not a nonnegative 5-tonne quantity.`);
  }
  return units;
}

function acceptsSegment(
  mode: AcceptanceMode,
  requestedSegment: Segment,
  availableSegment: Segment,
): boolean {
  if (mode === "EXACT") {
    return availableSegment === requestedSegment;
  }
  return QUALITY_RANK[availableSegment] <= QUALITY_RANK[requestedSegment];
}

function qualityUpgrade(requestedSegment: Segment, fromSegment: Segment) {
  return {
    fromSegment,
    toSegment: requestedSegment,
    levels: QUALITY_RANK[requestedSegment] - QUALITY_RANK[fromSegment],
  };
}

function createWorkingBalances(farms: readonly FarmInput[]): WorkingBalance[] {
  return [...farms]
    .sort((left, right) => compareIds(left.farmId, right.farmId))
    .flatMap((farm) =>
      SEGMENTS.map((segment) => {
        const actualTonnes = new Decimal(farm.actualTonnes[segment]);
        return {
          farmId: farm.farmId,
          segment,
          actualTonnes,
          availableTonnes: actualTonnes,
        };
      }),
    );
}

function sortClients(clients: readonly ClientInput[]): ClientInput[] {
  return [...clients].sort((left, right) => {
    const priceOrder = new Decimal(right.exportPricePerTonneEur).cmp(
      new Decimal(left.exportPricePerTonneEur),
    );
    return priceOrder === 0 ? compareIds(left.clientId, right.clientId) : priceOrder;
  });
}

function sortCompatibleBalances(
  balances: readonly WorkingBalance[],
  client: ClientInput,
): WorkingBalance[] {
  return balances
    .filter(
      (balance) =>
        balance.availableTonnes.gt(0) &&
        acceptsSegment(client.acceptanceMode, client.requestedSegment, balance.segment),
    )
    .sort((left, right) => {
      const leftUpgrade = QUALITY_RANK[client.requestedSegment] - QUALITY_RANK[left.segment];
      const rightUpgrade = QUALITY_RANK[client.requestedSegment] - QUALITY_RANK[right.segment];
      if (leftUpgrade !== rightUpgrade) return leftUpgrade - rightUpgrade;
      const farmOrder = compareIds(left.farmId, right.farmId);
      return farmOrder === 0 ? compareSegments(left.segment, right.segment) : farmOrder;
    });
}

function stableTraceId(prefix: "allocation" | "residual", ordinal: number): string {
  return `${prefix}-${String(ordinal).padStart(4, "0")}`;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Planning invariant failed: ${message}`);
  }
}

function isMultipleOfFive(value: Decimal): boolean {
  return value.gte(0) && value.mod(ALLOCATION_UNIT_TONNES).isZero();
}

function assertPlanningInvariants(
  snapshot: InputSnapshot,
  result: PlanningResult,
): void {
  const farmsById = new Map(snapshot.farms.map((farm) => [farm.farmId, farm]));
  const clientsById = new Map(snapshot.clients.map((client) => [client.clientId, client]));
  const allocationByClient = new Map<string, Decimal>();
  const revenueByClient = new Map<string, Decimal>();
  const allocationByFarmSegment = new Map<string, Decimal>();
  const allocationIds = new Set<string>();

  for (const allocation of result.allocations) {
    const farm = farmsById.get(allocation.farmId);
    const client = clientsById.get(allocation.clientId);
    invariant(farm !== undefined, `allocation references unknown farm ${allocation.farmId}`);
    invariant(client !== undefined, `allocation references unknown client ${allocation.clientId}`);
    invariant(allocationIds.has(allocation.allocationId) === false, "allocation IDs are unique");
    allocationIds.add(allocation.allocationId);

    const tonnes = new Decimal(allocation.tonnes);
    invariant(tonnes.gt(0) && isMultipleOfFive(tonnes), "allocations use positive 5-tonne units");
    invariant(allocation.requestedSegment === client.requestedSegment, "allocation request matches client");
    invariant(
      new Decimal(allocation.exportPricePerTonneEur).eq(client.exportPricePerTonneEur),
      `allocation ${allocation.allocationId} uses the served client price`,
    );
    invariant(
      acceptsSegment(client.acceptanceMode, client.requestedSegment, allocation.segment),
      `allocation ${allocation.allocationId} is incompatible with its client`,
    );
    const expectedUpgrade = qualityUpgrade(client.requestedSegment, allocation.segment);
    invariant(
      allocation.qualityUpgrade.fromSegment === expectedUpgrade.fromSegment &&
        allocation.qualityUpgrade.toSegment === expectedUpgrade.toSegment &&
        allocation.qualityUpgrade.levels === expectedUpgrade.levels,
      `allocation ${allocation.allocationId} has the wrong quality upgrade`,
    );
    const expectedRevenue = tonnes.times(client.exportPricePerTonneEur);
    invariant(
      new Decimal(allocation.exportRevenueEur).eq(expectedRevenue),
      `allocation ${allocation.allocationId} revenue uses the served client price`,
    );

    const clientTotal = allocationByClient.get(allocation.clientId) ?? new Decimal(0);
    allocationByClient.set(allocation.clientId, clientTotal.plus(tonnes));
    const clientRevenue = revenueByClient.get(allocation.clientId) ?? new Decimal(0);
    revenueByClient.set(allocation.clientId, clientRevenue.plus(expectedRevenue));
    const farmSegmentKey = `${allocation.farmId}\u0000${allocation.segment}`;
    const farmSegmentTotal = allocationByFarmSegment.get(farmSegmentKey) ?? new Decimal(0);
    allocationByFarmSegment.set(farmSegmentKey, farmSegmentTotal.plus(tonnes));
    invariant(
      allocationByFarmSegment.get(farmSegmentKey)?.lte(farm.actualTonnes[allocation.segment]) ?? false,
      `farm-segment ${allocation.farmId}/${allocation.segment} exceeds actual supply`,
    );
  }

  const balanceByFarmSegment = new Map<string, FarmSegmentBalance>();
  for (const balance of result.balances) {
    const farm = farmsById.get(balance.farmId);
    invariant(farm !== undefined, `balance references unknown farm ${balance.farmId}`);
    const key = `${balance.farmId}\u0000${balance.segment}`;
    invariant(!balanceByFarmSegment.has(key), `duplicate balance ${key}`);
    balanceByFarmSegment.set(key, balance);

    const actual = new Decimal(balance.actualTonnes);
    const exported = new Decimal(balance.exportedTonnes);
    const local = new Decimal(balance.localTonnes);
    invariant(actual.eq(farm.actualTonnes[balance.segment]), `balance has wrong actual ${key}`);
    invariant(exported.gte(0) && local.gte(0), `balance ${key} is nonnegative`);
    invariant(isMultipleOfFive(actual) && isMultipleOfFive(exported) && isMultipleOfFive(local), `balance ${key} uses 5-tonne units`);
    invariant(exported.plus(local).eq(actual), `balance ${key} conserves actual tonnes`);
    invariant(
      (allocationByFarmSegment.get(key) ?? new Decimal(0)).eq(exported),
      `balance ${key} matches allocation trace`,
    );
  }

  invariant(result.balances.length === snapshot.farms.length * SEGMENTS.length, "all farm-segment balances are returned");
  for (const farm of snapshot.farms) {
    for (const segment of SEGMENTS) {
      invariant(balanceByFarmSegment.has(`${farm.farmId}\u0000${segment}`), `missing balance ${farm.farmId}/${segment}`);
    }
  }

  const residualByFarmSegment = new Map<string, LocalResidual>();
  const residualIds = new Set<string>();
  for (const residual of result.localResiduals) {
    const key = `${residual.farmId}\u0000${residual.segment}`;
    invariant(!residualByFarmSegment.has(key), `duplicate residual ${key}`);
    invariant(!residualIds.has(residual.residualId), "residual IDs are unique");
    residualByFarmSegment.set(key, residual);
    residualIds.add(residual.residualId);
    const balance = balanceByFarmSegment.get(key);
    invariant(balance !== undefined, `residual references unknown balance ${key}`);
    const tonnes = new Decimal(residual.tonnes);
    invariant(tonnes.gt(0) && isMultipleOfFive(tonnes), `residual ${key} uses positive 5-tonne units`);
    invariant(tonnes.eq(balance.localTonnes), `residual ${key} matches local balance`);
    const localPrice = new Decimal(snapshot.station.localMarketRatio).times(
      snapshot.referencePrices[residual.segment].referenceExportPricePerTonneEur,
    );
    invariant(new Decimal(residual.localPricePerTonneEur).eq(localPrice), `residual ${key} uses its segment reference price`);
    invariant(
      new Decimal(residual.localValueEur).eq(tonnes.times(localPrice)),
      `residual ${key} has the correct local value`,
    );
  }
  for (const balance of result.balances) {
    const key = `${balance.farmId}\u0000${balance.segment}`;
    const residual = residualByFarmSegment.get(key);
    invariant(
      new Decimal(balance.localTonnes).isZero() ? residual === undefined : residual !== undefined,
      `residual rows match positive local balances for ${key}`,
    );
  }

  for (const outcome of result.clientOutcomes) {
    const client = clientsById.get(outcome.clientId);
    invariant(client !== undefined, `outcome references unknown client ${outcome.clientId}`);
    const allocated = allocationByClient.get(outcome.clientId) ?? new Decimal(0);
    const revenue = revenueByClient.get(outcome.clientId) ?? new Decimal(0);
    invariant(new Decimal(outcome.demandT).eq(client.demandT), `outcome demand matches ${outcome.clientId}`);
    invariant(new Decimal(outcome.allocatedTonnes).eq(allocated), `outcome allocation matches ${outcome.clientId}`);
    invariant(new Decimal(outcome.remainingTonnes).eq(new Decimal(client.demandT).minus(allocated)), `outcome remaining matches ${outcome.clientId}`);
    invariant(new Decimal(outcome.exportRevenueEur).eq(revenue), `outcome revenue matches ${outcome.clientId}`);
    invariant(
      (outcome.status === "COMPLETE" && new Decimal(outcome.remainingTonnes).isZero()) ||
        (outcome.status === "PARTIAL" && allocated.gt(0) && new Decimal(outcome.remainingTonnes).gt(0)) ||
        (outcome.status === "UNSERVED" && allocated.isZero() && new Decimal(outcome.demandT).gt(0)),
      `outcome status matches ${outcome.clientId}`,
    );
    invariant(
      outcome.status === "COMPLETE" ? outcome.shortageReason === null : outcome.shortageReason !== null,
      `outcome reason matches ${outcome.clientId}`,
    );
  }
  invariant(result.clientOutcomes.length === snapshot.clients.length, "all clients have outcomes");

  const totalExported = result.allocations.reduce(
    (sum, allocation) => sum.plus(allocation.tonnes),
    new Decimal(0),
  );
  const totalActual = result.balances.reduce((sum, balance) => sum.plus(balance.actualTonnes), new Decimal(0));
  const totalLocal = result.balances.reduce((sum, balance) => sum.plus(balance.localTonnes), new Decimal(0));
  const exportRevenue = result.allocations.reduce(
    (sum, allocation) => sum.plus(allocation.exportRevenueEur),
    new Decimal(0),
  );
  const localValue = result.localResiduals.reduce(
    (sum, residual) => sum.plus(residual.localValueEur),
    new Decimal(0),
  );
  invariant(totalExported.lte(snapshot.station.exportConditioningCapacityT), "station capacity is not exceeded");
  invariant(totalExported.plus(totalLocal).eq(totalActual), "global actual tonnes are conserved");
  invariant(new Decimal(result.kpis.exportedTonnes).eq(totalExported), "KPI export volume matches trace");
  invariant(new Decimal(result.kpis.localTonnes).eq(totalLocal), "KPI local volume matches balances");
  invariant(new Decimal(result.kpis.exportRevenueEur).eq(exportRevenue), "KPI export revenue matches trace");
  invariant(new Decimal(result.kpis.localValueEur).eq(localValue), "KPI local value matches residuals");
  invariant(
    new Decimal(result.kpis.totalValueEur).eq(exportRevenue.plus(localValue)),
    "KPI total value matches component values",
  );
}

/**
 * Execute the exact server-side planning policy on an already validated,
 * versioned snapshot.
 *
 * Allocation arithmetic uses Decimal counts of 5-tonne units. Clients are
 * ordered by price descending and deterministic ID ascending. Compatible
 * farm-segments are ordered by smallest quality upgrade, then farm ID. The
 * snapshot is never mutated; only the private working balances are reduced.
 */
export function calculatePlan(snapshot: InputSnapshot): PlanningResult {
  const production = calculateProductionComparison(snapshot);
  const workingBalances = createWorkingBalances(snapshot.farms);
  const sortedClients = sortClients(snapshot.clients);
  let remainingStationUnits = toUnits(
    snapshot.station.exportConditioningCapacityT,
    "station capacity",
  );
  const allocations: Allocation[] = [];
  const clientOutcomes: ClientOutcome[] = [];

  for (const client of sortedClients) {
    let remainingDemandUnits = toUnits(client.demandT, `${client.clientId} demand`);
    let clientRevenue = new Decimal(0);

    for (const balance of sortCompatibleBalances(workingBalances, client)) {
      if (remainingDemandUnits.isZero() || remainingStationUnits.isZero()) break;
      const availableUnits = balance.availableTonnes.div(ALLOCATION_UNIT_TONNES);
      const allocationUnits = Decimal.min(availableUnits, remainingDemandUnits, remainingStationUnits);
      if (allocationUnits.isZero()) continue;

      const tonnes = allocationUnits.times(ALLOCATION_UNIT_TONNES);
      balance.availableTonnes = balance.availableTonnes.minus(tonnes);
      remainingDemandUnits = remainingDemandUnits.minus(allocationUnits);
      remainingStationUnits = remainingStationUnits.minus(allocationUnits);
      const exportRevenue = tonnes.times(client.exportPricePerTonneEur);
      clientRevenue = clientRevenue.plus(exportRevenue);
      allocations.push({
        allocationId: stableTraceId("allocation", allocations.length + 1),
        farmId: balance.farmId,
        segment: balance.segment,
        clientId: client.clientId,
        requestedSegment: client.requestedSegment,
        tonnes: toNumber(tonnes, "allocation tonnes"),
        qualityUpgrade: qualityUpgrade(client.requestedSegment, balance.segment),
        exportPricePerTonneEur: client.exportPricePerTonneEur,
        exportRevenueEur: toNumber(exportRevenue, "allocation revenue"),
      });
    }

    const allocatedUnits = toUnits(client.demandT, `${client.clientId} demand`).minus(remainingDemandUnits);
    const allocatedTonnes = allocatedUnits.times(ALLOCATION_UNIT_TONNES);
    const remainingTonnes = remainingDemandUnits.times(ALLOCATION_UNIT_TONNES);
    const status = remainingTonnes.isZero()
      ? "COMPLETE"
      : allocatedTonnes.gt(0)
        ? "PARTIAL"
        : "UNSERVED";
    const shortageReason = status === "COMPLETE"
      ? null
      : remainingStationUnits.isZero()
        ? "STATION_CAPACITY_REACHED"
        : "INSUFFICIENT_COMPATIBLE_SEGMENT";

    clientOutcomes.push({
      clientId: client.clientId,
      acceptanceMode: client.acceptanceMode,
      requestedSegment: client.requestedSegment,
      demandT: client.demandT,
      allocatedTonnes: toNumber(allocatedTonnes, `${client.clientId} allocated tonnes`),
      remainingTonnes: toNumber(remainingTonnes, `${client.clientId} remaining tonnes`),
      exportRevenueEur: toNumber(clientRevenue, `${client.clientId} revenue`),
      status,
      shortageReason,
    });
  }

  const localResiduals: LocalResidual[] = [];
  for (const balance of workingBalances) {
    if (balance.availableTonnes.isZero()) continue;
    const localPrice = new Decimal(snapshot.station.localMarketRatio).times(
      snapshot.referencePrices[balance.segment].referenceExportPricePerTonneEur,
    );
    const localValue = balance.availableTonnes.times(localPrice);
    localResiduals.push({
      residualId: stableTraceId("residual", localResiduals.length + 1),
      farmId: balance.farmId,
      segment: balance.segment,
      tonnes: toNumber(balance.availableTonnes, "local tonnes"),
      localPricePerTonneEur: toNumber(localPrice, "local price"),
      localValueEur: toNumber(localValue, "local value"),
    });
  }

  const balances: FarmSegmentBalance[] = workingBalances.map((balance) => ({
    farmId: balance.farmId,
    segment: balance.segment,
    actualTonnes: toNumber(balance.actualTonnes, "actual tonnes"),
    exportedTonnes: toNumber(balance.actualTonnes.minus(balance.availableTonnes), "exported tonnes"),
    localTonnes: toNumber(balance.availableTonnes, "local tonnes"),
  }));

  const exportedTonnes = allocations.reduce(
    (sum, allocation) => sum.plus(allocation.tonnes),
    new Decimal(0),
  );
  const localTonnes = localResiduals.reduce(
    (sum, residual) => sum.plus(residual.tonnes),
    new Decimal(0),
  );
  const exportRevenue = allocations.reduce(
    (sum, allocation) => sum.plus(allocation.exportRevenueEur),
    new Decimal(0),
  );
  const localValue = localResiduals.reduce(
    (sum, residual) => sum.plus(residual.localValueEur),
    new Decimal(0),
  );
  const stationCapacity = new Decimal(snapshot.station.exportConditioningCapacityT);
  const actualReceived = new Decimal(production.actualTotalTonnes);
  const kpis: PlanningKpis = {
    expectedTotalTonnes: production.expectedTotalTonnes,
    actualTotalTonnes: production.actualTotalTonnes,
    stationCapacityT: snapshot.station.exportConditioningCapacityT,
    exportedTonnes: toNumber(exportedTonnes, "total exported tonnes"),
    stationUtilization: stationCapacity.isZero()
      ? null
      : toNumber(exportedTonnes.div(stationCapacity), "station utilization"),
    exportRate: actualReceived.isZero()
      ? null
      : toNumber(exportedTonnes.div(actualReceived), "export rate"),
    localTonnes: toNumber(localTonnes, "total local tonnes"),
    exportRevenueEur: toNumber(exportRevenue, "total export revenue"),
    localValueEur: toNumber(localValue, "total local value"),
    totalValueEur: toNumber(exportRevenue.plus(localValue), "total value"),
    atRiskCount: clientOutcomes.filter((outcome) => outcome.status !== "COMPLETE").length,
  };

  const result: PlanningResult = {
    inputVersion: snapshot.version,
    production,
    allocations,
    balances,
    localResiduals,
    clientOutcomes,
    kpis,
  };
  assertPlanningInvariants(snapshot, result);
  return result;
}
