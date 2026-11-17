import { createServer } from 'node:http'

export const serveApp = async ({ env = {}, unset = [] } = {}) => {
    for (const key of unset) {
        delete process.env[key]
    }
    Object.assign(process.env, env)

    const { default: app } = await import('../../server/index.js')
    const server = createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

    return {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    }
}
