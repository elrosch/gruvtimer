import {
  BarElement, CategoryScale, Chart, Decimation, Filler, Legend, LinearScale, LineElement, PointElement, TimeScale, Tooltip,
  type ChartOptions,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Bar, Line } from 'react-chartjs-2'
import { formatTime } from '../lib/format'
import { breakGaps, type Series } from '../lib/graph'

Chart.register(LineElement, PointElement, BarElement, LinearScale, TimeScale, CategoryScale, Tooltip, Legend, Decimation, Filler)

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

function baseOptions(): ChartOptions<'line'> {
  const fg = css('--fg4')
  const grid = css('--bg2')
  Chart.defaults.color = fg
  Chart.defaults.font.family = css('--font-mono') || 'monospace'
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    normalized: true,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { labels: { color: css('--fg'), boxWidth: 12, usePointStyle: true } },
      decimation: { enabled: true, algorithm: 'lttb', samples: 600 },
      tooltip: {
        backgroundColor: css('--bg1'),
        titleColor: css('--fg'),
        bodyColor: css('--fg'),
        borderColor: css('--bg3'),
        borderWidth: 1,
        callbacks: { label: c => `${c.dataset.label}: ${formatTime(c.parsed.y ?? NaN)}` },
      },
    },
    scales: {
      y: { grid: { color: grid }, ticks: { callback: v => formatTime(Number(v)) } },
    },
  }
}

export function TimeChart({ series, xAxis, height = 260 }: { series: Series[]; xAxis: 'time' | 'index'; height?: number }) {
  const opts = baseOptions()
  opts.scales!.x = xAxis === 'time'
    ? { type: 'time', grid: { color: css('--bg2') }, time: { tooltipFormat: 'PPp' } }
    : { type: 'linear', grid: { color: css('--bg2') }, ticks: { precision: 0 }, title: { display: true, text: 'solve #' } }

  const data = {
    datasets: series.map(s => {
      const color = css(s.color)
      const many = s.data.length > 300
      return {
        label: s.label,
        // on a time axis, long breaks in practice show as gaps instead of a straight line
        data: xAxis === 'time' && !s.points ? breakGaps(s.data) : s.data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: s.points ? 0 : 2,
        showLine: !s.points,
        pointRadius: s.points ? (many ? 1.2 : 2.5) : 0,
        pointHoverRadius: 4,
        stepped: s.stepped ? ('before' as const) : false,
        tension: 0,
        order: s.points ? 10 : 0,
      }
    }),
  }
  const empty = series.every(s => s.data.length === 0)
  return (
    <div className="chart" style={{ height }}>
      {empty ? <div className="chart-empty">no data in this range</div> : <Line options={opts} data={data} />}
    </div>
  )
}

export function Histogram({ bins, height = 180 }: { bins: { label: string; count: number }[]; height?: number }) {
  const opts: ChartOptions<'bar'> = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--bg1') } },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: css('--bg2') }, ticks: { precision: 0 } },
    },
  }
  const data = {
    labels: bins.map(b => b.label),
    datasets: [{ data: bins.map(b => b.count), backgroundColor: css('--blue'), borderRadius: 3 }],
  }
  return (
    <div className="chart" style={{ height }}>
      {bins.length === 0 ? <div className="chart-empty">no solves</div> : <Bar options={opts} data={data} />}
    </div>
  )
}
