import { describe, it, expect } from 'vitest'
import { niceTicks, chartPoints, linePath, areaPath, nearestIndex } from './weeklyProgressGeometry'

describe('niceTicks', () => {
  // הערכים המצופים חושבו מול getNiceTickValues([0, max], 5, false) של Recharts
  // (הושוו 0..5000 ללא הבדל לפני ההחלפה)
  it.each([
    [0, [0, 1, 2, 3, 4]],
    [3, [0, 1, 2, 3, 4]],
    [5, [0, 2, 4, 6, 8]],
    [9, [0, 3, 6, 9, 12]],
    [13, [0, 4, 8, 12, 16]],
    [20, [0, 5, 10, 15, 20]],
    [23, [0, 6, 12, 18, 24]],
    [50, [0, 15, 30, 45, 60]],
    [99, [0, 25, 50, 75, 100]],
    [129, [0, 35, 70, 105, 140]],
    [250, [0, 65, 130, 195, 260]],
    [1000, [0, 250, 500, 750, 1000]],
    [1234, [0, 350, 700, 1050, 1400]],
  ])('max=%i', (max, expected) => {
    expect(niceTicks(max)).toEqual(expected)
  })
})

describe('chartPoints', () => {
  it('spreads x edge to edge and flips y', () => {
    expect(chartPoints([0, 70, 140], 140)).toEqual([
      { x: 0, y: 100 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ])
  })

  it('centers a single point and survives yMax=0', () => {
    expect(chartPoints([0], 0)).toEqual([{ x: 50, y: 100 }])
  })
})

describe('linePath / areaPath', () => {
  it('matches d3.curveMonotoneX for the weekly data shape', () => {
    // נבדק מול line().curve(curveMonotoneX).digits(3) של d3-shape
    const pts = chartPoints([2, 39, 84, 129, 91, 55, 75], 140)
    expect(linePath(pts)).toBe(
      'M0,98.571C5.556,90.238,11.111,81.905,16.667,72.143C22.222,62.381,27.778,50.714,33.333,40' +
        'C38.889,29.286,44.444,7.857,50,7.857C55.556,7.857,61.111,26.19,66.667,35' +
        'C72.222,43.81,77.778,60.714,83.333,60.714C88.889,60.714,94.444,53.571,100,46.429'
    )
  })

  it('does not overshoot on flat segments (monotone)', () => {
    const pts = chartPoints([5, 5, 5, 0, 10, 10, 1], 12)
    const ys = linePath(pts).match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 1)
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    }
  })

  it('handles 0/1/2 points', () => {
    expect(linePath([])).toBe('')
    expect(linePath([{ x: 50, y: 20 }])).toBe('M50,20')
    expect(linePath(chartPoints([1, 2], 4))).toBe('M0,75L100,50')
    expect(areaPath([{ x: 50, y: 20 }])).toBe('')
  })

  it('closes the area down to the baseline', () => {
    expect(areaPath(chartPoints([1, 2], 4))).toBe('M0,75L100,50L100,100L0,100Z')
  })
})

describe('nearestIndex', () => {
  it('rounds to the closest point and clamps', () => {
    expect(nearestIndex(0, 7)).toBe(0)
    expect(nearestIndex(0.49, 7)).toBe(3)
    expect(nearestIndex(0.95, 7)).toBe(6)
    expect(nearestIndex(-1, 7)).toBe(0)
    expect(nearestIndex(2, 7)).toBe(6)
    expect(nearestIndex(0.5, 1)).toBe(0)
  })
})
