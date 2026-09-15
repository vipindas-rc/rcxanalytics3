import type { Dataset, Renderer } from '../lib/model'
const paletteTokens = ['primary-f', 'extra-amethyst', 'extra-tiffany', 'extra-olive', 'extra-wildberry']
const themeScope = (element?: Element | null) => element?.closest<HTMLElement>('[data-sui-theme-scope]') ?? document.querySelector<HTMLElement>('[data-sui-theme-scope]') ?? document.documentElement

export function getChartTheme(element?: Element | null) {
  const scope = themeScope(element)
  const computed = getComputedStyle(scope)
  const color = (name: string) => {
    const resolved = computed.getPropertyValue(`--sui-colors-${name}`).trim()
    if (!resolved) throw new Error(`Analytics requires the Spring color token --sui-colors-${name} on its theme scope.`)
    return resolved
  }
  return { version: 'spring-light-2', palette: paletteTokens.map(color), foreground: color('neutral-b1'), muted: color('neutral-b2'), grid: color('neutral-b4'), background: color('neutral-base'), font: computed.getPropertyValue('--sui-font-family').trim() }
}
export function chartThemeSignature(element?: Element | null) {
  const theme = getChartTheme(element)
  return JSON.stringify(theme)
}
export function styleChart(renderer: Renderer, input: any, dataset: Dataset, element?: Element | null) {
  const spec = structuredClone(input)
  const theme = getChartTheme(element)
  const choose = (name: unknown, index: number) => {
    const label = String(name)
    const category = dataset.fields.find(field => field.type !== 'number' && field.values?.includes(label))
    const metric = dataset.fields.filter(field => field.type === 'number').findIndex(field => field.id === label || field.name === label)
    const stable = category ? dataset.colors[`${category.id}:${label}`] : dataset.colors[label]
    return theme.palette[(stable ?? (metric >= 0 ? metric : index)) % theme.palette.length]
  }
  if (renderer === 'echarts') {
    delete spec._width; delete spec._height; delete spec.width; delete spec.height
    spec.title = { show: false }; spec.backgroundColor = theme.background
    spec.color = theme.palette; spec.textStyle = { ...spec.textStyle, fontFamily: theme.font, color: theme.foreground }
    const axes = (axis: any): any => Array.isArray(axis) ? axis.map(axes) : axis ? { ...axis, nameTextStyle: { ...axis.nameTextStyle, color: theme.muted, fontFamily: theme.font }, axisLabel: { ...axis.axisLabel, ...(axis.type === 'category' ? { rotate: 0, interval: 0, width: 100, overflow: 'truncate' } : {}), color: theme.muted, fontFamily: theme.font }, axisLine: { ...axis.axisLine, lineStyle: { color: theme.grid } }, splitLine: { ...axis.splitLine, lineStyle: { color: theme.grid } } } : undefined
    const xAxis = axes(spec.xAxis)
    spec.xAxis = Array.isArray(xAxis) ? xAxis.map(axis => ({ ...axis, axisLabel: { ...axis.axisLabel, rotate: 0, interval: 0, hideOverlap: true, fontSize: 11 } })) : xAxis && { ...xAxis, axisLabel: { ...xAxis.axisLabel, rotate: 0, interval: 0, hideOverlap: true, fontSize: 11 } }
    spec.yAxis = axes(spec.yAxis)
    const hasMultipleSeries = (spec.series?.length ?? 0) > 1
    spec.legend = hasMultipleSeries ? { ...spec.legend, show: true, orient: 'horizontal', left: 'center', right: undefined, textStyle: { color: theme.muted, fontFamily: theme.font }, type: 'plain', bottom: 0, top: undefined } : { show: false }
    spec.tooltip = { ...spec.tooltip, backgroundColor: theme.background, borderColor: theme.grid, textStyle: { color: theme.foreground, fontFamily: theme.font }, confine: true }
    spec.series = spec.series?.map((series: any, i: number) => {
      const color = choose(series.name, i)
      if (series.type === 'bar' && spec.series.length === 1) {
        const labels = (Array.isArray(spec.xAxis) ? spec.xAxis[0] : spec.xAxis)?.data ?? (Array.isArray(spec.yAxis) ? spec.yAxis[0] : spec.yAxis)?.data ?? []
        series.data = series.data.map((value: any, n: number) => ({ ...(value && typeof value === 'object' ? value : { value }), itemStyle: { color: choose(labels[n], n) } }))
      }
      return { ...series, label: { ...series.label, color: theme.foreground, fontFamily: theme.font }, lineStyle: { ...series.lineStyle, color, type: i >= theme.palette.length ? 'dashed' : 'solid' }, symbol: i >= theme.palette.length ? 'diamond' : 'circle', itemStyle: { ...series.itemStyle, color }, ...(series.type === 'pie' || series.type === 'funnel' ? { data: series.data.map((item: any, n: number) => ({ ...item, itemStyle: { ...item.itemStyle, color: choose(item.name, n) } })) } : {}) }
    })
    if (spec.grid && !Array.isArray(spec.grid)) spec.grid = { ...spec.grid, left: 58, right: 28, top: 22, bottom: hasMultipleSeries ? 54 : 30, containLabel: true, width: undefined, height: undefined }
  } else if (renderer === 'chartjs') {
    spec.data.datasets = spec.data.datasets.map((series: any, i: number) => {
      const color = choose(series.label, i)
      return { ...series, borderDash: i >= theme.palette.length ? [6, 3] : [], pointStyle: i >= theme.palette.length ? 'rectRot' : 'circle', backgroundColor: (['pie', 'doughnut'].includes(spec.type) || (spec.type === 'bar' && spec.data.datasets.length === 1)) ? spec.data.labels.map((label: string, n: number) => choose(label, n)) : color, borderColor: color }
    })
    const hasMultipleSeries = (spec.data?.datasets?.length ?? 0) > 1
    spec.options = { ...spec.options, responsive: true, maintainAspectRatio: false, font: { family: theme.font }, color: theme.muted, layout: { padding: 12 }, plugins: { ...spec.options?.plugins, title: { display: false }, subtitle: { display: false }, legend: { ...spec.options?.plugins?.legend, display: hasMultipleSeries, position: 'bottom', labels: { color: theme.muted, font: { family: theme.font }, boxWidth: 10, boxHeight: 10, padding: 12 } }, tooltip: { ...spec.options?.plugins?.tooltip, backgroundColor: theme.foreground, titleFont: { family: theme.font }, bodyFont: { family: theme.font } } } }
    if (spec.options.scales) Object.values(spec.options.scales).forEach((axis: any) => { axis.ticks = { ...axis.ticks, color: theme.muted, font: { family: theme.font } }; axis.title = { ...axis.title, color: theme.muted, font: { family: theme.font } }; axis.grid = { ...axis.grid, color: theme.grid }; axis.border = { color: theme.grid } })
  } else {
    const hasMultipleSeries = (spec.data?.length ?? 0) > 1
    spec.layout = { ...spec.layout, title: undefined, width: undefined, height: undefined, autosize: true, paper_bgcolor: theme.background, plot_bgcolor: theme.background, font: { family: theme.font, color: theme.muted, size: 12 }, colorway: theme.palette, margin: { t: 24, r: 36, b: hasMultipleSeries ? 68 : 42, l: 58 }, showlegend: hasMultipleSeries, legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.22 } }
    for (const axis of ['xaxis', 'yaxis', 'yaxis2']) if (spec.layout[axis]) spec.layout[axis] = { ...spec.layout[axis], gridcolor: theme.grid, linecolor: theme.grid, zerolinecolor: theme.grid, automargin: true }
    spec.data = spec.data.map((trace: any, i: number) => ({ ...trace, marker: { ...trace.marker, ...(trace.type === 'bar' && spec.data.length === 1 ? { color: trace.x.map((label: string, n: number) => choose(label, n)) } : trace.type === 'funnel' ? { color: trace.y.map((label: string, n: number) => choose(label, n)) } : trace.type === 'pie' ? { colors: trace.labels.map((label: string, n: number) => choose(label, n)) } : { color: choose(trace.name, i) }) }, line: { ...trace.line, color: choose(trace.name, i), dash: i >= theme.palette.length ? 'dash' : 'solid' }, textfont: { family: theme.font, color: theme.foreground } }))
  }
  return spec
}
