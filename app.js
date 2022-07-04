const { IMAPServer } = require('wildduck/imap-core')
const { EventEmitter } = require('events')
const { CoreMailWebClient } = require('./LZUMail')
const { LZUMailHandler } = require('./LZUMailHandler')
const config = require('wild-config')
const log4js = require("log4js")
const fs = require('fs')
const AsyncLock = require('async-lock')

const lock = new AsyncLock()

/* IMAP服务器配置 */
const server = new IMAPServer({
    skipFetchLog: false,
    secure: config.imap.tls,
    needsUpgrade: !config.imap.tls,
    disableSTARTTLS: false,
    ignoreSTARTTLS: false,
    acceptUTF8Enabled: false,
    key: config.imap.tls && fs.readFileSync(config.imap.tlsKey),
    cert: config.imap.tls && fs.readFileSync(config.imap.tlsCert),
    ciphers: 'ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL'
})

server.logger = log4js.getLogger('IMAPServer')
for (const logLevel of Object.keys(server.logger.__proto__)) {
    if (['debug', 'info', 'warn', 'error'].includes(logLevel)) {
        server.logger['_'+logLevel] = server.logger[logLevel]
        server.logger[logLevel] = (obj, ...args) => server.logger['_'+logLevel](...args)
    }
}
server.logger.level = config.imap.loggerLevel || 'info'

server.notifier = new EventEmitter()
server.on('error', err => {
    console.log('SERVER ERR\n%s', err.stack)
})
const WebClientCache = new WeakMap()

/* 功能实现 */
server.onAuth = function (login, session, callback) {
    const username = login.username
    if (!username.match(/^[a-zA-Z0-9]+@lzu\.edu\.cn$/g)) {
        return callback()
    }
    lock.acquire(WebClientCache, (done) => {
        let client = WebClientCache.get([username, login.password])
        if (!client) {
            client = new CoreMailWebClient()
            client.login(username, login.password).then(() => {
                const handler = new LZUMailHandler(client)
                session.webHandler = handler
                WebClientCache.set([username, login.password], client)
                done()
                return callback(null, {
                    user: {
                        id: 'lzu.' + username,
                        username: username
                    }
                })
            }).catch((reason) => {
                console.error(reason)
                return callback()
            })
        }
    })
}

server.onList = function (query, session, callback) {
    const handler = session.webHandler
    handler.getFolders().then((folders) => {
        callback(null, folders)
    }).catch((reason) => {
        console.error(reason)
        return callback()
    })
}

server.onLsub = null
server.onSubscribe = null
server.onUnsubscribe = null

server.onOpen = function (mailbox, session, callback) {
    const handler = session.webHandler
    handler.select(mailbox).then((response) => {
        callback(null, response)
    }).catch((reason) => {
        console.error(reason)
        return callback()
    })
}

server.onStatus = function (mailbox, session, callback) {
    const handler = session.webHandler
    handler.status(mailbox).then((response) => {
        callback(null, response)
    }).catch((reason) => {
        console.error(reason)
        return callback()
    })
}

server.onFetch = function (mailbox, options, session, callback) {
    const handler = session.webHandler
    handler.fetch(options, session).then(() => {
        callback(null, true)
    }).catch((reason) => {
        console.error(reason)
        return callback()
    })
}

server.onSearch = function (mailbox, options, session, callback) {
    const handler = session.webHandler
    handler.search(options).then((response) => {
        callback(null, response)
    }).catch((reason) => {
        console.error(reason)
        return callback()
    })
}

server.listen(config.imap.port || 993)
