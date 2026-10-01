import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WeeklyProgressArea from './WeeklyProgressArea'

const data = [
  { _id: '2026-09-21', date: 'יום ג׳', count: 2 },
  { _id: '2026-09-22', date: 'יום ד׳', count: 39 },
  { _id: '2026-09-23', date: 'יום ה׳', count: 84 },
  { _id: '2026-09-24', date: 'יום ו׳', count: 129 },
  { _id: '2026-09-25', date: 'שבת', count: 91 },
  { _id: '2026-09-26', date: 'יום א׳', count: 55 },
  { _id: '2026-09-27', date: 'יום ב׳', count: 75 },
]

describe('WeeklyProgressArea', () => {
  it('renders the day labels, the Recharts-equivalent y ticks and the curve', () => {
    const { container } = render(<WeeklyProgressArea data={data} />)
    for (const d of data) expect(screen.getByText(d.date)).toBeTruthy()
    for (const t of ['0', '35', '70', '105', '140']) expect(screen.getByText(t)).toBeTruthy()
    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(2)
    expect(paths[1].getAttribute('d')).toMatch(/^M0,98\.571C/)
  })

  it('shows "N דפים" for the nearest day on pointer move and hides it on leave', () => {
    const { container } = render(<WeeklyProgressArea data={data} />)
    const plot = container.querySelector('.touch-pan-y')
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 85, right: 600, bottom: 85 })
    fireEvent.pointerMove(plot, { clientX: 300 })
    expect(screen.getByText('129 דפים')).toBeTruthy()
    fireEvent.pointerLeave(plot)
    expect(screen.queryByText('129 דפים')).toBeNull()
  })

  it('renders an all-zero week without crashing', () => {
    render(<WeeklyProgressArea data={data.map((d) => ({ ...d, count: 0 }))} />)
    expect(screen.getByText('4')).toBeTruthy()
  })
})
