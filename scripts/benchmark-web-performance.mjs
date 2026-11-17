import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { createGzip } from 'node:zlib'

const FIXTURE_COUNT = 93
const FIXTURE_DATABASE = 'otzaria_web_perf'
const MOBILE_NETWORK = { latency: 300, downloadThroughput: 50_000, uploadThroughput: 25_000 }

async function seedCatalog() {
  const uri = new URL(process.env.MONGODB_URI)
  assert.equal(uri.protocol, 'mongodb:')
  assert.equal(uri.hostname, '127.0.0.1')
  assert.equal(uri.pathname, `/${FIXTURE_DATABASE}`)
  assert.ok(path.isAbsolute(process.env.PLUGIN_STORAGE_DIR || ''), 'PLUGIN_STORAGE_DIR חייב להיות נתיב מבודד')
  const { default: mongoose } = await import('mongoose')
  const { default: sharp } = await import('sharp')
  const { saveOptimizedImage } = await import('../src/lib/pluginStorage.js')
  try {
    await mongoose.connect(uri.href, { serverSelectionTimeoutMS: 5_000 })
    const plugins = mongoose.connection.collection('plugins')
    await plugins.bulkWrite(Array.from({ length: FIXTURE_COUNT }, (_, index) => {
      const serial = String(index + 1).padStart(3, '0')
      const slug = `web-perf-fixture-${serial}`
      const date = new Date(Date.UTC(2026, 0, index + 1))
      return { replaceOne: { filter: { slug }, upsert: true, replacement: {
        slug,
        name: `תוסף בדיקה ${serial}`,
        shortDescription: `תוסף בדיקה לביצועי הקטלוג, פריט ${serial}.`,
        description: `מילות חיפוש לדוגמה עבור פריט ${serial}. בדיקת תצוגה, קריאה, סינון והתקנה.`,
        author: 'בדיקת ביצועים',
        compatibleWith: '1.0.0',
        version: '1.0.0',
        status: index === 0 ? 'beta' : 'stable',
        tags: [`קטגוריה ${index % 8}`],
        pluginFileName: `${slug}.otzplugin`,
        pluginFileExt: '.otzplugin',
        createdAt: date,
        updatedAt: date,
        isApproved: true,
        isHidden: false,
        ...(index >= FIXTURE_COUNT - 4 ? { image: { ext: '.webp', contentType: 'image/webp' } } : {}),
      } } }
    }))
    const source = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#123b61' } })
      .webp().toBuffer()
    const image = new File([source], 'fixture.webp', { type: 'image/webp' })
    const pluginsWithImages = await plugins.find({ slug: /^web-perf-fixture-/, 'image.ext': '.webp' }).toArray()
    for (const plugin of pluginsWithImages) {
      const directory = path.join(process.env.PLUGIN_STORAGE_DIR, plugin._id.toString())
      await mkdir(directory, { recursive: true })
      await saveOptimizedImage(image, directory, 'image')
    }
  } finally {
    await mongoose.disconnect()
  }
}

// מקביל ל-gzip של nginx לצורך המדידה בלבד. שרת Next של הפרויקט מגיש ללא דחיסה.
async function startGzipProxy(upstream) {
  const requests = []
  const proxy = createServer((incoming, outgoing) => {
    requests.push({ url: new URL(incoming.url, upstream), rsc: incoming.headers.rsc === '1' })
    const headers = { ...incoming.headers }
    delete headers['accept-encoding']
    const origin = request({ hostname: upstream.hostname, port: upstream.port, path: incoming.url,
      method: incoming.method, headers }, response => {
      const forwarded = { ...response.headers }
      const compress = incoming.method === 'GET' && response.statusCode === 200 &&
        /(?:^|,|\s)gzip(?:$|,|\s)/i.test(incoming.headers['accept-encoding'] || '') &&
        !forwarded['content-encoding'] &&
        /^(text\/|application\/(javascript|json))/.test(forwarded['content-type'] || '')
      if (compress) {
        delete forwarded['content-length']
        forwarded['content-encoding'] = 'gzip'
        forwarded.vary = [forwarded.vary, 'Accept-Encoding'].filter(Boolean).join(', ')
      }
      outgoing.writeHead(response.statusCode, forwarded)
      if (compress) pipeline(response, createGzip(), outgoing, () => {})
      else pipeline(response, outgoing, () => {})
    })
    origin.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy()
      else outgoing.writeHead(502).end()
    })
    outgoing.on('close', () => origin.destroy())
    incoming.pipe(origin)
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  return { proxy, requests, baseUrl: `http://127.0.0.1:${proxy.address().port}` }
}

function isRsc({ url, rsc }) { return rsc || url.searchParams.has('_rsc') || url.pathname.endsWith('.rsc') }
function isSprite({ url }) { return url.pathname.includes('golden-book-sprite.') }
function isCardThumbnail({ url }) { return url.pathname.endsWith('/image') && url.searchParams.get('size') === 'card' }

async function measurePage(browser, baseUrl, requests, pathname) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    // בדיקת ביצועים אינה תלויה ביום שבו היא רצה או בשירות הזמנים החיצוני.
    userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36 Googlebot',
  })
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '3g', downlink: 0.4, rtt: 300, saveData: true },
      })
      window.webPerfLcp = null
      new PerformanceObserver(list => {
        window.webPerfLcp = list.getEntries().at(-1)?.startTime ?? null
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, connectionType: 'cellular3g', ...MOBILE_NETWORK,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const started = requests.length
    const response = await page.goto(baseUrl + pathname, { waitUntil: 'load', timeout: 60_000 })
    assert.equal(response?.status(), 200, pathname)
    assert.equal(response.headers()['content-encoding'], 'gzip', pathname)
    await page.locator('main h1').first().waitFor({ state: 'visible' })
    await page.waitForFunction(() => Number.isFinite(window.webPerfLcp))
    // כולל טעינות קצרות אחרי hydration, לפני שפעולת המשתמש משנה את המדידה.
    await page.waitForTimeout(1_200)
    const timings = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0]
      const resources = performance.getEntriesByType('resource')
      const thumbnails = resources.filter(entry => {
        const url = new URL(entry.name)
        return url.pathname.endsWith('/image') && url.searchParams.get('size') === 'card'
      })
      return {
        lcpMs: Math.round(window.webPerfLcp),
        ttfbMs: Math.round(navigation.responseStart),
        loadMs: Math.round(navigation.loadEventEnd),
        htmlBytes: navigation.encodedBodySize,
        transferredBytes: [navigation, ...resources].reduce((sum, entry) => sum + entry.transferSize, 0),
        jsBytes: resources.filter(entry => new URL(entry.name).pathname.endsWith('.js'))
          .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        thumbnailBytes: thumbnails.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      }
    })
    const coldRequests = requests.slice(started)
    if (pathname === '/') {
      assert.equal(coldRequests.filter(isSprite).length, 0, 'הרצועה אינה נדרשת ברשת חלשה')
    }
    if (pathname === '/plugins/all') {
      assert.ok(coldRequests.some(isCardThumbnail) && timings.thumbnailBytes > 0, 'כרטיסי הקטלוג קיבלו תמונות ממוזערות')
      const cards = page.locator('main article')
      assert.equal(await cards.count(), 24, 'כרטיסים בטעינה הראשונה')
      assert.equal(await cards.first().locator('img').evaluate(image => image.naturalWidth), 144)
      await page.getByRole('button', { name: 'הצג תוספים נוספים' }).click()
      await page.waitForFunction(() => document.querySelectorAll('main article').length === 48)
      const beforeFilter = requests.length
      await page.getByLabel('סטטוס', { exact: true }).selectOption('beta')
      await page.getByRole('heading', { name: 'תוסף בדיקה 001' }).waitFor()
      await page.waitForURL(url => url.searchParams.get('status') === 'beta')
      assert.equal(await cards.count(), 1, 'הסינון בודק גם פריטים מעבר למנה הראשונה')
      await page.waitForTimeout(600)
      assert.equal(requests.slice(beforeFilter).filter(isRsc).length, 0, 'סינון מקומי לא מבקש RSC')
    }
    return { pathname, ...timings, originRequests: coldRequests.length,
      rscRequests: coldRequests.filter(isRsc).length,
      thumbnailRequests: coldRequests.filter(isCardThumbnail).length }
  } finally {
    await context.close()
  }
}

async function runBenchmark() {
  const require = createRequire(import.meta.url)
  const { chromium } = require(process.env.OTZARIA_PLAYWRIGHT_MODULE || 'playwright')
  const upstream = new URL(process.env.OTZARIA_PERF_UPSTREAM || 'http://127.0.0.1:3000')
  assert.equal(upstream.protocol, 'http:')
  assert.equal(upstream.hostname, '127.0.0.1')
  assert.ok(upstream.port)
  const { proxy, baseUrl, requests } = await startGzipProxy(upstream)
  let browser
  try {
    const executablePath = process.env.OTZARIA_CHROME_EXECUTABLE
    browser = await chromium.launch({ headless: true, executablePath })
    const pages = []
    for (const pathname of ['/', '/plugins', '/plugins/all', '/library']) {
      const result = await measurePage(browser, baseUrl, requests, pathname)
      assert.ok(result.htmlBytes > 0 && result.transferredBytes > result.htmlBytes, pathname)
      pages.push(result)
    }
    const output = process.env.OTZARIA_PERF_RESULT || 'build/web-performance/measurements.json'
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify({ network: MOBILE_NETWORK, cpuSlowdown: 4, pages }, null, 2) + '\n')
    console.table(pages)
  } finally {
    await browser?.close()
    proxy.close()
  }
}

if (process.argv[2] === '--seed') await seedCatalog()
else await runBenchmark()
