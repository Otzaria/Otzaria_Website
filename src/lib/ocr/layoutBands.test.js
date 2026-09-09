import { describe, it, expect } from "vitest"
import {
  splitBandAt,
  removeBandAt,
  splitTallestBand,
  setBandIdentity,
  derivePartsFromValue,
  buildZonesFullAnswer,
} from "./layoutBands"

const band = (y0, y1, book_stream = null) => ({ y0, y1, book_stream })

describe("splitBandAt", () => {
  it("splits a band into two halves, the second with book_stream null", () => {
    const bands = [band(0, 0.5, 1)]
    const result = splitBandAt(bands, 0)
    expect(result).toEqual([band(0, 0.25, 1), band(0.25, 0.5, null)])
  })

  it("keeps surrounding bands untouched", () => {
    const bands = [band(0, 0.2, 1), band(0.2, 0.6, 2), band(0.6, 1, 3)]
    const result = splitBandAt(bands, 1)
    expect(result).toEqual([
      band(0, 0.2, 1),
      band(0.2, 0.4, 2),
      band(0.4, 0.6, null),
      band(0.6, 1, 3),
    ])
  })

  it("returns null when the band is too thin to split", () => {
    const bands = [band(0, 0.01, 1)]
    expect(splitBandAt(bands, 0)).toBeNull()
  })
})

describe("removeBandAt", () => {
  it("removes the band at the given index", () => {
    const bands = [band(0, 0.5), band(0.5, 1)]
    expect(removeBandAt(bands, 0)).toEqual([band(0.5, 1)])
  })

  it("returns null when it is the only remaining band", () => {
    const bands = [band(0, 1)]
    expect(removeBandAt(bands, 0)).toBeNull()
  })
})

describe("splitTallestBand", () => {
  it("splits the tallest band", () => {
    const bands = [band(0, 0.1, 1), band(0.1, 0.9, 2)]
    const result = splitTallestBand(bands)
    expect(result).toEqual([band(0, 0.1, 1), band(0.1, 0.5, 2), band(0.5, 0.9, null)])
  })

  it("returns null for an empty band list", () => {
    expect(splitTallestBand([])).toBeNull()
    expect(splitTallestBand(null)).toBeNull()
  })

  it("returns null when the tallest band is still too thin to split", () => {
    const bands = [band(0, 0.005), band(0.005, 0.01)]
    expect(splitTallestBand(bands)).toBeNull()
  })
})

describe("setBandIdentity", () => {
  it("sets the book_stream of the band at the given index only", () => {
    const bands = [band(0, 0.5, 1), band(0.5, 1, 2)]
    const result = setBandIdentity(bands, 1, 9)
    expect(result).toEqual([band(0, 0.5, 1), band(0.5, 1, 9)])
  })
})

describe("derivePartsFromValue", () => {
  const prefill = { pagenum: { expected: 5 }, header: { box: {} }, streams: { bands: [] } }

  it("marks every present part as machine-confirmed when value.confirmed", () => {
    expect(derivePartsFromValue({ confirmed: true, answer: null }, prefill)).toEqual({
      pagenum: { confirmed: true, answer: null },
      header: { confirmed: true, answer: null },
      streams: { confirmed: true, answer: null },
    })
  })

  it("omits parts missing from prefill when value.confirmed", () => {
    expect(derivePartsFromValue({ confirmed: true, answer: null }, { header: {} })).toEqual({
      pagenum: null,
      header: { confirmed: true, answer: null },
      streams: null,
    })
  })

  it("resets every part to null when value is null", () => {
    expect(derivePartsFromValue(null, prefill)).toEqual({ pagenum: null, header: null, streams: null })
  })

  it("loads existing answers into parts when value carries an answer", () => {
    const value = { confirmed: false, answer: { pagenum: { value: "5" }, streams: { bands: [] } } }
    expect(derivePartsFromValue(value, prefill)).toEqual({
      pagenum: { confirmed: false, answer: { value: "5" } },
      header: null,
      streams: { confirmed: false, answer: { bands: [] } },
    })
  })

  it("returns null (no update) for a truthy unconfirmed value without an answer", () => {
    expect(derivePartsFromValue({ confirmed: false }, prefill)).toBeNull()
  })
})

describe("buildZonesFullAnswer", () => {
  const prefill = {
    pagenum: { expected: 5, hebrew: "ה" },
    header: { box: { x: 1, y: 1, width: 2, height: 2 } },
  }

  it("returns null while not every needed part is decided", () => {
    expect(buildZonesFullAnswer(prefill, { pagenum: { confirmed: true, answer: null }, header: null })).toBeNull()
  })

  it("builds a full answer once every needed part is decided, resolving confirmed parts from prefill", () => {
    const parts = {
      pagenum: { confirmed: true, answer: null },
      header: { confirmed: false, answer: { box: null } },
    }
    const result = buildZonesFullAnswer(prefill, parts)
    expect(result).toEqual({
      confirmed: false,
      answer: {
        pagenum: { value: "ה" },
        header: { box: null },
      },
    })
  })

  it("ignores parts not present in prefill (e.g. streams)", () => {
    const parts = {
      pagenum: { confirmed: true, answer: null },
      header: { confirmed: true, answer: null },
      streams: { confirmed: false, answer: { bands: [] } },
    }
    const result = buildZonesFullAnswer(prefill, parts)
    expect(result.answer.streams).toBeUndefined()
  })
})
