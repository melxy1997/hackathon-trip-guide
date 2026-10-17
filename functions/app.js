const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(
  path.resolve(__dirname, '../dist/index.html'),
  'utf-8',
)

module.exports = async function app(ctx) {
  if (ctx.path === '/' || ctx.path === '/index.html') {
    const { assetsPath } = ctx.assets
    ctx.type = 'html'
    ctx.status = 200

    return html
      .replace(
        'SERVERLESS_INJECT_PUBLIC_PATH',
        `SERVERLESS_INJECT_PUBLIC_PATH = '${assetsPath}'`,
      )
      .replace(/\.\/assets\//g, `${assetsPath}assets/`)
  }
}
