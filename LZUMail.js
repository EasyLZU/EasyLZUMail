// 2022-07-03
/* 平台函数 */
function request(options, body) {
    const https = require('http')
    return new Promise((resolve, reject) => {
        const request = https.request(options, (res) => {
            let data = []
            res.on('data', (chunk) => data.push(chunk))
            res.on('end', () => {
                resolve({
                    headers: res.headers,
                    body: Buffer.concat(data).toString('utf8'),
                })
            })
        })
        request.on('error', () => reject('https request error'))
        request.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML) Safari/537.36')
        if (body) {
            request.setHeader('Content-Length', Buffer.byteLength(body))
            request.write(body)
        }
        request.end()
    })
}

class CoreMailWebClient {
    constructor() {
        this.sid = null
        this.cookie = null
    }
    async login(uid, password) {
        /* 第一阶段: 获取表单URL参数 */
        const res_1st = await request({
            hostname: 'mail.lzu.edu.cn',
            path: '/coremail/index.jsp',
            method: 'GET',
        })
        const url_parm = res_1st.body.match(new RegExp('/coremail/index.jsp([^"]+)'))[1]
        if (!url_parm) throw new Error('Can not get form url parm')
        console.log(`[CoreMailWebClient] Index Page URL Parameters: ${url_parm}`)
        /* 第二阶段: 提交登录请求 */
        const post_data = new URLSearchParams({
            'locale': 'zh_CN', 'nodetect': false, 'destURL': null || '',
            'supportLoginDevice': false, 'accessToken': null || '',
            'timestamp': null || '', 'signature': null || '',
            'nonce': null || '',
            'device': JSON.stringify({
                'uuid': 'webmail_windows', 'imie': 'webmail_windows',
                'friendlyName': 'firefox+102', 'model': 'windows',
                'os': 'windows', 'osLanguage': 'zh-CN', 'deviceType': 'Webmail'
            }),
            'supportDynamicPwd': false, 'supportBind2FA': false,
            'authorizeDevice': null || '', 'loginType': null || '',
            'uid': uid, 'password': password, 'action:login': null || ''
        })
        const res_2nd = await request({
            hostname: 'mail.lzu.edu.cn',
            path: '/coremail/index.jsp' + url_parm,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, post_data.toString())
        if (!res_2nd.headers['set-cookie']) throw new Error('Login failed, check uid & password')
        /* 第三阶段: 解析返回页面脚本，构造Cookie */
        const sessionID = res_2nd.headers['set-cookie'][0].split(';')[0]
        const sid = res_2nd.body.match(new RegExp('var sid = "([^"]+)"'))[1]
        this.sid = sid
        this.cookie = [
            'face=undefined', 'locale=zh_CN', 'saveUsername=true',
            `uid=${encodeURIComponent(uid)}`, `${sessionID}`,
            `CoremailReferer=${encodeURIComponent('https://mail.lzu.edu.cn/')}`,
            `Coremail.sid=${sid}`
        ].join('; ')
        console.log(`[CoreMailWebClient] New Session: ${sessionID}`)
        console.log(`[CoreMailWebClient] Using Cookie: ${this.cookie}`)
    }
    async POSTAPIRequest({path, func, post_data, content_type}) {
        if (!this.cookie || !this.sid) throw new Error('Should login first')
        const res = await request({
            hostname: 'mail.lzu.edu.cn',
            path: `${path}?sid=${this.sid}&func=${encodeURIComponent(func)}`,
            method: 'POST',
            headers: {
                'Content-Type': content_type, 'Cookie': this.cookie
            }
        }, post_data)
        const res_data = JSON.parse(res.body)
        if (res_data['result'] && res_data['result'] == 'error') throw new Error(res_data['errorMsg'])
        if (!res_data['code'] || res_data['code'] != 'S_OK') throw new Error('Unknown response')
        return res_data['var']
    }
    async getAllFolders() {
        return await this.POSTAPIRequest({
            'content_type': 'application/x-www-form-urlencoded',
            'path': '/coremail/XT5/jsp/mail.jsp', 'func': 'getAllFolders',
            'post_data': new URLSearchParams({
                'stats': true, 'threads': false
            }).toString()
        })
    }
    async listMessages(folderID, start, limit) {
        return await this.POSTAPIRequest({
            'content_type': 'text/x-json',
            'path': '/coremail/s/json', 'func': 'mbox:listMessages',
            'post_data': JSON.stringify({
                "start": start, "limit": limit, "mode": "count",
                "order": "receivedDate", "desc": false,
                "returnTotal": true, "summaryWindowSize": limit,
                "fid": folderID, "topFirst": true
            })
        })
    }
    async mailContent(mailID) {
        if (!this.cookie || !this.sid) throw new Error('Should login first')
        const res = await request({
            hostname: 'mail.lzu.edu.cn',
            path: '/coremail/mbox-data/content.eml?' + (new URLSearchParams({
                'mid': mailID, 'mode': 'text', 'part': 0, 'mboxa': ''
            })).toString(),
            method: 'GET',
            headers: {
                'Cookie': this.cookie
            }
        })
        return res.body
    }
}

module.exports = { CoreMailWebClient }