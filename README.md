### EasyLZUMail

提供兰大电子邮件Web端的IMAP转发服务

> **注意** : 目前EasyLZUMail还处于测试阶段
> * IMAP服务端目前**只读**
> * 请将同步间隔设置到 **1小时** 以上
> * **第一次的同步过程会非常慢**，请耐心等待
> * 同步的邮件可能会有乱码和错误，请在issue反馈

#### 部署

* 修改config/default.toml文件
* 添加私钥和证书文件
* `npm install`
* `node app`