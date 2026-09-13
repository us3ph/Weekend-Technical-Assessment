import Decimal from "decimal.js";
import {
  SEGMENTS,
  type FarmComparison,
  type ProductionComparison,
  type SegmentComparison,
  type SegmentMap,
  type ValidatedInputSnapshot,
} from "./types";

function asNumber(value: Decimal): number {
  return value.toNumber();
}

/** Compare IDs without locale-dependent collation or source-row dependence. */
function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function zeroSegments(): SegmentMap<Decimal> {
  return { A: new Decimal(0), B: new Decimal(0), C: new Decimal(0), D: new Decimal(0) };
}

/**
 * Calculate expected-vs-actual production comparisons without changing the
 * validated source snapshot. Decimal is used for products and sums so values
 * such as 35 × 0.9 remain exact at the business boundary.
 */
export function calculateProductionComparison(
  snapshot: ValidatedInputSnapshot,
): ProductionComparison {
  const expectedBySegment = zeroSegments();
  const actualBySegment = zeroSegments();

  const farms: FarmComparison[] = [...snapshot.farms].sort((left, right) => compareIds(left.farmId, right.farmId)).map((farm) => {
    const expectedCapacity = new Decimal(farm.expectedDailyCapacityT);
    const farmActualBySegment = {} as SegmentMap<Decimal>;
    const segments = {} as SegmentMap<SegmentComparison>;

    for (const segment of SEGMENTS) {
      const expected = expectedCapacity.times(farm.expectedMix[segment]);
      const actual = new Decimal(farm.actualTonnes[segment]);
      const variance = actual.minus(expected);

      farmActualBySegment[segment] = actual;
      expectedBySegment[segment] = expectedBySegment[segment].plus(expected);
      actualBySegment[segment] = actualBySegment[segment].plus(actual);
      segments[segment] = {
        segment,
        expectedTonnes: asNumber(expected),
        actualTonnes: asNumber(actual),
        varianceTonnes: asNumber(variance),
      };
    }

    const expectedTotal = expectedCapacity;
    const actualTotal = SEGMENTS.reduce(
      (sum, segment) => sum.plus(farmActualBySegment[segment]),
      new Decimal(0),
    );

    return {
      farmId: farm.farmId,
      expectedCapacityT: asNumber(expectedTotal),
      actualTotalTonnes: asNumber(actualTotal),
      varianceTonnes: asNumber(actualTotal.minus(expectedTotal)),
      segments,
    };
  });

  const segments: SegmentComparison[] = SEGMENTS.map((segment) => {
    const expected = expectedBySegment[segment];
    const actual = actualBySegment[segment];
    return {
      segment,
      expectedTonnes: asNumber(expected),
      actualTonnes: asNumber(actual),
      varianceTonnes: asNumber(actual.minus(expected)),
    };
  });

  const expectedTotal = snapshot.farms.reduce(
    (sum, farm) => sum.plus(farm.expectedDailyCapacityT),
    new Decimal(0),
  );
  const actualTotal = SEGMENTS.reduce(
    (sum, segment) => sum.plus(actualBySegment[segment]),
    new Decimal(0),
  );

  return {
    expectedTotalTonnes: asNumber(expectedTotal),
    actualTotalTonnes: asNumber(actualTotal),
    varianceTonnes: asNumber(actualTotal.minus(expectedTotal)),
    segments,
    farms,
  };
}
