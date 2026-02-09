## TG-BOT-LIVEGRAM 功能亮点

- CF免费部署，每天约可处理25K消息，足够中小需求的日常使用。

- 可靠的防刷，全局限流40个每秒，单个用户每1个每秒。

- 有效的防止攻击，与TG服务器Screct-Token通信。

- 多种类消息的支持。文字、语音、图片、视频均支持。

- 完整的TG BOtapi框架，方便扩展各种机器人。


## TG-BOT-LIVEGRAM 使用说明

- 客户通过机器人发送消息

- 消息被转发到超级群

- 客服在超级群通过回复客户消息

- 回复被转发到客户私聊

## TG-BOT-LIVEGRAM CF免费部署方案

- 2026年2月

worker 100K次请求
d1 5M次读行和100K次写行

- 限流方案

本机器人全局限流40个每秒
单个用户每1个每秒

- 本机器人免费

每天约可处理25K消息
足够中小需求的日常使用

### 使用wrangler创建cloudflare项目

$ `wrangler init`

```
 ⛅️ wrangler 4.63.0
───────────────────
🌀 Running `npm create cloudflare@^2.5.0 --`...
Need to install the following packages:
create-cloudflare@2.63.0
Ok to proceed? (y)

> npx
> create-cloudflare



👋 Welcome to create-cloudflare v2.63.0!
🧡 Let's get started.
📊 Cloudflare collects telemetry about your usage of Create-Cloudflare.

Learn more at: https://github.com/cloudflare/workers-sdk/blob/main/packages/crea
te-cloudflare/telemetry.md


╭ Create an application with Cloudflare Step 1 of 3
│
╰ In which directory do you want to create your application? also used as applic
├ In which directory do you want to create your application?
│ dir ./memebababot
│
├ What would you like to start with?
│ category Hello World example
│╰ Which template would you like to use?
├ Which template would you like to use?
│ type Worker only
├ Which language do you want to use?
│ lang JavaScript
│├ Copying template files
│ files copied to project directory
│
├ Updating name in `package.json`
│ updated `package.json`
│
╰ Application created

╭ Configuring your application for Cloudflare Step 2 of 3
│
├ Retrieving current workerd compatibility date
│ compatibility date 2026-02-05
│
├ Do you want to use git for version control?
│ no git
│
╰ Application configured

╭ Deploy with Cloudflare Step 3 of 3
│
├ Do you want to deploy your application?
│ no deploy via `npm run deploy`
│
╰ Done


🎉  SUCCESS  Application created successfully!

💻 Continue Developing
Change directories: cd memebababot
Deploy: npm run deploy

📖 Explore Documentation
https://developers.cloudflare.com/workers

🐛 Report an Issue
https://github.com/cloudflare/workers-sdk/issues/new/choose

💬 Join our Community
https://discord.cloudflare.com

```



### 使用wrangler创建数据库，并加入到wrangler.jsonc

$ `npx wrangler@latest d1 create BOT-STORAGE`

```
 ⛅️ wrangler 4.63.0
───────────────────
✅ Successfully created DB 'BOT-STORAGE' in region WNAM
Created your new D1 database.

To access your new D1 Database in your Worker, add the following snippet to your
 configuration file:
{
  "d1_databases": [
    {
      "binding": "BOT_STORAGE",
      "database_name": "BOT-STORAGE",
      "database_id": "1234ea12-1234-1234-1234-1234e5512d4f"
    }
  ]
}
√ Would you like Wrangler to add it on your behalf? ... yes
√ What binding name would you like to use? ... BOT_STORAGE
√ For local dev, do you want to connect to the remote resource instead of a loca
l resource? ... yes
```

### 使用wrangler初始化数据库

$ `npx wrangler d1 execute  BOT_STORAGE --remote --file=./src/BOT_STORAGE.sql`

```
 ⛅️ wrangler 4.63.0
───────────────────
Resource location: remote

√ ⚠️ This process may take some time, during which your D1 database will be unav
ailable to serve queries.
  Ok to proceed? ... yes
🌀 Executing on remote database BOT_STORAGE (1234ea12-1234-1234-1234-1234e5512d4f):
🌀 To execute on your local development database, remove the --remote flag from
your wrangler command.
Note: if the execution fails to complete, your DB will return to its original st
ate and you can safely retry.
├ 🌀 Uploading 1234ea12-1234-1234-1234-1234e5512d4f.196b26da1ec92fef.sql
│ 🌀 Uploading complete.
│
🌀 Starting import...
🌀 Processed 7 queries.
🚣 Executed 7 queries in 2.55ms (3 rows read, 11 rows written)
   Database is currently at bookmark 00000001-00000005-0000500d-181da365dc142a2a
70848a35c8843dec.
┌────────────────────────┬───────────┬──────────────┬────────────────────┐
│ Total queries executed │ Rows read │ Rows written │ Database size (MB) │
├────────────────────────┼───────────┼──────────────┼────────────────────┤
│ 7                      │ 3         │ 11           │ 0.04               │
└────────────────────────┴───────────┴──────────────┴────────────────────┘
```

### 将环境变量加入到wrangler.jsonc


```
	"vars": {
		"TELEGRAM_API": "https://api.telegram.org/bot",
		"BOT_OWNER_ID": "8123456789", //写入自己的电报ID
		"BOT_SUPERGROUP_ID": "-100123456789",//写入自己的超级群组ID
		"GLOBAL_RATELIMIT": "40",
		"USER_RATELIMIT": "1",
		"MSG_BOT_WELOCME":"欢迎您",
		"MSG_BOT_LIMIT":"你已经被限流约1000秒后自动恢复",
		"MSG_BOT_SUCCESS":"你的消息已经成功发送",
	},
```


### wrangler put机密变量


```
wrangler secret put TELEGRAM_BOT_TOKEN
8123456789:AA123456789FE93CT123456789qyue36wH0

wrangler secret put TELEGRAM_API_PASSWORD
123456789bmPQaf5lvO6oklk7kTh7FXt5bZ123456789
```


### POSTMAN写入电报回调地址

```
https://api.telegram.org/bot8123456789:AA123456789FE93CT123456789qyue36wH0/setWebhook
{
    "url": "https://memebababot.yourusername.workers.dev",
    "secret_token": "123456789bmPQaf5lvO6oklk7kTh7FXt5bZ123456789"
}
```

### wrangler部署到CF

$ `wrangler deploy`


## TG-BOT-LIVEGRAM 特别说明

- 没有采用话题Topic的模式，因为需要200人以上的超级群组。

- 使用部署中有问题，联系 [@memeBABAbot 机器人](https://t.me/memeBABAbot "最好的 TG-BOT-LIVEGRAM 电报机器人")

## TG-BOT-LIVEGRAM 后续计划

- 增加各种管理命令

- 增强异常处理
