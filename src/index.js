/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */


export default {
	async fetch(request, env, ctx) {
		//检查请求是否来自电报服务器
		let tgRequest = false;
		const headerVariations = [
			'X-Telegram-Bot-Api-Secret-Token',  // 原始大小写
			'x-telegram-bot-api-secret-token',  // 全小写
			'X-Telegram-Bot-Api-Secret-token',  // 混合
		];
		console.log('=== 尝试获取 secret_token ===');
		headerVariations.forEach(headerName => {
			const value = request.headers.get(headerName);
			console.log(`尝试 "${headerName}": ${value ? '找到' : '未找到'}`);
			if (value) {
				console.log(`  值: ${value}`);
				if (value == env.TELEGRAM_API_PASSWORD) { tgRequest = true }
			}
		});
		if (!tgRequest) {
			console.log("电报服务器检查不通过");
			return new Response('Request Not Allowed', { status: 405 });
		}
		//只处理POST请求
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}
		//主函数
		try {
			const url = new URL(request.url);
			if (url.pathname === '/webhook' || url.pathname === '/') {
				return await handleWebhook(request, env, ctx); // 传递ctx参数
			}
			else { return new Response('Route Not Allowed', { status: 406 }); }
		} catch (error) {
			console.error('fetch Error:', error);
			return new Response('CF worker fetch Error', { status: 500 });
		}
	},
};

///////////////////////////////////////////////////////////////////////////////
// 外部请求，再这里已经返回了。
// 处理电报webhook消息请求（修复ctx参数传递）
async function handleWebhook(request, env, ctx) {
	try {
		//使用body参数，防止请求响应后，无法获得request
		const body = await request.json();
		console.log('接收的请求体:', JSON.stringify(body));
		//使用ctx.waitUntil处理异步任务，不阻塞主响应
		ctx.waitUntil(handleRequest(body, env));
		return new Response('OK', { status: 200 });
	} catch (error) {
		console.error('handleWebhook error:', error);
		return new Response('handleWebhook Error', { status: 501 });
	}
}

///////////////////////////////////////////////////////////////////////////////
//剩下的全部是内部处理
// 处理请求的主函数
async function handleRequest(body, env) {
	try {
		//按照消息分类-频道消息
		if (body.channel_post) {
			console.log("这是一个频道消息的处理");
			await handleChannelMessage(body.channel_post, env)
			return;
		}
		// 按照消息分类-群聊消息
		if (body.message) {
			//检查用户的限流（每秒1个）
			const MemberRate = await validMessageRateLimit(body.message, env);
			if (!MemberRate) { return }

			//检查全局的限流（每秒并发40）
			const GlobalRate = await validGlobalRateLimit(body.message, env);
			if (!GlobalRate) { return }

			const chatType = body.message.chat.type;
			if (chatType == 'private') {
				console.log("这是一个私聊消息的处理");
				await handlePrivateMessage(body.message, env);
				return;
			}
			else {
				console.log("这是一个群组消息的处理");
				await handleSperchatMessage(body.message, env);
				return;
			}
		}
	} catch (error) {
		console.error('handleRequest async await', error);
	}
}

///////////////////////////////////////////////////////////////////////////////
//检查全局的限流是否通过(并发不超过每秒40个)
//通过true，不通过false
async function validGlobalRateLimit(message, env) {
	try {
		//数据库方案
		//const userID = message.from.id;
		const nowdate = Math.floor(Date.now() / 1000);
		const tbname = "botsettings";
		const memberkey = "GLOBAL_REQUEST_RATE";
		//处理数据库返回结果
		const oldRecord = await botStorageGet(tbname, memberkey, env);
		console.log("await botStorageGet(validGlobalRateLimit)", oldRecord);

		if (oldRecord) {
			const oldValue = JSON.parse(oldRecord);
			// 计算限流阈值
			if (nowdate - oldValue.message_last > env.USER_RATELIMIT) {
				//本次请求距离上次请求大于1秒
				const newlimit = { message_last: nowdate, request_count: 1 };
				await botStoragePut(tbname, memberkey, JSON.stringify(newlimit), env);
				return true;
			}
			else if (oldValue.request_count < env.USER_RATELIMIT) {
				//1秒内的请求数量小于40
				const newlimit = { ...oldValue, request_count: oldValue.request_count + 1 };
				await botStoragePut(tbname, memberkey, JSON.stringify(newlimit), env);
				return true;
			}
			return false;
		}
	} catch (error) {
		console.error('validGlobalRateLimit async error', error);
		return false;
	}

}

///////////////////////////////////////////////////////////////////////////////
//检查私聊消息的限流是否通过(每用户每秒1个)
//通过true，不通过false
async function validMessageRateLimit(message, env) {
	try {
		//数据库方案
		const userID = message.from.id;
		const nowdate = Math.floor(Date.now() / 1000);
		const tbname = "botmembers";
		const memberkey = `user_${userID}`
		//处理数据库返回结果
		const oldRecord = await botStorageGet(tbname, memberkey, env);
		console.log("await botStorageGet(validMessageRateLimit)", oldRecord);
		//老用户
		if (oldRecord) {
			const oldValue = JSON.parse(oldRecord);
			// 计算限流阈值
			const userlimitRate = Math.max(oldValue.limit, env.USER_RATELIMIT);
			// 限流不通过，放大limit
			if (nowdate - oldValue.messageDate < userlimitRate) {
				console.log("老用户限流不通过:", nowdate, oldValue.messageDate, userlimitRate);
				//如果限流大于30天，就不处理了
				if (oldValue.limit < 30 * 24 * 60) {
					const newlimit = oldValue.limit * 10;
					const newMassage = { ...message.from, limit: newlimit, messageDate: nowdate };
					await botStoragePut(tbname, memberkey, JSON.stringify(newMassage), env);
				}
				if (oldValue.limit == 100) {
					//回复消息给用户-仅提示用户一次
					await replyTextMessageTG(message.chat.id, env.MSG_BOT_LIMIT, env.TELEGRAM_BOT_TOKEN);
				}
				return false;
			}
			console.log("老用户限流通过:", nowdate, oldValue.messageDate, userlimitRate);
			//老用户限流通过-继续处理
			const newMassage = { ...message.from, limit: 1, messageDate: nowdate };
			await botStoragePut(tbname, memberkey, JSON.stringify(newMassage), env);
			return true;
		}
		else {
			//新用户-记录限流的时间戳限流
			console.log("新用户限流通过:", nowdate);
			const newMassage = { ...message.from, limit: 1, messageDate: nowdate };
			const newValue = await botStorageAdd(tbname, memberkey, JSON.stringify(newMassage), env);
			if (newValue) {
				//新用户的第一次消息处理
				await handlePrivateFirstMessage(message, env);
				//回复消息给用户
				await replyTextMessageTG(message.chat.id, env.MSG_BOT_WELOCME, env.TELEGRAM_BOT_TOKEN);
				return true
			}
			return false;
		}
	} catch (error) {
		console.error('validMessageRateLimit async error', error);
		return false;
	}
}

///////////////////////////////////////////////////////////////////////////////
//从D1数据库读取记录
//正确返回字符串： {"messageDate":1770185214,"limit":2592111} 
//错误返回：false
//异常抛出
async function botStorageGet(tbname, memberkey, env) {
	try {
		const botsql = "SELECT babaValue FROM " + tbname + " WHERE babaKey = ?";
		const babaKey = `${memberkey}`;
		const results = await env.BOT_STORAGE
			.prepare(botsql)
			.bind(babaKey)
			.run();
		console.log("数据获得结果", JSON.stringify(results))
		// 提取 babaValue，若无结果则返回 false
		if (results.results && results.results.length > 0) {
			return results.results[0].babaValue; // 直接返回 babaValue是个字符串
		} else {
			return false; // 无结果时返回空
		}
	} catch (error) {
		console.error('botStorageGet async error', error);
		throw error;
	}
}

///////////////////////////////////////////////////////////////////////////////
//从D1数据库更新记录
//正确返回true
//错误返回false
//异常抛出
async function botStoragePut(tbname, memberkey, memberValue, env) {
	try {
		const botsql = "UPDATE " + tbname + " SET babaValue = ? WHERE babaKey = ?";
		const babaKey = `${memberkey}`;
		const babaValue = `${memberValue}`;
		// 使用UPDATE语句更新数据库
		const result = await env.BOT_STORAGE
			.prepare(botsql)
			.bind(babaValue, babaKey)
			.run();
		console.log("botStoragePut results", JSON.stringify(result));
		// 检查更新是否成功
		if (result.success) {
			console.log("数据更新成功", tbname, babaKey, babaValue);
			return true;
		} else {
			console.log("数据更新失败", tbname, babaKey, babaValue);
			return false;
		}
	} catch (error) {
		console.error('botStoragePut async error', error);
		throw error
	}
}

///////////////////////////////////////////////////////////////////////////////
//从D1数据库新增记录
//正确返回true
//错误返回false
//异常抛出
async function botStorageAdd(tbname, memberkey, memberValue, env) {
	try {
		const botsql = "INSERT INTO " + tbname + "(babaKey, babaValue) VALUES (?, ?)";
		const babaKey = `${memberkey}`;
		const babaValue = `${memberValue}`;
		// 使用INSERT语句插入新数据
		const result = await env.BOT_STORAGE
			.prepare(botsql)
			.bind(babaKey, babaValue)
			.run();
		console.log("botStorageAdd results", JSON.stringify(result));
		// 检查插入是否成功
		if (result.success) {
			console.log("数据新增成功", tbname, babaKey, babaValue);
			return true;
		} else {
			console.log("数据新增失败", tbname, babaKey, babaValue);
			return false;
		}
	} catch (error) {
		console.error('botStorageAdd async error', error);
		throw error
	}
}

///////////////////////////////////////////////////////////////////////////////
//回复文本消息给用户
async function replyTextMessageTG(chatid, text, bot_token) {
	try {
		const newtext = `${text}`;
		const url = `https://api.telegram.org/bot${bot_token}/sendMessage`;
		const payload = {
			chat_id: chatid,
			text: newtext.substring(0, 4096),
			parse_mode: 'Markdown'
		};
		// 执行
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Telegram API error(sendMessage): ${response.status} - ${errorText}`);
		}
		console.log("文本回复成功");
		return true;
	} catch (error) {
		console.error('replyTextMessageTG async error', error);
		return false;
	}
}

///////////////////////////////////////////////////////////////////////////////
//到此为止，全局限流和用户限流完成
//下面的部分全部处理消息
//处理频道发布
async function handleChannelMessage(message, env) {
	try {
		console.log("这是一个普通频道-限流通过");
	} catch (error) {
		console.error('handlePrivateMessage async error', error);
	}
}
///////////////////////////////////////////////////////////////////////////////
//处理私聊消息
//新用户的第一条消息
async function handlePrivateFirstMessage(message, env) {
	try {
		console.log("这是一个私聊消息-限流通过新用户的第一条消息");
		if (message.text && message.text.startsWith('/')) {
			await handleCommandMessage(message, env);
			return;
		}
		//新用户的第一条消息
	} catch (error) {
		console.error('handlePrivateFirstMessage async error', error);
	}
}

///////////////////////////////////////////////////////////////////////////////
//处理私聊消息
async function handlePrivateMessage(message, env) {
	try {
		console.log("这是一个私聊消息-限流通过");
		if (message.text && message.text.startsWith('/')) {
			await handleCommandMessage(message, env);
			return;
		}
		//在这里处理私聊的消息
		await forwardMessageToSuperChat(message, env);
	} catch (error) {
		console.error('handlePrivateMessage async error', error);
	}
}

///////////////////////////////////////////////////////////////////////////////
//处理命令消息
async function handleCommandMessage(message, env) {
	try {
		console.log("这是一个命令消息-限流通过");
		//在这里处理命令的消息
	} catch (error) {
		console.error('handleCommandMessage async error', error);
	}
}

///////////////////////////////////////////////////////////////////////////////
//处理群组消息
async function handleSperchatMessage(message, env) {
	try {
		console.log("这是一个普通群组-限流通过");
		//在这里处理群组的消息
		await forwardMessageToPrivate(message, env);
	} catch (error) {
		console.error('handlePrivateMessage async error', error);
	}
}

///////////////////////////////////////////////////////////////////////////////
//到此为止，上面是电报机器人的框架
//下面是双向机器人
//将私聊消息转发给超级群组
async function forwardMessageToSuperChat(message, env) {
	try {
		const requestBody = {
			chat_id: env.BOT_SUPERGROUP_ID,
			from_chat_id: message.chat.id,
			message_id: message.message_id,
			disable_notification: true
		};
		console.log("转发消息准备", JSON.stringify(requestBody));
		const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/forwardMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody)
		});
		const data = await response.json();
		if (!data.ok) {
			throw new Error(`Failed to copy message to superChat`);
		}
		console.log("转发消息成功", JSON.stringify(data));
		//保存超级群组消息ID供回复
		const userID = message.from.id;
		const tbname = "botmessages";
		const msgValue = `${userID}`;
		const msgId = data.result.message_id;
		const msgkey = `${msgId}`;
		await botStorageAdd(tbname, msgkey, msgValue, env);
		//回复消息给用户
		await replyTextMessageTG(message.chat.id, env.MSG_BOT_SUCCESS, env.TELEGRAM_BOT_TOKEN);

	} catch (error) {
		console.error('forwardMessageToSuperChat async error', error);
	}
}
///////////////////////////////////////////////////////////////////////////////
//将群组中的回复信息转发给个人
async function forwardMessageToPrivate(message, env) {
	try {
		const tbname = "botmessages";

		//不是本机器人对应的群组消息
		if (message.chat.id.toString() != env.BOT_SUPERGROUP_ID) { return }
		//只处理回复的消息
		if (message.reply_to_message) {
			//获得被回复者的userid;
			const msgId = message.reply_to_message.message_id;
			const oldRecord = await botStorageGet(tbname, msgId, env);
			console.log("msgId oldRecord", msgId, oldRecord);
			//找到被回复者
			if (oldRecord) {
				const requestBody = {
					chat_id: oldRecord,
					from_chat_id: message.chat.id,
					message_id: message.message_id,
					disable_notification: true
				};
				console.log("拷贝消息准备", JSON.stringify(requestBody));
				const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/copyMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(requestBody)
				});
				const data = await response.json();
				if (!data.ok) {
					throw new Error(`Failed to copy message to superChat`);
				}
				console.log("拷贝消息成功", JSON.stringify(data));
			}
		}
	} catch (error) {
		console.error('forwardMessageToPrivate async error', error);
	}
}





