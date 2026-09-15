import { describe, expect, it } from 'vitest'
import type { Filter } from '../lib/model'
import { CHART_CARD_URL_KEYS, parseChartCardUrlState, updateChartCardUrlSearch } from './useChartCardUrlState'

const filters: Filter[] = [{ field: 'region', operator: 'in', value: ['East', 'West'] }]

describe('ChartCard URL state', () => {
  it('parses namespaced overlay and renderer state for the addressed artifact', () => {
    const search = new URLSearchParams({
      analyticsView: 'chats',
      [CHART_CARD_URL_KEYS.artifact]: 'sales-by-region',
      [CHART_CARD_URL_KEYS.inspector]: 'sales-by-region:provenance',
      [CHART_CARD_URL_KEYS.expanded]: 'sales-by-region',
      [CHART_CARD_URL_KEYS.renderer]: 'sales-by-region:plotly',
      [CHART_CARD_URL_KEYS.filters]: JSON.stringify({ 'sales-by-region': filters }),
      [CHART_CARD_URL_KEYS.page]: 'sales-by-region:2',
    }).toString()

    expect(parseChartCardUrlState(`?${search}`, 'sales-by-region')).toMatchObject({
      inspector: 'provenance',
      expanded: true,
      renderer: 'plotly',
      filters,
      page: 2,
      invalid: { inspector: false, expanded: false, renderer: false, filters: false, page: false },
    })
    expect(parseChartCardUrlState(`?${search}`, 'another-artifact')).toMatchObject({
      inspector: null,
      expanded: false,
      renderer: null,
      filters: null,
      page: 0,
    })
  })

  it('cleans only malformed state addressed to one artifact', () => {
    const search = `?analyticsView=chats&${CHART_CARD_URL_KEYS.artifact}=sales-by-region&${CHART_CARD_URL_KEYS.renderer}=sales-by-region:unknown&${CHART_CARD_URL_KEYS.page}=sales-by-region:-1&keep=1`
    const parsed = parseChartCardUrlState(search, 'sales-by-region')
    expect(parsed.invalid.renderer).toBe(true)
    expect(parsed.invalid.page).toBe(true)

    const cleaned = updateChartCardUrlSearch(search, params => {
      params.delete(CHART_CARD_URL_KEYS.renderer)
      params.delete(CHART_CARD_URL_KEYS.page)
    })
    const result = new URLSearchParams(cleaned)
    expect(result.get('keep')).toBe('1')
    expect(result.get(CHART_CARD_URL_KEYS.renderer)).toBeNull()
    expect(result.get(CHART_CARD_URL_KEYS.page)).toBeNull()
    expect(result.get(CHART_CARD_URL_KEYS.artifact)).toBe('sales-by-region')
  })

  it('supports compact and single-card filter links without exposing row data', () => {
    const compact = `${CHART_CARD_URL_KEYS.filters}=sales-by-region%3A${encodeURIComponent(JSON.stringify(filters))}`
    expect(parseChartCardUrlState(`?${compact}`, 'sales-by-region').filters).toEqual(filters)

    const singleCard = new URLSearchParams({
      [CHART_CARD_URL_KEYS.artifact]: 'sales-by-region',
      [CHART_CARD_URL_KEYS.filters]: JSON.stringify(filters),
    }).toString()
    expect(parseChartCardUrlState(`?${singleCard}`, 'sales-by-region').filters).toEqual(filters)
  })

  it('accepts scalar state values for links produced by the native route boundary', () => {
    const search = new URLSearchParams({
      [CHART_CARD_URL_KEYS.artifact]: 'sales-by-region',
      [CHART_CARD_URL_KEYS.inspector]: 'definitions',
      [CHART_CARD_URL_KEYS.expanded]: '1',
      [CHART_CARD_URL_KEYS.renderer]: 'chartjs',
      [CHART_CARD_URL_KEYS.page]: '3',
    }).toString()
    expect(parseChartCardUrlState(`?${search}`, 'sales-by-region')).toMatchObject({
      inspector: 'definitions',
      expanded: true,
      renderer: 'chartjs',
      page: 3,
    })
  })
})