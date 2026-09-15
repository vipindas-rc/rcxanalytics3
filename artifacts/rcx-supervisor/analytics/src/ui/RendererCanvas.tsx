import { useEffect, useRef } from 'react'
import type { Dataset, Presentation } from '../lib/model'
import { styleChart } from './chartTheme'

type Props = { presentation: Presentation; dataset: Dataset; title: string; onReady: () => void; onError: (error: string) => void }
export function RendererCanvas({ presentation, dataset, title, onReady, onError }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const ready = useRef(onReady); const error = useRef(onError)
  useEffect(() => { ready.current = onReady; error.current = onError }, [onReady, onError])
  // Polling returns fresh dataset objects. Only a changed effective chart should remount.
  const renderKey = JSON.stringify({ renderer: presentation.renderer, spec: presentation.spec, colors: dataset.colors, fields: dataset.fields, title })
  const inputs = useRef({ presentation, dataset, title })
  useEffect(() => { inputs.current = { presentation, dataset, title } }, [presentation, dataset, title])
  useEffect(() => {
    const { presentation, dataset, title } = inputs.current
    const element = host.current
    if (!element) return
    let disposed = false; let destroy = () => {}; let resize = () => {}; let finished = false
    const done = () => { if (!disposed && !finished) { finished = true; clearTimeout(timeout); ready.current() } }
    const fail = (caught: unknown) => { if (!disposed && !finished) { finished = true; clearTimeout(timeout); error.current(caught instanceof Error ? caught.message : String(caught)) } }
    const timeout = setTimeout(() => fail('The chart did not finish rendering. Try another renderer or retry.'), 20000)
    let resizeFrame = 0
    const observer = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!disposed && element.clientWidth > 0 && element.clientHeight > 0) { try { resize() } catch (caught) { fail(caught) } } }) }); observer.observe(element)
    void (async () => {
      const spec = styleChart(presentation.renderer, presentation.spec, dataset)
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (document.fonts?.ready) await document.fonts.ready
      if (disposed) return
      if (presentation.renderer === 'echarts') {
        const echarts = await import('echarts'); if (disposed) return
        const chart = echarts.init(element); destroy = () => chart.dispose(); resize = () => chart.resize()
        chart.on('finished', done); chart.setOption({ ...spec, animation: !reduced, animationDuration: reduced ? 0 : 240 }, true)
        // ECharts can omit its finished event when its host is intentionally
        // invisible during a renderer transition. A painted frame is enough to
        // retain the old chart only until the new instance is usable.
        requestAnimationFrame(done)
      } else if (presentation.renderer === 'chartjs') {
        const { Chart, registerables } = await import('chart.js'); if (disposed) return
        Chart.register(...registerables)
        const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', title); element.append(canvas)
        const completePlugin = { id: 'analytics-ready', afterRender: done }
        const chart = new Chart(canvas, { ...spec, plugins: [completePlugin], options: { ...spec.options, animation: reduced ? false : { duration: 240, onComplete: done } } })
        destroy = () => { chart.destroy(); canvas.remove() }; resize = () => chart.resize()
        // Chart.js' animation callback is skipped in some headless and hidden
        // canvas layouts. The first frame confirms the instance was created.
        requestAnimationFrame(done)
      } else {
        const { default: importedPlotly } = await import('plotly.js-dist-min'); if (disposed) return
        const Plotly = importedPlotly as typeof importedPlotly & { Plots: { resize: (host: HTMLElement) => Promise<void> } }
        destroy = () => { Plotly.purge(element) }; resize = () => { void Plotly.Plots.resize(element).catch(fail) }
        await Plotly.react(element, spec.data, spec.layout, { responsive: false, displayModeBar: false }); if (disposed) { Plotly.purge(element); return }; done()
      }
    })().catch(fail)
    return () => { disposed = true; clearTimeout(timeout); cancelAnimationFrame(resizeFrame); observer.disconnect(); destroy() }
  }, [renderKey])
  return <div className="chart-host" data-testid="chart-host" data-renderer={presentation.renderer} ref={host} role="img" aria-label={`${title} chart`} />
}
