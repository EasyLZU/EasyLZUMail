const { IMAPServer } = require('wildduck/imap-core')
const { EventEmitter } = require('events')
const { CoreMailWebClient } = require('./LZUMail')
const { LZUMailHandler } = require('./LZUMailHandler')
const log4js = require("log4js")

/* IMAP服务器配置 */
const server = new IMAPServer({
    logger: false,
    skipFetchLog: false,
    disableSTARTTLS: true,
    ignoreSTARTTLS: true,
    acceptUTF8Enabled: false
})
server.logger = log4js.getLogger('IMAPServer')
server.logger._info = server.logger.info
server.logger.info = (obj, ...args) => server.logger._info(...args)
server.logger.level = 'info'
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
    let client = WebClientCache.get([username, login.password])
    if (!client) {
        client = new CoreMailWebClient()
        client.login(username, login.password).then(() => {
            const handler = new LZUMailHandler(client)
            session.webHandler = handler
            WebClientCache.set([username, login.password], client)
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

server.listen(143)