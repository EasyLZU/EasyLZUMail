const parseMimeTree = require('wildduck/imap-core/lib/indexer/parse-mime-tree')
const imapHandler = require('wildduck/imap-core/lib/handler/imap-handler')

const FolderNameMAP = new Map(Object.entries({
    '待办邮件': '\\Flagged',
    '收件箱': 'INBOX',
    '草稿箱': '\\Drafts',
    '已发送': '\\Sent',
    '已删除': '\\Trash',
    '垃圾邮件': '\\Junk'
}))

class LZUMailHandler {
    constructor(webClient) {
        this.webClient = webClient
        this.rawFolders = null
        this.folders = null
        this.selectedFolder = null
        this.mailContentBuffer = new Map()
        this.mailBuffer = new Map()
    }
    async getFolders() { /* 只实现了返回全部一级文件夹 */
        if (this.folders) return this.folders
        this.rawFolders = await this.webClient.getAllFolders()
        this.folders = this.rawFolders.map((folder) => ({
            mailbox: folder.name,
            path: folder.name === '收件箱' ? 'INBOX' : folder.name,
            specialUse: FolderNameMAP.get(folder.name)
        }))
        return this.folders
    }
    async select(folderName) {
        if (!this.rawFolders) await this.getFolders()
        if (folderName.toUpperCase() === 'INBOX') {
            folderName = '收件箱'
        }
        const folder = this.rawFolders.find((e) => e.name === folderName)
        if (!folder) return 'NONEXISTENT'
        this.selectedFolder = folder
        return {
            _id: folderName,
            uidValidity: Date.now(),
            uidList: Array.from({ length: folder.stats.messageCount }, (v, i) => i + 1),
            uidNext: folder.stats.messageCount + 1,
            specialUse: FolderNameMAP.get(folder.name)
        }
    }
    async status(folderName) {
        if (!this.rawFolders) await this.getFolders()
        if (folderName.toUpperCase() === 'INBOX') {
            folderName = '收件箱'
        }
        const folder = this.rawFolders.find((e) => e.name === folderName)
        if (!folder) return 'NONEXISTENT'
        return {
            messages: folder.stats.messageCount,
            uidNext: folder.stats.messageCount + 1,
            uidValidity: Date.now(),
            highestModseq: 0,
            unseen: folder.stats.unreadMessageCount
        }
    }
    async search(options) { /* 只实现了查询指定范围存在的UID列表 */
        if (!options.isUid) return null
        let uidList = []
        for (const query of options.query) {
            if (query.key === 'uid') {
                uidList = uidList.concat(query.value)
            }
        }
        return {
            uidList,
            highestModseq: 0
        }
    }
    async fetch(options, session) { /* 只实现了全文加载 */
        function justSendData(stream) {
            return new Promise((resolve, reject) => {
                session.writeStream.write(stream, resolve)
            })
        }
        if (!options.isUid) return null
        const fid = this.selectedFolder.id
        for (const messagesID of options.messages) {
            /* Cached Mail */
            let realMail = this.mailBuffer.get([fid, messagesID - 1, 1])
            if (!realMail) {
                realMail = (await this.webClient.listMessages(fid, messagesID - 1, 1))[0]
                this.mailBuffer.set([fid, messagesID - 1, 1], realMail)
            }
            const sendData = {
                uid: messagesID,
                modseq: messagesID,
                idate: new Date(realMail.receivedDate),
                flags: realMail.flags.read ? ['\\Seen'] : []
            }
            if (!options.metadataOnly) {
                /* Cached Content */
                let mailContent = this.mailContentBuffer.get(realMail.id)
                if (!mailContent) {
                    mailContent = await this.webClient.mailContent(realMail.id)
                    this.mailContentBuffer.set(realMail.id, mailContent)
                }
                sendData.mimeTree = parseMimeTree(mailContent)
            }
            /* Send data */
            let stream = imapHandler.compileStream(
                session.formatResponse('FETCH', messagesID, {
                    query: options.query,
                    values: session.getQueryResponse(options.query, sendData)
                })
            )
            try {
                await justSendData(stream)
            } catch {
                // Do nothing
            }
        }
    }
}

module.exports = { LZUMailHandler }