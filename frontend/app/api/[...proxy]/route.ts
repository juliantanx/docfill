import { type NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8002'

async function proxy(req: NextRequest, path: string) {
  const url = `${BACKEND}${path}`
  const headers = new Headers(req.headers)
  headers.delete('host')

  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    // @ts-expect-error Node fetch duplex
    duplex: 'half',
  })

  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    status: res.status,
    headers: res.headers,
  })
}

export async function GET(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
export async function POST(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
export async function PATCH(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
export async function DELETE(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
