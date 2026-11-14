// מודל עמוד קטן לבדיקות (PACKAGE.md "מודל העמוד"): גמרא בשלוש שורות, ורש"י בשורה אחת שלא עוגן.
const w = (t, ref, wi) => ({ t, ref, wi })
const R = 'ברכות ב.'

export function fixtureModel() {
  return {
    blocks: [
      {
        id: 'g',
        kind: 'g',
        label: 'גמרא',
        auto: 'ok',
        lines: [
          { i: 0, ours: [0.3, 0.1, 0.4, 0.02], scan: [0.3, 0.1, 0.4, 0.02], words: [w('מאימתי', R, 0), w('קורין', R, 1), w('את', R, 2)], print: ['מאימתי', 'קורין'], auto: true, flag: 'end' },
          { i: 1, ours: [0.3, 0.13, 0.4, 0.02], scan: [0.3, 0.13, 0.4, 0.02], words: [w('שמע', R, 3), w('בערבין', R, 4), w('משעה', R, 5)], print: ['את', 'שמע', 'בערבין'], auto: true, flag: 'start' },
          { i: 2, ours: [0.3, 0.16, 0.4, 0.02], scan: null, words: [w('שהכהנים', R, 6), w('נכנסים', R, 7)], print: [], auto: false, flag: null },
        ],
      },
      {
        id: 'r',
        kind: 'r',
        label: 'רש"י',
        auto: 'gate',
        lines: [{ i: 0, ours: [0.05, 0.1, 0.2, 0.015], scan: [0.05, 0.1, 0.2, 0.015], words: [w('מאימתי', 'רש"י ב.', 0), w('קורין', 'רש"י ב.', 1)], print: [], auto: false, flag: null }],
      },
    ],
  }
}

export function fixtureItem(over = {}) {
  return {
    id: '64b7f0000000000000000001',
    slug: 'berakhot',
    masechet: 'ברכות',
    daf: 'ב.',
    kind: 'g',
    kindLabel: 'גמרא',
    question: 'replace',
    prompt: 'מה כתוב בדפוס?',
    focus: null,
    options: [
      { id: 'a', label: '', words: ['אמר', 'רבי'] },
      { id: 'b', label: '', words: ['א"ר'] },
    ],
    allowText: true,
    ctxBefore: ['מאימתי', 'קורין'],
    ctxAfter: ['יוחנן'],
    imageUrl: '/api/tzurat-hadaf/items/64b7f0000000000000000001/image?v=1',
    fullImageUrl: '/api/tzurat-hadaf/items/64b7f0000000000000000001/image?full=1&v=1',
    box: { x: 0.4, y: 0.3, w: 0.2, h: 0.2 },
    ...over,
  }
}

/** תשובת fetch מדומה */
export const res = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json })
