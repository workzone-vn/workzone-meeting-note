// Đồ thị kiến thức kiểu Obsidian: canvas force-directed tự viết (không thêm
// thư viện - app chạy offline). Node xám = ghi chú, node xanh = #tag; cạnh =
// wikilink giữa note + note-tag. Kéo node, hover nổi label, bấm để mở.
import { useEffect, useRef } from 'react'
import type { WikiNoteMeta } from '../../../shared/types'

interface Node {
  id: string // 'note:<id>' | 'tag:<tên>'
  label: string
  isTag: boolean
  degree: number
  x: number
  y: number
  vx: number
  vy: number
}

interface Edge {
  a: number // index vào mảng nodes
  b: number
}

function buildGraph(notes: WikiNoteMeta[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const index = new Map<string, number>()
  const addNode = (id: string, label: string, isTag: boolean): number => {
    let i = index.get(id)
    if (i === undefined) {
      i = nodes.length
      index.set(id, i)
      // rải đều quanh vòng tròn để layout hội tụ ổn định (không dùng Math.random
      // cho vị trí khởi tạo phụ thuộc index -> mỗi lần mở giống nhau)
      const angle = (i * 137.5 * Math.PI) / 180 // góc vàng - phân bố đều
      const r = 60 + 14 * Math.sqrt(i)
      nodes.push({ id, label, isTag, degree: 0, x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 })
    }
    return i
  }
  const edges: Edge[] = []
  const seen = new Set<string>()
  const addEdge = (a: number, b: number): void => {
    if (a === b) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ a, b })
    nodes[a].degree++
    nodes[b].degree++
  }
  for (const n of notes) addNode(`note:${n.id}`, n.title, false)
  for (const n of notes) {
    const a = addNode(`note:${n.id}`, n.title, false)
    for (const l of n.links) addEdge(a, addNode(`note:${l}`, l, false))
    for (const t of n.tags) addEdge(a, addNode(`tag:${t}`, `#${t}`, true))
  }
  return { nodes, edges }
}

export function WikiGraph({
  notes,
  onOpenNote,
  onOpenTag
}: {
  notes: WikiNoteMeta[]
  onOpenNote: (id: string) => void
  onOpenTag: (tag: string) => void
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { nodes, edges } = buildGraph(notes)
    const ctx = canvas.getContext('2d')
    if (!ctx || nodes.length === 0) return

    let raf = 0
    let hover = -1
    let drag = -1
    let scale = 1
    let ox = 0 // tâm canvas (transform world -> screen)
    let oy = 0

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * devicePixelRatio
      canvas.height = rect.height * devicePixelRatio
    }
    resize()

    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    const colors = {
      edge: dark ? 'rgba(147,164,187,0.25)' : 'rgba(107,124,145,0.3)',
      note: dark ? '#93a4bb' : '#6b7c91',
      tag: '#35b06a',
      label: dark ? '#e4ebf5' : '#26303f',
      labelDim: dark ? '#93a4bb' : '#6b7c91'
    }

    const tick = (): void => {
      // lực đẩy giữa mọi cặp node (O(n^2) - wiki cá nhân vài trăm note vẫn êm)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const d2 = Math.max(dx * dx + dy * dy, 25)
          const f = 900 / d2
          const d = Math.sqrt(d2)
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          nodes[i].vx -= fx
          nodes[i].vy -= fy
          nodes[j].vx += fx
          nodes[j].vy += fy
        }
      }
      // lò xo trên cạnh
      for (const e of edges) {
        const dx = nodes[e.b].x - nodes[e.a].x
        const dy = nodes[e.b].y - nodes[e.a].y
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = (d - 80) * 0.02
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        nodes[e.a].vx += fx
        nodes[e.a].vy += fy
        nodes[e.b].vx -= fx
        nodes[e.b].vy -= fy
      }
      // hút nhẹ về tâm + ma sát
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        n.vx -= n.x * 0.005
        n.vy -= n.y * 0.005
        n.vx *= 0.85
        n.vy *= 0.85
        if (i !== drag) {
          n.x += n.vx
          n.y += n.vy
        }
      }
    }

    const fit = (): void => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const n of nodes) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
      }
      const w = canvas.width / devicePixelRatio
      const h = canvas.height / devicePixelRatio
      const pad = 70
      scale = Math.min(
        (w - pad * 2) / Math.max(maxX - minX, 1),
        (h - pad * 2) / Math.max(maxY - minY, 1),
        1.6
      )
      ox = w / 2 - ((minX + maxX) / 2) * scale
      oy = h / 2 - ((minY + maxY) / 2) * scale
    }

    const toScreen = (n: Node): { x: number; y: number } => ({ x: n.x * scale + ox, y: n.y * scale + oy })

    const draw = (): void => {
      const w = canvas.width / devicePixelRatio
      const h = canvas.height / devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = colors.edge
      ctx.lineWidth = 1
      for (const e of edges) {
        const a = toScreen(nodes[e.a])
        const b = toScreen(nodes[e.b])
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      nodes.forEach((n, i) => {
        const p = toScreen(n)
        const r = (n.isTag ? 4 : 4.5) + Math.min(n.degree, 6) * 0.8 + (i === hover ? 2 : 0)
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = n.isTag ? colors.tag : colors.note
        ctx.fill()
        // label: luôn hiện với node nhiều liên kết hoặc đang hover; còn lại mờ
        const always = n.degree >= 2 || nodes.length <= 30
        if (always || i === hover) {
          ctx.font = i === hover ? 'bold 12px -apple-system, sans-serif' : '11px -apple-system, sans-serif'
          ctx.fillStyle = i === hover ? colors.label : colors.labelDim
          ctx.textAlign = 'center'
          const label = n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label
          ctx.fillText(label, p.x, p.y + r + 13)
        }
      })
    }

    const loop = (): void => {
      tick()
      if (drag < 0) fit() // đang kéo thì giữ khung hình để chuột không "trượt"
      draw()
      raf = requestAnimationFrame(loop)
    }
    loop()

    const nodeAt = (mx: number, my: number): number => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const p = toScreen(nodes[i])
        if ((p.x - mx) ** 2 + (p.y - my) ** 2 < 12 ** 2) return i
      }
      return -1
    }
    const pos = (ev: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
    }
    let moved = false
    const onDown = (ev: MouseEvent): void => {
      const { x, y } = pos(ev)
      drag = nodeAt(x, y)
      moved = false
    }
    const onMove = (ev: MouseEvent): void => {
      const { x, y } = pos(ev)
      if (drag >= 0) {
        moved = true
        nodes[drag].x = (x - ox) / scale
        nodes[drag].y = (y - oy) / scale
        nodes[drag].vx = 0
        nodes[drag].vy = 0
      } else {
        hover = nodeAt(x, y)
        canvas.style.cursor = hover >= 0 ? 'pointer' : 'default'
      }
    }
    const onUp = (): void => {
      if (drag >= 0 && !moved) {
        const n = nodes[drag]
        if (n.isTag) onOpenTag(n.label.replace(/^#/, ''))
        else if (n.id.startsWith('note:')) onOpenNote(n.id.slice(5))
      }
      drag = -1
    }
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('resize', resize)
    }
  }, [notes, onOpenNote, onOpenTag])

  return <canvas ref={canvasRef} className="wiki-graph" />
}
