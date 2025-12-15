/**
彩云天气 v1.0
@author: majiqian5
更新地址：https://raw.githubusercontent.com/majiqian5/MyBoxJS/main/Tasks/caiyun.js
*/

const $ = API("caiyun");

// 读取BoxJS订阅配置
function getConfig() {
  return {
    caiyun_token: $.read("@caiyun.token.caiyun") || "",
    tencent_token: $.read("@caiyun.token.tencent") || "",
    tts_enabled: $.read("@caiyun.tts.enabled") === "true" || $.read("@caiyun.tts.enabled") === true || true,
    tts_speed: parseFloat($.read("@caiyun.tts.speed")) || 0.6,
    tts_start_hour: parseInt($.read("@caiyun.tts.schedule_start")) || 8,
    tts_end_hour: parseInt($.read("@caiyun.tts.schedule_end")) || 22,
    minutely_enabled: $.read("@caiyun.minutely.enabled") !== "false",
    display_location: $.read("@caiyun.display_location") === "true" || $.read("@caiyun.display_location") === true || false
  };
}

// 错误处理类
class TokenError extends Error {
  constructor(message) {
    super(message);
    this.name = "TokenError";
  }
}

if (typeof $request !== "undefined") {
  // 处理定位请求
  const url = $request.url;
  const res = url.match(/weather\/.*?\/(.*)\/(.*)\?/) ||
              url.match(/geocode\/([0-9.]*)\/([0-9.]*)\//) ||
              url.match(/geocode=([0-9.]*),([0-9.]*)/);
  
  if (res) {
    const location = {
      latitude: res[1],
      longitude: res[2]
    };
    
    if (!$.read("location")) {
      $.notify("[彩云天气]", "", "🎉 获取定位成功");
    }
    
    $.write(location, "location");
    if (getConfig().display_location) {
      $.info(`定位成功: 纬度 ${location.latitude}, 经度 ${location.longitude}`);
    }
  }
  $.done({});
} else {
  !(async () => {
    const config = getConfig();
    
    // 检查彩云Token
    if (!config.caiyun_token) {
      throw new TokenError("❌ 请在BoxJS中配置彩云天气Token");
    }
    
    // 检查位置
    const location = $.read("location");
    if (!location || !location.latitude || !location.longitude) {
      $.notify("[彩云天气]", "❌ 未找到定位", "请打开系统天气应用获取位置");
      return;
    }
    
    // 查询天气
    const weather = await queryWeather(config, location);
    
    // 处理天气信息
    await processWeather(weather, config, location);
    
  })().catch(err => {
    if (err.name === "TokenError") {
      $.notify(
        "[彩云天气]",
        err.message,
        "🤖 请前往BoxJS配置Token\nhttps://t.me/cool_scripts 获取最新Token",
        {
          "open-url": "https://t.me/cool_scripts"
        }
      );
    } else {
      $.notify("[彩云天气]", "❌ 错误", err.message);
    }
    $.error(err);
  }).finally(() => $.done());
}

async function queryWeather(config, location) {
  const url = `https://api.caiyunapp.com/v2.5/${config.caiyun_token}/${location.longitude},${location.latitude}/weather?lang=zh_CN&dailystart=0&hourlysteps=384&dailysteps=16&alert=true`;
  
  $.log(`查询天气: ${url.substring(0, 50)}...`);
  
  return await $.http.get({
    url,
    headers: {
      "User-Agent": "ColorfulCloudsPro/5.0.10 (iPhone; iOS 14.0; Scale/3.00)"
    },
    timeout: 15000
  }).then(resp => {
    const body = JSON.parse(resp.body);
    if (body.status === "failed") {
      throw new Error(`彩云API错误: ${body.error}`);
    }
    return body;
  }).catch(err => {
    throw new Error(`网络请求失败: ${err.message}`);
  });
}

async function processWeather(weather, config, location) {
  const realtime = weather.result.realtime;
  const keypoint = weather.result.forecast_keypoint;
  const hourly = weather.result.hourly;
  const daily = weather.result.daily;
  const minutely = weather.result.minutely;
  
  // 获取当前时间和日期信息
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekDay = weekDays[now.getDay()];
  
  // 获取当前温度
  const temp = Math.round(realtime.temperature);
  const weatherDesc = mapSkycon(realtime.skycon)[0];
  const humidity = Math.round(realtime.humidity * 100);
  const apparentTemp = Math.round(realtime.apparent_temperature);
  const uvDesc = realtime.life_index.ultraviolet.desc;
  const comfortDesc = realtime.life_index.comfort.desc;
  const windInfo = mapWind(realtime.wind.speed, realtime.wind.direction);
  
  // 构建通知内容
  let notificationBody = `🔱 ${keypoint || "暂无预报要点"}\n\n`;
  
  // 当天温度范围
  if (daily && daily.temperature && daily.temperature.length > 0) {
    const todayTemp = daily.temperature[0];
    if (todayTemp && todayTemp.max !== undefined && todayTemp.min !== undefined) {
      const maxTemp = Math.round(todayTemp.max);
      const minTemp = Math.round(todayTemp.min);
      notificationBody += `🌡 ${minTemp}°C ~ ${maxTemp}°C\n`;
    }
  }
  
  notificationBody += `🌡 体感${comfortDesc} ${apparentTemp}°C\n`;
  notificationBody += `💧 湿度 ${humidity}%\n`;
  notificationBody += `🌞 紫外线 ${uvDesc}\n`;
  notificationBody += `💨 ${windInfo}\n`;
  
  // 分钟级降水预报
  if (config.minutely_enabled && minutely && minutely.status === "ok") {
    const description = minutely.description || "暂无分钟级预报";
    notificationBody += `\n🌧 分钟预报: ${description}`;
  }
  
  // 未来3小时预报
  let hourlyForecast = "\n[未来3小时]\n";
  for (let i = 0; i < 3; i++) {
    if (!hourly.skycon || !hourly.skycon[i]) break;
    
    const skycon = hourly.skycon[i];
    const dt = new Date(skycon.datetime);
    const startHour = dt.getHours();
    const endHour = (startHour + 1) % 24;
    
    let tempInfo = "";
    if (hourly.temperature && hourly.temperature[i]) {
      const temp = hourly.temperature[i].value;
      tempInfo = ` ${Math.round(temp)}°C`;
    }
    
    const weatherDesc = mapSkycon(skycon.value)[0];
    hourlyForecast += `${startHour.toString().padStart(2, '0')}:00-${endHour.toString().padStart(2, '0')}:00 ${weatherDesc}${tempInfo}\n`;
  }
  
  notificationBody += hourlyForecast;
  
  // 发送通知
  $.notify(
    "[彩云天气]",
    `${year}年${month}月${day}日 ${weekDay}\n${weatherDesc} ${temp}°C`,
    notificationBody,
    {
      "media-url": mapSkycon(realtime.skycon)[1]
    }
  );
  
  // TTS语音播报
  const currentHour = now.getHours();
  if (config.tts_enabled && currentHour >= config.tts_start_hour && currentHour <= config.tts_end_hour) {
    const ttsText = `${weatherDesc}，气温${temp}度，${comfortDesc}，湿度${humidity}%，${uvDesc}`;
    speakTTS(ttsText, config.tts_speed);
  }
}

function speakTTS(text, speed) {
  try {
    if (typeof $speech !== "undefined") {
      $speech.speak({
        text: text,
        rate: speed,
        pitch: 1.0,
        language: "zh-CN"
      });
      $.log(`TTS播报: ${text.substring(0, 30)}...`);
    }
  } catch (err) {
    $.error(`TTS失败: ${err.message}`);
  }
}

// 天气图标和描述映射
function mapSkycon(skycon) {
  const map = {
    CLEAR_DAY: ["☀️ 日间晴朗", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_DAY.gif"],
    CLEAR_NIGHT: ["✨ 夜间晴朗", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_NIGHT.gif"],
    PARTLY_CLOUDY_DAY: ["⛅️ 日间多云", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_DAY.gif"],
    PARTLY_CLOUDY_NIGHT: ["☁️ 夜间多云", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_NIGHT.gif"],
    CLOUDY: ["☁️ 阴", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLOUDY.gif"],
    LIGHT_RAIN: ["💧 小雨", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_RAIN.gif"],
    MODERATE_RAIN: ["💦 中雨", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_RAIN.gif"],
    HEAVY_RAIN: ["🌧 大雨", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_RAIN.gif"],
    STORM_RAIN: ["⛈ 暴雨", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/STORM_RAIN.gif"],
    LIGHT_SNOW: ["🌨 小雪", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_SNOW.gif"],
    MODERATE_SNOW: ["❄️ 中雪", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_SNOW.gif"],
    HEAVY_SNOW: ["☃️ 大雪", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_SNOW.gif"],
    FOG: ["🌫️ 雾", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/FOG.gif"]
  };
  return map[skycon] || ["🌤 未知天气", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLOUDY.gif"];
}

function mapWind(speed, direction) {
  let description = "";
  let d_description = "";

  if (speed < 1) {
    description = "无风";
    return description;
  } else if (speed <= 5) {
    description = "1级 微风徐徐";
  } else if (speed <= 11) {
    description = "2级 清风";
  } else if (speed <= 19) {
    description = "3级 树叶摇摆";
  } else if (speed <= 28) {
    description = "4级 树枝摇动";
  } else if (speed <= 38) {
    description = "5级 风力强劲";
  } else if (speed <= 49) {
    description = "6级 风力强劲";
  } else if (speed <= 61) {
    description = "7级 风力超强";
  } else if (speed <= 74) {
    description = "8级 狂风大作";
  } else if (speed <= 88) {
    description = "9级 狂风呼啸";
  } else if (speed <= 102) {
    description = "10级 暴风毁树";
  } else if (speed <= 117) {
    description = "11级 暴风毁树";
  } else if (speed <= 133) {
    description = "12级 飓风";
  } else {
    description = "飓风";
  }

  if (direction >= 348.76 || direction <= 11.25) {
    d_description = "北";
  } else if (direction >= 11.26 && direction <= 33.75) {
    d_description = "北东北";
  } else if (direction >= 33.76 && direction <= 56.25) {
    d_description = "东北";
  } else if (direction >= 56.26 && direction <= 78.75) {
    d_description = "东东北";
  } else if (direction >= 78.76 && direction <= 101.25) {
    d_description = "东";
  } else if (direction >= 101.26 && direction <= 123.75) {
    d_description = "东东南";
  } else if (direction >= 123.76 && direction <= 146.25) {
    d_description = "东南";
  } else if (direction >= 146.26 && direction <= 168.75) {
    d_description = "南东南";
  } else if (direction >= 168.76 && direction <= 191.25) {
    d_description = "南";
  } else if (direction >= 191.26 && direction <= 213.75) {
    d_description = "南西南";
  } else if (direction >= 213.76 && direction <= 236.25) {
    d_description = "西南";
  } else if (direction >= 236.26 && direction <= 258.75) {
    d_description = "西西南";
  } else if (direction >= 258.76 && direction <= 281.25) {
    d_description = "西";
  } else if (direction >= 281.26 && direction <= 303.75) {
    d_description = "西西北";
  } else if (direction >= 303.76 && direction <= 326.25) {
    d_description = "西北";
  } else if (direction >= 326.26 && direction <= 348.75) {
    d_description = "北西北";
  } else {
    d_description = "未知方向";
  }

  return `${d_description}风 ${description} (${speed.toFixed(1)}m/s)`;
}

// 保留API函数（保持不变）
function ENV() { const e = "undefined" != typeof $task, t = "undefined" != typeof $loon, s = "undefined" != typeof $httpClient && !t, i = "function" == typeof require && "undefined" != typeof $jsbox; return { isQX: e, isLoon: t, isSurge: s, isNode: "function" == typeof require && !i, isJSBox: i, isRequest: "undefined" != typeof $request, isScriptable: "undefined" != typeof importModule } } function HTTP(e = { baseURL: "" }) { const { isQX: t, isLoon: s, isSurge: i, isScriptable: n, isNode: o } = ENV(), r = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/; const u = {}; return ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(l => u[l.toLowerCase()] = (u => (function (u, l) { l = "string" == typeof l ? { url: l } : l; const h = e.baseURL; h && !r.test(l.url || "") && (l.url = h ? h + l.url : l.url); const a = (l = { ...e, ...l }).timeout, c = { onRequest: () => { }, onResponse: e => e, onTimeout: () => { }, ...l.events }; let f, d; if (c.onRequest(u, l), t) f = $task.fetch({ method: u, ...l }); else if (s || i || o) f = new Promise((e, t) => { (o ? require("request") : $httpClient)[u.toLowerCase()](l, (s, i, n) => { s ? t(s) : e({ statusCode: i.status || i.statusCode, headers: i.headers, body: n }) }) }); else if (n) { const e = new Request(l.url); e.method = u, e.headers = l.headers, e.body = l.body, f = new Promise((t, s) => { e.loadString().then(s => { t({ statusCode: e.response.statusCode, headers: e.response.headers, body: s }) }).catch(e => s(e)) }) } const p = a ? new Promise((e, t) => { d = setTimeout(() => (c.onTimeout(), t(`${u} URL: ${l.url} exceeds the timeout ${a} ms`)), a) }) : null; return (p ? Promise.race([p, f]).then(e => (clearTimeout(d), e)) : f).then(e => c.onResponse(e)) })(l, u))), u } function API(e = "untitled", t = !1) { const { isQX: s, isLoon: i, isSurge: n, isNode: o, isJSBox: r, isScriptable: u } = ENV(); return new class { constructor(e, t) { this.name = e, this.debug = t, this.http = HTTP(), this.env = ENV(), this.node = (() => { if (o) { return { fs: require("fs") } } return null })(), this.initCache(); Promise.prototype.delay = function (e) { return this.then(function (t) { return ((e, t) => new Promise(function (s) { setTimeout(s.bind(null, t), e) }))(e, t) }) } } initCache() { if (s && (this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}")), (i || n) && (this.cache = JSON.parse($persistentStore.read(this.name) || "{}")), o) { let e = "root.json"; this.node.fs.existsSync(e) || this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.root = {}, e = `${this.name}.json`, this.node.fs.existsSync(e) ? this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`)) : (this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.cache = {}) } } persistCache() { const e = JSON.stringify(this.cache, null, 2); s && $prefs.setValueForKey(e, this.name), (i || n) && $persistentStore.write(e, this.name), o && (this.node.fs.writeFileSync(`${this.name}.json`, e, { flag: "w" }, e => console.log(e)), this.node.fs.writeFileSync("root.json", JSON.stringify(this.root, null, 2), { flag: "w" }, e => console.log(e))) } write(e, t) { if (this.log(`SET ${t}`), -1 !== t.indexOf("#")) { if (t = t.substr(1), n || i) return $persistentStore.write(e, t); if (s) return $prefs.setValueForKey(e, t); o && (this.root[t] = e) } else this.cache[t] = e; this.persistCache() } read(e) { return this.log(`READ ${e}`), -1 === e.indexOf("#") ? this.cache[e] : (e = e.substr(1), n || i ? $persistentStore.read(e) : s ? $prefs.valueForKey(e) : o ? this.root[e] : void 0) } delete(e) { if (this.log(`DELETE ${e}`), -1 !== e.indexOf("#")) { if (e = e.substr(1), n || i) return $persistentStore.write(null, e); if (s) return $prefs.removeValueForKey(e); o && delete this.root[e] } else delete this.cache[e]; this.persistCache() } notify(e, t = "", l = "", h = {}) { const a = h["open-url"], c = h["media-url"]; if (s && $notify(e, t, l, h), n && $notification.post(e, t, l + `${c ? "\n多媒体:" + c : ""}`, { url: a }), i) { let s = {}; a && (s.openUrl = a), c && (s.mediaUrl = c), "{}" === JSON.stringify(s) ? $notification.post(e, t, l) : $notification.post(e, t, l, s) } if (o || u) { const s = l + (a ? `\n点击跳转: ${a}` : "") + (c ? `\n多媒体: ${c}` : ""); if (r) { require("push").schedule({ title: e, body: (t ? t + "\n" : "") + s }) } else console.log(`${e}\n${t}\n${s}\n\n`) } } log(e) { this.debug && console.log(`[${this.name}] LOG: ${this.stringify(e)}`) } info(e) { console.log(`[${this.name}] INFO: ${this.stringify(e)}`) } error(e) { console.log(`[${this.name}] ERROR: ${this.stringify(e)}`) } wait(e) { return new Promise(t => setTimeout(t, e)) } done(e = {}) { s || i || n ? $done(e) : o && !r && "undefined" != typeof $context && ($context.headers = e.headers, $context.statusCode = e.statusCode, $context.body = e.body) } stringify(e) { if ("string" == typeof e || e instanceof String) return e; try { return JSON.stringify(e, null, 2) } catch (e) { return "[object Object]" } } }(e, t) }
